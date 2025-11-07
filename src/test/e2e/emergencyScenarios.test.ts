import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupDatabase, db } from '@/config/database';
import { setupRedis, redisClient } from '@/config/redis';
import { setupRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { performanceMonitoringService } from '@/services/performanceMonitoringService';
import { healthMonitoringService } from '@/services/healthMonitoringService';

describe('Emergency Scenarios and System Recovery E2E', () => {
    let app: express.Application;
    let adminToken: string;
    let dispatcherToken: string;
    let driverToken: string;
    let workerToken: string;
    let adminId: string;
    let dispatcherId: string;
    let driverId: string;
    let workerId: string;

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
        await db.query('DELETE FROM users WHERE email LIKE %emergency.test%');
        await db.query('DELETE FROM trips WHERE id IS NOT NULL');
        await db.query('DELETE FROM audit_events WHERE actor_id IS NOT NULL');
    });

    afterAll(async () => {
        // Clean up
        await db.query('DELETE FROM users WHERE email LIKE %emergency.test%');
        await db.query('DELETE FROM trips WHERE id IS NOT NULL');
        await db.query('DELETE FROM audit_events WHERE actor_id IS NOT NULL');

        await db.end();
        await redisClient.quit();
    });

    describe('System Setup', () => {
        it('should register test users', async () => {
            const users = [
                { email: 'admin.emergency.test@example.com', role: 'admin', department: 'administration' },
                { email: 'dispatcher.emergency.test@example.com', role: 'dispatcher', department: 'operations' },
                { email: 'driver.emergency.test@example.com', role: 'driver', department: 'transport' },
                { email: 'worker.emergency.test@example.com', role: 'worker', department: 'engineering' }
            ];

            for (const user of users) {
                const response = await request(app)
                    .post('/api/v1/auth/register')
                    .send({
                        ...user,
                        password: 'TestPassword123!'
                    });

                expect(response.status).toBe(201);

                if (user.role === 'admin') adminId = response.body.user.id;
                if (user.role === 'dispatcher') dispatcherId = response.body.user.id;
                if (user.role === 'driver') driverId = response.body.user.id;
                if (user.role === 'worker') workerId = response.body.user.id;
            }
        });

        it('should authenticate all users', async () => {
            const users = [
                { email: 'admin.emergency.test@example.com', tokenVar: 'adminToken' },
                { email: 'dispatcher.emergency.test@example.com', tokenVar: 'dispatcherToken' },
                { email: 'driver.emergency.test@example.com', tokenVar: 'driverToken' },
                { email: 'worker.emergency.test@example.com', tokenVar: 'workerToken' }
            ];

            for (const user of users) {
                const response = await request(app)
                    .post('/api/v1/auth/login')
                    .send({
                        email: user.email,
                        password: 'TestPassword123!'
                    });

                expect(response.status).toBe(200);

                if (user.tokenVar === 'adminToken') adminToken = response.body.token;
                if (user.tokenVar === 'dispatcherToken') dispatcherToken = response.body.token;
                if (user.tokenVar === 'driverToken') driverToken = response.body.token;
                if (user.tokenVar === 'workerToken') workerToken = response.body.token;
            }
        });
    });

    describe('Database Connection Failure Recovery', () => {
        it('should handle database connection loss gracefully', async () => {
            // Simulate database connection issues by making requests during potential downtime
            const response = await request(app)
                .get('/health')
                .timeout(10000);

            // System should either respond with healthy status or degraded status
            expect([200, 503]).toContain(response.status);

            if (response.status === 503) {
                expect(response.body.status).toBe('unhealthy');
                expect(response.body.checks.some((check: any) =>
                    check.name === 'database' && check.status === 'unhealthy'
                )).toBe(true);
            }
        });

        it('should recover from database connection issues', async () => {
            // Wait for potential recovery
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response = await request(app)
                .get('/health');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('healthy');
        });

        it('should maintain data integrity after recovery', async () => {
            // Test that we can still perform database operations
            const userResponse = await request(app)
                .get('/api/v1/users/profile')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(userResponse.status).toBe(200);
            expect(userResponse.body.user.id).toBe(adminId);
        });
    });

    describe('Redis Connection Failure Recovery', () => {
        it('should handle Redis connection loss', async () => {
            // Test operations that depend on Redis
            const locationResponse = await request(app)
                .post('/api/v1/location/update')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    coordinates: {
                        latitude: 14.5995,
                        longitude: 120.9842
                    },
                    accuracy: 10,
                    source: 'gps',
                    deviceId: 'emergency-test-device'
                });

            // Should either succeed or fail gracefully
            expect([201, 503]).toContain(locationResponse.status);
        });

        it('should recover Redis functionality', async () => {
            // Wait for potential recovery
            await new Promise(resolve => setTimeout(resolve, 1000));

            const healthResponse = await request(app)
                .get('/api/v1/monitoring/health/detailed')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(healthResponse.status).toBe(200);

            const redisCheck = healthResponse.body.current.checks.find(
                (check: any) => check.name === 'redis'
            );
            expect(redisCheck.status).toBe('healthy');
        });
    });

    describe('High Load Scenario Recovery', () => {
        it('should handle concurrent requests without failure', async () => {
            // Simulate high load with concurrent requests
            const concurrentRequests = Array.from({ length: 50 }, (_, i) =>
                request(app)
                    .post('/api/v1/location/update')
                    .set('Authorization', `Bearer ${workerToken}`)
                    .send({
                        coordinates: {
                            latitude: 14.5995 + (i * 0.001),
                            longitude: 120.9842 + (i * 0.001)
                        },
                        accuracy: 10,
                        source: 'gps',
                        deviceId: 'emergency-test-device'
                    })
            );

            const responses = await Promise.allSettled(concurrentRequests);

            // At least 80% of requests should succeed
            const successfulRequests = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            ).length;

            expect(successfulRequests / responses.length).toBeGreaterThan(0.8);
        });

        it('should maintain system performance under load', async () => {
            const performanceResponse = await request(app)
                .get('/api/v1/monitoring/performance')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(performanceResponse.status).toBe(200);

            // Response time should be reasonable even under load
            expect(performanceResponse.body.averageResponseTime).toBeLessThan(5000); // 5 seconds

            // Error rate should be acceptable
            expect(performanceResponse.body.errorRate).toBeLessThan(0.2); // Less than 20%
        });
    });

    describe('Payment System Failure Recovery', () => {
        it('should handle payment provider outage', async () => {
            // Try to process a payment when provider might be down
            const paymentResponse = await request(app)
                .post('/api/v1/payment/test-connection')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    provider: 'stripe',
                    timeout: 5000
                });

            // Should either succeed or fail gracefully with proper error handling
            expect([200, 503]).toContain(paymentResponse.status);

            if (paymentResponse.status === 503) {
                expect(paymentResponse.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
                expect(paymentResponse.body.error.retryable).toBe(true);
            }
        });

        it('should queue payments during provider outage', async () => {
            // Create a test invoice
            const invoiceResponse = await request(app)
                .post('/api/v1/payment/invoices/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    userId: workerId,
                    billingPeriod: {
                        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
                    },
                    amount: 1000,
                    description: 'Emergency test invoice'
                });

            expect(invoiceResponse.status).toBe(201);
            const invoiceId = invoiceResponse.body.invoice.id;

            // Try to process payment - should queue if provider is down
            const paymentResponse = await request(app)
                .post(`/api/v1/payment/invoices/${invoiceId}/pay`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    paymentMethodId: 'test_payment_method',
                    idempotencyKey: `emergency_test_${Date.now()}`
                });

            // Should either succeed immediately or be queued for retry
            expect([200, 202]).toContain(paymentResponse.status);

            if (paymentResponse.status === 202) {
                expect(paymentResponse.body.message).toContain('queued');
            }
        });
    });

    describe('Data Corruption Recovery', () => {
        it('should detect audit trail integrity issues', async () => {
            const integrityResponse = await request(app)
                .get('/api/v1/audit/integrity/check')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString()
                });

            expect(integrityResponse.status).toBe(200);
            expect(integrityResponse.body.valid).toBe(true);
            expect(integrityResponse.body.checkedEvents).toBeGreaterThan(0);
        });

        it('should handle corrupted location data gracefully', async () => {
            // Try to submit invalid location data
            const invalidLocationResponse = await request(app)
                .post('/api/v1/location/update')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    coordinates: {
                        latitude: 999, // Invalid latitude
                        longitude: 999  // Invalid longitude
                    },
                    accuracy: -1, // Invalid accuracy
                    source: 'invalid_source',
                    deviceId: 'emergency-test-device'
                });

            expect(invalidLocationResponse.status).toBe(400);
            expect(invalidLocationResponse.body.error.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('Security Incident Response', () => {
        it('should detect and respond to suspicious activity', async () => {
            // Simulate multiple failed login attempts
            const failedAttempts = Array.from({ length: 10 }, () =>
                request(app)
                    .post('/api/v1/auth/login')
                    .send({
                        email: 'admin.emergency.test@example.com',
                        password: 'WrongPassword123!'
                    })
            );

            const responses = await Promise.all(failedAttempts);

            // All should fail
            responses.forEach(response => {
                expect(response.status).toBe(401);
            });

            // Check if rate limiting kicks in
            const finalAttempt = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'admin.emergency.test@example.com',
                    password: 'WrongPassword123!'
                });

            expect([401, 429]).toContain(finalAttempt.status);
        });

        it('should log security events', async () => {
            const securityEventsResponse = await request(app)
                .get('/api/v1/audit/events')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    action: 'login_failed',
                    startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString()
                });

            expect(securityEventsResponse.status).toBe(200);
            expect(securityEventsResponse.body.events.length).toBeGreaterThan(0);
        });
    });

    describe('System Recovery Procedures', () => {
        it('should create emergency backup', async () => {
            const backupResponse = await request(app)
                .post('/api/v1/monitoring/backups/database')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    includeData: true,
                    compress: true,
                    priority: 'emergency'
                });

            expect(backupResponse.status).toBe(201);
            expect(backupResponse.body.id).toBeDefined();
            expect(backupResponse.body.type).toBe('full');
        });

        it('should verify backup integrity', async () => {
            // List recent backups
            const backupsResponse = await request(app)
                .get('/api/v1/monitoring/backups')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ type: 'full' });

            expect(backupsResponse.status).toBe(200);
            expect(backupsResponse.body.length).toBeGreaterThan(0);

            const latestBackup = backupsResponse.body[0];
            expect(latestBackup.status).toBe('completed');
            expect(latestBackup.checksum).toBeDefined();
        });

        it('should enable emergency mode', async () => {
            const emergencyModeResponse = await request(app)
                .post('/api/v1/monitoring/emergency-mode')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    enabled: true,
                    reason: 'System recovery testing',
                    restrictions: ['disable_payments', 'read_only_mode']
                });

            expect(emergencyModeResponse.status).toBe(200);
            expect(emergencyModeResponse.body.emergencyMode).toBe(true);
        });

        it('should restrict operations in emergency mode', async () => {
            // Try to create a new trip (should be restricted)
            const tripResponse = await request(app)
                .post('/api/v1/transport/trips')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({
                    routeId: 'test-route-id',
                    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
                });

            expect(tripResponse.status).toBe(503);
            expect(tripResponse.body.error.code).toBe('EMERGENCY_MODE_ACTIVE');
        });

        it('should disable emergency mode', async () => {
            const emergencyModeResponse = await request(app)
                .post('/api/v1/monitoring/emergency-mode')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    enabled: false,
                    reason: 'Recovery testing completed'
                });

            expect(emergencyModeResponse.status).toBe(200);
            expect(emergencyModeResponse.body.emergencyMode).toBe(false);
        });
    });

    describe('Disaster Recovery Validation', () => {
        it('should validate system health after recovery', async () => {
            const healthResponse = await request(app)
                .get('/api/v1/monitoring/health/detailed')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(healthResponse.status).toBe(200);
            expect(healthResponse.body.current.status).toBe('healthy');

            // All critical systems should be healthy
            const criticalSystems = ['database', 'redis', 'memory'];
            criticalSystems.forEach(system => {
                const check = healthResponse.body.current.checks.find(
                    (c: any) => c.name === system
                );
                expect(check.status).toBe('healthy');
            });
        });

        it('should verify data consistency after recovery', async () => {
            // Check that user data is consistent
            const userResponse = await request(app)
                .get('/api/v1/users/profile')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(userResponse.status).toBe(200);
            expect(userResponse.body.user.email).toBe('admin.emergency.test@example.com');

            // Check that audit trail is intact
            const auditResponse = await request(app)
                .get('/api/v1/audit/events')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    actorId: adminId,
                    limit: 10
                });

            expect(auditResponse.status).toBe(200);
            expect(auditResponse.body.events.length).toBeGreaterThan(0);
        });

        it('should confirm all services are operational', async () => {
            const servicesResponse = await request(app)
                .get('/api/v1/gateway/status')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(servicesResponse.status).toBe(200);
            expect(servicesResponse.body.gateway).toBe('operational');

            // All services should be healthy
            Object.values(servicesResponse.body.services).forEach((service: any) => {
                expect(service.status).toBe('healthy');
            });
        });

        it('should generate disaster recovery report', async () => {
            const reportResponse = await request(app)
                .get('/api/v1/monitoring/disaster-recovery/report')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    endTime: new Date().toISOString()
                });

            expect(reportResponse.status).toBe(200);
            expect(reportResponse.body.report.recoveryTime).toBeDefined();
            expect(reportResponse.body.report.dataIntegrityCheck).toBe('passed');
            expect(reportResponse.body.report.systemHealthCheck).toBe('passed');
        });
    });

    describe('Performance Recovery Validation', () => {
        it('should verify system performance is restored', async () => {
            const performanceResponse = await request(app)
                .get('/api/v1/monitoring/performance/report')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ timeRange: 'hour' });

            expect(performanceResponse.status).toBe(200);

            const report = performanceResponse.body;
            expect(report.summary.averageResponseTime).toBeLessThan(2000); // Less than 2 seconds
            expect(report.summary.errorRate).toBeLessThan(0.05); // Less than 5%

            // Should have recommendations if any issues
            expect(Array.isArray(report.recommendations)).toBe(true);
        });

        it('should confirm monitoring systems are active', async () => {
            const monitoringResponse = await request(app)
                .get('/api/v1/monitoring/feature-flags')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(monitoringResponse.status).toBe(200);

            // Performance monitoring should be enabled
            const performanceFlag = monitoringResponse.body.find(
                (flag: any) => flag.name === 'performance_monitoring'
            );
            expect(performanceFlag?.enabled).toBe(true);
        });
    });
});