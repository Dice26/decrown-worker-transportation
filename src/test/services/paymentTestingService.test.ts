import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentTestingService } from '@/services/paymentTestingService';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';

describe('PaymentTestingService', () => {
    let paymentTestingService: PaymentTestingService;
    let db: any;
    let testUser: any;

    beforeEach(async () => {
        paymentTestingService = new PaymentTestingService();
        db = getDatabase();

        // Create test user
        testUser = await TestDataFactory.createUser({
            role: 'worker',
            email: 'testing.service@example.com'
        });

        // Create test trip data
        await createTestTripData();
    });

    async function createTestTripData() {
        const tripId = 'test-trip-' + Date.now();

        await db('trips').insert({
            id: tripId,
            status: 'completed',
            planned_stops: JSON.stringify([]),
            actual_stops: JSON.stringify([{
                userId: testUser.id,
                status: 'picked_up',
                location: { latitude: 14.5995, longitude: 120.9842 }
            }]),
            metrics: JSON.stringify({
                totalDistance: 8000, // 8km
                totalDuration: 45, // 45 minutes
                pickupCount: 1,
                noShowCount: 0
            }),
            scheduled_at: new Date('2024-01-15T08:00:00Z'),
            completed_at: new Date('2024-01-15T08:45:00Z'),
            created_at: new Date('2024-01-15T07:00:00Z')
        });

        await db('trip_stops').insert({
            id: 'test-stop-' + Date.now(),
            trip_id: tripId,
            user_id: testUser.id,
            location: JSON.stringify({ latitude: 14.5995, longitude: 120.9842 }),
            status: 'picked_up',
            actual_arrival: new Date('2024-01-15T08:15:00Z'),
            created_at: new Date('2024-01-15T07:00:00Z')
        });
    }

    describe('runPaymentTests', () => {
        it('should run all payment test scenarios', async () => {
            const result = await paymentTestingService.runPaymentTests();

            expect(result).toBeDefined();
            expect(result.totalTests).toBeGreaterThan(0);
            expect(result.passed + result.failed).toBe(result.totalTests);
            expect(result.results).toHaveLength(result.totalTests);
        });

        it('should report test results correctly', async () => {
            const result = await paymentTestingService.runPaymentTests();

            expect(result.passed).toBeGreaterThanOrEqual(0);
            expect(result.failed).toBeGreaterThanOrEqual(0);

            // Each result should have required properties
            result.results.forEach(testResult => {
                expect(testResult.scenarioName).toBeDefined();
                expect(typeof testResult.success).toBe('boolean');
                expect(typeof testResult.duration).toBe('number');
                expect(testResult.duration).toBeGreaterThanOrEqual(0);
            });
        });

        it('should handle test failures gracefully', async () => {
            // Mock a service method to fail
            vi.spyOn(paymentTestingService, 'testInvoiceGeneration').mockRejectedValue(new Error('Test failure'));

            const result = await paymentTestingService.runPaymentTests();

            expect(result.failed).toBeGreaterThan(0);

            const failedTest = result.results.find(r => !r.success);
            expect(failedTest).toBeDefined();
            expect(failedTest?.error).toContain('Test failure');
        });

        it('should measure test execution time', async () => {
            const result = await paymentTestingService.runPaymentTests();

            result.results.forEach(testResult => {
                expect(testResult.duration).toBeGreaterThan(0);
            });
        });
    });

    describe('testInvoiceGeneration', () => {
        it('should test invoice generation successfully', async () => {
            const billingPeriod = {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            };

            const result = await paymentTestingService.testInvoiceGeneration(testUser.id, billingPeriod);

            expect(result).toBeDefined();
            expect(result.invoice).toBeDefined();
            expect(result.usageData).toBeDefined();
            expect(result.validationResults).toBeDefined();

            // Validate invoice properties
            expect(result.invoice.userId).toBe(testUser.id);
            expect(result.invoice.status).toBe('draft'); // Dry-run mode
            expect(result.invoice.totalAmount).toBeGreaterThan(0);

            // Validate usage data
            expect(result.usageData.userId).toBe(testUser.id);
            expect(result.usageData.ridesCount).toBe(1);
            expect(result.usageData.totalDistance).toBe(8000);
            expect(result.usageData.totalDuration).toBe(45);
        });

        it('should validate line items correctly', async () => {
            const billingPeriod = {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            };

            const result = await paymentTestingService.testInvoiceGeneration(testUser.id, billingPeriod);

            expect(result.validationResults.lineItemsValid).toBe(true);
            expect(result.invoice.lineItems).toHaveLength(3); // Rides, distance, time

            const ridesItem = result.invoice.lineItems.find(item => item.description.includes('rides'));
            expect(ridesItem).toBeDefined();
            expect(ridesItem?.quantity).toBe(1);
        });

        it('should validate amount calculation', async () => {
            const billingPeriod = {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            };

            const result = await paymentTestingService.testInvoiceGeneration(testUser.id, billingPeriod);

            expect(result.validationResults.amountCalculationValid).toBe(true);

            // Calculate expected total
            const expectedTotal = result.invoice.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
            expect(Math.abs(result.invoice.totalAmount - expectedTotal)).toBeLessThan(0.01);
        });

        it('should validate billing period', async () => {
            const billingPeriod = {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            };

            const result = await paymentTestingService.testInvoiceGeneration(testUser.id, billingPeriod);

            expect(result.validationResults.periodValid).toBe(true);
            expect(result.invoice.billingPeriod.start.getTime()).toBe(billingPeriod.start.getTime());
            expect(result.invoice.billingPeriod.end.getTime()).toBe(billingPeriod.end.getTime());
        });

        it('should handle user with no usage', async () => {
            const userWithNoTrips = await TestDataFactory.createUser({
                role: 'worker',
                email: 'no.usage@example.com'
            });

            const billingPeriod = {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            };

            const result = await paymentTestingService.testInvoiceGeneration(userWithNoTrips.id, billingPeriod);

            expect(result.usageData.ridesCount).toBe(0);
            expect(result.invoice.totalAmount).toBe(0);
            expect(result.invoice.lineItems).toHaveLength(0);
        });
    });

    describe('testPaymentProcessing', () => {
        it('should test successful payment processing', async () => {
            const result = await paymentTestingService.testPaymentProcessing(100, false);

            expect(result).toBeDefined();
            expect(result.invoice).toBeDefined();
            expect(result.paymentAttempt).toBeDefined();
            expect(result.validationResults).toBeDefined();

            expect(result.validationResults.attemptCreated).toBe(true);
            expect(result.validationResults.statusCorrect).toBe(true);
            expect(result.paymentAttempt.status).toBe('succeeded');
        });

        it('should test failed payment processing', async () => {
            const result = await paymentTestingService.testPaymentProcessing(100, true);

            expect(result.validationResults.attemptCreated).toBe(true);
            expect(result.validationResults.statusCorrect).toBe(true);
            expect(result.paymentAttempt.status).toBe('failed');
        });

        it('should test idempotency', async () => {
            const result = await paymentTestingService.testPaymentProcessing(100, false);

            expect(result.validationResults.idempotencyWorking).toBe(true);
        });

        it('should handle different payment amounts', async () => {
            const smallAmount = await paymentTestingService.testPaymentProcessing(10, false);
            const largeAmount = await paymentTestingService.testPaymentProcessing(10000, false);

            expect(smallAmount.invoice.totalAmount).toBe(10);
            expect(largeAmount.invoice.totalAmount).toBe(10000);

            expect(smallAmount.paymentAttempt.amount).toBe(10);
            expect(largeAmount.paymentAttempt.amount).toBe(10000);
        });

        it('should validate payment attempt properties', async () => {
            const result = await paymentTestingService.testPaymentProcessing(150, false);

            expect(result.paymentAttempt.id).toBeDefined();
            expect(result.paymentAttempt.invoiceId).toBe(result.invoice.id);
            expect(result.paymentAttempt.amount).toBe(150);
            expect(result.paymentAttempt.currency).toBe('PHP');
            expect(result.paymentAttempt.idempotencyKey).toBeDefined();
            expect(result.paymentAttempt.attemptedAt).toBeInstanceOf(Date);
        });
    });

    describe('testWebhookProcessing', () => {
        it('should test webhook processing with various event types', async () => {
            const webhookConfigs = [
                {
                    eventType: 'payment.succeeded',
                    data: { id: 'ch_test_success', amount: 100 },
                    expectedOutcome: 'success' as const,
                    description: 'Payment success webhook test'
                },
                {
                    eventType: 'payment.failed',
                    data: { id: 'ch_test_failed', failure_reason: 'card_declined' },
                    expectedOutcome: 'success' as const,
                    description: 'Payment failure webhook test'
                }
            ];

            const result = await paymentTestingService.testWebhookProcessing(webhookConfigs);

            expect(result).toBeDefined();
            expect(result.totalWebhooks).toBe(2);
            expect(result.processed).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.results).toHaveLength(2);
        });

        it('should handle webhook processing errors', async () => {
            const webhookConfigs = [
                {
                    eventType: 'invalid.event',
                    data: { invalid: 'data' },
                    expectedOutcome: 'failure' as const,
                    description: 'Invalid webhook test'
                }
            ];

            const result = await paymentTestingService.testWebhookProcessing(webhookConfigs);

            expect(result.totalWebhooks).toBe(1);
            expect(result.processed + result.failed).toBe(1);
        });

        it('should validate webhook results', async () => {
            const webhookConfigs = [
                {
                    eventType: 'payment.succeeded',
                    data: { id: 'ch_validation_test', amount: 200 },
                    expectedOutcome: 'success' as const,
                    description: 'Webhook validation test'
                }
            ];

            const result = await paymentTestingService.testWebhookProcessing(webhookConfigs);

            expect(result.results[0].config).toEqual(webhookConfigs[0]);
            expect(result.results[0].success).toBe(true);
            expect(result.results[0].error).toBeUndefined();
        });
    });

    describe('testBillingCycle', () => {
        it('should test billing cycle execution', async () => {
            const result = await paymentTestingService.testBillingCycle(2024, 1);

            expect(result).toBeDefined();
            expect(result.result).toBeDefined();
            expect(result.validationResults).toBeDefined();

            expect(result.validationResults.usersProcessed).toBe(true);
            expect(result.validationResults.invoicesGenerated).toBe(true);
            expect(result.validationResults.amountsCalculated).toBe(true);
            expect(result.validationResults.errorsHandled).toBe(true);
        });

        it('should validate billing cycle results', async () => {
            const result = await paymentTestingService.testBillingCycle(2024, 1);

            expect(result.result.processedUsers).toBeGreaterThanOrEqual(0);
            expect(result.result.generatedInvoices).toBeGreaterThanOrEqual(0);
            expect(result.result.totalAmount).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(result.result.errors)).toBe(true);
        });

        it('should handle billing cycle for different months', async () => {
            const jan2024 = await paymentTestingService.testBillingCycle(2024, 1);
            const feb2024 = await paymentTestingService.testBillingCycle(2024, 2);

            expect(jan2024.result.processedUsers).toBeGreaterThan(0); // Has test data
            expect(feb2024.result.processedUsers).toBe(0); // No test data for Feb
        });
    });

    describe('testPaymentRetries', () => {
        it('should test payment retry logic', async () => {
            const result = await paymentTestingService.testPaymentRetries();

            expect(result).toBeDefined();
            expect(result.retriesProcessed).toBeGreaterThanOrEqual(0);
            expect(result.successfulRetries).toBeGreaterThanOrEqual(0);
            expect(result.failedRetries).toBeGreaterThanOrEqual(0);
            expect(result.validationResults).toBeDefined();
        });

        it('should validate retry logic components', async () => {
            const result = await paymentTestingService.testPaymentRetries();

            expect(typeof result.validationResults.exponentialBackoffWorking).toBe('boolean');
            expect(typeof result.validationResults.maxRetriesRespected).toBe('boolean');
            expect(typeof result.validationResults.dunningInitiated).toBe('boolean');
        });
    });

    describe('generateTestData', () => {
        it('should generate test data successfully', async () => {
            const result = await paymentTestingService.generateTestData();

            expect(result).toBeDefined();
            expect(result.users).toBeGreaterThan(0);
            expect(result.trips).toBeGreaterThan(0);
            expect(result.invoices).toBeGreaterThan(0);
            expect(result.paymentAttempts).toBeGreaterThan(0);
        });

        it('should create related test data', async () => {
            const result = await paymentTestingService.generateTestData();

            // Should create multiple trips per user
            expect(result.trips).toBeGreaterThanOrEqual(result.users);

            // Should create one invoice per user
            expect(result.invoices).toBe(result.users);

            // Should create one payment attempt per invoice
            expect(result.paymentAttempts).toBe(result.invoices);
        });

        it('should create test data with proper relationships', async () => {
            await paymentTestingService.generateTestData();

            // Verify test users were created
            const testUsers = await db('users').where('email', 'like', 'test_%');
            expect(testUsers.length).toBeGreaterThan(0);

            // Verify test trips were created
            const testTrips = await db('trips').where('id', 'like', 'test-%');
            expect(testTrips.length).toBeGreaterThan(0);

            // Verify test invoices were created
            const testInvoices = await db('invoices').where('id', 'like', 'test-%');
            expect(testInvoices.length).toBeGreaterThan(0);
        });
    });

    describe('cleanupTestData', () => {
        it('should clean up all test data', async () => {
            // Generate test data first
            await paymentTestingService.generateTestData();

            // Verify test data exists
            const testUsersBefore = await db('users').where('email', 'like', 'test_%');
            expect(testUsersBefore.length).toBeGreaterThan(0);

            // Clean up test data
            await paymentTestingService.cleanupTestData();

            // Verify test data was removed
            const testUsersAfter = await db('users').where('email', 'like', 'test_%');
            expect(testUsersAfter.length).toBe(0);

            const testTripsAfter = await db('trips').where('id', 'like', 'test-%');
            expect(testTripsAfter.length).toBe(0);

            const testInvoicesAfter = await db('invoices').where('id', 'like', 'test-%');
            expect(testInvoicesAfter.length).toBe(0);
        });

        it('should not affect non-test data', async () => {
            // Count existing non-test data
            const regularUsersBefore = await db('users').whereNot('email', 'like', 'test_%');
            const regularUsersCount = regularUsersBefore.length;

            // Generate and cleanup test data
            await paymentTestingService.generateTestData();
            await paymentTestingService.cleanupTestData();

            // Verify regular data is unchanged
            const regularUsersAfter = await db('users').whereNot('email', 'like', 'test_%');
            expect(regularUsersAfter.length).toBe(regularUsersCount);
        });

        it('should handle cleanup errors gracefully', async () => {
            // Mock database error
            vi.spyOn(db, 'del').mockRejectedValueOnce(new Error('Cleanup error'));

            await expect(
                paymentTestingService.cleanupTestData()
            ).rejects.toThrow('Cleanup error');
        });
    });

    describe('dry-run mode validation', () => {
        it('should ensure all tests run in dry-run mode', async () => {
            const result = await paymentTestingService.runPaymentTests();

            // All successful tests should have run in dry-run mode
            const successfulTests = result.results.filter(r => r.success);

            successfulTests.forEach(test => {
                if (test.result?.invoice) {
                    expect(test.result.invoice.status).toBe('draft');
                }
            });
        });

        it('should not create persistent data in dry-run mode', async () => {
            const invoiceCountBefore = await db('invoices').count('* as count').first();
            const paymentCountBefore = await db('payment_attempts').count('* as count').first();

            await paymentTestingService.testInvoiceGeneration(testUser.id, {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            });

            const invoiceCountAfter = await db('invoices').count('* as count').first();
            const paymentCountAfter = await db('payment_attempts').count('* as count').first();

            // Counts should be the same (no persistent data created)
            expect(invoiceCountAfter.count).toBe(invoiceCountBefore.count);
            expect(paymentCountAfter.count).toBe(paymentCountBefore.count);
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle missing test data gracefully', async () => {
            const userWithoutData = await TestDataFactory.createUser({
                role: 'worker',
                email: 'no.data@example.com'
            });

            const result = await paymentTestingService.testInvoiceGeneration(userWithoutData.id, {
                start: new Date('2024-01-01'),
                end: new Date('2024-01-31')
            });

            expect(result.usageData.ridesCount).toBe(0);
            expect(result.invoice.totalAmount).toBe(0);
        });

        it('should handle invalid date ranges', async () => {
            const invalidPeriod = {
                start: new Date('2024-01-31'),
                end: new Date('2024-01-01') // End before start
            };

            const result = await paymentTestingService.testInvoiceGeneration(testUser.id, invalidPeriod);

            expect(result.usageData.ridesCount).toBe(0);
        });

        it('should handle concurrent test execution', async () => {
            const promises = [
                paymentTestingService.testPaymentProcessing(100, false),
                paymentTestingService.testPaymentProcessing(200, false),
                paymentTestingService.testPaymentProcessing(300, false)
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.validationResults.attemptCreated).toBe(true);
            });
        });
    });
});