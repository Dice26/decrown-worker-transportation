import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentRetryService } from '@/services/paymentRetryService';
import { PaymentService } from '@/services/paymentService';
import { MockPaymentProvider } from '@/services/paymentProviders/mockPaymentProvider';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import {
    PaymentAttempt,
    DunningNotice,
    WebhookEvent
} from '@/types/payment';

describe('PaymentRetryService', () => {
    let paymentRetryService: PaymentRetryService;
    let paymentService: PaymentService;
    let mockProvider: MockPaymentProvider;
    let db: any;
    let testUser: any;
    let testInvoice: any;

    beforeEach(async () => {
        mockProvider = new MockPaymentProvider();
        paymentService = new PaymentService(mockProvider);
        paymentRetryService = new PaymentRetryService(paymentService, mockProvider);
        db = getDatabase();

        // Create test user
        testUser = await TestDataFactory.createUser({
            role: 'worker',
            email: 'retry.test@example.com',
            payment_customer_id: 'cust_test_123'
        });

        // Create test invoice
        testInvoice = await createTestInvoice();
    });

    async function createTestInvoice() {
        const invoiceId = 'test-invoice-' + Date.now();

        await db('invoices').insert({
            id: invoiceId,
            user_id: testUser.id,
            billing_period_start: new Date('2024-01-01'),
            billing_period_end: new Date('2024-01-31'),
            line_items: JSON.stringify([{
                id: 'item-1',
                description: 'Test charges',
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100
            }]),
            total_amount: 100,
            currency: 'PHP',
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date()
        });

        return { id: invoiceId, totalAmount: 100 };
    }

    async function createFailedPaymentAttempt(retryCount: number = 0): Promise<string> {
        const attemptId = 'test-attempt-' + Date.now() + '-' + retryCount;

        await db('payment_attempts').insert({
            id: attemptId,
            invoice_id: testInvoice.id,
            amount: testInvoice.totalAmount,
            currency: 'PHP',
            payment_method: 'card',
            status: 'failed',
            failure_reason: 'Test failure for retry',
            idempotency_key: 'test-key-' + attemptId,
            attempted_at: new Date(),
            completed_at: new Date(),
            retry_count: retryCount,
            next_retry_at: new Date(Date.now() - 1000) // Past time to trigger retry
        });

        return attemptId;
    }

    describe('processPaymentRetries', () => {
        it('should process failed payment attempts for retry', async () => {
            // Create failed payment attempts
            await createFailedPaymentAttempt(0);
            await createFailedPaymentAttempt(1);

            const result = await paymentRetryService.processPaymentRetries();

            expect(result).toBeDefined();
            expect(result.processed).toBe(2);
            expect(result.succeeded + result.failed).toBe(2);
            expect(result.errors).toHaveLength(0);
        });

        it('should not retry attempts that exceed max retries', async () => {
            // Create attempt that has already reached max retries
            await createFailedPaymentAttempt(3); // Assuming max retries is 3

            const result = await paymentRetryService.processPaymentRetries();

            expect(result.processed).toBe(1);
            expect(result.failed).toBe(1); // Should fail due to max retries exceeded
        });

        it('should not retry attempts not yet due', async () => {
            const attemptId = 'future-retry-' + Date.now();

            await db('payment_attempts').insert({
                id: attemptId,
                invoice_id: testInvoice.id,
                amount: testInvoice.totalAmount,
                currency: 'PHP',
                payment_method: 'card',
                status: 'failed',
                failure_reason: 'Test failure',
                idempotency_key: 'test-key-' + attemptId,
                attempted_at: new Date(),
                completed_at: new Date(),
                retry_count: 1,
                next_retry_at: new Date(Date.now() + 60000) // Future time
            });

            const result = await paymentRetryService.processPaymentRetries();

            expect(result.processed).toBe(0);
        });

        it('should handle retry errors gracefully', async () => {
            await createFailedPaymentAttempt(0);

            // Mock payment provider to throw error
            vi.spyOn(mockProvider, 'chargeCustomer').mockRejectedValue(new Error('Provider error'));

            const result = await paymentRetryService.processPaymentRetries();

            expect(result.processed).toBe(1);
            expect(result.failed).toBe(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toContain('Provider error');
        });
    });

    describe('retryPayment', () => {
        let failedAttempt: PaymentAttempt;

        beforeEach(async () => {
            const attemptId = await createFailedPaymentAttempt(1);

            failedAttempt = {
                id: attemptId,
                invoiceId: testInvoice.id,
                amount: testInvoice.totalAmount,
                currency: 'PHP',
                paymentMethod: 'card',
                status: 'failed',
                failureReason: 'Test failure',
                idempotencyKey: 'test-key-' + attemptId,
                attemptedAt: new Date(),
                completedAt: new Date(),
                retryCount: 1
            };
        });

        it('should successfully retry a failed payment', async () => {
            const result = await paymentRetryService.retryPayment(failedAttempt);

            expect(result.success).toBe(true);
            expect(result.newAttempt).toBeDefined();
            expect(result.newAttempt?.retryCount).toBe(2);
            expect(result.newAttempt?.status).toBe('succeeded');
        });

        it('should update invoice status on successful retry', async () => {
            await paymentRetryService.retryPayment(failedAttempt);

            const updatedInvoice = await paymentService.getInvoiceById(testInvoice.id);
            expect(updatedInvoice?.status).toBe('paid');
            expect(updatedInvoice?.paidAt).toBeInstanceOf(Date);
        });

        it('should handle retry failure', async () => {
            // Mock payment provider to fail
            vi.spyOn(mockProvider, 'chargeCustomer').mockResolvedValue({
                success: false,
                status: 'failed',
                failureReason: 'Card declined'
            });

            const result = await paymentRetryService.retryPayment(failedAttempt);

            expect(result.success).toBe(false);
            expect(result.newAttempt?.status).toBe('failed');
            expect(result.newAttempt?.failureReason).toBe('Card declined');
        });

        it('should start dunning process after max retries', async () => {
            // Create attempt at max retry count
            const maxRetryAttempt = { ...failedAttempt, retryCount: 3 };

            const result = await paymentRetryService.retryPayment(maxRetryAttempt);

            expect(result.success).toBe(false);

            // Check that invoice status was updated to overdue
            const updatedInvoice = await paymentService.getInvoiceById(testInvoice.id);
            expect(updatedInvoice?.status).toBe('overdue');

            // Check that dunning notice was created
            const dunningNotices = await db('dunning_notices')
                .where('invoice_id', testInvoice.id);
            expect(dunningNotices).toHaveLength(1);
        });

        it('should use exponential backoff for retry scheduling', async () => {
            // Mock payment provider to fail
            vi.spyOn(mockProvider, 'chargeCustomer').mockResolvedValue({
                success: false,
                status: 'failed',
                failureReason: 'Temporary failure'
            });

            const result = await paymentRetryService.retryPayment(failedAttempt);

            expect(result.success).toBe(false);

            // Check that next retry was scheduled
            const newAttempt = await db('payment_attempts')
                .where('id', result.newAttempt?.id)
                .first();

            expect(newAttempt.next_retry_at).toBeDefined();
            expect(new Date(newAttempt.next_retry_at).getTime()).toBeGreaterThan(Date.now());
        });
    });

    describe('processDunningNotices', () => {
        beforeEach(async () => {
            // Create overdue invoice
            await db('invoices')
                .where('id', testInvoice.id)
                .update({
                    status: 'overdue',
                    due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days overdue
                });
        });

        it('should process overdue invoices for dunning', async () => {
            const result = await paymentRetryService.processDunningNotices();

            expect(result).toBeDefined();
            expect(result.processed).toBe(1);
            expect(result.sent).toBe(1);
            expect(result.suspended).toBe(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should send appropriate dunning notice level', async () => {
            await paymentRetryService.processDunningNotices();

            const dunningNotice = await db('dunning_notices')
                .where('invoice_id', testInvoice.id)
                .first();

            expect(dunningNotice).toBeDefined();
            expect(dunningNotice.notice_level).toBe(1); // First notice for 5 days overdue
            expect(dunningNotice.status).toBe('notice_1');
        });

        it('should suspend user after final notice', async () => {
            // Set invoice to be 15 days overdue (triggers final notice)
            await db('invoices')
                .where('id', testInvoice.id)
                .update({
                    due_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
                });

            const result = await paymentRetryService.processDunningNotices();

            expect(result.suspended).toBe(1);

            // Check user was suspended
            const updatedUser = await db('users').where('id', testUser.id).first();
            expect(updatedUser.status).toBe('suspended');
        });

        it('should not send duplicate notices', async () => {
            // Send first notice
            await paymentRetryService.processDunningNotices();

            // Try to send again
            const result = await paymentRetryService.processDunningNotices();

            expect(result.processed).toBe(0); // Should not process again
        });

        it('should handle errors gracefully', async () => {
            // Mock database error
            vi.spyOn(db, 'transaction').mockRejectedValue(new Error('Database error'));

            const result = await paymentRetryService.processDunningNotices();

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toContain('Database error');
        });
    });

    describe('sendDunningNotice', () => {
        beforeEach(async () => {
            await db('invoices')
                .where('id', testInvoice.id)
                .update({ status: 'overdue' });
        });

        it('should send dunning notice successfully', async () => {
            const notice = await paymentRetryService.sendDunningNotice(testInvoice.id, 1);

            expect(notice).toBeDefined();
            expect(notice.invoiceId).toBe(testInvoice.id);
            expect(notice.userId).toBe(testUser.id);
            expect(notice.noticeLevel).toBe(1);
            expect(notice.status).toBe('notice_1');
            expect(notice.delivered).toBe(true);
        });

        it('should prevent duplicate notices for same level', async () => {
            // Send first notice
            await paymentRetryService.sendDunningNotice(testInvoice.id, 1);

            // Try to send duplicate
            await expect(
                paymentRetryService.sendDunningNotice(testInvoice.id, 1)
            ).rejects.toThrow('Dunning notice level 1 already sent');
        });

        it('should suspend user on final notice', async () => {
            await paymentRetryService.sendDunningNotice(testInvoice.id, 3);

            const updatedUser = await db('users').where('id', testUser.id).first();
            expect(updatedUser.status).toBe('suspended');
        });

        it('should generate appropriate message for each level', async () => {
            const notice1 = await paymentRetryService.sendDunningNotice(testInvoice.id, 1);
            expect(notice1.message).toContain('Please settle your account immediately');

            // Create another invoice for level 2 test
            const invoice2 = await createTestInvoice();
            await db('invoices').where('id', invoice2.id).update({ status: 'overdue' });

            const notice2 = await paymentRetryService.sendDunningNotice(invoice2.id, 2);
            expect(notice2.message).toContain('URGENT');

            // Create another invoice for level 3 test
            const invoice3 = await createTestInvoice();
            await db('invoices').where('id', invoice3.id).update({ status: 'overdue' });

            const notice3 = await paymentRetryService.sendDunningNotice(invoice3.id, 3);
            expect(notice3.message).toContain('FINAL NOTICE');
        });
    });

    describe('handleWebhookEvent', () => {
        let testPaymentAttempt: string;

        beforeEach(async () => {
            testPaymentAttempt = await createFailedPaymentAttempt(0);

            // Update with provider transaction ID
            await db('payment_attempts')
                .where('id', testPaymentAttempt)
                .update({
                    provider_transaction_id: 'ch_test_123',
                    status: 'processing'
                });
        });

        it('should handle payment succeeded webhook', async () => {
            const { payload, signature } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_123', amount: 100 }
            );

            await paymentRetryService.handleWebhookEvent(payload, signature);

            // Check that payment attempt was updated
            const updatedAttempt = await db('payment_attempts')
                .where('provider_transaction_id', 'ch_test_123')
                .first();

            expect(updatedAttempt.status).toBe('succeeded');

            // Check that invoice was marked as paid
            const updatedInvoice = await db('invoices')
                .where('id', testInvoice.id)
                .first();

            expect(updatedInvoice.status).toBe('paid');
        });

        it('should handle payment failed webhook', async () => {
            const { payload, signature } = mockProvider.generateMockWebhook(
                'payment.failed',
                { id: 'ch_test_123', failure_reason: 'Card expired' }
            );

            await paymentRetryService.handleWebhookEvent(payload, signature);

            const updatedAttempt = await db('payment_attempts')
                .where('provider_transaction_id', 'ch_test_123')
                .first();

            expect(updatedAttempt.status).toBe('failed');
            expect(updatedAttempt.failure_reason).toBe('Card expired');
        });

        it('should prevent duplicate webhook processing', async () => {
            const { payload, signature } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_123', amount: 100 }
            );

            // Process webhook twice
            await paymentRetryService.handleWebhookEvent(payload, signature);
            await paymentRetryService.handleWebhookEvent(payload, signature);

            // Should only create one webhook event record
            const webhookEvents = await db('webhook_events')
                .where('provider_event_id', payload.id);

            expect(webhookEvents).toHaveLength(1);
        });

        it('should handle invalid webhook signature', async () => {
            const { payload } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_123', amount: 100 }
            );

            const invalidSignature = 'invalid_signature';

            await expect(
                paymentRetryService.handleWebhookEvent(payload, invalidSignature)
            ).rejects.toThrow('Invalid webhook signature');
        });

        it('should save failed webhook events', async () => {
            const { payload, signature } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_123', amount: 100 }
            );

            // Mock database error during processing
            vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('Processing error'));

            await expect(
                paymentRetryService.handleWebhookEvent(payload, signature)
            ).rejects.toThrow('Processing error');

            // Check that failed event was saved
            const failedEvents = await db('webhook_events')
                .where('processed', false)
                .where('processing_error', 'like', '%Processing error%');

            expect(failedEvents).toHaveLength(1);
        });

        it('should handle unknown webhook event types', async () => {
            const { payload, signature } = mockProvider.generateMockWebhook(
                'unknown.event.type',
                { id: 'evt_unknown_123' }
            );

            // Should not throw error for unknown event types
            await expect(
                paymentRetryService.handleWebhookEvent(payload, signature)
            ).resolves.not.toThrow();

            // Should save the event as processed
            const webhookEvent = await db('webhook_events')
                .where('provider_event_id', payload.id)
                .first();

            expect(webhookEvent.processed).toBe(true);
        });
    });

    describe('webhook signature validation', () => {
        it('should validate correct webhook signatures', async () => {
            const { payload, signature } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_validation', amount: 100 }
            );

            // Should not throw error for valid signature
            await expect(
                paymentRetryService.handleWebhookEvent(payload, signature)
            ).resolves.not.toThrow();
        });

        it('should reject invalid webhook signatures', async () => {
            const { payload } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_validation', amount: 100 }
            );

            const invalidSignature = 'definitely_invalid_signature';

            await expect(
                paymentRetryService.handleWebhookEvent(payload, invalidSignature)
            ).rejects.toThrow('Invalid webhook signature');
        });

        it('should handle webhook signature validation errors', async () => {
            // Mock provider to throw error during signature validation
            vi.spyOn(mockProvider, 'handleWebhook').mockRejectedValue(new Error('Signature validation failed'));

            const { payload, signature } = mockProvider.generateMockWebhook(
                'payment.succeeded',
                { id: 'ch_test_error', amount: 100 }
            );

            await expect(
                paymentRetryService.handleWebhookEvent(payload, signature)
            ).rejects.toThrow('Signature validation failed');
        });
    });
});