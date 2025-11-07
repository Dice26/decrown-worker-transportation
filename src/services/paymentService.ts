import { getDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import {
    Invoice,
    InvoiceStatus,
    InvoiceLineItem,
    UsageLedger,
    PaymentAttempt,
    PaymentStatus,
    DunningNotice,
    DunningStatus,
    PaymentConfiguration,
    InvoiceGenerationRequest,
    PaymentProcessingRequest,
    UsageAggregationResult,
    BillingCycleResult,
    PaymentRetryConfig,
    ChargeResult,
    PaymentProvider,
    WebhookEvent,
    WebhookValidationResult
} from '@/types/payment';
import { Trip } from '@/types/transport';
import { User } from '@/types/auth';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export class PaymentService {
    private db: Knex;
    private paymentProvider: PaymentProvider;
    private config: PaymentConfiguration;
    private retryConfig: PaymentRetryConfig;

    constructor(paymentProvider: PaymentProvider) {
        this.db = getDatabase();
        this.paymentProvider = paymentProvider;
        this.config = {
            baseFarePerRide: 50.00, // PHP 50 per ride
            distanceFeePerKm: 15.00, // PHP 15 per km
            timeFeePerMinute: 2.00, // PHP 2 per minute
            currency: 'PHP',
            paymentRetryAttempts: 3,
            retryDelayMinutes: [60, 240, 1440], // 1 hour, 4 hours, 24 hours
            dunningNoticeDays: [3, 7, 14], // Days after due date
            suspensionGraceDays: 30,
            dryRunMode: process.env.NODE_ENV !== 'production'
        };
        this.retryConfig = {
            maxAttempts: 3,
            baseDelayMinutes: 60,
            maxDelayMinutes: 1440,
            backoffMultiplier: 2
        };
    }

    /**
     * Aggregate monthly usage data from trip records
     */
    async aggregateMonthlyUsage(userId: string, year: number, month: number): Promise<UsageAggregationResult> {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

        try {
            // Get completed trips for the user in the specified month
            const trips = await this.db('trips')
                .select('*')
                .whereExists(
                    this.db('trip_stops')
                        .select(1)
                        .where('trip_id', this.db.raw('trips.id'))
                        .where('user_id', userId)
                )
                .where('status', 'completed')
                .whereBetween('completed_at', [startDate, endDate]);

            let totalDistance = 0;
            let totalDuration = 0;
            let ridesCount = 0;

            for (const trip of trips) {
                const metrics = JSON.parse(trip.metrics || '{}');
                const actualStops = JSON.parse(trip.actual_stops || '[]');

                // Check if user was actually picked up
                const userStop = actualStops.find((stop: any) => stop.userId === userId);
                if (userStop && userStop.status === 'picked_up') {
                    ridesCount++;
                    totalDistance += metrics.totalDistance || 0;
                    totalDuration += metrics.totalDuration || 0;
                }
            }

            // Calculate raw cost based on usage
            const rawCost = this.calculateUsageCost(ridesCount, totalDistance, totalDuration);

            // Get existing ledger adjustments
            const existingLedger = await this.getUsageLedger(userId, monthKey);
            const adjustments = existingLedger?.adjustments.reduce((sum, adj) => {
                return sum + (adj.type === 'credit' ? -adj.amount : adj.amount);
            }, 0) || 0;

            const finalCost = Math.max(0, rawCost + adjustments);

            return {
                userId,
                period: monthKey,
                ridesCount,
                totalDistance,
                totalDuration,
                rawCost,
                adjustments,
                finalCost
            };
        } catch (error) {
            logger.error('Failed to aggregate monthly usage:', error);
            throw error;
        }
    }

    /**
     * Generate invoice for a user's monthly usage
     */
    async generateInvoice(request: InvoiceGenerationRequest): Promise<Invoice> {
        const trx = await this.db.transaction();

        try {
            const { userId, billingPeriod, dryRun = false } = request;
            const monthKey = `${billingPeriod.start.getFullYear()}-${(billingPeriod.start.getMonth() + 1).toString().padStart(2, '0')}`;

            // Check if invoice already exists for this period
            const existingInvoice = await this.getInvoiceByPeriod(userId, billingPeriod, trx);
            if (existingInvoice) {
                throw new Error(`Invoice already exists for period ${monthKey}`);
            }

            // Aggregate usage data
            const usageData = await this.aggregateMonthlyUsage(
                userId,
                billingPeriod.start.getFullYear(),
                billingPeriod.start.getMonth() + 1
            );

            // Create or update usage ledger
            await this.createOrUpdateUsageLedger(usageData, trx);

            // Generate line items
            const lineItems = this.generateLineItems(usageData);

            // Calculate due date (30 days from generation)
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);

            const invoiceId = uuidv4();
            const invoice: Invoice = {
                id: invoiceId,
                userId,
                billingPeriod,
                lineItems,
                totalAmount: usageData.finalCost,
                currency: this.config.currency,
                dueDate,
                status: dryRun ? 'draft' : 'pending',
                paymentAttempts: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                notes: dryRun ? 'Generated in dry-run mode' : undefined
            };

            if (!dryRun) {
                // Save invoice to database
                await trx('invoices').insert({
                    id: invoiceId,
                    user_id: userId,
                    billing_period_start: billingPeriod.start,
                    billing_period_end: billingPeriod.end,
                    line_items: JSON.stringify(lineItems),
                    total_amount: usageData.finalCost,
                    currency: this.config.currency,
                    due_date: dueDate,
                    status: 'pending',
                    created_at: new Date(),
                    updated_at: new Date()
                });
            }

            await trx.commit();

            logger.info(`Invoice generated successfully`, {
                invoiceId,
                userId,
                period: monthKey,
                amount: usageData.finalCost,
                dryRun
            });

            return invoice;
        } catch (error) {
            await trx.rollback();
            logger.error('Failed to generate invoice:', error);
            throw error;
        }
    }

    /**
     * Process payment for an invoice
     */
    async processPayment(request: PaymentProcessingRequest): Promise<PaymentAttempt> {
        const trx = await this.db.transaction();

        try {
            const { invoiceId, paymentMethodToken, dryRun = false } = request;

            const invoice = await this.getInvoiceById(invoiceId, trx);
            if (!invoice) {
                throw new Error('Invoice not found');
            }

            if (invoice.status !== 'pending' && invoice.status !== 'overdue') {
                throw new Error(`Cannot process payment for invoice with status: ${invoice.status}`);
            }

            // Get user information
            const user = await trx('users').select('*').where('id', invoice.userId).first();
            if (!user) {
                throw new Error('User not found');
            }

            // Create payment attempt record
            const attemptId = uuidv4();
            const idempotencyKey = `payment_${invoiceId}_${attemptId}`;

            const paymentAttempt: PaymentAttempt = {
                id: attemptId,
                invoiceId,
                amount: invoice.totalAmount,
                currency: invoice.currency,
                paymentMethod: 'card',
                status: 'pending',
                idempotencyKey,
                attemptedAt: new Date(),
                retryCount: 0
            };

            // Save payment attempt
            await trx('payment_attempts').insert({
                id: attemptId,
                invoice_id: invoiceId,
                amount: invoice.totalAmount,
                currency: invoice.currency,
                payment_method: 'card',
                status: 'pending',
                idempotency_key: idempotencyKey,
                attempted_at: new Date(),
                retry_count: 0
            });

            let chargeResult: ChargeResult;

            if (dryRun || this.config.dryRunMode) {
                // Simulate payment processing
                chargeResult = await this.simulatePayment(invoice.totalAmount);
            } else {
                // Process actual payment
                const customerId = user.payment_customer_id || await this.createCustomer(user, trx);
                chargeResult = await this.paymentProvider.chargeCustomer(
                    customerId,
                    invoice.totalAmount,
                    invoice.currency,
                    idempotencyKey
                );
            }

            // Update payment attempt with result
            paymentAttempt.status = chargeResult.status;
            paymentAttempt.providerTransactionId = chargeResult.transactionId;
            paymentAttempt.providerResponse = chargeResult.metadata;
            paymentAttempt.failureReason = chargeResult.failureReason;
            paymentAttempt.completedAt = new Date();

            await trx('payment_attempts')
                .where('id', attemptId)
                .update({
                    status: chargeResult.status,
                    provider_transaction_id: chargeResult.transactionId,
                    provider_response: JSON.stringify(chargeResult.metadata || {}),
                    failure_reason: chargeResult.failureReason,
                    completed_at: new Date()
                });

            // Update invoice status based on payment result
            if (chargeResult.success && chargeResult.status === 'succeeded') {
                await trx('invoices')
                    .where('id', invoiceId)
                    .update({
                        status: 'paid',
                        paid_at: new Date(),
                        updated_at: new Date()
                    });

                invoice.status = 'paid';
                invoice.paidAt = new Date();
            } else if (chargeResult.status === 'failed') {
                // Schedule retry if within retry limits
                await this.schedulePaymentRetry(invoiceId, paymentAttempt.retryCount + 1, trx);
            }

            await trx.commit();

            logger.info(`Payment processed`, {
                invoiceId,
                attemptId,
                status: chargeResult.status,
                amount: invoice.totalAmount,
                dryRun: dryRun || this.config.dryRunMode
            });

            return paymentAttempt;
        } catch (error) {
            await trx.rollback();
            logger.error('Failed to process payment:', error);
            throw error;
        }
    }

    /**
     * Run monthly billing cycle for all users
     */
    async runBillingCycle(year: number, month: number, dryRun: boolean = false): Promise<BillingCycleResult> {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const result: BillingCycleResult = {
            processedUsers: 0,
            generatedInvoices: 0,
            totalAmount: 0,
            errors: []
        };

        try {
            // Get all active users who had trips in the billing period
            const usersWithTrips = await this.db('users')
                .select('users.*')
                .distinct()
                .join('trip_stops', 'users.id', 'trip_stops.user_id')
                .join('trips', 'trip_stops.trip_id', 'trips.id')
                .where('trips.status', 'completed')
                .whereBetween('trips.completed_at', [startDate, endDate])
                .where('users.status', 'active');

            for (const user of usersWithTrips) {
                try {
                    result.processedUsers++;

                    const invoice = await this.generateInvoice({
                        userId: user.id,
                        billingPeriod: {
                            start: startDate,
                            end: endDate
                        },
                        dryRun
                    });

                    if (invoice.totalAmount > 0) {
                        result.generatedInvoices++;
                        result.totalAmount += invoice.totalAmount;

                        // Send invoice notification (would integrate with notification service)
                        await this.sendInvoiceNotification(invoice);
                    }
                } catch (error) {
                    result.errors.push({
                        userId: user.id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    logger.error(`Failed to process billing for user ${user.id}:`, error);
                }
            }

            logger.info(`Billing cycle completed`, {
                year,
                month,
                processedUsers: result.processedUsers,
                generatedInvoices: result.generatedInvoices,
                totalAmount: result.totalAmount,
                errors: result.errors.length,
                dryRun
            });

            return result;
        } catch (error) {
            logger.error('Failed to run billing cycle:', error);
            throw error;
        }
    }

    /**
     * Get invoice by ID
     */
    async getInvoiceById(invoiceId: string, trx?: Knex.Transaction): Promise<Invoice | null> {
        const db = trx || this.db;

        const result = await db('invoices')
            .select('*')
            .where('id', invoiceId)
            .first();

        if (!result) return null;

        // Get payment attempts
        const attempts = await db('payment_attempts')
            .select('*')
            .where('invoice_id', invoiceId)
            .orderBy('attempted_at', 'desc');

        return {
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
            paymentAttempts: attempts.map(attempt => ({
                id: attempt.id,
                invoiceId: attempt.invoice_id,
                amount: parseFloat(attempt.amount),
                currency: attempt.currency,
                paymentMethod: attempt.payment_method,
                status: attempt.status,
                providerTransactionId: attempt.provider_transaction_id,
                providerResponse: attempt.provider_response ? JSON.parse(attempt.provider_response) : undefined,
                failureReason: attempt.failure_reason,
                idempotencyKey: attempt.idempotency_key,
                attemptedAt: attempt.attempted_at,
                completedAt: attempt.completed_at,
                retryCount: attempt.retry_count,
                nextRetryAt: attempt.next_retry_at
            })),
            createdAt: result.created_at,
            updatedAt: result.updated_at,
            paidAt: result.paid_at,
            notes: result.notes
        };
    }

    /**
     * Get usage ledger for a user and month
     */
    async getUsageLedger(userId: string, month: string): Promise<UsageLedger | null> {
        const result = await this.db('usage_ledgers')
            .select('*')
            .where('user_id', userId)
            .where('month', month)
            .first();

        if (!result) return null;

        // Get adjustments
        const adjustments = await this.db('ledger_adjustments')
            .select('*')
            .where('ledger_id', result.id)
            .orderBy('applied_at', 'desc');

        return {
            id: result.id,
            userId: result.user_id,
            month: result.month,
            ridesCount: result.rides_count,
            totalDistance: parseFloat(result.total_distance),
            totalDuration: parseFloat(result.total_duration),
            costComponents: JSON.parse(result.cost_components),
            adjustments: adjustments.map(adj => ({
                id: adj.id,
                type: adj.type,
                amount: parseFloat(adj.amount),
                reason: adj.reason,
                appliedBy: adj.applied_by,
                appliedAt: adj.applied_at,
                metadata: adj.metadata ? JSON.parse(adj.metadata) : undefined
            })),
            finalAmount: parseFloat(result.final_amount),
            createdAt: result.created_at,
            updatedAt: result.updated_at
        };
    }

    // Private helper methods

    private calculateUsageCost(ridesCount: number, totalDistance: number, totalDuration: number): number {
        const baseCost = ridesCount * this.config.baseFarePerRide;
        const distanceCost = (totalDistance / 1000) * this.config.distanceFeePerKm; // Convert meters to km
        const timeCost = totalDuration * this.config.timeFeePerMinute;

        return Math.round((baseCost + distanceCost + timeCost) * 100) / 100; // Round to 2 decimal places
    }

    private generateLineItems(usageData: UsageAggregationResult): InvoiceLineItem[] {
        const lineItems: InvoiceLineItem[] = [];

        if (usageData.ridesCount > 0) {
            lineItems.push({
                id: uuidv4(),
                description: `Transportation rides (${usageData.ridesCount} rides)`,
                quantity: usageData.ridesCount,
                unitPrice: this.config.baseFarePerRide,
                totalPrice: usageData.ridesCount * this.config.baseFarePerRide
            });
        }

        if (usageData.totalDistance > 0) {
            const distanceKm = Math.round((usageData.totalDistance / 1000) * 100) / 100;
            lineItems.push({
                id: uuidv4(),
                description: `Distance fee (${distanceKm} km)`,
                quantity: distanceKm,
                unitPrice: this.config.distanceFeePerKm,
                totalPrice: distanceKm * this.config.distanceFeePerKm
            });
        }

        if (usageData.totalDuration > 0) {
            lineItems.push({
                id: uuidv4(),
                description: `Time fee (${usageData.totalDuration} minutes)`,
                quantity: usageData.totalDuration,
                unitPrice: this.config.timeFeePerMinute,
                totalPrice: usageData.totalDuration * this.config.timeFeePerMinute
            });
        }

        if (usageData.adjustments !== 0) {
            lineItems.push({
                id: uuidv4(),
                description: usageData.adjustments > 0 ? 'Additional charges' : 'Credits and discounts',
                quantity: 1,
                unitPrice: usageData.adjustments,
                totalPrice: usageData.adjustments
            });
        }

        return lineItems;
    }

    private async getInvoiceByPeriod(userId: string, billingPeriod: { start: Date; end: Date }, trx: Knex.Transaction): Promise<Invoice | null> {
        const result = await trx('invoices')
            .select('*')
            .where('user_id', userId)
            .where('billing_period_start', billingPeriod.start)
            .where('billing_period_end', billingPeriod.end)
            .first();

        return result ? await this.getInvoiceById(result.id, trx) : null;
    }

    private async createOrUpdateUsageLedger(usageData: UsageAggregationResult, trx: Knex.Transaction): Promise<void> {
        const existingLedger = await trx('usage_ledgers')
            .select('*')
            .where('user_id', usageData.userId)
            .where('month', usageData.period)
            .first();

        const costComponents = {
            baseFare: usageData.ridesCount * this.config.baseFarePerRide,
            distanceFee: (usageData.totalDistance / 1000) * this.config.distanceFeePerKm,
            timeFee: usageData.totalDuration * this.config.timeFeePerMinute,
            surcharges: 0,
            discounts: 0
        };

        if (existingLedger) {
            await trx('usage_ledgers')
                .where('id', existingLedger.id)
                .update({
                    rides_count: usageData.ridesCount,
                    total_distance: usageData.totalDistance,
                    total_duration: usageData.totalDuration,
                    cost_components: JSON.stringify(costComponents),
                    final_amount: usageData.finalCost,
                    updated_at: new Date()
                });
        } else {
            await trx('usage_ledgers').insert({
                id: uuidv4(),
                user_id: usageData.userId,
                month: usageData.period,
                rides_count: usageData.ridesCount,
                total_distance: usageData.totalDistance,
                total_duration: usageData.totalDuration,
                cost_components: JSON.stringify(costComponents),
                final_amount: usageData.finalCost,
                created_at: new Date(),
                updated_at: new Date()
            });
        }
    }

    private async createCustomer(user: any, trx: Knex.Transaction): Promise<string> {
        const customerId = await this.paymentProvider.createCustomer({
            id: user.id,
            email: user.email
        });

        await trx('users')
            .where('id', user.id)
            .update({
                payment_customer_id: customerId,
                updated_at: new Date()
            });

        return customerId;
    }

    private async simulatePayment(amount: number): Promise<ChargeResult> {
        // Simulate payment processing with random success/failure
        const success = Math.random() > 0.1; // 90% success rate in dry-run

        if (success) {
            return {
                success: true,
                transactionId: `sim_${uuidv4()}`,
                status: 'succeeded',
                metadata: {
                    simulatedPayment: true,
                    amount,
                    processedAt: new Date().toISOString()
                }
            };
        } else {
            return {
                success: false,
                status: 'failed',
                failureReason: 'Simulated payment failure for testing',
                metadata: {
                    simulatedPayment: true,
                    amount
                }
            };
        }
    }

    private async schedulePaymentRetry(invoiceId: string, retryCount: number, trx: Knex.Transaction): Promise<void> {
        if (retryCount > this.retryConfig.maxAttempts) {
            // Mark invoice as overdue and start dunning process
            await trx('invoices')
                .where('id', invoiceId)
                .update({
                    status: 'overdue',
                    updated_at: new Date()
                });

            await this.initiateDunningProcess(invoiceId, trx);
            return;
        }

        const delayMinutes = Math.min(
            this.retryConfig.baseDelayMinutes * Math.pow(this.retryConfig.backoffMultiplier, retryCount - 1),
            this.retryConfig.maxDelayMinutes
        );

        const nextRetryAt = new Date();
        nextRetryAt.setMinutes(nextRetryAt.getMinutes() + delayMinutes);

        // This would typically be handled by a job queue system
        logger.info(`Payment retry scheduled`, {
            invoiceId,
            retryCount,
            nextRetryAt,
            delayMinutes
        });
    }

    private async initiateDunningProcess(invoiceId: string, trx: Knex.Transaction): Promise<void> {
        // Create first dunning notice
        const invoice = await this.getInvoiceById(invoiceId, trx);
        if (!invoice) return;

        await trx('dunning_notices').insert({
            id: uuidv4(),
            invoice_id: invoiceId,
            user_id: invoice.userId,
            status: 'notice_1',
            notice_level: 1,
            sent_at: new Date(),
            due_date: invoice.dueDate,
            amount: invoice.totalAmount,
            message: 'Your payment is overdue. Please settle your account to avoid service suspension.',
            delivery_method: 'email',
            delivered: false
        });

        logger.info(`Dunning process initiated`, {
            invoiceId,
            userId: invoice.userId,
            amount: invoice.totalAmount
        });
    }

    private async sendInvoiceNotification(invoice: Invoice): Promise<void> {
        // This would integrate with a notification service
        logger.info(`Invoice notification sent`, {
            invoiceId: invoice.id,
            userId: invoice.userId,
            amount: invoice.totalAmount,
            dueDate: invoice.dueDate
        });
    }
}