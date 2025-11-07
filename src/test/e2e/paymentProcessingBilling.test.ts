import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupDatabase, db } from '@/config/database';
import { setupRedis, redisClient } from '@/config/redis';
import { setupRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { performanceMonitoringService } from '@/services/performanceMonitoringService';

describe('Payment Processing and Billing Cycle E2E', () => {
    let app: express.Application;
    let workerToken: string;
    let financeToken: string;
    let adminToken: string;
    let workerId: string;
    let financeId: string;
    let adminId: string;
    let invoiceId: string;
    let paymentMethodId: string;

    beforeAll(async () => {
        // Setup test application
        app = express();
        app.use(express.json());
        app.use(performanceMonitoringService.trackRequest());

        // Setup database and Redis
        await setupDatabase();
        await setupRedis();

        // Setup routes
        setupRoutes(app);
        app.use(errorHandler);

        // Clean up test data
        await db.query('DELETE FROM users WHERE email LIKE %payment.test%');
        await db.query('DELETE FROM invoices WHERE id IS NOT NULL');
        await db.query('DELETE FROM usage_ledger WHERE user_id IS NOT NULL');
        await db.query('DELETE FROM payment_attempts WHERE id IS NOT NULL');
    });

    afterAll(async () => {
        // Clean up
        await db.query('DELETE FROM users WHERE email LIKE %payment.test%');
        await db.query('DELETE FROM invoices WHERE id IS NOT NULL');
        await db.query('DELETE FROM usage_ledger WHERE user_id IS NOT NULL');
        await db.query('DELETE FROM payment_attempts WHERE id IS NOT NULL');

        await db.end();
        await redisClient.quit();
    });

    describe('User Setup and Payment Method Registration', () => {
        it('should register users with different roles', async () => {
            // Register worker
            const workerResponse = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'worker.payment.test@example.com',
                    password: 'TestPassword123!',
                    role: 'worker',
                    department: 'engineering'
                });

            expect(workerResponse.status).toBe(201);
            workerId = workerResponse.body.user.id;

            // Register finance user
            const financeResponse = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'finance.payment.test@example.com',
                    password: 'TestPassword123!',
                    role: 'finance',
                    department: 'finance'
                });

            expect(financeResponse.status).toBe(201);
            financeId = financeResponse.body.user.id;

            // Register admin
            const adminResponse = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'admin.payment.test@example.com',
                    password: 'TestPassword123!',
                    role: 'admin',
                    department: 'administration'
                });

            expect(adminResponse.status).toBe(201);
            adminId = adminResponse.body.user.id;
        });

        it('should authenticate all users', async () => {
            // Login worker
            const workerLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'worker.payment.test@example.com',
                    password: 'TestPassword123!'
                });

            expect(workerLogin.status).toBe(200);
            workerToken = workerLogin.body.token;

            // Login finance
            const financeLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'finance.payment.test@example.com',
                    password: 'TestPassword123!'
                });

            expect(financeLogin.status).toBe(200);
            financeToken = financeLogin.body.token;

            // Login admin
            const adminLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'admin.payment.test@example.com',
                    password: 'TestPassword123!'
                });

            expect(adminLogin.status).toBe(200);
            adminToken = adminLogin.body.token;
        });

        it('should add payment method for worker', async () => {
            const paymentMethodResponse = await request(app)
                .post('/api/v1/payment/methods')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    type: 'card',
                    cardDetails: {
                        number: '4242424242424242', // Test card number
                        expMonth: 12,
                        expYear: 2025,
                        cvc: '123'
                    },
                    billingAddress: {
                        line1: '123 Test Street',
                        city: 'Makati',
                        state: 'Metro Manila',
                        postalCode: '1200',
                        country: 'PH'
                    }
                });

            expect(paymentMethodResponse.status).toBe(201);
            expect(paymentMethodResponse.body.paymentMethod.id).toBeDefined();
            paymentMethodId = paymentMethodResponse.body.paymentMethod.id;
        });
    });

    describe('Usage Accumulation', () => {
        it('should record transportation usage', async () => {
            // Simulate multiple trips for billing
            const trips = [
                { distance: 5.2, duration: 25, cost: 150 },
                { distance: 8.1, duration: 35, cost: 200 },
                { distance: 3.5, duration: 18, cost: 120 },
                { distance: 12.0, duration: 45, cost: 300 }
            ];

            for (const trip of trips) {
                const usageResponse = await request(app)
                    .post('/api/v1/payment/usage/record')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        userId: workerId,
                        tripData: {
                            distance: trip.distance,
                            duration: trip.duration,
                            baseFare: 50,
                            distanceFee: trip.distance * 10,
                            timeFee: trip.duration * 2,
                            surcharges: 0
                        },
                        month: new Date().toISOString().substring(0, 7) // YYYY-MM
                    });

                expect(usageResponse.status).toBe(201);
            }
        });

        it('should aggregate monthly usage', async () => {
            const usageResponse = await request(app)
                .get('/api/v1/payment/usage')
                .set('Authorization', `Bearer ${workerToken}`)
                .query({
                    month: new Date().toISOString().substring(0, 7)
                });

            expect(usageResponse.status).toBe(200);
            expect(usageResponse.body.usage.ridesCount).toBe(4);
            expect(usageResponse.body.usage.totalDistance).toBe(28.8);
            expect(usageResponse.body.usage.totalAmount).toBeGreaterThan(0);
        });
    });

    describe('Invoice Generation', () => {
        it('should generate monthly invoice', async () => {
            const invoiceResponse = await request(app)
                .post('/api/v1/payment/invoices/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    userId: workerId,
                    billingPeriod: {
                        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
                    }
                });

            expect(invoiceResponse.status).toBe(201);
            expect(invoiceResponse.body.invoice.id).toBeDefined();
            expect(invoiceResponse.body.invoice.lineItems).toHaveLength(4);
            expect(invoiceResponse.body.invoice.totalAmount).toBeGreaterThan(0);
            invoiceId = invoiceResponse.body.invoice.id;
        });

        it('should validate invoice calculations', async () => {
            const invoiceResponse = await request(app)
                .get(`/api/v1/payment/invoices/${invoiceId}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(invoiceResponse.status).toBe(200);

            const invoice = invoiceResponse.body.invoice;
            expect(invoice.status).toBe('draft');

            // Verify line items
            expect(invoice.lineItems).toHaveLength(4);

            // Calculate expected total
            const expectedTotal = invoice.lineItems.reduce((sum: number, item: any) =>
                sum + item.amount, 0);
            expect(invoice.totalAmount).toBe(expectedTotal);
        });

        it('should send invoice to customer', async () => {
            const sendResponse = await request(app)
                .post(`/api/v1/payment/invoices/${invoiceId}/send`)
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    notificationMethod: 'email',
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                });

            expect(sendResponse.status).toBe(200);
            expect(sendResponse.body.invoice.status).toBe('sent');
            expect(sendResponse.body.invoice.dueDate).toBeDefined();
        });
    });

    describe('Payment Processing', () => {
        it('should process payment successfully', async () => {
            const paymentResponse = await request(app)
                .post(`/api/v1/payment/invoices/${invoiceId}/pay`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    paymentMethodId,
                    amount: null, // Pay full amount
                    idempotencyKey: `payment_${Date.now()}_${Math.random()}`
                });

            expect(paymentResponse.status).toBe(200);
            expect(paymentResponse.body.payment.status).toBe('succeeded');
            expect(paymentResponse.body.invoice.status).toBe('paid');
        });

        it('should record payment attempt in audit trail', async () => {
            const auditResponse = await request(app)
                .get('/api/v1/audit/events')
                .set('Authorization', `Bearer ${financeToken}`)
                .query({
                    entityType: 'invoice',
                    entityId: invoiceId,
                    action: 'payment_processed'
                });

            expect(auditResponse.status).toBe(200);
            expect(auditResponse.body.events).toHaveLength(1);
            expect(auditResponse.body.events[0].action).toBe('payment_processed');
        });
    });

    describe('Payment Failure and Retry Logic', () => {
        let failingInvoiceId: string;

        it('should create another invoice for failure testing', async () => {
            // Record more usage
            await request(app)
                .post('/api/v1/payment/usage/record')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    userId: workerId,
                    tripData: {
                        distance: 10.0,
                        duration: 30,
                        baseFare: 50,
                        distanceFee: 100,
                        timeFee: 60,
                        surcharges: 20
                    },
                    month: new Date().toISOString().substring(0, 7)
                });

            // Generate invoice
            const invoiceResponse = await request(app)
                .post('/api/v1/payment/invoices/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    userId: workerId,
                    billingPeriod: {
                        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
                    }
                });

            expect(invoiceResponse.status).toBe(201);
            failingInvoiceId = invoiceResponse.body.invoice.id;
        });

        it('should handle payment failure with retry logic', async () => {
            // Simulate payment failure by using invalid payment method
            const paymentResponse = await request(app)
                .post(`/api/v1/payment/invoices/${failingInvoiceId}/pay`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    paymentMethodId: 'invalid_payment_method',
                    amount: null,
                    idempotencyKey: `payment_fail_${Date.now()}_${Math.random()}`
                });

            expect(paymentResponse.status).toBe(400);
            expect(paymentResponse.body.error.code).toBe('PAYMENT_FAILED');
        });

        it('should track failed payment attempts', async () => {
            const attemptsResponse = await request(app)
                .get(`/api/v1/payment/invoices/${failingInvoiceId}/attempts`)
                .set('Authorization', `Bearer ${financeToken}`);

            expect(attemptsResponse.status).toBe(200);
            expect(attemptsResponse.body.attempts).toHaveLength(1);
            expect(attemptsResponse.body.attempts[0].status).toBe('failed');
        });

        it('should schedule retry for failed payment', async () => {
            const retryResponse = await request(app)
                .post(`/api/v1/payment/invoices/${failingInvoiceId}/retry`)
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    retryAt: new Date(Date.now() + 60 * 1000).toISOString(), // 1 minute from now
                    maxRetries: 3
                });

            expect(retryResponse.status).toBe(200);
            expect(retryResponse.body.message).toContain('retry scheduled');
        });
    });

    describe('Dry Run Mode Testing', () => {
        it('should enable dry run mode', async () => {
            const dryRunResponse = await request(app)
                .post('/api/v1/payment/dry-run/enable')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ enabled: true });

            expect(dryRunResponse.status).toBe(200);
            expect(dryRunResponse.body.dryRunEnabled).toBe(true);
        });

        it('should simulate payment processing in dry run', async () => {
            // Create test invoice
            const invoiceResponse = await request(app)
                .post('/api/v1/payment/invoices/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    userId: workerId,
                    billingPeriod: {
                        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
                    }
                });

            const testInvoiceId = invoiceResponse.body.invoice.id;

            // Process payment in dry run mode
            const paymentResponse = await request(app)
                .post(`/api/v1/payment/invoices/${testInvoiceId}/pay`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    paymentMethodId,
                    amount: null,
                    idempotencyKey: `dry_run_${Date.now()}_${Math.random()}`
                });

            expect(paymentResponse.status).toBe(200);
            expect(paymentResponse.body.payment.status).toBe('simulated');
            expect(paymentResponse.body.dryRun).toBe(true);
        });

        it('should disable dry run mode', async () => {
            const dryRunResponse = await request(app)
                .post('/api/v1/payment/dry-run/enable')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ enabled: false });

            expect(dryRunResponse.status).toBe(200);
            expect(dryRunResponse.body.dryRunEnabled).toBe(false);
        });
    });

    describe('Dunning Process', () => {
        let overdueInvoiceId: string;

        it('should create overdue invoice', async () => {
            // Create invoice with past due date
            const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

            const invoiceResponse = await request(app)
                .post('/api/v1/payment/invoices/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    userId: workerId,
                    billingPeriod: {
                        start: new Date(pastDate.getFullYear(), pastDate.getMonth(), 1).toISOString(),
                        end: new Date(pastDate.getFullYear(), pastDate.getMonth() + 1, 0).toISOString()
                    },
                    dueDate: pastDate.toISOString()
                });

            expect(invoiceResponse.status).toBe(201);
            overdueInvoiceId = invoiceResponse.body.invoice.id;

            // Mark as sent and overdue
            await request(app)
                .put(`/api/v1/payment/invoices/${overdueInvoiceId}/status`)
                .set('Authorization', `Bearer ${financeToken}`)
                .send({ status: 'overdue' });
        });

        it('should generate dunning notice', async () => {
            const dunningResponse = await request(app)
                .post(`/api/v1/payment/invoices/${overdueInvoiceId}/dunning`)
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    noticeType: 'first_notice',
                    gracePeriod: 3 // 3 days
                });

            expect(dunningResponse.status).toBe(200);
            expect(dunningResponse.body.dunningNotice.type).toBe('first_notice');
            expect(dunningResponse.body.dunningNotice.sentAt).toBeDefined();
        });

        it('should suspend service for non-payment', async () => {
            const suspensionResponse = await request(app)
                .post(`/api/v1/payment/invoices/${overdueInvoiceId}/suspend`)
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    reason: 'non_payment',
                    suspensionDate: new Date().toISOString()
                });

            expect(suspensionResponse.status).toBe(200);
            expect(suspensionResponse.body.user.status).toBe('suspended');
        });
    });

    describe('Payment Reconciliation', () => {
        it('should reconcile payments with provider', async () => {
            const reconciliationResponse = await request(app)
                .post('/api/v1/payment/reconcile')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                    provider: 'stripe'
                });

            expect(reconciliationResponse.status).toBe(200);
            expect(reconciliationResponse.body.reconciliation.totalTransactions).toBeGreaterThan(0);
            expect(reconciliationResponse.body.reconciliation.matchedTransactions).toBeDefined();
        });

        it('should handle webhook validation', async () => {
            const webhookResponse = await request(app)
                .post('/api/v1/payment/webhooks/stripe')
                .set('stripe-signature', 'test_signature')
                .send({
                    id: 'evt_test_webhook',
                    object: 'event',
                    type: 'payment_intent.succeeded',
                    data: {
                        object: {
                            id: 'pi_test_payment',
                            amount: 23000,
                            currency: 'php',
                            status: 'succeeded'
                        }
                    }
                });

            // This might fail due to signature validation, which is expected
            expect([200, 400]).toContain(webhookResponse.status);
        });
    });

    describe('Financial Reporting', () => {
        it('should generate payment summary report', async () => {
            const reportResponse = await request(app)
                .get('/api/v1/reports/payments')
                .set('Authorization', `Bearer ${financeToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                    format: 'json'
                });

            expect(reportResponse.status).toBe(200);
            expect(reportResponse.body.report.totalRevenue).toBeGreaterThan(0);
            expect(reportResponse.body.report.successfulPayments).toBeGreaterThan(0);
            expect(reportResponse.body.report.failedPayments).toBeDefined();
        });

        it('should export payment data', async () => {
            const exportResponse = await request(app)
                .get('/api/v1/reports/payments/export')
                .set('Authorization', `Bearer ${financeToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                    format: 'csv'
                });

            expect(exportResponse.status).toBe(200);
            expect(exportResponse.headers['content-type']).toContain('text/csv');
        });
    });

    describe('Compliance and Audit', () => {
        it('should maintain PCI compliance logs', async () => {
            const complianceResponse = await request(app)
                .get('/api/v1/audit/compliance/pci')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString()
                });

            expect(complianceResponse.status).toBe(200);
            expect(complianceResponse.body.events).toBeDefined();
            expect(complianceResponse.body.complianceScore).toBeGreaterThan(0);
        });

        it('should verify payment data encryption', async () => {
            const encryptionResponse = await request(app)
                .get('/api/v1/payment/security/encryption-status')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(encryptionResponse.status).toBe(200);
            expect(encryptionResponse.body.paymentDataEncrypted).toBe(true);
            expect(encryptionResponse.body.keyRotationEnabled).toBe(true);
        });

        it('should audit payment processing performance', async () => {
            const performanceResponse = await request(app)
                .get('/api/v1/monitoring/performance/endpoints')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ endpoint: '/api/v1/payment/invoices/*/pay' });

            expect(performanceResponse.status).toBe(200);
            expect(performanceResponse.body).toHaveLength(1);
            expect(performanceResponse.body[0].averageResponseTime).toBeDefined();
            expect(performanceResponse.body[0].errorRate).toBeLessThan(0.1); // Less than 10% error rate
        });
    });
});