import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRoutes } from '@/routes';
import { TestDataFactory } from '@/test/helpers/testData';
import { AuthService } from '@/services/authService';

describe('Mobile Driver Routes', () => {
    let app: express.Application;
    let authService: AuthService;
    let testDriver: any;
    let testDevice: any;
    let authToken: string;

    beforeEach(async () => {
        app = express();
        app.use(express.json());
        setupRoutes(app);

        authService = new AuthService();

        // Create test driver and device
        testDriver = await TestDataFactory.createUser({
            role: 'driver',
            consent_flags: JSON.stringify({
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            })
        });

        testDevice = await TestDataFactory.createDevice(testDriver.id, {
            trust_level: 85 // High trust for driver
        });

        // Generate auth token
        authToken = await authService.generateAccessToken({
            userId: testDriver.id,
            email: testDriver.email,
            role: testDriver.role,
            permissions: []
        });
    });

    describe('GET /api/v1/mobile/driver/routes', () => {
        it('should return empty routes when none assigned', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/driver/routes')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.routes).toEqual([]);
        });

        it('should return assigned routes', async () => {
            // Create test route assigned to driver
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'assigned',
                planned_stops: JSON.stringify([
                    {
                        id: 'stop1',
                        userId: 'worker1',
                        location: { latitude: 14.5995, longitude: 120.9842 },
                        estimatedArrival: new Date(Date.now() + 900000)
                    }
                ]),
                metrics: JSON.stringify({
                    estimatedDuration: 1800,
                    totalDistance: 15.5,
                    optimizationScore: 85
                })
            });

            const response = await request(app)
                .get('/api/v1/mobile/driver/routes')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.routes).toHaveLength(1);
            expect(response.body.data.routes[0].id).toBe(trip.id);
            expect(response.body.data.routes[0].status).toBe('assigned');
        });

        it('should filter routes by status', async () => {
            // Create completed trip
            await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'completed'
            });

            const response = await request(app)
                .get('/api/v1/mobile/driver/routes?status=active')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.routes).toHaveLength(0);
        });
    });

    describe('GET /api/v1/mobile/driver/routes/:routeId', () => {
        it('should return detailed route information', async () => {
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'assigned',
                planned_stops: JSON.stringify([
                    {
                        id: 'stop1',
                        userId: 'worker1',
                        location: { latitude: 14.5995, longitude: 120.9842 },
                        estimatedArrival: new Date(Date.now() + 900000),
                        status: 'pending',
                        workerInfo: {
                            department: 'Engineering',
                            contactNumber: '+63912345678'
                        }
                    }
                ]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({
                    remainingDistance: 15.5,
                    estimatedCompletion: new Date(Date.now() + 1800000)
                })
            });

            const response = await request(app)
                .get(`/api/v1/mobile/driver/routes/${trip.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.route.id).toBe(trip.id);
            expect(response.body.data.route.plannedStops).toHaveLength(1);
            expect(response.body.data.route.navigation.currentStopIndex).toBe(0);
        });

        it('should deny access to routes not assigned to driver', async () => {
            const otherDriver = await TestDataFactory.createUser({ role: 'driver' });
            const trip = await TestDataFactory.createTrip({
                driver_id: otherDriver.id,
                status: 'assigned'
            });

            const response = await request(app)
                .get(`/api/v1/mobile/driver/routes/${trip.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(403);

            expect(response.body.error.code).toBe('ACCESS_DENIED');
        });
    });

    describe('POST /api/v1/mobile/driver/location', () => {
        it('should accept driver location update with high trust', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 5,
                heading: 45,
                speed: 25
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/location')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(locationData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locationId).toBeDefined();
            expect(response.body.data.timestamp).toBeDefined();
        });

        it('should reject location update from low trust device', async () => {
            // Update device to low trust
            await TestDataFactory.updateDevice(testDevice.id, {
                trust_level: 50 // Below high trust threshold
            });

            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 5
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/location')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(locationData)
                .expect(403);

            expect(response.body.error.code).toBe('INSUFFICIENT_TRUST_LEVEL');
        });
    });

    describe('POST /api/v1/mobile/driver/checkin/:stopId', () => {
        it('should process driver check-in successfully', async () => {
            // Create active trip
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'assigned',
                planned_stops: JSON.stringify([
                    {
                        id: 'stop1',
                        userId: 'worker1',
                        location: { latitude: 14.5995, longitude: 120.9842 }
                    }
                ])
            });

            const checkInData = {
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                },
                notes: 'Arrived at pickup location'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/checkin/stop1')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(checkInData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.stopId).toBe('stop1');
            expect(response.body.data.status).toBe('arrived');
            expect(response.body.data.checkInTime).toBeDefined();
        });
    });

    describe('POST /api/v1/mobile/driver/pickup/:stopId', () => {
        it('should process worker pickup successfully', async () => {
            // Create trip with checked-in stop
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'in_progress',
                actual_stops: JSON.stringify([
                    {
                        stopId: 'stop1',
                        status: 'arrived',
                        timestamp: new Date()
                    }
                ])
            });

            const pickupData = {
                workerPresent: true,
                notes: 'Worker picked up successfully'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/pickup/stop1')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(pickupData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.stopId).toBe('stop1');
            expect(response.body.data.workerPresent).toBe(true);
            expect(response.body.data.pickupTime).toBeDefined();
        });

        it('should handle no-show scenario', async () => {
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'in_progress',
                actual_stops: JSON.stringify([
                    {
                        stopId: 'stop1',
                        status: 'arrived',
                        timestamp: new Date()
                    }
                ])
            });

            const pickupData = {
                workerPresent: false,
                notes: 'Worker not present at pickup location'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/pickup/stop1')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(pickupData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.workerPresent).toBe(false);
        });
    });

    describe('POST /api/v1/mobile/driver/incident', () => {
        it('should report driver incident successfully', async () => {
            const incidentData = {
                type: 'traffic',
                description: 'Heavy traffic causing delay',
                severity: 'medium',
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                }
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/incident')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(incidentData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.incidentId).toBeDefined();
            expect(response.body.data.referenceNumber).toBeDefined();
        });

        it('should reject invalid incident type', async () => {
            const incidentData = {
                type: 'invalid_type',
                description: 'Test incident'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/incident')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(incidentData)
                .expect(400);

            expect(response.body.error.code).toBe('INVALID_INCIDENT_TYPE');
        });
    });

    describe('POST /api/v1/mobile/driver/availability', () => {
        it('should update driver availability successfully', async () => {
            const availabilityData = {
                available: false,
                reason: 'End of shift',
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                }
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/availability')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(availabilityData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.available).toBe(false);
            expect(response.body.data.reason).toBe('End of shift');
        });

        it('should prevent going unavailable with active route', async () => {
            // Create active route
            await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'in_progress'
            });

            const availabilityData = {
                available: false,
                reason: 'Break time'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/availability')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(availabilityData)
                .expect(400);

            expect(response.body.error.code).toBe('ACTIVE_ROUTE_EXISTS');
        });
    });

    describe('GET /api/v1/mobile/driver/metrics', () => {
        it('should return driver performance metrics', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/driver/metrics?period=week')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.period).toBe('week');
            expect(response.body.data.metrics).toBeDefined();
            expect(response.body.data.rankings).toBeDefined();
        });

        it('should reject invalid period', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/driver/metrics?period=invalid')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(400);

            expect(response.body.error.code).toBe('INVALID_PERIOD');
        });
    });
});