import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupDatabase, db } from '@/config/database';
import { setupRedis, redisClient } from '@/config/redis';
import { setupRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { performanceMonitoringService } from '@/services/performanceMonitoringService';

describe('Multi-User Concurrent Operations E2E', () => {
    let app: express.Application;
    let users: Array<{
        id: string;
        token: string;
        role: string;
        email: string;
    }> = [];

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
        await db.query('DELETE FROM users WHERE email LIKE %concurrent.test%');
        await db.query('DELETE FROM trips WHERE id IS NOT NULL');
        await db.query('DELETE FROM location_points WHERE user_id IS NOT NULL');
        await db.query('DELETE FROM invoices WHERE id IS NOT NULL');
    });

    afterAll(async () => {
        // Clean up
        await db.query('DELETE FROM users WHERE email LIKE %concurrent.test%');
        await db.query('DELETE FROM trips WHERE id IS NOT NULL');
        await db.query('DELETE FROM location_points WHERE user_id IS NOT NULL');
        await db.query('DELETE FROM invoices WHERE id IS NOT NULL');

        await db.end();
        await redisClient.quit();
    });

    describe('User Setup and Authentication', () => {
        it('should register multiple users concurrently', async () => {
            const userRegistrations = [
                // Workers
                ...Array.from({ length: 20 }, (_, i) => ({
                    email: `worker${i}.concurrent.test@example.com`,
                    password: 'TestPassword123!',
                    role: 'worker',
                    department: 'engineering'
                })),
                // Drivers
                ...Array.from({ length: 5 }, (_, i) => ({
                    email: `driver${i}.concurrent.test@example.com`,
                    password: 'TestPassword123!',
                    role: 'driver',
                    department: 'transport'
                })),
                // Dispatchers
                ...Array.from({ length: 3 }, (_, i) => ({
                    email: `dispatcher${i}.concurrent.test@example.com`,
                    password: 'TestPassword123!',
                    role: 'dispatcher',
                    department: 'operations'
                })),
                // Finance users
                ...Array.from({ length: 2 }, (_, i) => ({
                    email: `finance${i}.concurrent.test@example.com`,
                    password: 'TestPassword123!',
                    role: 'finance',
                    department: 'finance'
                }))
            ];

            const registrationPromises = userRegistrations.map(user =>
                request(app)
                    .post('/api/v1/auth/register')
                    .send(user)
            );

            const responses = await Promise.allSettled(registrationPromises);

            // At least 90% should succeed
            const successfulRegistrations = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            );

            expect(successfulRegistrations.length / responses.length).toBeGreaterThan(0.9);

            // Store user data for later use
            successfulRegistrations.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const response = result.value as any;
                    users.push({
                        id: response.body.user.id,
                        token: '', // Will be filled during login
                        role: response.body.user.role,
                        email: response.body.user.email
                    });
                }
            });
        });

        it('should authenticate all users concurrently', async () => {
            const loginPromises = users.map(user =>
                request(app)
                    .post('/api/v1/auth/login')
                    .send({
                        email: user.email,
                        password: 'TestPassword123!'
                    })
            );

            const responses = await Promise.allSettled(loginPromises);

            // All should succeed
            const successfulLogins = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 200
            );

            expect(successfulLogins.length).toBe(users.length);

            // Update tokens
            successfulLogins.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const response = result.value as any;
                    users[index].token = response.body.token;
                }
            });
        });
    });

    describe('Concurrent Location Updates', () => {
        it('should handle simultaneous location updates from multiple workers', async () => {
            const workers = users.filter(u => u.role === 'worker');

            // Each worker sends multiple location updates
            const locationUpdates = workers.flatMap(worker =>
                Array.from({ length: 10 }, (_, i) => ({
                    worker,
                    coordinates: {
                        latitude: 14.5995 + (Math.random() - 0.5) * 0.01,
                        longitude: 120.9842 + (Math.random() - 0.5) * 0.01
                    },
                    accuracy: 5 + Math.random() * 10,
                    source: 'gps',
                    deviceId: `device_${worker.id}_${i}`
                }))
            );

            const updatePromises = locationUpdates.map(update =>
                request(app)
                    .post('/api/v1/location/update')
                    .set('Authorization', `Bearer ${update.worker.token}`)
                    .send({
                        coordinates: update.coordinates,
                        accuracy: update.accuracy,
                        source: update.source,
                        deviceId: update.deviceId
                    })
            );

            const responses = await Promise.allSettled(updatePromises);

            // At least 95% should succeed
            const successfulUpdates = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            );

            expect(successfulUpdates.length / responses.length).toBeGreaterThan(0.95);
        });

        it('should maintain location data consistency', async () => {
            const workers = users.filter(u => u.role === 'worker').slice(0, 5);

            // Get location history for each worker
            const historyPromises = workers.map(worker =>
                request(app)
                    .get('/api/v1/location/history')
                    .set('Authorization', `Bearer ${worker.token}`)
                    .query({
                        startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                        endTime: new Date().toISOString()
                    })
            );

            const responses = await Promise.all(historyPromises);

            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.locations).toBeDefined();
                expect(response.body.locations.length).toBeGreaterThan(0);

                // Verify location data integrity
                response.body.locations.forEach((location: any) => {
                    expect(location.coordinates.latitude).toBeGreaterThan(14.5);
                    expect(location.coordinates.latitude).toBeLessThan(14.7);
                    expect(location.coordinates.longitude).toBeGreaterThan(120.9);
                    expect(location.coordinates.longitude).toBeLessThan(121.1);
                });
            });
        });
    });

    describe('Concurrent Trip Management', () => {
        let routeIds: string[] = [];

        it('should create multiple routes concurrently', async () => {
            const dispatchers = users.filter(u => u.role === 'dispatcher');
            const workers = users.filter(u => u.role === 'worker');

            const routeCreations = dispatchers.flatMap((dispatcher, dispatcherIndex) =>
                Array.from({ length: 3 }, (_, routeIndex) => ({
                    dispatcher,
                    route: {
                        name: `Route ${dispatcherIndex}-${routeIndex}`,
                        description: `Concurrent test route ${dispatcherIndex}-${routeIndex}`,
                        stops: workers.slice(routeIndex * 3, (routeIndex + 1) * 3).map(worker => ({
                            userId: worker.id,
                            location: {
                                latitude: 14.5995 + Math.random() * 0.01,
                                longitude: 120.9842 + Math.random() * 0.01,
                                address: `Stop for ${worker.email}`
                            },
                            estimatedArrival: new Date(Date.now() + (30 + routeIndex * 15) * 60 * 1000).toISOString()
                        })),
                        vehicleCapacity: 8,
                        maxDuration: 120
                    }
                }))
            );

            const routePromises = routeCreations.map(creation =>
                request(app)
                    .post('/api/v1/transport/routes')
                    .set('Authorization', `Bearer ${creation.dispatcher.token}`)
                    .send(creation.route)
            );

            const responses = await Promise.allSettled(routePromises);

            const successfulRoutes = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            );

            expect(successfulRoutes.length).toBeGreaterThan(0);

            // Store route IDs
            successfulRoutes.forEach(result => {
                if (result.status === 'fulfilled') {
                    const response = result.value as any;
                    routeIds.push(response.body.route.id);
                }
            });
        });

        it('should create and assign trips concurrently', async () => {
            const dispatchers = users.filter(u => u.role === 'dispatcher');
            const drivers = users.filter(u => u.role === 'driver');

            const tripCreations = routeIds.slice(0, Math.min(routeIds.length, drivers.length)).map((routeId, index) => ({
                dispatcher: dispatchers[index % dispatchers.length],
                driver: drivers[index],
                routeId,
                scheduledAt: new Date(Date.now() + (15 + index * 5) * 60 * 1000).toISOString()
            }));

            // Create trips
            const tripPromises = tripCreations.map(creation =>
                request(app)
                    .post('/api/v1/transport/trips')
                    .set('Authorization', `Bearer ${creation.dispatcher.token}`)
                    .send({
                        routeId: creation.routeId,
                        scheduledAt: creation.scheduledAt,
                        optimizationAlgorithm: 'nearest_neighbor'
                    })
            );

            const tripResponses = await Promise.allSettled(tripPromises);

            const successfulTrips = tripResponses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            );

            expect(successfulTrips.length).toBeGreaterThan(0);

            // Assign drivers concurrently
            const assignmentPromises = successfulTrips.map((result, index) => {
                if (result.status === 'fulfilled') {
                    const response = result.value as any;
                    const tripId = response.body.trip.id;
                    const creation = tripCreations[index];

                    return request(app)
                        .put(`/api/v1/transport/trips/${tripId}/assign`)
                        .set('Authorization', `Bearer ${creation.dispatcher.token}`)
                        .send({
                            driverId: creation.driver.id
                        });
                }
                return Promise.resolve({ status: 400 });
            });

            const assignmentResponses = await Promise.allSettled(assignmentPromises);

            const successfulAssignments = assignmentResponses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 200
            );

            expect(successfulAssignments.length).toBeGreaterThan(0);
        });
    });

    describe('Concurrent Payment Processing', () => {
        it('should handle concurrent invoice generation', async () => {
            const financeUsers = users.filter(u => u.role === 'finance');
            const workers = users.filter(u => u.role === 'worker').slice(0, 10);

            // Generate usage data for workers
            const usagePromises = workers.map(worker =>
                request(app)
                    .post('/api/v1/payment/usage/record')
                    .set('Authorization', `Bearer ${financeUsers[0].token}`)
                    .send({
                        userId: worker.id,
                        tripData: {
                            distance: 5 + Math.random() * 10,
                            duration: 20 + Math.random() * 30,
                            baseFare: 50,
                            distanceFee: Math.floor((5 + Math.random() * 10) * 10),
                            timeFee: Math.floor((20 + Math.random() * 30) * 2),
                            surcharges: Math.floor(Math.random() * 50)
                        },
                        month: new Date().toISOString().substring(0, 7)
                    })
            );

            await Promise.all(usagePromises);

            // Generate invoices concurrently
            const invoicePromises = workers.map(worker =>
                request(app)
                    .post('/api/v1/payment/invoices/generate')
                    .set('Authorization', `Bearer ${financeUsers[0].token}`)
                    .send({
                        userId: worker.id,
                        billingPeriod: {
                            start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
                            end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
                        }
                    })
            );

            const responses = await Promise.allSettled(invoicePromises);

            const successfulInvoices = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            );

            expect(successfulInvoices.length / responses.length).toBeGreaterThan(0.8);
        });

        it('should handle concurrent payment method additions', async () => {
            const workers = users.filter(u => u.role === 'worker').slice(0, 10);

            const paymentMethodPromises = workers.map((worker, index) =>
                request(app)
                    .post('/api/v1/payment/methods')
                    .set('Authorization', `Bearer ${worker.token}`)
                    .send({
                        type: 'card',
                        cardDetails: {
                            number: '4242424242424242',
                            expMonth: 12,
                            expYear: 2025,
                            cvc: '123'
                        },
                        billingAddress: {
                            line1: `${123 + index} Test Street`,
                            city: 'Makati',
                            state: 'Metro Manila',
                            postalCode: '1200',
                            country: 'PH'
                        }
                    })
            );

            const responses = await Promise.allSettled(paymentMethodPromises);

            const successfulMethods = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 201
            );

            expect(successfulMethods.length / responses.length).toBeGreaterThan(0.9);
        });
    });

    describe('Concurrent Audit Operations', () => {
        it('should handle concurrent audit queries', async () => {
            const allUsers = users.slice(0, 15); // Limit to prevent overwhelming

            const auditPromises = allUsers.map(user =>
                request(app)
                    .get('/api/v1/audit/events')
                    .set('Authorization', `Bearer ${user.token}`)
                    .query({
                        actorId: user.id,
                        startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                        endDate: new Date().toISOString(),
                        limit: 50
                    })
            );

            const responses = await Promise.allSettled(auditPromises);

            const successfulQueries = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 200
            );

            expect(successfulQueries.length).toBe(allUsers.length);

            // Verify audit data integrity
            successfulQueries.forEach(result => {
                if (result.status === 'fulfilled') {
                    const response = result.value as any;
                    expect(response.body.events).toBeDefined();
                    expect(Array.isArray(response.body.events)).toBe(true);
                }
            });
        });

        it('should maintain audit trail consistency under concurrent operations', async () => {
            // Perform various operations concurrently to generate audit events
            const workers = users.filter(u => u.role === 'worker').slice(0, 5);
            const dispatchers = users.filter(u => u.role === 'dispatcher').slice(0, 2);

            const operations = [
                // Profile updates
                ...workers.map(worker =>
                    request(app)
                        .put('/api/v1/users/profile')
                        .set('Authorization', `Bearer ${worker.token}`)
                        .send({
                            department: `updated_${worker.role}_${Date.now()}`
                        })
                ),
                // Location updates
                ...workers.map(worker =>
                    request(app)
                        .post('/api/v1/location/update')
                        .set('Authorization', `Bearer ${worker.token}`)
                        .send({
                            coordinates: {
                                latitude: 14.5995 + Math.random() * 0.01,
                                longitude: 120.9842 + Math.random() * 0.01
                            },
                            accuracy: 10,
                            source: 'gps',
                            deviceId: `audit_test_${worker.id}`
                        })
                )
            ];

            await Promise.allSettled(operations);

            // Wait for audit events to be processed
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify audit integrity
            const integrityResponse = await request(app)
                .get('/api/v1/audit/integrity/check')
                .set('Authorization', `Bearer ${dispatchers[0].token}`)
                .query({
                    startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString()
                });

            expect(integrityResponse.status).toBe(200);
            expect(integrityResponse.body.valid).toBe(true);
        });
    });

    describe('System Performance Under Load', () => {
        it('should maintain acceptable response times under concurrent load', async () => {
            const startTime = Date.now();

            // Mix of different operations
            const operations = [
                // Health checks
                ...Array.from({ length: 20 }, () =>
                    request(app).get('/health')
                ),
                // User profile requests
                ...users.slice(0, 10).map(user =>
                    request(app)
                        .get('/api/v1/users/profile')
                        .set('Authorization', `Bearer ${user.token}`)
                ),
                // Location updates
                ...users.filter(u => u.role === 'worker').slice(0, 10).map(worker =>
                    request(app)
                        .post('/api/v1/location/update')
                        .set('Authorization', `Bearer ${worker.token}`)
                        .send({
                            coordinates: {
                                latitude: 14.5995 + Math.random() * 0.01,
                                longitude: 120.9842 + Math.random() * 0.01
                            },
                            accuracy: 10,
                            source: 'gps',
                            deviceId: `perf_test_${worker.id}`
                        })
                )
            ];

            const responses = await Promise.allSettled(operations);
            const endTime = Date.now();

            const totalTime = endTime - startTime;
            const successfulOperations = responses.filter(
                result => result.status === 'fulfilled' &&
                    [200, 201].includes((result.value as any).status)
            );

            // At least 95% should succeed
            expect(successfulOperations.length / responses.length).toBeGreaterThan(0.95);

            // Average response time should be reasonable
            const averageResponseTime = totalTime / operations.length;
            expect(averageResponseTime).toBeLessThan(1000); // Less than 1 second average
        });

        it('should handle database connection pool under concurrent load', async () => {
            // Create many concurrent database operations
            const dbOperations = Array.from({ length: 50 }, (_, i) =>
                request(app)
                    .get('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${users[i % users.length].token}`)
            );

            const responses = await Promise.allSettled(dbOperations);

            const successfulOperations = responses.filter(
                result => result.status === 'fulfilled' &&
                    (result.value as any).status === 200
            );

            // Should handle connection pool efficiently
            expect(successfulOperations.length / responses.length).toBeGreaterThan(0.9);
        });

        it('should maintain Redis performance under concurrent operations', async () => {
            // Operations that heavily use Redis (caching, sessions, etc.)
            const redisOperations = [
                // Multiple location updates (uses Redis for real-time data)
                ...users.filter(u => u.role === 'worker').slice(0, 15).map(worker =>
                    request(app)
                        .post('/api/v1/location/update')
                        .set('Authorization', `Bearer ${worker.token}`)
                        .send({
                            coordinates: {
                                latitude: 14.5995 + Math.random() * 0.01,
                                longitude: 120.9842 + Math.random() * 0.01
                            },
                            accuracy: 10,
                            source: 'gps',
                            deviceId: `redis_test_${worker.id}`
                        })
                ),
                // Feature flag checks
                ...users.slice(0, 10).map(user =>
                    request(app)
                        .get('/api/v1/monitoring/feature-flags/location_tracking')
                        .set('Authorization', `Bearer ${user.token}`)
                )
            ];

            const responses = await Promise.allSettled(redisOperations);

            const successfulOperations = responses.filter(
                result => result.status === 'fulfilled' &&
                    [200, 201].includes((result.value as any).status)
            );

            expect(successfulOperations.length / responses.length).toBeGreaterThan(0.95);
        });
    });

    describe('Data Consistency Validation', () => {
        it('should maintain user data consistency across concurrent operations', async () => {
            const testWorkers = users.filter(u => u.role === 'worker').slice(0, 5);

            // Concurrent profile updates
            const updatePromises = testWorkers.map(worker =>
                request(app)
                    .put('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${worker.token}`)
                    .send({
                        department: `consistency_test_${worker.id}_${Date.now()}`
                    })
            );

            await Promise.all(updatePromises);

            // Verify updates
            const verificationPromises = testWorkers.map(worker =>
                request(app)
                    .get('/api/v1/users/profile')
                    .set('Authorization', `Bearer ${worker.token}`)
            );

            const verificationResponses = await Promise.all(verificationPromises);

            verificationResponses.forEach((response, index) => {
                expect(response.status).toBe(200);
                expect(response.body.user.department).toContain('consistency_test');
                expect(response.body.user.id).toBe(testWorkers[index].id);
            });
        });

        it('should prevent race conditions in trip assignments', async () => {
            const dispatchers = users.filter(u => u.role === 'dispatcher');
            const drivers = users.filter(u => u.role === 'driver').slice(0, 2);

            if (routeIds.length > 0 && dispatchers.length > 0) {
                // Create a trip
                const tripResponse = await request(app)
                    .post('/api/v1/transport/trips')
                    .set('Authorization', `Bearer ${dispatchers[0].token}`)
                    .send({
                        routeId: routeIds[0],
                        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                        optimizationAlgorithm: 'nearest_neighbor'
                    });

                expect(tripResponse.status).toBe(201);
                const tripId = tripResponse.body.trip.id;

                // Try to assign multiple drivers concurrently (should fail for all but one)
                const assignmentPromises = drivers.map(driver =>
                    request(app)
                        .put(`/api/v1/transport/trips/${tripId}/assign`)
                        .set('Authorization', `Bearer ${dispatchers[0].token}`)
                        .send({
                            driverId: driver.id
                        })
                );

                const assignmentResponses = await Promise.allSettled(assignmentPromises);

                // Only one assignment should succeed
                const successfulAssignments = assignmentResponses.filter(
                    result => result.status === 'fulfilled' &&
                        (result.value as any).status === 200
                );

                expect(successfulAssignments.length).toBe(1);
            }
        });
    });

    describe('Cleanup and Final Validation', () => {
        it('should generate comprehensive performance report', async () => {
            const adminUser = users.find(u => u.role === 'finance') || users[0]; // Use finance or first user as admin

            const reportResponse = await request(app)
                .get('/api/v1/monitoring/performance/report')
                .set('Authorization', `Bearer ${adminUser.token}`)
                .query({ timeRange: 'hour' });

            expect(reportResponse.status).toBe(200);

            const report = reportResponse.body;
            expect(report.summary).toBeDefined();
            expect(report.topEndpoints).toBeDefined();
            expect(report.slowestEndpoints).toBeDefined();

            // System should have handled the load reasonably well
            expect(report.summary.errorRate).toBeLessThan(0.1); // Less than 10% error rate
        });

        it('should verify system health after concurrent operations', async () => {
            const healthResponse = await request(app)
                .get('/health');

            expect(healthResponse.status).toBe(200);
            expect(healthResponse.body.status).toBe('healthy');
        });

        it('should confirm all critical systems are operational', async () => {
            const adminUser = users.find(u => u.role === 'finance') || users[0];

            const detailedHealthResponse = await request(app)
                .get('/api/v1/monitoring/health/detailed')
                .set('Authorization', `Bearer ${adminUser.token}`);

            expect(detailedHealthResponse.status).toBe(200);

            const criticalSystems = ['database', 'redis', 'memory'];
            criticalSystems.forEach(system => {
                const check = detailedHealthResponse.body.current.checks.find(
                    (c: any) => c.name === system
                );
                expect(check?.status).toBe('healthy');
            });
        });
    });
});