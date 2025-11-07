import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import transportRoutes from '@/routes/transport';
import { authenticateToken } from '@/middleware/auth';
import jwt from 'jsonwebtoken';

// Mock the authentication middleware for testing
vi.mock('@/middleware/auth', () => ({
    authenticateToken: vi.fn((req, res, next) => {
        // Mock user will be set by individual tests
        if (req.headers.authorization) {
            const token = req.headers.authorization.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret') as any;
                req.user = decoded;
                next();
            } catch (error) {
                res.status(401).json({ error: 'Invalid token' });
            }
        } else {
            res.status(401).json({ error: 'No token provided' });
        }
    })
}));

describe('Transport Routes', () => {
    let app: express.Application;
    let db: any;
    let testWorker: any;
    let testDriver: any;
    let testDispatcher: any;
    let workerToken: string;
    let driverToken: string;
    let dispatcherToken: string;

    beforeEach(async () => {
        app = express();
        app.use(express.json());
        app.use('/api/transport', transportRoutes);

        db = getDatabase();

        // Create test users
        testWorker = await TestDataFactory.createUser({
            role: 'worker',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            }
        });

        testDriver = await TestDataFactory.createUser({
            role: 'driver'
        });

        testDispatcher = await TestDataFactory.createUser({
            role: 'dispatcher'
        });

        // Create JWT tokens for testing
        const jwtSecret = process.env.JWT_SECRET || 'test-secret';
        workerToken = jwt.sign(
            { id: testWorker.id, role: testWorker.role, email: testWorker.email },
            jwtSecret,
            { expiresIn: '1h' }
        );

        driverToken = jwt.sign(
            { id: testDriver.id, role: testDriver.role, email: testDriver.email },
            jwtSecret,
            { expiresIn: '1h' }
        );

        dispatcherToken = jwt.sign(
            { id: testDispatcher.id, role: testDispatcher.role, email: testDispatcher.email },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Insert test location data for worker
        await db.raw(`
            INSERT INTO location_points (
                user_id, device_id, coordinates, accuracy, source, 
                timestamp, consent_version, hash_chain, retention_date
            ) VALUES (?, ?, ST_GeogFromText(?), ?, ?, ?, ?, ?, ?)
        `, [
            testWorker.id,
            'test-device',
            'POINT(120.9842 14.5995)',
            10,
            'gps',
            new Date(),
            '1.0',
            'test-hash',
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        ]);
    });

    describe('GET /api/transport/workers/locations', () => {
        it('should return worker locations for dispatcher', async () => {
            const response = await request(app)
                .get('/api/transport/workers/locations')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('locations');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('count');
            expect(Array.isArray(response.body.locations)).toBe(true);
        });

        it('should reject access for non-dispatcher roles', async () => {
            await request(app)
                .get('/api/transport/workers/locations')
                .set('Authorization', `Bearer ${workerToken}`)
                .expect(403);
        });

        it('should require authentication', async () => {
            await request(app)
                .get('/api/transport/workers/locations')
                .expect(401);
        });

        it('should respect limit parameter', async () => {
            const response = await request(app)
                .get('/api/transport/workers/locations?limit=5')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body.locations.length).toBeLessThanOrEqual(5);
        });
    });

    describe('POST /api/transport/trips', () => {
        it('should create a new trip for dispatcher', async () => {
            const tripData = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000).toISOString(),
                driverId: testDriver.id,
                notes: 'Test trip creation'
            };

            const response = await request(app)
                .post('/api/transport/trips')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(tripData)
                .expect(201);

            expect(response.body).toHaveProperty('trip');
            expect(response.body).toHaveProperty('message');
            expect(response.body.trip.status).toBe('planned');
            expect(response.body.trip.driverId).toBe(testDriver.id);
            expect(response.body.trip.plannedStops).toHaveLength(1);
        });

        it('should reject trip creation for non-dispatcher roles', async () => {
            const tripData = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000).toISOString()
            };

            await request(app)
                .post('/api/transport/trips')
                .set('Authorization', `Bearer ${workerToken}`)
                .send(tripData)
                .expect(403);
        });

        it('should validate required fields', async () => {
            const invalidTripData = {
                scheduledAt: new Date(Date.now() + 3600000).toISOString()
                // Missing workerIds
            };

            await request(app)
                .post('/api/transport/trips')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(invalidTripData)
                .expect(400);
        });

        it('should validate scheduled time', async () => {
            const invalidTripData = {
                workerIds: [testWorker.id]
                // Missing scheduledAt
            };

            await request(app)
                .post('/api/transport/trips')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(invalidTripData)
                .expect(400);
        });
    });

    describe('GET /api/transport/trips', () => {
        let testTrip: any;

        beforeEach(async () => {
            // Create a test trip
            const [tripId] = await db('trips').insert({
                route_id: null,
                driver_id: testDriver.id,
                status: 'planned',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    status: 'pending'
                }]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date(Date.now() + 3600000),
                created_at: new Date()
            }).returning('id');

            testTrip = { id: tripId };
        });

        it('should return trips for dispatcher', async () => {
            const response = await request(app)
                .get('/api/transport/trips')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('trips');
            expect(response.body).toHaveProperty('count');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.trips)).toBe(true);
        });

        it('should return only driver trips for driver role', async () => {
            const response = await request(app)
                .get('/api/transport/trips')
                .set('Authorization', `Bearer ${driverToken}`)
                .expect(200);

            expect(response.body.trips).toBeDefined();
            // Should only return trips assigned to this driver
            response.body.trips.forEach((trip: any) => {
                if (trip.driverId) {
                    expect(trip.driverId).toBe(testDriver.id);
                }
            });
        });

        it('should filter by status', async () => {
            const response = await request(app)
                .get('/api/transport/trips?status=planned')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            response.body.trips.forEach((trip: any) => {
                expect(trip.status).toBe('planned');
            });
        });

        it('should respect pagination parameters', async () => {
            const response = await request(app)
                .get('/api/transport/trips?limit=1&offset=0')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body.pagination.limit).toBe(1);
            expect(response.body.pagination.offset).toBe(0);
        });

        it('should reject access for unauthorized roles', async () => {
            await request(app)
                .get('/api/transport/trips')
                .set('Authorization', `Bearer ${workerToken}`)
                .expect(403);
        });
    });

    describe('GET /api/transport/trips/:id', () => {
        let testTrip: any;

        beforeEach(async () => {
            const [tripId] = await db('trips').insert({
                route_id: null,
                driver_id: testDriver.id,
                status: 'planned',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    status: 'pending'
                }]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date(Date.now() + 3600000),
                created_at: new Date()
            }).returning('id');

            testTrip = { id: tripId };
        });

        it('should return trip details for dispatcher', async () => {
            const response = await request(app)
                .get(`/api/transport/trips/${testTrip.id}`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('trip');
            expect(response.body.trip.id).toBe(testTrip.id);
            expect(response.body.trip.status).toBe('planned');
        });

        it('should return trip details for assigned driver', async () => {
            const response = await request(app)
                .get(`/api/transport/trips/${testTrip.id}`)
                .set('Authorization', `Bearer ${driverToken}`)
                .expect(200);

            expect(response.body.trip.id).toBe(testTrip.id);
        });

        it('should reject access for non-assigned driver', async () => {
            const otherDriver = await TestDataFactory.createUser({ role: 'driver' });
            const otherDriverToken = jwt.sign(
                { id: otherDriver.id, role: 'driver', email: otherDriver.email },
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '1h' }
            );

            await request(app)
                .get(`/api/transport/trips/${testTrip.id}`)
                .set('Authorization', `Bearer ${otherDriverToken}`)
                .expect(403);
        });

        it('should return 404 for non-existent trip', async () => {
            await request(app)
                .get('/api/transport/trips/non-existent-id')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(404);
        });
    });

    describe('PUT /api/transport/trips/:id/status', () => {
        let testTrip: any;

        beforeEach(async () => {
            const [tripId] = await db('trips').insert({
                route_id: null,
                driver_id: testDriver.id,
                status: 'planned',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    status: 'pending'
                }]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date(Date.now() + 3600000),
                created_at: new Date()
            }).returning('id');

            testTrip = { id: tripId };
        });

        it('should update trip status for dispatcher', async () => {
            const response = await request(app)
                .put(`/api/transport/trips/${testTrip.id}/status`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({ status: 'assigned' })
                .expect(200);

            expect(response.body.trip.status).toBe('assigned');
            expect(response.body).toHaveProperty('message');
        });

        it('should update trip status for assigned driver', async () => {
            // First assign the trip
            await request(app)
                .put(`/api/transport/trips/${testTrip.id}/status`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({ status: 'assigned' });

            // Then driver can update to in_progress
            const response = await request(app)
                .put(`/api/transport/trips/${testTrip.id}/status`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ status: 'in_progress' })
                .expect(200);

            expect(response.body.trip.status).toBe('in_progress');
        });

        it('should reject status update without status field', async () => {
            await request(app)
                .put(`/api/transport/trips/${testTrip.id}/status`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({})
                .expect(400);
        });

        it('should reject access for non-assigned driver', async () => {
            const otherDriver = await TestDataFactory.createUser({ role: 'driver' });
            const otherDriverToken = jwt.sign(
                { id: otherDriver.id, role: 'driver', email: otherDriver.email },
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '1h' }
            );

            await request(app)
                .put(`/api/transport/trips/${testTrip.id}/status`)
                .set('Authorization', `Bearer ${otherDriverToken}`)
                .send({ status: 'assigned' })
                .expect(403);
        });

        it('should handle additional update data', async () => {
            const response = await request(app)
                .put(`/api/transport/trips/${testTrip.id}/status`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send({
                    status: 'assigned',
                    notes: 'Updated notes',
                    metrics: { delayMinutes: 10 }
                })
                .expect(200);

            expect(response.body.trip.status).toBe('assigned');
            expect(response.body.trip.notes).toBe('Updated notes');
        });
    });

    describe('POST /api/transport/trips/:id/complete', () => {
        let testTrip: any;

        beforeEach(async () => {
            const [tripId] = await db('trips').insert({
                route_id: null,
                driver_id: testDriver.id,
                status: 'in_progress',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    status: 'pending'
                }]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date(Date.now() + 3600000),
                started_at: new Date(),
                created_at: new Date()
            }).returning('id');

            testTrip = { id: tripId };
        });

        it('should complete trip with final stops', async () => {
            const finalStops = [{
                userId: testWorker.id,
                location: { latitude: 14.5995, longitude: 120.9842 },
                estimatedArrival: new Date(Date.now() - 300000).toISOString(),
                actualArrival: new Date(Date.now() - 240000).toISOString(),
                status: 'picked_up'
            }];

            const response = await request(app)
                .post(`/api/transport/trips/${testTrip.id}/complete`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ finalStops })
                .expect(200);

            expect(response.body.trip.status).toBe('completed');
            expect(response.body.trip.actualStops).toEqual(finalStops);
            expect(response.body.trip.completedAt).toBeDefined();
        });

        it('should reject completion without final stops', async () => {
            await request(app)
                .post(`/api/transport/trips/${testTrip.id}/complete`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({})
                .expect(400);
        });

        it('should reject completion by non-assigned driver', async () => {
            const otherDriver = await TestDataFactory.createUser({ role: 'driver' });
            const otherDriverToken = jwt.sign(
                { id: otherDriver.id, role: 'driver', email: otherDriver.email },
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '1h' }
            );

            const finalStops = [{
                userId: testWorker.id,
                location: { latitude: 14.5995, longitude: 120.9842 },
                estimatedArrival: new Date().toISOString(),
                actualArrival: new Date().toISOString(),
                status: 'picked_up'
            }];

            await request(app)
                .post(`/api/transport/trips/${testTrip.id}/complete`)
                .set('Authorization', `Bearer ${otherDriverToken}`)
                .send({ finalStops })
                .expect(403);
        });
    });

    describe('POST /api/transport/trips/:id/incidents', () => {
        let testTrip: any;

        beforeEach(async () => {
            const [tripId] = await db('trips').insert({
                route_id: null,
                driver_id: testDriver.id,
                status: 'in_progress',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    status: 'pending'
                }]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date(Date.now() + 3600000),
                created_at: new Date()
            }).returning('id');

            testTrip = { id: tripId };
        });

        it('should report incident successfully', async () => {
            const incidentData = {
                incidentType: 'delay',
                severity: 'medium',
                description: 'Traffic jam causing delay',
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                },
                estimatedDelay: 15
            };

            const response = await request(app)
                .post(`/api/transport/trips/${testTrip.id}/incidents`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send(incidentData)
                .expect(201);

            expect(response.body).toHaveProperty('incident');
            expect(response.body).toHaveProperty('message');
            expect(response.body.incident.tripId).toBe(testTrip.id);
            expect(response.body.incident.incidentType).toBe('delay');
            expect(response.body.incident.severity).toBe('medium');
        });

        it('should validate required incident fields', async () => {
            const invalidIncidentData = {
                incidentType: 'delay'
                // Missing severity and description
            };

            await request(app)
                .post(`/api/transport/trips/${testTrip.id}/incidents`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send(invalidIncidentData)
                .expect(400);
        });

        it('should allow incident reporting by any authenticated user', async () => {
            const incidentData = {
                incidentType: 'other',
                severity: 'low',
                description: 'Minor issue reported by dispatcher'
            };

            const response = await request(app)
                .post(`/api/transport/trips/${testTrip.id}/incidents`)
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(incidentData)
                .expect(201);

            expect(response.body.incident.reportedBy).toBe(testDispatcher.id);
        });
    });

    describe('POST /api/transport/routes/optimize', () => {
        it('should optimize route for dispatcher', async () => {
            const optimizationData = {
                workerIds: [testWorker.id],
                optimizationConfig: {
                    algorithm: 'nearest_neighbor',
                    prioritizePickupTime: true,
                    minimizeDistance: true
                },
                constraints: {
                    maxStops: 10,
                    maxDuration: 120,
                    vehicleCapacity: 8
                }
            };

            const response = await request(app)
                .post('/api/transport/routes/optimize')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(optimizationData)
                .expect(200);

            expect(response.body).toHaveProperty('optimization');
            expect(response.body).toHaveProperty('message');
            expect(response.body.optimization.optimizedStops).toBeDefined();
            expect(response.body.optimization.totalDistance).toBeGreaterThanOrEqual(0);
        });

        it('should reject optimization for non-dispatcher roles', async () => {
            const optimizationData = {
                workerIds: [testWorker.id],
                optimizationConfig: { algorithm: 'nearest_neighbor' },
                constraints: { maxStops: 10, maxDuration: 120, vehicleCapacity: 8 }
            };

            await request(app)
                .post('/api/transport/routes/optimize')
                .set('Authorization', `Bearer ${workerToken}`)
                .send(optimizationData)
                .expect(403);
        });

        it('should validate required optimization fields', async () => {
            const invalidOptimizationData = {
                optimizationConfig: { algorithm: 'nearest_neighbor' },
                constraints: { maxStops: 10, maxDuration: 120, vehicleCapacity: 8 }
                // Missing workerIds
            };

            await request(app)
                .post('/api/transport/routes/optimize')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(invalidOptimizationData)
                .expect(400);
        });
    });

    describe('GET /api/transport/drivers/capacity', () => {
        it('should return driver capacity information for dispatcher', async () => {
            const response = await request(app)
                .get('/api/transport/drivers/capacity')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('capacities');
            expect(response.body).toHaveProperty('count');
            expect(response.body).toHaveProperty('timestamp');
            expect(Array.isArray(response.body.capacities)).toBe(true);
        });

        it('should reject access for non-dispatcher roles', async () => {
            await request(app)
                .get('/api/transport/drivers/capacity')
                .set('Authorization', `Bearer ${workerToken}`)
                .expect(403);
        });

        it('should filter available drivers only', async () => {
            const response = await request(app)
                .get('/api/transport/drivers/capacity?available_only=true')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body.capacities).toBeDefined();
        });
    });

    describe('GET /api/transport/dashboard/stats', () => {
        it('should return dashboard statistics for dispatcher', async () => {
            const response = await request(app)
                .get('/api/transport/dashboard/stats')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('stats');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body.stats).toHaveProperty('activeTrips');
            expect(response.body.stats).toHaveProperty('availableDrivers');
            expect(response.body.stats).toHaveProperty('activeWorkers');
            expect(response.body.stats).toHaveProperty('completedToday');
            expect(response.body.stats).toHaveProperty('averageDelay');
        });

        it('should reject access for non-dispatcher roles', async () => {
            await request(app)
                .get('/api/transport/dashboard/stats')
                .set('Authorization', `Bearer ${workerToken}`)
                .expect(403);
        });
    });
});