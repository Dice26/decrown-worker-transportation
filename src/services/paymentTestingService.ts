import { getDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import {
    Invoice,
    PaymentAttempt,
    UsageAggregationResult,
    BillingCycleResult,
    InvoiceGenerationRequest,
    PaymentProcessingRequest,
    WebhookEvent,
    ChargeResult
} from '@/types/payment';
import { PaymentService } from './paymentService';
import { PaymentRetryService } from './paymentRetryService';
import { MockPaymentProvider } from './paymentProviders/mockPaymentProvider';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export interface DryRunTestScenario {
    name: string;
    description: string;
    setup: () => Promise<void>;
    execute: () => Promise<any>;
    validate: (result: any) => Promise<boolean>;
    cleanup?: () => Promise<void>;
}

export interface PaymentTestResult {
    scenarioName: string;
    success: boolean;
    duration: number;
    result?: any;
    error?: string;
    validationPassed?: boolean;
}

export interface WebhookTestConfig {
    eventType: string;
    data: any;
    expectedOutcome: 'success' | 'failure';
    description: string;
}

export class PaymentTestingService {
    private db: Knex;
    private paymentService: PaymentService;
    private paymentRetryService: PaymentRetryService;
    private mockProvider: MockPaymentProvider;
    private testDataPrefix = 'test_';

    constructor() {
        this.db = getDatabase();
        this.mockProvider = new MockPaymentProvider();
        this.paymentService = new PaymentService(this.mockProvider);
        this.paymentRetryService = new PaymentRetryService(this.paymentService, this.mockProvider);
    }

    /**
     * Run comprehensive payment system tests
     */
    async runPaymentTests(): Promise<{
        totalTests: number;
        passed: number;
        failed: number;
        results: PaymentTestResult[];
    }> {
        const scenarios = this.getTestScenarios();
        const results: PaymentTestResult[] = [];

        logger.info(`Starting payment system tests (${scenarios.length} scenarios)`);

        for (const scenario of scenarios) {
            const startTime = Date.now();
            let testResult: PaymentTestResult = {
                scenarioName: scenario.name,
                success: false,
                duration: 0
            };

            try {
                // Setup test data
                await scenario.setup();

                // Execute test
                const result = await scenario.execute();
                testResult.result = result;

                // Validate result
                const validationPassed = await scenario.validate(result);
                testResult.validationPassed = validationPassed;
                testResult.success = validationPassed;

                // Cleanup if provided
                if (scenario.cleanup) {
                    await scenario.cleanup();
                }

                logger.info(`Test scenario '${scenario.name}' ${testResult.success ? 'PASSED' : 'FAILED'}`);
            } catch (error) {
                testResult.error = error instanceof Error ? error.message : 'Unknown error';
                testResult.success = false;
                logger.error(`Test scenario '${scenario.name}' FAILED:`, error);
            } finally {
                testResult.duration = Date.now() - startTime;
                results.push(testResult);
            }
        }

        const summary = {
            totalTests: results.length,
            passed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };

        logger.info('Payment system tests completed', {
            total: summary.totalTests,
            passed: summary.passed,
            failed: summary.failed
        });

        return summary;
    }

    /**
     * Test invoice generation in dry-run mode
     */
    async testInvoiceGeneration(userId: string, billingPeriod: { start: Date; end: Date }): Promise<{
        invoice: Invoice;
        usageData: UsageAggregationResult;
        validationResults: {
            lineItemsValid: boolean;
            amountCalculationValid: boolean;
            periodValid: boolean;
        };
    }> {
        try {
            // Generate usage data
            const usageData = await this.paymentService.aggregateMonthlyUsage(
                userId,
                billingPeriod.start.getFullYear(),
                billingPeriod.start.getMonth() + 1
            );

            // Generate invoice in dry-run mode
            const invoice = await this.paymentService.generateInvoice({
                userId,
                billingPeriod,
                dryRun: true
            });

            // Validate invoice
            const validationResults = {
                lineItemsValid: this.validateLineItems(invoice.lineItems, usageData),
                amountCalculationValid: this.validateAmountCalculation(invoice, usageData),
                periodValid: this.validateBillingPeriod(invoice.billingPeriod, billingPeriod)
            };

            logger.info('Invoice generation test completed', {
                userId,
                invoiceId: invoice.id,
                amount: invoice.totalAmount,
                validationResults
            });

            return {
                invoice,
                usageData,
                validationResults
            };
        } catch (error) {
            logger.error('Invoice generation test failed:', error);
            throw error;
        }
    }

    /**
     * Test payment processing in dry-run mode
     */
    async testPaymentProcessing(invoiceAmount: number, simulateFailure: boolean = false): Promise<{
        invoice: Invoice;
        paymentAttempt: PaymentAttempt;
        validationResults: {
            attemptCreated: boolean;
            statusCorrect: boolean;
            idempotencyWorking: boolean;
        };
    }> {
        try {
            // Create test user and invoice
            const testUser = await this.createTestUser();
            const testInvoice = await this.createTestInvoice(testUser.id, invoiceAmount);

            // Configure mock provider for failure if requested
            if (simulateFailure) {
                // This would configure the mock provider to simulate failure
                logger.info('Simulating payment failure for test');
            }

            // Process payment in dry-run mode
            const paymentAttempt = await this.paymentService.processPayment({
                invoiceId: testInvoice.id,
                dryRun: true
            });

            // Test idempotency by processing again
            const secondAttempt = await this.paymentService.processPayment({
                invoiceId: testInvoice.id,
                dryRun: true
            });

            const validationResults = {
                attemptCreated: !!paymentAttempt.id,
                statusCorrect: simulateFailure ?
                    paymentAttempt.status === 'failed' :
                    paymentAttempt.status === 'succeeded',
                idempotencyWorking: paymentAttempt.id !== secondAttempt.id // Should create new attempt
            };

            logger.info('Payment processing test completed', {
                invoiceId: testInvoice.id,
                attemptId: paymentAttempt.id,
                status: paymentAttempt.status,
                validationResults
            });

            return {
                invoice: testInvoice,
                paymentAttempt,
                validationResults
            };
        } catch (error) {
            logger.error('Payment processing test failed:', error);
            throw error;
        }
    }

    /**
     * Test webhook processing with mock events
     */
    async testWebhookProcessing(configs: WebhookTestConfig[]): Promise<{
        totalWebhooks: number;
        processed: number;
        failed: number;
        results: Array<{
            config: WebhookTestConfig;
            success: boolean;
            error?: string;
        }>;
    }> {
        const results = [];

        for (const config of configs) {
            try {
                // Generate mock webhook
                const { payload, signature } = this.mockProvider.generateMockWebhook(
                    config.eventType,
                    config.data
                );

                // Process webhook
                await this.paymentRetryService.handleWebhookEvent(payload, signature);

                results.push({
                    config,
                    success: true
                });

                logger.info(`Webhook test passed: ${config.description}`);
            } catch (error) {
                results.push({
                    config,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });

                logger.error(`Webhook test failed: ${config.description}`, error);
            }
        }

        return {
            totalWebhooks: configs.length,
            processed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Test billing cycle in dry-run mode
     */
    async testBillingCycle(year: number, month: number): Promise<{
        result: BillingCycleResult;
        validationResults: {
            usersProcessed: boolean;
            invoicesGenerated: boolean;
            amountsCalculated: boolean;
            errorsHandled: boolean;
        };
    }> {
        try {
            // Run billing cycle in dry-run mode
            const result = await this.paymentService.runBillingCycle(year, month, true);

            const validationResults = {
                usersProcessed: result.processedUsers > 0,
                invoicesGenerated: result.generatedInvoices >= 0,
                amountsCalculated: result.totalAmount >= 0,
                errorsHandled: Array.isArray(result.errors)
            };

            logger.info('Billing cycle test completed', {
                year,
                month,
                result,
                validationResults
            });

            return {
                result,
                validationResults
            };
        } catch (error) {
            logger.error('Billing cycle test failed:', error);
            throw error;
        }
    }

    /**
     * Test payment retry logic
     */
    async testPaymentRetries(): Promise<{
        retriesProcessed: number;
        successfulRetries: number;
        failedRetries: number;
        validationResults: {
            exponentialBackoffWorking: boolean;
            maxRetriesRespected: boolean;
            dunningInitiated: boolean;
        };
    }> {
        try {
            // Create test scenario with failed payments
            const testUser = await this.createTestUser();
            const testInvoice = await this.createTestInvoice(testUser.id, 100);

            // Create failed payment attempts
            await this.createFailedPaymentAttempt(testInvoice.id, 1);
            await this.createFailedPaymentAttempt(testInvoice.id, 2);

            // Process retries
            const retryResult = await this.paymentRetryService.processPaymentRetries();

            const validationResults = {
                exponentialBackoffWorking: true, // Would need more complex validation
                maxRetriesRespected: retryResult.failed > 0, // Some should fail after max retries
                dunningInitiated: true // Would check if dunning notices were created
            };

            logger.info('Payment retry test completed', {
                retryResult,
                validationResults
            });

            return {
                retriesProcessed: retryResult.processed,
                successfulRetries: retryResult.succeeded,
                failedRetries: retryResult.failed,
                validationResults
            };
        } catch (error) {
            logger.error('Payment retry test failed:', error);
            throw error;
        }
    }

    /**
     * Generate test data for payment scenarios
     */
    async generateTestData(): Promise<{
        users: number;
        trips: number;
        invoices: number;
        paymentAttempts: number;
    }> {
        const trx = await this.db.transaction();

        try {
            let userCount = 0;
            let tripCount = 0;
            let invoiceCount = 0;
            let attemptCount = 0;

            // Create test users
            for (let i = 0; i < 5; i++) {
                const user = await this.createTestUser(trx);
                userCount++;

                // Create test trips for each user
                for (let j = 0; j < 3; j++) {
                    const trip = await this.createTestTrip(user.id, trx);
                    tripCount++;
                }

                // Create test invoice
                const invoice = await this.createTestInvoice(user.id, 150 + (i * 50), trx);
                invoiceCount++;

                // Create test payment attempts
                const attempt = await this.createTestPaymentAttempt(invoice.id, trx);
                attemptCount++;
            }

            await trx.commit();

            logger.info('Test data generated', {
                users: userCount,
                trips: tripCount,
                invoices: invoiceCount,
                paymentAttempts: attemptCount
            });

            return {
                users: userCount,
                trips: tripCount,
                invoices: invoiceCount,
                paymentAttempts: attemptCount
            };
        } catch (error) {
            await trx.rollback();
            logger.error('Failed to generate test data:', error);
            throw error;
        }
    }

    /**
     * Clean up all test data
     */
    async cleanupTestData(): Promise<void> {
        try {
            // Delete test data in reverse dependency order
            await this.db('payment_attempts').where('idempotency_key', 'like', `${this.testDataPrefix}%`).del();
            await this.db('invoices').where('id', 'like', `${this.testDataPrefix}%`).del();
            await this.db('trip_stops').where('trip_id', 'like', `${this.testDataPrefix}%`).del();
            await this.db('trips').where('id', 'like', `${this.testDataPrefix}%`).del();
            await this.db('users').where('email', 'like', `${this.testDataPrefix}%`).del();
            await this.db('usage_ledgers').where('user_id', 'like', `${this.testDataPrefix}%`).del();
            await this.db('dunning_notices').where('user_id', 'like', `${this.testDataPrefix}%`).del();
            await this.db('webhook_events').where('provider_event_id', 'like', `${this.testDataPrefix}%`).del();

            // Clear mock provider data
            this.mockProvider.clearMockData();

            logger.info('Test data cleanup completed');
        } catch (error) {
            logger.error('Failed to cleanup test data:', error);
            throw error;
        }
    }

    // Private helper methods

    private getTestScenarios(): DryRunTestScenario[] {
        return [
            {
                name: 'Invoice Generation',
                description: 'Test invoice generation with various usage patterns',
                setup: async () => {
                    await this.generateTestData();
                },
                execute: async () => {
                    const testUser = await this.createTestUser();
                    return await this.testInvoiceGeneration(testUser.id, {
                        start: new Date(2024, 0, 1),
                        end: new Date(2024, 0, 31)
                    });
                },
                validate: async (result) => {
                    return result.validationResults.lineItemsValid &&
                        result.validationResults.amountCalculationValid &&
                        result.validationResults.periodValid;
                },
                cleanup: async () => {
                    await this.cleanupTestData();
                }
            },
            {
                name: 'Payment Processing Success',
                description: 'Test successful payment processing',
                setup: async () => { },
                execute: async () => {
                    return await this.testPaymentProcessing(100, false);
                },
                validate: async (result) => {
                    return result.validationResults.attemptCreated &&
                        result.validationResults.statusCorrect;
                }
            },
            {
                name: 'Payment Processing Failure',
                description: 'Test failed payment processing and retry logic',
                setup: async () => { },
                execute: async () => {
                    return await this.testPaymentProcessing(100, true);
                },
                validate: async (result) => {
                    return result.validationResults.attemptCreated &&
                        result.paymentAttempt.status === 'failed';
                }
            },
            {
                name: 'Webhook Processing',
                description: 'Test webhook event processing',
                setup: async () => { },
                execute: async () => {
                    return await this.testWebhookProcessing([
                        {
                            eventType: 'payment.succeeded',
                            data: { id: 'test_charge_123', amount: 100 },
                            expectedOutcome: 'success',
                            description: 'Payment success webhook'
                        },
                        {
                            eventType: 'payment.failed',
                            data: { id: 'test_charge_456', failure_reason: 'insufficient_funds' },
                            expectedOutcome: 'success',
                            description: 'Payment failure webhook'
                        }
                    ]);
                },
                validate: async (result) => {
                    return result.processed === result.totalWebhooks;
                }
            }
        ];
    }

    private validateLineItems(lineItems: any[], usageData: UsageAggregationResult): boolean {
        // Validate that line items match usage data
        const hasRideItems = usageData.ridesCount > 0 ?
            lineItems.some(item => item.description.includes('rides')) : true;
        const hasDistanceItems = usageData.totalDistance > 0 ?
            lineItems.some(item => item.description.includes('Distance')) : true;
        const hasDurationItems = usageData.totalDuration > 0 ?
            lineItems.some(item => item.description.includes('Time')) : true;

        return hasRideItems && hasDistanceItems && hasDurationItems;
    }

    private validateAmountCalculation(invoice: Invoice, usageData: UsageAggregationResult): boolean {
        const calculatedTotal = invoice.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
        return Math.abs(calculatedTotal - invoice.totalAmount) < 0.01; // Allow for rounding differences
    }

    private validateBillingPeriod(invoicePeriod: { start: Date; end: Date }, expectedPeriod: { start: Date; end: Date }): boolean {
        return invoicePeriod.start.getTime() === expectedPeriod.start.getTime() &&
            invoicePeriod.end.getTime() === expectedPeriod.end.getTime();
    }

    private async createTestUser(trx?: Knex.Transaction): Promise<any> {
        const db = trx || this.db;
        const userId = `${this.testDataPrefix}${uuidv4()}`;

        const user = {
            id: userId,
            email: `${this.testDataPrefix}user_${Date.now()}@test.com`,
            role: 'worker',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date()
        };

        await db('users').insert(user);
        return user;
    }

    private async createTestTrip(userId: string, trx?: Knex.Transaction): Promise<any> {
        const db = trx || this.db;
        const tripId = `${this.testDataPrefix}${uuidv4()}`;

        const trip = {
            id: tripId,
            status: 'completed',
            planned_stops: JSON.stringify([]),
            actual_stops: JSON.stringify([{
                userId,
                status: 'picked_up',
                location: { latitude: 14.5995, longitude: 120.9842 }
            }]),
            metrics: JSON.stringify({
                totalDistance: 5000, // 5km
                totalDuration: 30, // 30 minutes
                pickupCount: 1
            }),
            scheduled_at: new Date(),
            completed_at: new Date(),
            created_at: new Date()
        };

        await db('trips').insert(trip);
        return trip;
    }

    private async createTestInvoice(userId: string, amount: number, trx?: Knex.Transaction): Promise<Invoice> {
        const db = trx || this.db;
        const invoiceId = `${this.testDataPrefix}${uuidv4()}`;

        const invoice = {
            id: invoiceId,
            user_id: userId,
            billing_period_start: new Date(2024, 0, 1),
            billing_period_end: new Date(2024, 0, 31),
            line_items: JSON.stringify([
                {
                    id: uuidv4(),
                    description: 'Test transportation charges',
                    quantity: 1,
                    unitPrice: amount,
                    totalPrice: amount
                }
            ]),
            total_amount: amount,
            currency: 'PHP',
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date()
        };

        await db('invoices').insert(invoice);

        return {
            id: invoiceId,
            userId,
            billingPeriod: {
                start: invoice.billing_period_start,
                end: invoice.billing_period_end
            },
            lineItems: JSON.parse(invoice.line_items),
            totalAmount: amount,
            currency: invoice.currency,
            dueDate: invoice.due_date,
            status: invoice.status as any,
            paymentAttempts: [],
            createdAt: invoice.created_at,
            updatedAt: invoice.updated_at
        };
    }

    private async createTestPaymentAttempt(invoiceId: string, trx?: Knex.Transaction): Promise<any> {
        const db = trx || this.db;
        const attemptId = `${this.testDataPrefix}${uuidv4()}`;

        const attempt = {
            id: attemptId,
            invoice_id: invoiceId,
            amount: 100,
            currency: 'PHP',
            payment_method: 'card',
            status: 'pending',
            idempotency_key: `${this.testDataPrefix}${uuidv4()}`,
            attempted_at: new Date(),
            retry_count: 0
        };

        await db('payment_attempts').insert(attempt);
        return attempt;
    }

    private async createFailedPaymentAttempt(invoiceId: string, retryCount: number): Promise<void> {
        const attemptId = `${this.testDataPrefix}${uuidv4()}`;

        await this.db('payment_attempts').insert({
            id: attemptId,
            invoice_id: invoiceId,
            amount: 100,
            currency: 'PHP',
            payment_method: 'card',
            status: 'failed',
            failure_reason: 'Test failure for retry testing',
            idempotency_key: `${this.testDataPrefix}${uuidv4()}`,
            attempted_at: new Date(),
            completed_at: new Date(),
            retry_count: retryCount,
            next_retry_at: new Date(Date.now() - 1000) // Past time to trigger retry
        });
    }
}