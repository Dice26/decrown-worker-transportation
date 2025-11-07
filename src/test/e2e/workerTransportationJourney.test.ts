import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupDatabase, db } from '@/config/database';
import { setupRedis, redisClient } from '@/config/redis';
import { setupRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { performanceMonitoringService } from '@/services/performanceMonitoringService';

describe('Complete Worker Transportation Journey E2E', () => {
    let app: express.Application;
    let workerToken: string;
    let driverToken: string;
    let dispatcherToken: string;
    let workerId: string;
    let driverId: string;
    let dispatcherId: string;
    let tripId: string;
    let routeId: string;

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
        await db.query('DELETE FROM users WHERE email LIKE %test%');
        await db.query('DELETE FROM trips WHERE id IS NOT NULL');
        await db.query('DELETE FROM location_points WHERE user_id IS NOT NULL');
    });

    afterAll(async () => {
        // Clean up
        await db.query('DELETE FROM users WHERE email LIKE %test%');
        await db.query('DELETE FROM trips WHERE id IS NOT NULL');
        await db.query('DELETE FROM location_points WHERE user_id IS NOT NULL');

        await db.end();
        await redisClient.quit();
    });

    beforeEach(async () => {
        // Reset any state between tests if needed
    });

    describe('User Registration and Authentication', () => {
        it('should register a worker, driver, and dispatcher', async () => {
            // Register worker
            const workerResponse = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'worker.test@example.com',
                    password: 'TestPassword123!',
                    role: 'worker',
                    department: 'engineering',
                    consentFlags: {
                        locationTracking: true,
                        dataProcessing: true,
                        marketingCommunications: false
                    }
                });

            expect(workerResponse.status).toBe(201);
            expect(workerResponse.body.user.role).toBe('worker');
            workerId = workerResponse.body.user.id;

            // Register driver
            const driverResponse = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'driver.test@example.com',
                    password: 'TestPassword123!',
                    role: 'driver',
                    department: 'transport'
                });

            expect(driverResponse.status).toBe(201);
            expect(driverResponse.body.user.role).toBe('driver');
            driverId = driverResponse.body.user.id;

            // Register dispatcher
            const dispatcherResponse = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    email: 'dispatcher.test@example.com',
                    password: 'TestPassword123!',
                    role: 'dispatcher',
                    department: 'operations'
                });

            expect(dispatcherResponse.status).toBe(201);
            expect(dispatcherResponse.body.user.role).toBe('dispatcher');
            dispatcherId = dispatcherResponse.body.user.id;
        });

        it('should authenticate all users and get tokens', async () => {
            // Login worker
            const workerLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'worker.test@example.com',
                    password: 'TestPassword123!'
                });

            expect(workerLogin.status).toBe(200);
            expect(workerLogin.body.token).toBeDefined();
            workerToken = workerLogin.body.token;

            // Login driver
            const driverLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'driver.test@example.com',
                    password: 'TestPassword123!'
                });

            expect(driverLogin.status).toBe(200);
            expect(driverLogin.body.token).toBeDefined();
            driverToken = driverLogin.body.token;

            // Login dispatcher
            const dispatcherLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'dispatcher.test@example.com',
                    password: 'TestPassword123!'
                });

            expect(dispatcherLogin.status).toBe(200);
            expect(dispatcherLogin.body.token).toBeDefined();
            dispatcherToken = dispatcherLogin.body.token;
        });
    });

    describe('Device Registration and Location Sharing', () => {
        it('should register worker device', async () => {
            const deviceResponse = await request(app)
                .post('/api/v1/devices/register')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    deviceId: 'worker-device-123',
                    deviceType: 'mobile',
                    platform: 'ios',
                    appVersion: '1.0.0',
                    fingerprint: 'unique-device-fingerprint'
                });

            expect(deviceResponse.status).toBe(201);
            expect(deviceResponse.body.device.trustLevel).toBeDefined();
        });

        it('should register driver device', async () => {
            const deviceResponse = await request(app)
                .post('/api/v1/devices/register')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({
                    deviceId: 'driver-device-456',
                    deviceType: 'mobile',
                    platform: 'android',
                    appVersion: '1.0.0',
                    fingerprint: 'unique-driver-fingerprint'
                });

            expect(deviceResponse.status).toBe(201);
            expect(deviceResponse.body.device.trustLevel).toBeDefined();
        });

        it('should share worker location with consent', async () => {
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
                    deviceId: 'worker-device-123'
                });

            expect(locationResponse.status).toBe(201);
            expect(locationResponse.body.message).toContain('Location updated');
        });

        it('should share driver location', async () => {
            const locationResponse = await request(app)
                .post('/api/v1/location/update')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({
                    coordinates: {
                        latitude: 14.6042,
                        longitude: 120.9822
                    },
                    accuracy: 5,
                    source: 'gps',
                    deviceId: 'driver-device-456'
                });

            expect(locationResponse.status).toBe(201);
            expect(locationResponse.body.message).toContain('Location updated');
        });
    });

    describe('Route Creation and Trip Management', () => {
        it('should create a route as dispatcher', async () => {
            const routeResponse = await request(app)
                .post('/api/v1/transport/routes')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({
                    name: 'Morning Pickup Route',
                    description: 'Daily morning pickup for engineering team',
                    stops: [
                        {
                            userId: workerId,
                            location: {
                                latitude: 14.5995,
                                longitude: 120.9842,
                                address: 'Makati CBD'
                            },
                            estimatedArrival: new Date(Date.now() + 30 * 60 * 1000).toISOString()
                        }
                    ],
                    vehicleCapacity: 8,
                    maxDuration: 120 // 2 hours
                });

            expect(routeResponse.status).toBe(201);
            expect(routeResponse.body.route.id).toBeDefined();
            routeId = routeResponse.body.route.id;
        });

        it('should optimize route and create trip', async () => {
            const tripResponse = await request(app)
                .post('/api/v1/transport/trips')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({
                    routeId,
                    scheduledAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                    optimizationAlgorithm: 'nearest_neighbor'
                });

            expect(tripResponse.status).toBe(201);
            expect(tripResponse.body.trip.id).toBeDefined();
            expect(tripResponse.body.trip.status).toBe('planned');
            tripId = tripResponse.body.trip.id;
        });

        it('should assign driver to trip', async () => {
            const assignResponse = await request(app)
                .put(`/api/v1/transport/trips/${tripId}/assign`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({
                    driverId
                });

            expect(assignResponse.status).toBe(200);
            expect(assignResponse.body.trip.driverId).toBe(driverId);
            expect(assignResponse.body.trip.status).toBe('assigned');
        });
    });

    describe('Trip Execution', () => {
        it('should start trip as driver', async () => {
            const startResponse = await request(app)
                .put(`/api/v1/transport/trips/${tripId}/start`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({
                    startLocation: {
                        latitude: 14.6042,
                        longitude: 120.9822
                    }
                });

            expect(startResponse.status).toBe(200);
            expect(startResponse.body.trip.status).toBe('in_progress');
        });

        it('should update driver location during trip', async () => {
            // Simulate driver moving towards pickup location
            const locations = [
                { latitude: 14.6030, longitude: 120.9830 },
                { latitude: 14.6020, longitude: 120.9835 },
                { latitude: 14.6010, longitude: 120.9840 }
            ];

            for (const location of locations) {
                const locationResponse = await request(app)
                    .post('/api/v1/location/update')
                    .set('Authorization', `Bearer ${driverToken}`)
                    .send({
                        coordinates: location,
                        accuracy: 5,
                        source: 'gps',
                        deviceId: 'driver-device-456'
                    });

                expect(locationResponse.status).toBe(201);

                // Small delay to simulate real movement
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        });

        it('should confirm arrival at pickup location', async () => {
            const arrivalResponse = await request(app)
                .put(`/api/v1/transport/trips/${tripId}/stops/0/arrive`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({
                    actualLocation: {
                        latitude: 14.5995,
                        longitude: 120.9842
                    },
                    arrivalTime: new Date().toISOString()
                });

            expect(arrivalResponse.status).toBe(200);
            expect(arrivalResponse.body.stop.status).toBe('arrived');
        });

        it('should confirm worker pickup', async () => {
            const pickupResponse = await request(app)
                .put(`/api/v1/transport/trips/${tripId}/stops/0/pickup`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({
                    pickupTime: new Date().toISOString(),
                    passengerCount: 1
                });

            expect(pickupResponse.status).toBe(200);
            expect(pickupResponse.body.stop.status).toBe('picked_up');
        });

        it('should complete trip', async () => {
            const completeResponse = await request(app)
                .put(`/api/v1/transport/trips/${tripId}/complete`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({
                    endLocation: {
                        latitude: 14.5500,
                        longitude: 121.0300
                    },
                    completionTime: new Date().toISOString(),
                    totalDistance: 15.5,
                    totalDuration: 45
                });

            expect(completeResponse.status).toBe(200);
            expect(completeResponse.body.trip.status).toBe('completed');
            expect(completeResponse.body.trip.metrics).toBeDefined();
        });
    });

    describe('Real-time Updates and Notifications', () => {
        it('should get trip status updates', async () => {
            const statusResponse = await request(app)
                .get(`/api/v1/transport/trips/${tripId}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(statusResponse.status).toBe(200);
            expect(statusResponse.body.trip.status).toBe('completed');
            expect(statusResponse.body.trip.actualStops).toHaveLength(1);
        });

        it('should get location history for audit', async () => {
            const historyResponse = await request(app)
                .get('/api/v1/location/history')
                .set('Authorization', `Bearer ${workerToken}`)
                .query({
                    startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    endTime: new Date().toISOString()
                });

            expect(historyResponse.status).toBe(200);
            expect(historyResponse.body.locations).toBeDefined();
            expect(historyResponse.body.locations.length).toBeGreaterThan(0);
        });
    });

    describe('Usage Tracking and Billing Preparation', () => {
        it('should track usage for billing', async () => {
            const usageResponse = await request(app)
                .get('/api/v1/payment/usage')
                .set('Authorization', `Bearer ${workerToken}`)
                .query({
                    month: new Date().toISOString().substring(0, 7) // YYYY-MM format
                });

            expect(usageResponse.status).toBe(200);
            expect(usageResponse.body.usage).toBeDefined();
            expect(usageResponse.body.usage.ridesCount).toBeGreaterThan(0);
        });

        it('should generate usage report for dispatcher', async () => {
            const reportResponse = await request(app)
                .get('/api/v1/reports/usage')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .query({
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                    format: 'json'
                });

            expect(reportResponse.status).toBe(200);
            expect(reportResponse.body.report).toBeDefined();
            expect(reportResponse.body.report.totalRides).toBeGreaterThan(0);
        });
    });

    describe('Audit Trail Verification', () => {
        it('should have audit trail for all critical actions', async () => {
            const auditResponse = await request(app)
                .get('/api/v1/audit/events')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .query({
                    entityType: 'trip',
                    entityId: tripId,
                    startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString()
                });

            expect(auditResponse.status).toBe(200);
            expect(auditResponse.body.events).toBeDefined();
            expect(auditResponse.body.events.length).toBeGreaterThan(0);

            // Verify key events are logged
            const eventActions = auditResponse.body.events.map((e: any) => e.action);
            expect(eventActions).toContain('trip_created');
            expect(eventActions).toContain('trip_assigned');
            expect(eventActions).toContain('trip_started');
            expect(eventActions).toContain('trip_completed');
        });

        it('should verify audit trail integrity', async () => {
            const integrityResponse = await request(app)
                .get('/api/v1/audit/integrity')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .query({
                    entityType: 'trip',
                    entityId: tripId
                });

            expect(integrityResponse.status).toBe(200);
            expect(integrityResponse.body.valid).toBe(true);
            expect(integrityResponse.body.hashChainValid).toBe(true);
        });
    });

    describe('Performance and Monitoring', () => {
        it('should track performance metrics', async () => {
            const metricsResponse = await request(app)
                .get('/api/v1/monitoring/performance')
                .set('Authorization', `Bearer ${dispatcherToken}`);

            expect(metricsResponse.status).toBe(200);
            expect(metricsResponse.body.requestsPerSecond).toBeDefined();
            expect(metricsResponse.body.averageResponseTime).toBeDefined();
        });

        it('should have healthy system status', async () => {
            const healthResponse = await request(app)
                .get('/health');

            expect(healthResponse.status).toBe(200);
            expect(healthResponse.body.status).toBe('healthy');
            expect(healthResponse.body.checks).toBeDefined();
        });
    });

    describe('Data Privacy and Consent', () => {
        it('should respect location data retention policy', async () => {
            // This would typically be tested with older data
            // For now, verify that retention policy is configured
            const retentionResponse = await request(app)
                .get('/api/v1/location/retention-policy')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(retentionResponse.status).toBe(200);
            expect(retentionResponse.body.retentionDays).toBe(30);
        });

        it('should allow consent withdrawal', async () => {
            const consentResponse = await request(app)
                .put('/api/v1/users/consent')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    locationTracking: false,
                    dataProcessing: true,
                    marketingCommunications: false
                });

            expect(consentResponse.status).toBe(200);
            expect(consentResponse.body.user.consentFlags.locationTracking).toBe(false);
        });

        it('should stop location tracking after consent withdrawal', async () => {
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
                    deviceId: 'worker-device-123'
                });

            expect(locationResponse.status).toBe(403);
            expect(locationResponse.body.error.code).toBe('CONSENT_REQUIRED');
        });
    });
});