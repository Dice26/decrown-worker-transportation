import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '@/services/paymentService';
import { PaymentRetryService } from '@/services/paymentRetryService';
import { MockPaymentProvider } from '@/services/paymentProviders/mockPaymentProvider';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import {
    InvoiceGenerationRequest,
    PaymentProcessingRequest,
    UsageAggregationResult
} from '@/types/payment';

describe('PaymentService', () => {
    let paymentService: PaymentService;
    let mockProvider: MockPaymentProvider;
    let db: any;
    let testUser: any;
    let testDriver: any;

    beforeEach(async () => {
        mockProvider = new MockPaymentProvider();
        paymentService = new PaymentService(mockProvider);
        db = getDatabase();

        // Create test users
        testUser = await TestDataFactory.createUser({
            role: 'worker',
            email: 'test.worker@example.com'
        });

        testDriver = await TestDataFactory.createUser({
            role: 'driver',
            email: 'test.driver@example.com'
        });

        // Create test trip data for usage aggregation
        await createTestTripData();
    });

    async function createTestTripData() {
        // Create a completed trip with the test user
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
                totalDistance: 5000, // 5km in meters
                totalDuration: 30, // 30 minutes
                pickupCount: 1,
                noShowCount: 0
            }),
            scheduled_at: new Date('2024-01-15T08:00:00Z'),
            completed_at: new Date('2024-01-15T08:30:00Z'),
            created_at: new Date('2024-01-15T07:00:00Z')
        });

        // Create trip stop record
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

    describe('aggregateMonthlyUsage', () => {
        it('should aggregate usage data for a user and month', async () => {
            const usageData = await paymentService.aggregateMonthlyUsage(testUser.id, 2024, 1);

            expect(usageData).toBeDefined();
            expect(usageData.userId).toBe(testUser.id);
            expect(usageData.period).toBe('2024-01');
            expect(usageData.ridesCount).toBe(1);
            expect(usageData.totalDistance).toBe(5000);
            expect(usageData.totalDuration).toBe(30);
            expect(usageData.rawCost).toBeGreaterThan(0);
            expect(usageData.finalCost).toBeGreaterThanOrEqual(0);
        });

        it('should return zero usage for user with no trips', async () => {
            const otherUser = await TestDataFactory.createUser({
                role: 'worker',
                email: 'no.trips@example.com'
            });

            const usageData = await paymentService.aggregateMonthlyUsage(otherUser.id, 2024, 1);

            expect(usageData.ridesCount).toBe(0);
            expect(usageData.totalDistance).toBe(0);
            expect(usageData.totalDuration).toBe(0);
            expect(usageData.rawCost).toBe(0);
            expect(usageData.finalCost).toBe(0);
        });

        it('should only count picked up rides', async () => {
            // Create another trip with no-show
            const noShowTripId = 'no-show-trip-' + Date.now();

            await db('trips').insert({
                id: noShowTripId,
                status: 'completed',
                planned_stops: JSON.stringify([]),
                actual_stops: JSON.stringify([{
                    userId: testUser.id,
                    status: 'no_show',
                    location: { latitude: 14.6000, longitude: 120.9850 }
                }]),
                metrics: JSON.stringify({
                    totalDistance: 3000,
                    totalDuration: 20,
                    pickupCount: 0,
                    noShowCount: 1
                }),
                scheduled_at: new Date('2024-01-20T09:00:00Z'),
                completed_at: new Date('2024-01-20T09:20:00Z'),
                created_at: new Date('2024-01-20T08:00:00Z')
            });

            await db('trip_stops').insert({
                id: 'no-show-stop-' + Date.now(),
                trip_id: noShowTripId,
                user_id: testUser.id,
                location: JSON.stringify({ latitude: 14.6000, longitude: 120.9850 }),
                status: 'no_show',
                created_at: new Date('2024-01-20T08:00:00Z')
            });

            const usageData = await paymentService.aggregateMonthlyUsage(testUser.id, 2024, 1);

            // Should still only count the picked up ride
            expect(usageData.ridesCount).toBe(1);
        });

        it('should calculate cost components correctly', async () => {
            const usageData = await paymentService.aggregateMonthlyUsage(testUser.id, 2024, 1);

            // Expected calculation:
            // Base fare: 1 ride * 50 PHP = 50 PHP
            // Distance fee: 5 km * 15 PHP = 75 PHP
            // Time fee: 30 minutes * 2 PHP = 60 PHP
            // Total: 185 PHP
            expect(usageData.rawCost).toBe(185);
        });
    });

    describe('generateInvoice', () => {
        it('should generate invoice for user usage', async () => {
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            const invoice = await paymentService.generateInvoice(request);

            expect(invoice).toBeDefined();
            expect(invoice.userId).toBe(testUser.id);
            expect(invoice.totalAmount).toBe(185); // Based on test data
            expect(invoice.currency).toBe('PHP');
            expect(invoice.status).toBe('pending');
            expect(invoice.lineItems).toHaveLength(3); // Rides, distance, time
            expect(invoice.dueDate).toBeInstanceOf(Date);
        });

        it('should generate invoice in dry-run mode', async () => {
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                dryRun: true
            };

            const invoice = await paymentService.generateInvoice(request);

            expect(invoice.status).toBe('draft');
            expect(invoice.notes).toContain('dry-run');

            // Should not be saved to database in dry-run mode
            const dbInvoice = await db('invoices').where('id', invoice.id).first();
            expect(dbInvoice).toBeUndefined();
        });

        it('should create usage ledger entry', async () => {
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            await paymentService.generateInvoice(request);

            const ledger = await paymentService.getUsageLedger(testUser.id, '2024-01');
            expect(ledger).toBeDefined();
            expect(ledger?.ridesCount).toBe(1);
            expect(ledger?.totalDistance).toBe(5000);
            expect(ledger?.finalAmount).toBe(185);
        });

        it('should prevent duplicate invoices for same period', async () => {
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            // Generate first invoice
            await paymentService.generateInvoice(request);

            // Attempt to generate duplicate
            await expect(
                paymentService.generateInvoice(request)
            ).rejects.toThrow('Invoice already exists for period 2024-01');
        });

        it('should generate correct line items', async () => {
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            const invoice = await paymentService.generateInvoice(request);

            expect(invoice.lineItems).toHaveLength(3);

            const ridesItem = invoice.lineItems.find(item => item.description.includes('rides'));
            expect(ridesItem).toBeDefined();
            expect(ridesItem?.quantity).toBe(1);
            expect(ridesItem?.unitPrice).toBe(50);
            expect(ridesItem?.totalPrice).toBe(50);

            const distanceItem = invoice.lineItems.find(item => item.description.includes('Distance'));
            expect(distanceItem).toBeDefined();
            expect(distanceItem?.quantity).toBe(5); // 5km
            expect(distanceItem?.unitPrice).toBe(15);
            expect(distanceItem?.totalPrice).toBe(75);

            const timeItem = invoice.lineItems.find(item => item.description.includes('Time'));
            expect(timeItem).toBeDefined();
            expect(timeItem?.quantity).toBe(30); // 30 minutes
            expect(timeItem?.unitPrice).toBe(2);
            expect(timeItem?.totalPrice).toBe(60);
        });
    });

    describe('processPayment', () => {
        let testInvoice: any;

        beforeEach(async () => {
            // Generate test invoice
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            testInvoice = await paymentService.generateInvoice(request);
        });

        it('should process payment successfully', async () => {
            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            const paymentAttempt = await paymentService.processPayment(request);

            expect(paymentAttempt).toBeDefined();
            expect(paymentAttempt.invoiceId).toBe(testInvoice.id);
            expect(paymentAttempt.amount).toBe(testInvoice.totalAmount);
            expect(paymentAttempt.status).toBe('succeeded'); // Mock provider succeeds by default
            expect(paymentAttempt.idempotencyKey).toBeDefined();
        });

        it('should process payment in dry-run mode', async () => {
            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id,
                dryRun: true
            };

            const paymentAttempt = await paymentService.processPayment(request);

            expect(paymentAttempt.status).toBe('succeeded');
            expect(paymentAttempt.providerResponse?.simulatedPayment).toBe(true);
        });

        it('should update invoice status on successful payment', async () => {
            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            await paymentService.processPayment(request);

            const updatedInvoice = await paymentService.getInvoiceById(testInvoice.id);
            expect(updatedInvoice?.status).toBe('paid');
            expect(updatedInvoice?.paidAt).toBeInstanceOf(Date);
        });

        it('should create customer if not exists', async () => {
            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            await paymentService.processPayment(request);

            // Check that customer was created in mock provider
            const mockCharges = mockProvider.getMockCharges();
            expect(mockCharges.size).toBeGreaterThan(0);
        });

        it('should handle payment failures', async () => {
            // Configure mock provider to fail
            vi.spyOn(mockProvider, 'chargeCustomer').mockResolvedValue({
                success: false,
                status: 'failed',
                failureReason: 'Insufficient funds'
            });

            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            const paymentAttempt = await paymentService.processPayment(request);

            expect(paymentAttempt.status).toBe('failed');
            expect(paymentAttempt.failureReason).toBe('Insufficient funds');

            // Invoice should remain pending
            const updatedInvoice = await paymentService.getInvoiceById(testInvoice.id);
            expect(updatedInvoice?.status).toBe('pending');
        });

        it('should reject payment for non-pending invoice', async () => {
            // Mark invoice as paid
            await db('invoices')
                .where('id', testInvoice.id)
                .update({ status: 'paid' });

            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            await expect(
                paymentService.processPayment(request)
            ).rejects.toThrow('Cannot process payment for invoice with status: paid');
        });

        it('should use idempotency key correctly', async () => {
            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            const attempt1 = await paymentService.processPayment(request);
            const attempt2 = await paymentService.processPayment(request);

            // Should create separate attempts with different idempotency keys
            expect(attempt1.id).not.toBe(attempt2.id);
            expect(attempt1.idempotencyKey).not.toBe(attempt2.idempotencyKey);
        });
    });

    describe('runBillingCycle', () => {
        beforeEach(async () => {
            // Create additional test users with trips
            const user2 = await TestDataFactory.createUser({
                role: 'worker',
                email: 'worker2@example.com'
            });

            // Create trip for second user
            const tripId2 = 'test-trip-2-' + Date.now();

            await db('trips').insert({
                id: tripId2,
                status: 'completed',
                planned_stops: JSON.stringify([]),
                actual_stops: JSON.stringify([{
                    userId: user2.id,
                    status: 'picked_up',
                    location: { latitude: 14.6000, longitude: 120.9850 }
                }]),
                metrics: JSON.stringify({
                    totalDistance: 3000,
                    totalDuration: 20,
                    pickupCount: 1,
                    noShowCount: 0
                }),
                scheduled_at: new Date('2024-01-10T10:00:00Z'),
                completed_at: new Date('2024-01-10T10:20:00Z'),
                created_at: new Date('2024-01-10T09:00:00Z')
            });

            await db('trip_stops').insert({
                id: 'test-stop-2-' + Date.now(),
                trip_id: tripId2,
                user_id: user2.id,
                location: JSON.stringify({ latitude: 14.6000, longitude: 120.9850 }),
                status: 'picked_up',
                actual_arrival: new Date('2024-01-10T10:10:00Z'),
                created_at: new Date('2024-01-10T09:00:00Z')
            });
        });

        it('should run billing cycle for all users', async () => {
            const result = await paymentService.runBillingCycle(2024, 1);

            expect(result).toBeDefined();
            expect(result.processedUsers).toBe(2);
            expect(result.generatedInvoices).toBe(2);
            expect(result.totalAmount).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should run billing cycle in dry-run mode', async () => {
            const result = await paymentService.runBillingCycle(2024, 1, true);

            expect(result.processedUsers).toBe(2);
            expect(result.generatedInvoices).toBe(2);

            // Should not create actual invoices in database
            const invoices = await db('invoices')
                .where('billing_period_start', new Date('2024-01-01'))
                .where('status', 'pending');

            expect(invoices).toHaveLength(0);
        });

        it('should handle errors gracefully', async () => {
            // Create user without trips to cause zero-amount invoice
            const userWithoutTrips = await TestDataFactory.createUser({
                role: 'worker',
                email: 'no.trips.user@example.com'
            });

            const result = await paymentService.runBillingCycle(2024, 1);

            expect(result.processedUsers).toBeGreaterThanOrEqual(2);
            expect(result.errors).toHaveLength(0); // Zero amount invoices are handled gracefully
        });

        it('should only process users with completed trips', async () => {
            // Create user with only planned trip
            const userWithPlannedTrip = await TestDataFactory.createUser({
                role: 'worker',
                email: 'planned.trip@example.com'
            });

            await db('trips').insert({
                id: 'planned-trip-' + Date.now(),
                status: 'planned',
                planned_stops: JSON.stringify([]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date('2024-01-25T12:00:00Z'),
                created_at: new Date('2024-01-25T11:00:00Z')
            });

            const result = await paymentService.runBillingCycle(2024, 1);

            // Should only process users with completed trips
            expect(result.processedUsers).toBe(2); // Original test users
        });
    });

    describe('getInvoiceById', () => {
        let testInvoice: any;

        beforeEach(async () => {
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            testInvoice = await paymentService.generateInvoice(request);
        });

        it('should retrieve invoice by ID', async () => {
            const retrievedInvoice = await paymentService.getInvoiceById(testInvoice.id);

            expect(retrievedInvoice).toBeDefined();
            expect(retrievedInvoice?.id).toBe(testInvoice.id);
            expect(retrievedInvoice?.userId).toBe(testUser.id);
            expect(retrievedInvoice?.totalAmount).toBe(185);
            expect(retrievedInvoice?.status).toBe('pending');
        });

        it('should return null for non-existent invoice', async () => {
            const nonExistentId = 'non-existent-invoice-id';
            const retrievedInvoice = await paymentService.getInvoiceById(nonExistentId);

            expect(retrievedInvoice).toBeNull();
        });

        it('should include payment attempts', async () => {
            // Create payment attempt
            const paymentRequest: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            await paymentService.processPayment(paymentRequest);

            const retrievedInvoice = await paymentService.getInvoiceById(testInvoice.id);

            expect(retrievedInvoice?.paymentAttempts).toHaveLength(1);
            expect(retrievedInvoice?.paymentAttempts[0].invoiceId).toBe(testInvoice.id);
        });
    });

    describe('getUsageLedger', () => {
        beforeEach(async () => {
            // Generate invoice to create usage ledger
            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            await paymentService.generateInvoice(request);
        });

        it('should retrieve usage ledger by user and month', async () => {
            const ledger = await paymentService.getUsageLedger(testUser.id, '2024-01');

            expect(ledger).toBeDefined();
            expect(ledger?.userId).toBe(testUser.id);
            expect(ledger?.month).toBe('2024-01');
            expect(ledger?.ridesCount).toBe(1);
            expect(ledger?.totalDistance).toBe(5000);
            expect(ledger?.totalDuration).toBe(30);
            expect(ledger?.finalAmount).toBe(185);
        });

        it('should return null for non-existent ledger', async () => {
            const ledger = await paymentService.getUsageLedger(testUser.id, '2024-02');
            expect(ledger).toBeNull();
        });

        it('should include cost components', async () => {
            const ledger = await paymentService.getUsageLedger(testUser.id, '2024-01');

            expect(ledger?.costComponents).toBeDefined();
            expect(ledger?.costComponents.baseFare).toBe(50);
            expect(ledger?.costComponents.distanceFee).toBe(75);
            expect(ledger?.costComponents.timeFee).toBe(60);
        });

        it('should include adjustments array', async () => {
            const ledger = await paymentService.getUsageLedger(testUser.id, '2024-01');

            expect(ledger?.adjustments).toBeDefined();
            expect(Array.isArray(ledger?.adjustments)).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should handle database errors gracefully', async () => {
            // Mock database error
            vi.spyOn(db, 'transaction').mockRejectedValue(new Error('Database connection failed'));

            const request: InvoiceGenerationRequest = {
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            await expect(
                paymentService.generateInvoice(request)
            ).rejects.toThrow('Database connection failed');
        });

        it('should handle payment provider errors', async () => {
            const testInvoice = await paymentService.generateInvoice({
                userId: testUser.id,
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            });

            // Mock payment provider error
            vi.spyOn(mockProvider, 'chargeCustomer').mockRejectedValue(new Error('Payment provider unavailable'));

            const request: PaymentProcessingRequest = {
                invoiceId: testInvoice.id
            };

            const paymentAttempt = await paymentService.processPayment(request);

            expect(paymentAttempt.status).toBe('failed');
            expect(paymentAttempt.failureReason).toContain('Payment provider unavailable');
        });

        it('should validate invoice generation parameters', async () => {
            const invalidRequest: InvoiceGenerationRequest = {
                userId: 'non-existent-user',
                billingPeriod: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                }
            };

            // Should handle gracefully and return zero usage
            const invoice = await paymentService.generateInvoice(invalidRequest);
            expect(invoice.totalAmount).toBe(0);
        });
    });
});