import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRoutes } from '@/routes';
import { TestDataFactory } from '@/test/helpers/testData';
import { AuthService } from '@/services/authService';

describe('Mobile Worker Routes', () => {
    let app: express.Application;
    let authService: AuthService;
    let testUser: any;
    let testDevice: any;
    let authToken: string;

    beforeEach(async () => {
        app = express();
        app.use(express.json());
        setupRoutes(app);

        authService = new AuthService();

        // Create test user and device
        testUser = await TestDataFactory.createUser({
            role: 'worker',
            consent_flags: JSON.stringify({
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            })
        });

        testDevice = await TestDataFactory.createDevice(testUser.id, {
            trust_level: 75
        });

        // Generate auth token
        authToken = await authService.generateAccessToken({
            userId: testUser.id,
            email: testUser.email,
            role: testUser.role,
            permissions: []
        });
    });

    describe('POST /api/v1/mobile/worker/location', () => {
        it('should accept valid location update with consent', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 10,
                timestamp: new Date().toISOString()
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .set('x-app-version', '1.0.0')
                .send(locationData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locationId).toBeDefined();
            expect(response.body.data.accepted).toBe(true);
        });

        it('should reject location update without consent', async () => {
            // Update user to remove location consent
            await TestDataFactory.updateUser(testUser.id, {
                consent_flags: JSON.stringify({
                    locationTracking: false,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                })
            });

            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 10
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(locationData)
                .expect(403);

            expect(response.body.error.code).toBe('CONSENT_REQUIRED');
        });

        it('should reject location with poor accuracy', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 150 // Above 100m threshold
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(locationData)
                .expect(400);

            expect(response.body.error.code).toBe('POOR_ACCURACY');
        });

        it('should reject request without device fingerprint', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 10
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${authToken}`)
                .send(locationData)
                .expect(401);

            expect(response.body.error.code).toBe('MISSING_DEVICE_FINGERPRINT');
        });
    });

    describe('GET /api/v1/mobile/worker/trip/status', () => {
        it('should return no active trip when none exists', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/worker/trip/status')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.hasActiveTrip).toBe(false);
            expect(response.body.data.status).toBe('no_trip');
        });

        it('should return active trip details when trip exists', async () => {
            // Create test trip
            const trip = await TestDataFactory.createTrip({
                status: 'in_progress',
                planned_stops: JSON.stringify([{
                    userId: testUser.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(Date.now() + 900000), // 15 minutes
                    status: 'pending'
                }])
            });

            const response = await request(app)
                .get('/api/v1/mobile/worker/trip/status')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.hasActiveTrip).toBe(true);
            expect(response.body.data.tripId).toBe(trip.id);
            expect(response.body.data.status).toBe('pending');
        });
    });

    describe('POST /api/v1/mobile/worker/availability', () => {
        it('should update worker availability successfully', async () => {
            const availabilityData = {
                available: false,
                reason: 'On break'
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/availability')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(availabilityData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.available).toBe(false);
            expect(response.body.data.reason).toBe('On break');
        });

        it('should require boolean availability status', async () => {
            const availabilityData = {
                available: 'yes', // Invalid type
                reason: 'On break'
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/availability')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(availabilityData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('POST /api/v1/mobile/worker/incident', () => {
        it('should report incident successfully', async () => {
            const incidentData = {
                type: 'safety',
                description: 'Unsafe pickup location',
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                }
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/incident')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(incidentData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.incidentId).toBeDefined();
            expect(response.body.data.status).toBe('reported');
            expect(response.body.data.referenceNumber).toBeDefined();
        });

        it('should reject incident without required fields', async () => {
            const incidentData = {
                type: 'safety'
                // Missing description
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/incident')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(incidentData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject invalid incident type', async () => {
            const incidentData = {
                type: 'invalid_type',
                description: 'Test incident'
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/incident')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(incidentData)
                .expect(400);

            expect(response.body.error.code).toBe('INVALID_INCIDENT_TYPE');
        });
    });

    describe('POST /api/v1/mobile/worker/consent', () => {
        it('should update consent preferences successfully', async () => {
            const consentData = {
                locationTracking: false,
                dataProcessing: true,
                marketingCommunications: true
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/consent')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send(consentData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.consentFlags.locationTracking).toBe(false);
            expect(response.body.data.consentFlags.dataProcessing).toBe(true);
            expect(response.body.data.consentFlags.marketingCommunications).toBe(true);
        });

        it('should require at least one consent preference', async () => {
            const response = await request(app)
                .post('/api/v1/mobile/worker/consent')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .send({})
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/mobile/worker/profile', () => {
        it('should return worker profile and preferences', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/worker/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-device-fingerprint', testDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.id).toBe(testUser.id);
            expect(response.body.data.user.email).toBe(testUser.email);
            expect(response.body.data.device.id).toBe(testDevice.id);
            expect(response.body.data.device.trustLevel).toBe(testDevice.trust_level);
        });
    });
});