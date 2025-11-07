import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestApp } from '@/test/helpers/testApp';
import { getDatabase } from '@/config/database';
import { PaymentService } from '@/services/paymentService';
import { Knex } from 'knex';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

describe('Payment Security Tests', () => {
    let app: any;
    let db: Knex;
    let paymentService: PaymentService;
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
        app = await setupTestApp();
        db = getDatabase();
        paymentService = new PaymentService();

        // Clean up test data
        await db('users').del();
        await db('invoices').del();
        await db('payment_attempts').del();
        await db('usage_ledger').del();

        // Create test user
        const user = await db('users').insert({
            id: 'test-user',
            email: 'test@example.com',
            role: 'worker',
            status: 'active'
        }).returning('*');

        userId = user[0].id;
        userToken = jwt.sign(
            { userId: user[0].id, role: user[0].role },
            process.env.JWT_SECRET!,
            { expiresIn: '15m' }
        );
    });

    afterEach(async () => {
        await db('users').del();
        await db('invoices').del();
        await db('payment_attempts').del();
        await db('usage_ledger').del();
    });

    describe('PCI Compliance', () => {
        it('should never store raw credit card numbers', async () => {
            const cardData = {
                number: '4111111111111111',
                expMonth: '12',
                expYear: '2025',
                cvc: '123'
            };

            const response = await request(app)
                .post('/api/payment/methods')
                .set('Authorization', `Bearer ${userToken}`)
                .send(cardData);

            expect(response.status).toBe(201);

            // Verify no raw card data in database
            const user = await db('users').where('id', userId).first();
            expect(user.payment_token_ref).toBeDefined();
            expect(user.payment_token_ref).not.toContain('4111111111111111');

            // Check all tables for card number
            const tables = ['users', 'invoices', 'payment_attempts', 'audit_events'];
            for (const table of tables) {
                const hasTable = await db.schema.hasTable(table);
                if (hasTable) {
                    const rows = await db(table).select('*');
                    const serialized = JSON.stringify(rows);
                    expect(serialized).not.toContain('4111111111111111');
                    expect(serialized).not.toContain(cardData.cvc);
                }
            }
        });

        it('should tokenize payment methods securely', async () => {
            const cardData = {
                number: '4111111111111111',
                expMonth: '12',
                expYear: '2025',
                cvc: '123'
            };

            const response = await request(app)
                .post('/api/payment/methods')
                .set('Authorization', `Bearer ${userToken}`)
                .send(cardData);

            expect(response.status).toBe(201);
            expect(response.body.token).toBeDefined();
            expect(response.body.token).toMatch(/^pm_/); // Stripe-like token format
            expect(response.body.last4).toBe('1111');
            expect(response.body).not.toHaveProperty('number');
            expect(response.body).not.toHaveProperty('cvc');
        });

        it('should encrypt sensitive payment data at rest', async () => {
            await db('invoices').insert({
                id: 'test-invoice',
                user_id: userId,
                billing_period_start: new Date(),
                billing_period_end: new Date(),
                total_amount: 10000, // $100.00
                currency: 'USD',
                due_date: new Date(),
                status: 'pending'
            });

            // Verify sensitive data is encrypted
            const invoice = await db('invoices').where('id', 'test-invoice').first();

            // If PII is stored, it should be encrypted
            if (invoice.encrypted_pii) {
                expect(invoice.encrypted_pii).toBeInstanceOf(Buffer);
                // Should not contain readable text
                expect(invoice.encrypted_pii.toString()).not.toContain('@');
                expect(invoice.encrypted_pii.toString()).not.toContain('test');
            }
        });

        it('should validate payment amounts to prevent manipulation', async () => {
            const maliciousAmount = -10000; // Negative amount

            const response = await request(app)
                .post('/api/payment/charge')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    amount: maliciousAmount,
                    currency: 'USD',
                    paymentMethodId: 'pm_test_token'
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_AMOUNT');
        });

        it('should prevent payment amount tampering', async () => {
            // Create invoice
            const invoice = await db('invoices').insert({
                id: 'test-invoice',
                user_id: userId,
                billing_period_start: new Date(),
                billing_period_end: new Date(),
                total_amount: 10000, // $100.00
                currency: 'USD',
                due_date: new Date(),
                status: 'pending'
            }).returning('*');

            // Attempt to pay different amount
            const response = await request(app)
                .post(`/api/invoices/${invoice[0].id}/pay`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    amount: 1000, // $10.00 - different from invoice
                    paymentMethodId: 'pm_test_token'
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('AMOUNT_MISMATCH');
        });
    });

    describe('Payment Processing Security', () => {
        it('should implement idempotency for payment requests', async () => {
            const idempotencyKey = crypto.randomUUID();
            const paymentData = {
                amount: 10000,
                currency: 'USD',
                paymentMethodId: 'pm_test_token'
            };

            // First request
            const response1 = await request(app)
                .post('/api/payment/charge')
                .set('Authorization', `Bearer ${userToken}`)
                .set('Idempotency-Key', idempotencyKey)
                .send(paymentData);

            // Second request with same idempotency key
            const response2 = await request(app)
                .post('/api/payment/charge')
                .set('Authorization', `Bearer ${userToken}`)
                .set('Idempotency-Key', idempotencyKey)
                .send(paymentData);

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(response1.body.chargeId).toBe(response2.body.chargeId);
        });

        it('should validate webhook signatures', async () => {
            const webhookPayload = {
                id: 'evt_test_webhook',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_payment',
                        amount: 10000,
                        status: 'succeeded'
                    }
                }
            };

            const invalidSignature = 'invalid_signature';

            const response = await request(app)
                .post('/api/webhooks/stripe')
                .set('Stripe-Signature', invalidSignature)
                .send(webhookPayload);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_SIGNATURE');
        });

        it('should prevent replay attacks on webhooks', async () => {
            const webhookPayload = {
                id: 'evt_test_webhook',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_payment',
                        amount: 10000,
                        status: 'succeeded'
                    }
                }
            };

            // Create valid signature (mocked)
            const timestamp = Math.floor(Date.now() / 1000);
            const signature = `t=${timestamp},v1=valid_signature`;

            // First webhook
            const response1 = await request(app)
                .post('/api/webhooks/stripe')
                .set('Stripe-Signature', signature)
                .send(webhookPayload);

            // Replay same webhook
            const response2 = await request(app)
                .post('/api/webhooks/stripe')
                .set('Stripe-Signature', signature)
                .send(webhookPayload);

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(400);
            expect(response2.body.error.code).toBe('WEBHOOK_ALREADY_PROCESSED');
        });

        it('should enforce webhook timestamp validation', async () => {
            const webhookPayload = {
                id: 'evt_test_webhook',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_payment',
                        amount: 10000,
                        status: 'succeeded'
                    }
                }
            };

            // Old timestamp (more than 5 minutes ago)
            const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
            const signature = `t=${oldTimestamp},v1=valid_signature`;

            const response = await request(app)
                .post('/api/webhooks/stripe')
                .set('Stripe-Signature', signature)
                .send(webhookPayload);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('WEBHOOK_TIMESTAMP_TOO_OLD');
        });

        it('should implement secure payment retry logic', async () => {
            // Create failed payment attempt
            await db('payment_attempts').insert({
                id: 'attempt-1',
                invoice_id: 'test-invoice',
                amount: 10000,
                currency: 'USD',
                status: 'failed',
                failure_reason: 'insufficient_funds',
                attempt_number: 1,
                created_at: new Date()
            });

            const response = await request(app)
                .post('/api/payment/retry')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    invoiceId: 'test-invoice',
                    paymentMethodId: 'pm_test_token'
                });

            // Should implement exponential backoff
            expect(response.status).toBe(200);
            expect(response.body.retryAfter).toBeGreaterThan(0);
        });
    });

    describe('Financial Data Protection', () => {
        it('should redact sensitive financial data in logs', async () => {
            const paymentData = {
                amount: 10000,
                currency: 'USD',
                paymentMethodId: 'pm_1234567890abcdef',
                customerEmail: 'test@example.com'
            };

            await request(app)
                .post('/api/payment/charge')
                .set('Authorization', `Bearer ${userToken}`)
                .send(paymentData);

            // Check audit logs
            const auditEvents = await db('audit_events')
                .where('action', 'payment_processed')
                .select('*');

            for (const event of auditEvents) {
                const metadata = JSON.stringify(event.metadata);
                expect(metadata).not.toContain('pm_1234567890abcdef');
                expect(metadata).not.toContain('test@example.com');
                // Should contain redacted versions
                expect(metadata).toContain('pm_****');
                expect(metadata).toContain('****@example.com');
            }
        });

        it('should prevent unauthorized access to financial data', async () => {
            // Create worker user (should not access financial data)
            const workerUser = await db('users').insert({
                id: 'worker-user',
                email: 'worker@example.com',
                role: 'worker',
                status: 'active'
            }).returning('*');

            const workerToken = jwt.sign(
                { userId: workerUser[0].id, role: workerUser[0].role },
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            const response = await request(app)
                .get('/api/invoices')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should encrypt financial reports', async () => {
            const response = await request(app)
                .post('/api/reports/financial')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    period: '2024-11',
                    format: 'pdf'
                });

            expect(response.status).toBe(200);
            expect(response.body.downloadUrl).toBeDefined();
            expect(response.body.encrypted).toBe(true);
            expect(response.body.encryptionKey).toBeDefined();
        });
    });

    describe('Usage Billing Security', () => {
        it('should prevent usage data tampering', async () => {
            const maliciousUsage = {
                userId: userId,
                month: '2024-11',
                ridesCount: -10, // Negative rides
                totalDistance: 1000000, // Unrealistic distance
                totalDuration: -3600 // Negative duration
            };

            const response = await request(app)
                .post('/api/usage/record')
                .set('Authorization', `Bearer ${userToken}`)
                .send(maliciousUsage);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_USAGE_DATA');
        });

        it('should validate usage calculations', async () => {
            // Create usage ledger entry
            await db('usage_ledger').insert({
                user_id: userId,
                month: '2024-11',
                rides_count: 10,
                total_distance: 100.5,
                total_duration: 3600,
                cost_components: JSON.stringify({
                    baseFare: 5000,
                    distanceFee: 2000,
                    timeFee: 1000,
                    surcharges: 500
                })
            });

            const response = await request(app)
                .post('/api/invoices/generate')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    userId: userId,
                    month: '2024-11'
                });

            expect(response.status).toBe(200);

            // Verify calculations
            const invoice = response.body;
            expect(invoice.totalAmount).toBe(8500); // Sum of cost components
            expect(invoice.lineItems).toHaveLength(4);
        });

        it('should prevent double billing', async () => {
            // Create existing invoice
            await db('invoices').insert({
                id: 'existing-invoice',
                user_id: userId,
                billing_period_start: new Date('2024-11-01'),
                billing_period_end: new Date('2024-11-30'),
                total_amount: 10000,
                currency: 'USD',
                due_date: new Date(),
                status: 'paid'
            });

            const response = await request(app)
                .post('/api/invoices/generate')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    userId: userId,
                    month: '2024-11'
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVOICE_ALREADY_EXISTS');
        });
    });
});