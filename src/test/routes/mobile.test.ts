import request from 'supertest';
import { Express } from 'express';
import { setupTestApp } from '../helpers/testApp';
import { createTestUser, createTestDevice } from '../helpers/testData';
import { AuthService } from '@/services/authService';
import { PushNotificationService } from '@/services/pushNotificationService';
import { OfflineSyncService } from '@/services/offlineSyncService';

describe('Mobile API Routes', () => {
    let app: Express;
    let authService: AuthService;
    let pushNotificationService: PushNotificationService;
    let offlineSyncService: OfflineSyncService;
    let testUser: any;
    let testDevice: any;
    let accessToken: string;

    beforeAll(async () => {
        app = await setupTestApp();
        authService = new AuthService();
        pushNotificationService = new PushNotificationService();
        offlineSyncService = new OfflineSyncService();
    });

    beforeEach(async () => {
        // Create test user and device
        testUser = await createTestUser({ role: 'worker' });
        testDevice = await createTestDevice(testUser.id);

        // Generate access token
        accessToken = await authService.generateAccessToken({
            userId: testUser.id,
            email: testUser.email,
            role: testUser.role,
            permissions: ['location:share', 'trip:view']
        });
    });

    describe('Mobile Authentication', () => {
        it('should require device fingerprint for mobile access', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/health')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('MISSING_DEVICE_FINGERPRINT');
        });

        it('should authenticate with valid token and device fingerprint', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/health')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user.id).toBe(testUser.id);
        });
    });

    describe('Push Notifications', () => {
        it('should register push token successfully', async () => {
            const pushTokenData = {
                token: 'test-push-token-123',
                platform: 'ios',
                appVersion: '1.0.0'
            };

            const response = await request(app)
                .post('/api/v1/mobile/push/register')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(pushTokenData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Push token registered successfully');
        });

        it('should get notification history', async () => {
            // First create a test notification
            await pushNotificationService.sendNotification(
                testUser.id,
                'trip_assigned',
                { title: 'Test Notification' }
            );

            const response = await request(app)
                .get('/api/v1/mobile/notifications')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.notifications)).toBe(true);
        });
    });

    describe('Offline Sync', () => {
        it('should process sync request with pending data', async () => {
            const syncRequest = {
                lastSyncTimestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                pendingData: [
                    {
                        id: 'test-sync-1',
                        dataType: 'location_point',
                        operation: 'create',
                        data: {
                            latitude: 14.5995,
                            longitude: 120.9842,
                            accuracy: 10,
                            timestamp: new Date().toISOString()
                        },
                        clientTimestamp: new Date().toISOString()
                    }
                ]
            };

            const response = await request(app)
                .post('/api/v1/mobile/sync')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(syncRequest);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.syncTimestamp).toBeDefined();
            expect(Array.isArray(response.body.data.syncedItems)).toBe(true);
        });

        it('should get pending sync data', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/sync/pending')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.pendingData)).toBe(true);
        });
    });

    describe('Mobile Configuration', () => {
        it('should return mobile app configuration', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/config')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.apiVersion).toBeDefined();
            expect(response.body.data.features).toBeDefined();
            expect(response.body.data.intervals).toBeDefined();
            expect(response.body.data.limits).toBeDefined();
            expect(response.body.data.security).toBeDefined();
        });
    });

    describe('Worker Mobile API', () => {
        it('should update worker location with consent', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 10,
                timestamp: new Date().toISOString()
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(locationData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.locationId).toBeDefined();
            expect(response.body.data.accepted).toBe(true);
        });

        it('should get worker trip status', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/worker/trip/status')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.hasActiveTrip).toBeDefined();
        });

        it('should update worker availability', async () => {
            const availabilityData = {
                available: false,
                reason: 'On break'
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/availability')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(availabilityData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.available).toBe(false);
            expect(response.body.data.reason).toBe('On break');
        });

        it('should report incident', async () => {
            const incidentData = {
                type: 'safety',
                description: 'Unsafe pickup location'
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/incident')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(incidentData);

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.incidentId).toBeDefined();
            expect(response.body.data.referenceNumber).toBeDefined();
        });
    });

    describe('Driver Mobile API', () => {
        let driverUser: any;
        let driverToken: string;

        beforeEach(async () => {
            // Create driver user
            driverUser = await createTestUser({ role: 'driver' });
            driverToken = await authService.generateAccessToken({
                userId: driverUser.id,
                email: driverUser.email,
                role: driverUser.role,
                permissions: ['route:manage', 'location:share']
            });
        });

        it('should get driver routes', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/driver/routes')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.routes)).toBe(true);
        });

        it('should update driver location', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 5,
                heading: 45,
                speed: 30
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/location')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(locationData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.locationId).toBeDefined();
        });

        it('should update driver availability', async () => {
            const availabilityData = {
                available: true,
                reason: 'Ready for routes'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/availability')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(availabilityData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.available).toBe(true);
        });

        it('should get driver metrics', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/driver/metrics?period=week')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.metrics).toBeDefined();
            expect(response.body.data.rankings).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid location coordinates', async () => {
            const invalidLocationData = {
                latitude: 200, // Invalid latitude
                longitude: 120.9842,
                accuracy: 10
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send(invalidLocationData);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_COORDINATES');
        });

        it('should handle missing required fields', async () => {
            const response = await request(app)
                .post('/api/v1/mobile/push/register')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', testDevice.deviceFingerprint)
                .send({}); // Missing required fields

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle unauthorized device access', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/health')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('x-device-fingerprint', 'invalid-fingerprint');

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('DEVICE_NOT_BOUND');
        });
    });
});