import { getDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import {
    PaymentAttempt,
    PaymentRetryConfig,
    DunningNotice,
    DunningStatus,
    Invoice,
    PaymentProvider,
    ChargeResult
} from '@/types/payment';
import { PaymentService } from './paymentService';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export class PaymentRetryService {
    private db: Knex;
    private paymentService: PaymentService;
    private paymentProvider: PaymentProvider;
    private retryConfig: PaymentRetryConfig;

    constructor(paymentService: PaymentService, paymentProvider: PaymentProvider) {
        this.db = getDatabase();
        this.paymentService = paymentService;
        this.paymentProvider = paymentProvider;
        this.retryConfig = {
            maxAttempts: 3,
            baseDelayMinutes: 60,
            maxDelayMinutes: 1440, // 24 hours
            backoffMultiplier: 2
        };
    }

    /**
     * Process payment retries for failed attempts
     */
    async processPaymentRetries(): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
        errors: Array<{ invoiceId: string; error: string }>;
    }> {
        const result = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            errors: [] as Array<{ invoiceId: string; error: string }>
        };

        try {
            // Get payment attempts that are due for retry
            const retryAttempts = await this.getRetryDueAttempts();

            for (const attempt of retryAttempts) {
                try {
                    result.processed++;
                    const retryResult = await this.retryPayment(attempt);

                    if (retryResult.success) {
                        result.succeeded++;
                    } else {
                        result.failed++;
                    }
                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        invoiceId: attempt.invoiceId,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    logger.error(`Failed to retry payment for invoice ${attempt.invoiceId}:`, error);
                }
            }

            logger.info('Payment retry processing completed', result);
            return result;
        } catch (error) {
            logger.error('Failed to process payment retries:', error);
            throw error;
        }
    }

    /**
     * Retry a specific payment attempt
     */
    async retryPayment(attempt: PaymentAttempt): Promise<{ success: boolean; newAttempt?: PaymentAttempt }> {
        const trx = await this.db.transaction();

        try {
            // Check if we've exceeded max retry attempts
            if (attempt.retryCount >= this.retryConfig.maxAttempts) {
                await this.handleMaxRetriesExceeded(attempt.invoiceId, trx);
                await trx.commit();
                return { success: false };
            }

            // Get invoice details
            const invoice = await this.paymentService.getInvoiceById(attempt.invoiceId, trx);
            if (!invoice) {
                throw new Error('Invoice not found');
            }

            // Get user information
            const user = await trx('users').select('*').where('id', invoice.userId).first();
            if (!user) {
                throw new Error('User not found');
            }

            // Create new payment attempt
            const newAttemptId = uuidv4();
            const idempotencyKey = `retry_${attempt.invoiceId}_${newAttemptId}`;

            const newAttempt: PaymentAttempt = {
                id: newAttemptId,
                invoiceId: attempt.invoiceId,
                amount: attempt.amount,
                currency: attempt.currency,
                paymentMethod: attempt.paymentMethod,
                status: 'pending',
                idempotencyKey,
                attemptedAt: new Date(),
                retryCount: attempt.retryCount + 1
            };

            // Save new payment attempt
            await trx('payment_attempts').insert({
                id: newAttemptId,
                invoice_id: attempt.invoiceId,
                amount: attempt.amount,
                currency: attempt.currency,
                payment_method: attempt.paymentMethod,
                status: 'pending',
                idempotency_key: idempotencyKey,
                attempted_at: new Date(),
                retry_count: attempt.retryCount + 1
            });

            // Attempt payment
            let chargeResult: ChargeResult;
            try {
                const customerId = user.payment_customer_id;
                if (!customerId) {
                    throw new Error('Customer ID not found');
                }

                chargeResult = await this.paymentProvider.chargeCustomer(
                    customerId,
                    attempt.amount,
                    attempt.currency,
                    idempotencyKey
                );
            } catch (error) {
                chargeResult = {
                    success: false,
                    status: 'failed',
                    failureReason: error instanceof Error ? error.message : 'Payment processing error'
                };
            }

            // Update payment attempt with result
            newAttempt.status = chargeResult.status;
            newAttempt.providerTransactionId = chargeResult.transactionId;
            newAttempt.providerResponse = chargeResult.metadata;
            newAttempt.failureReason = chargeResult.failureReason;
            newAttempt.completedAt = new Date();

            await trx('payment_attempts')
                .where('id', newAttemptId)
                .update({
                    status: chargeResult.status,
                    provider_transaction_id: chargeResult.transactionId,
                    provider_response: JSON.stringify(chargeResult.metadata || {}),
                    failure_reason: chargeResult.failureReason,
                    completed_at: new Date()
                });

            if (chargeResult.success && chargeResult.status === 'succeeded') {
                // Payment succeeded - update invoice
                await trx('invoices')
                    .where('id', attempt.invoiceId)
                    .update({
                        status: 'paid',
                        paid_at: new Date(),
                        updated_at: new Date()
                    });

                logger.info(`Payment retry succeeded`, {
                    invoiceId: attempt.invoiceId,
                    attemptId: newAttemptId,
                    retryCount: newAttempt.retryCount
                });
            } else {
                // Payment failed - schedule next retry or start dunning
                if (newAttempt.retryCount < this.retryConfig.maxAttempts) {
                    await this.scheduleNextRetry(newAttemptId, newAttempt.retryCount, trx);
                } else {
                    await this.handleMaxRetriesExceeded(attempt.invoiceId, trx);
                }
            }

            await trx.commit();

            return {
                success: chargeResult.success,
                newAttempt
            };
        } catch (error) {
            await trx.rollback();
            logger.error('Failed to retry payment:', error);
            throw error;
        }
    }

    /**
     * Process dunning notices for overdue invoices
     */
    async processDunningNotices(): Promise<{
        processed: number;
        sent: number;
        suspended: number;
        errors: Array<{ invoiceId: string; error: string }>;
    }> {
        const result = {
            processed: 0,
            sent: 0,
            suspended: 0,
            errors: [] as Array<{ invoiceId: string; error: string }>
        };

        try {
            // Get overdue invoices that need dunning notices
            const overdueInvoices = await this.getOverdueInvoicesForDunning();

            for (const invoice of overdueInvoices) {
                try {
                    result.processed++;
                    const dunningResult = await this.processDunningForInvoice(invoice);

                    if (dunningResult.sent) {
                        result.sent++;
                    }
                    if (dunningResult.suspended) {
                        result.suspended++;
                    }
                } catch (error) {
                    result.errors.push({
                        invoiceId: invoice.id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    logger.error(`Failed to process dunning for invoice ${invoice.id}:`, error);
                }
            }

            logger.info('Dunning notice processing completed', result);
            return result;
        } catch (error) {
            logger.error('Failed to process dunning notices:', error);
            throw error;
        }
    }

    /**
     * Send dunning notice for a specific invoice
     */
    async sendDunningNotice(invoiceId: string, noticeLevel: number): Promise<DunningNotice> {
        const trx = await this.db.transaction();

        try {
            const invoice = await this.paymentService.getInvoiceById(invoiceId, trx);
            if (!invoice) {
                throw new Error('Invoice not found');
            }

            // Check if notice already sent for this level
            const existingNotice = await trx('dunning_notices')
                .select('*')
                .where('invoice_id', invoiceId)
                .where('notice_level', noticeLevel)
                .first();

            if (existingNotice) {
                throw new Error(`Dunning notice level ${noticeLevel} already sent for invoice ${invoiceId}`);
            }

            const dunningStatus = this.getDunningStatusForLevel(noticeLevel);
            const message = this.getDunningMessage(noticeLevel, invoice.totalAmount, invoice.dueDate);

            const noticeId = uuidv4();
            const dunningNotice: DunningNotice = {
                id: noticeId,
                invoiceId,
                userId: invoice.userId,
                status: dunningStatus,
                noticeLevel,
                sentAt: new Date(),
                dueDate: invoice.dueDate,
                amount: invoice.totalAmount,
                message,
                deliveryMethod: 'email',
                delivered: false
            };

            await trx('dunning_notices').insert({
                id: noticeId,
                invoice_id: invoiceId,
                user_id: invoice.userId,
                status: dunningStatus,
                notice_level: noticeLevel,
                sent_at: new Date(),
                due_date: invoice.dueDate,
                amount: invoice.totalAmount,
                message,
                delivery_method: 'email',
                delivered: false
            });

            // If this is the final notice, suspend the user
            if (noticeLevel >= 3) {
                await this.suspendUserAccess(invoice.userId, trx);
            }

            await trx.commit();

            // Send the actual notification (would integrate with notification service)
            await this.deliverDunningNotice(dunningNotice);

            logger.info(`Dunning notice sent`, {
                noticeId,
                invoiceId,
                userId: invoice.userId,
                noticeLevel,
                status: dunningStatus
            });

            return dunningNotice;
        } catch (error) {
            await trx.rollback();
            logger.error('Failed to send dunning notice:', error);
            throw error;
        }
    }

    /**
     * Handle webhook events from payment provider
     */
    async handleWebhookEvent(payload: any, signature: string): Promise<void> {
        const trx = await this.db.transaction();

        try {
            // Validate webhook signature
            const webhookEvent = await this.paymentProvider.handleWebhook(payload, signature);

            // Check if event already processed (idempotency)
            const existingEvent = await trx('webhook_events')
                .select('*')
                .where('provider_event_id', webhookEvent.id)
                .first();

            if (existingEvent) {
                logger.info('Webhook event already processed', { eventId: webhookEvent.id });
                await trx.commit();
                return;
            }

            // Save webhook event
            const eventId = uuidv4();
            await trx('webhook_events').insert({
                id: eventId,
                provider: 'mock', // Would be dynamic based on provider
                event_type: webhookEvent.type,
                provider_event_id: webhookEvent.id,
                payload: JSON.stringify(webhookEvent.data),
                processed: false,
                received_at: new Date()
            });

            // Process the webhook event
            await this.processWebhookEvent(webhookEvent, trx);

            // Mark as processed
            await trx('webhook_events')
                .where('id', eventId)
                .update({
                    processed: true,
                    processed_at: new Date()
                });

            await trx.commit();

            logger.info('Webhook event processed successfully', {
                eventId: webhookEvent.id,
                eventType: webhookEvent.type
            });
        } catch (error) {
            await trx.rollback();

            // Save failed webhook processing
            try {
                await this.db('webhook_events').insert({
                    id: uuidv4(),
                    provider: 'mock',
                    event_type: 'unknown',
                    provider_event_id: payload.id || 'unknown',
                    payload: JSON.stringify(payload),
                    processed: false,
                    processing_error: error instanceof Error ? error.message : 'Unknown error',
                    received_at: new Date()
                });
            } catch (saveError) {
                logger.error('Failed to save failed webhook event:', saveError);
            }

            logger.error('Failed to process webhook event:', error);
            throw error;
        }
    }

    // Private helper methods

    private async getRetryDueAttempts(): Promise<PaymentAttempt[]> {
        const results = await this.db('payment_attempts')
            .select('*')
            .where('status', 'failed')
            .where('retry_count', '<', this.retryConfig.maxAttempts)
            .where(function () {
                this.whereNull('next_retry_at')
                    .orWhere('next_retry_at', '<=', new Date());
            });

        return results.map(result => ({
            id: result.id,
            invoiceId: result.invoice_id,
            amount: parseFloat(result.amount),
            currency: result.currency,
            paymentMethod: result.payment_method,
            status: result.status,
            providerTransactionId: result.provider_transaction_id,
            providerResponse: result.provider_response ? JSON.parse(result.provider_response) : undefined,
            failureReason: result.failure_reason,
            idempotencyKey: result.idempotency_key,
            attemptedAt: result.attempted_at,
            completedAt: result.completed_at,
            retryCount: result.retry_count,
            nextRetryAt: result.next_retry_at
        }));
    }

    private async scheduleNextRetry(attemptId: string, retryCount: number, trx: Knex.Transaction): Promise<void> {
        const delayMinutes = Math.min(
            this.retryConfig.baseDelayMinutes * Math.pow(this.retryConfig.backoffMultiplier, retryCount - 1),
            this.retryConfig.maxDelayMinutes
        );

        const nextRetryAt = new Date();
        nextRetryAt.setMinutes(nextRetryAt.getMinutes() + delayMinutes);

        await trx('payment_attempts')
            .where('id', attemptId)
            .update({
                next_retry_at: nextRetryAt
            });

        logger.info(`Payment retry scheduled`, {
            attemptId,
            retryCount,
            nextRetryAt,
            delayMinutes
        });
    }

    private async handleMaxRetriesExceeded(invoiceId: string, trx: Knex.Transaction): Promise<void> {
        // Mark invoice as overdue
        await trx('invoices')
            .where('id', invoiceId)
            .update({
                status: 'overdue',
                updated_at: new Date()
            });

        // Start dunning process
        await this.initiateDunningProcess(invoiceId, trx);

        logger.info(`Max payment retries exceeded, starting dunning process`, { invoiceId });
    }

    private async initiateDunningProcess(invoiceId: string, trx: Knex.Transaction): Promise<void> {
        const invoice = await this.paymentService.getInvoiceById(invoiceId, trx);
        if (!invoice) return;

        // Send first dunning notice
        await trx('dunning_notices').insert({
            id: uuidv4(),
            invoice_id: invoiceId,
            user_id: invoice.userId,
            status: 'notice_1',
            notice_level: 1,
            sent_at: new Date(),
            due_date: invoice.dueDate,
            amount: invoice.totalAmount,
            message: this.getDunningMessage(1, invoice.totalAmount, invoice.dueDate),
            delivery_method: 'email',
            delivered: false
        });
    }

    private async getOverdueInvoicesForDunning(): Promise<Invoice[]> {
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const results = await this.db('invoices')
            .select('*')
            .where('status', 'overdue')
            .where(function () {
                // First notice: 3 days overdue
                this.where(function () {
                    this.where('due_date', '<=', threeDaysAgo)
                        .whereNotExists(
                            this.db('dunning_notices')
                                .select(1)
                                .where('invoice_id', this.db.raw('invoices.id'))
                                .where('notice_level', 1)
                        );
                })
                    // Second notice: 7 days overdue
                    .orWhere(function () {
                        this.where('due_date', '<=', sevenDaysAgo)
                            .whereExists(
                                this.db('dunning_notices')
                                    .select(1)
                                    .where('invoice_id', this.db.raw('invoices.id'))
                                    .where('notice_level', 1)
                            )
                            .whereNotExists(
                                this.db('dunning_notices')
                                    .select(1)
                                    .where('invoice_id', this.db.raw('invoices.id'))
                                    .where('notice_level', 2)
                            );
                    })
                    // Final notice: 14 days overdue
                    .orWhere(function () {
                        this.where('due_date', '<=', fourteenDaysAgo)
                            .whereExists(
                                this.db('dunning_notices')
                                    .select(1)
                                    .where('invoice_id', this.db.raw('invoices.id'))
                                    .where('notice_level', 2)
                            )
                            .whereNotExists(
                                this.db('dunning_notices')
                                    .select(1)
                                    .where('invoice_id', this.db.raw('invoices.id'))
                                    .where('notice_level', 3)
                            );
                    });
            });

        return results.map(result => ({
            id: result.id,
            userId: result.user_id,
            billingPeriod: {
                start: result.billing_period_start,
                end: result.billing_period_end
            },
            lineItems: JSON.parse(result.line_items || '[]'),
            totalAmount: parseFloat(result.total_amount),
            currency: result.currency,
            dueDate: result.due_date,
            status: result.status,
            paymentAttempts: [], // Would be loaded separately if needed
            createdAt: result.created_at,
            updatedAt: result.updated_at,
            paidAt: result.paid_at,
            notes: result.notes
        }));
    }

    private async processDunningForInvoice(invoice: Invoice): Promise<{ sent: boolean; suspended: boolean }> {
        const now = new Date();
        const daysSinceOverdue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000));

        let noticeLevel = 0;
        if (daysSinceOverdue >= 14) noticeLevel = 3;
        else if (daysSinceOverdue >= 7) noticeLevel = 2;
        else if (daysSinceOverdue >= 3) noticeLevel = 1;

        if (noticeLevel === 0) return { sent: false, suspended: false };

        await this.sendDunningNotice(invoice.id, noticeLevel);

        return {
            sent: true,
            suspended: noticeLevel >= 3
        };
    }

    private getDunningStatusForLevel(level: number): DunningStatus {
        const statusMap: Record<number, DunningStatus> = {
            1: 'notice_1',
            2: 'notice_2',
            3: 'notice_3'
        };
        return statusMap[level] || 'notice_1';
    }

    private getDunningMessage(level: number, amount: number, dueDate: Date): string {
        const messages = {
            1: `Your payment of ${amount} was due on ${dueDate.toDateString()}. Please settle your account immediately to avoid service interruption.`,
            2: `URGENT: Your payment of ${amount} is now 7 days overdue. Immediate payment is required to maintain service access.`,
            3: `FINAL NOTICE: Your payment of ${amount} is now 14 days overdue. Your account will be suspended if payment is not received within 24 hours.`
        };
        return messages[level as keyof typeof messages] || messages[1];
    }

    private async suspendUserAccess(userId: string, trx: Knex.Transaction): Promise<void> {
        await trx('users')
            .where('id', userId)
            .update({
                status: 'suspended',
                updated_at: new Date()
            });

        logger.info(`User access suspended due to overdue payment`, { userId });
    }

    private async deliverDunningNotice(notice: DunningNotice): Promise<void> {
        // This would integrate with email/SMS service
        // For now, just mark as delivered
        await this.db('dunning_notices')
            .where('id', notice.id)
            .update({
                delivered: true,
                delivered_at: new Date()
            });

        logger.info(`Dunning notice delivered`, {
            noticeId: notice.id,
            userId: notice.userId,
            deliveryMethod: notice.deliveryMethod
        });
    }

    private async processWebhookEvent(event: WebhookEvent, trx: Knex.Transaction): Promise<void> {
        switch (event.type) {
            case 'payment.succeeded':
                await this.handlePaymentSucceededWebhook(event.data, trx);
                break;
            case 'payment.failed':
                await this.handlePaymentFailedWebhook(event.data, trx);
                break;
            case 'invoice.payment_succeeded':
                await this.handleInvoicePaymentSucceededWebhook(event.data, trx);
                break;
            default:
                logger.info(`Unhandled webhook event type: ${event.type}`);
        }
    }

    private async handlePaymentSucceededWebhook(data: any, trx: Knex.Transaction): Promise<void> {
        const transactionId = data.id;

        // Find payment attempt by provider transaction ID
        const attempt = await trx('payment_attempts')
            .select('*')
            .where('provider_transaction_id', transactionId)
            .first();

        if (attempt) {
            // Update payment attempt status
            await trx('payment_attempts')
                .where('id', attempt.id)
                .update({
                    status: 'succeeded',
                    completed_at: new Date()
                });

            // Update invoice status
            await trx('invoices')
                .where('id', attempt.invoice_id)
                .update({
                    status: 'paid',
                    paid_at: new Date(),
                    updated_at: new Date()
                });

            logger.info(`Payment succeeded via webhook`, {
                transactionId,
                invoiceId: attempt.invoice_id
            });
        }
    }

    private async handlePaymentFailedWebhook(data: any, trx: Knex.Transaction): Promise<void> {
        const transactionId = data.id;

        // Find payment attempt by provider transaction ID
        const attempt = await trx('payment_attempts')
            .select('*')
            .where('provider_transaction_id', transactionId)
            .first();

        if (attempt) {
            // Update payment attempt status
            await trx('payment_attempts')
                .where('id', attempt.id)
                .update({
                    status: 'failed',
                    failure_reason: data.failure_reason || 'Payment failed via webhook',
                    completed_at: new Date()
                });

            logger.info(`Payment failed via webhook`, {
                transactionId,
                invoiceId: attempt.invoice_id,
                reason: data.failure_reason
            });
        }
    }

    private async handleInvoicePaymentSucceededWebhook(data: any, trx: Knex.Transaction): Promise<void> {
        // Handle invoice-level payment success events
        logger.info(`Invoice payment succeeded via webhook`, { data });
    }
}