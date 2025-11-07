import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRoutes } from '@/routes';
import { TestDataFactory } from '@/test/helpers/testData';
import { AuthService } from '@/services/authService';
import { PushNotificationService } from '@/services/pushNotificationService';
import { OfflineSyncService } from '@/services/offlineSyncService';
import { LocationService } from '@/services/locationService';
import { TransportService } from '@/services/transportService';

describe('Mobile API Integration Tests', () => {
    let app: express.Application;
    let authService: AuthService;
    let pushNotificationService: PushNotificationService;
    let offlineSyncService: OfflineSyncService;
    let locationService: LocationService;
    let transportService: TransportService;
    let testWorker: any;
    let testDriver: any;
    let testWorkerDevice: any;
    let testDriverDevice: any;
    let workerToken: string;
    let driverToken: string;

    beforeEach(async () => {
        app = express();
        app.use(express.json());
        setupRoutes(app);

        // Initialize services
        authService = new AuthService();
        pushNotificationService = new PushNotificationService();
        offlineSyncService = new OfflineSyncService();
        locationService = new LocationService();
        transportService = new TransportService();

        // Create test users and devices
        testWorker = await TestDataFactory.createUser({
            role: 'worker',
            consent_flags: JSON.stringify({
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            })
        });

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

        testWorkerDevice = await TestDataFactory.createDevice(testWorker.id, {
            trust_level: 75
        });

        testDriverDevice = await TestDataFactory.createDevice(testDriver.id, {
            trust_level: 85
        });

        // Generate auth tokens
        workerToken = await authService.generateAccessToken({
            userId: testWorker.id,
            email: testWorker.email,
            role: testWorker.role,
            permissions: []
        });

        driverToken = await authService.generateAccessToken({
            userId: testDriver.id,
            email: testDriver.email,
            role: testDriver.role,
            permissions: []
        });
    });

    describe('Location Sharing and Consent Workflows', () => {
        it('should allow location sharing with valid consent', async () => {
            const locationData = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 10,
                timestamp: new Date().toISOString()
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(locationData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locationId).toBeDefined();
            expect(response.body.data.accepted).toBe(true);

            // Verify location was stored
            const storedLocation = await locationService.getLatestLocation(testWorker.id);
            expect(storedLocation).toBeDefined();
            expect(storedLocation.coordinates.latitude).toBe(locationData.latitude);
            expect(storedLocation.coordinates.longitude).toBe(locationData.longitude);
        });

        it('should reject location sharing without consent', async () => {
            // Update user to remove location consent
            await TestDataFactory.updateUser(testWorker.id, {
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
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(locationData)
                .expect(403);

            expect(response.body.error.code).toBe('CONSENT_REQUIRED');
        });

        it('should update consent preferences and stop location tracking', async () => {
            // First, share a location
            await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send({
                    latitude: 14.5995,
                    longitude: 120.9842,
                    accuracy: 10
                });

            // Update consent to disable location tracking
            const consentData = {
                locationTracking: false,
                dataProcessing: true,
                marketingCommunications: true
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/consent')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(consentData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.consentFlags.locationTracking).toBe(false);

            // Verify subsequent location updates are rejected
            await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send({
                    latitude: 14.6000,
                    longitude: 120.9850,
                    accuracy: 10
                })
                .expect(403);
        });

        it('should validate location accuracy requirements', async () => {
            const poorAccuracyLocation = {
                latitude: 14.5995,
                longitude: 120.9842,
                accuracy: 150 // Above 100m threshold
            };

            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(poorAccuracyLocation)
                .expect(400);

            expect(response.body.error.code).toBe('POOR_ACCURACY');
        });
    });

    describe('Trip Management and Status Updates', () => {
        let testTrip: any;

        beforeEach(async () => {
            // Create a test trip
            testTrip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'assigned',
                planned_stops: JSON.stringify([
                    {
                        id: 'stop1',
                        userId: testWorker.id,
                        location: { latitude: 14.5995, longitude: 120.9842 },
                        estimatedArrival: new Date(Date.now() + 900000), // 15 minutes
                        status: 'pending'
                    }
                ]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({
                    estimatedDuration: 1800,
                    totalDistance: 15.5,
                    optimizationScore: 85
                })
            });
        });

        it('should get worker trip status with active trip', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/worker/trip/status')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.hasActiveTrip).toBe(true);
            expect(response.body.data.tripId).toBe(testTrip.id);
            expect(response.body.data.status).toBe('pending');
            expect(response.body.data.estimatedArrival).toBeDefined();
        });

        it('should get driver route details', async () => {
            const response = await request(app)
                .get(`/api/v1/mobile/driver/routes/${testTrip.id}`)
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.route.id).toBe(testTrip.id);
            expect(response.body.data.route.plannedStops).toHaveLength(1);
            expect(response.body.data.route.navigation.currentStopIndex).toBe(0);
        });

        it('should process driver check-in workflow', async () => {
            const checkInData = {
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                },
                notes: 'Arrived at pickup location'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/checkin/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send(checkInData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.stopId).toBe('stop1');
            expect(response.body.data.status).toBe('arrived');
            expect(response.body.data.checkInTime).toBeDefined();

            // Verify trip status was updated
            const updatedTrip = await transportService.getRouteDetails(testTrip.id);
            expect(updatedTrip.actualStops).toHaveLength(1);
        });

        it('should process worker pickup workflow', async () => {
            // First check in
            await request(app)
                .post('/api/v1/mobile/driver/checkin/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send({
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    notes: 'Arrived'
                });

            // Then pickup worker
            const pickupData = {
                workerPresent: true,
                notes: 'Worker picked up successfully'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/pickup/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send(pickupData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.workerPresent).toBe(true);
            expect(response.body.data.pickupTime).toBeDefined();

            // Verify worker can see updated trip status
            const workerStatusResponse = await request(app)
                .get('/api/v1/mobile/worker/trip/status')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint);

            expect(workerStatusResponse.body.data.status).toBe('picked_up');
        });

        it('should handle no-show scenario', async () => {
            // Check in first
            await request(app)
                .post('/api/v1/mobile/driver/checkin/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send({
                    location: { latitude: 14.5995, longitude: 120.9842 }
                });

            // Report no-show
            const noShowData = {
                workerPresent: false,
                notes: 'Worker not present at pickup location'
            };

            const response = await request(app)
                .post('/api/v1/mobile/driver/pickup/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send(noShowData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.workerPresent).toBe(false);

            // Verify trip metrics include no-show
            const updatedTrip = await transportService.getRouteDetails(testTrip.id);
            expect(updatedTrip.metrics.noShowCount).toBe(1);
        });

        it('should complete route workflow', async () => {
            // Complete all stops first
            await request(app)
                .post('/api/v1/mobile/driver/checkin/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send({ location: { latitude: 14.5995, longitude: 120.9842 } });

            await request(app)
                .post('/api/v1/mobile/driver/pickup/stop1')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send({ workerPresent: true });

            // Complete route
            const completionData = {
                finalLocation: {
                    latitude: 14.6000,
                    longitude: 120.9850
                },
                notes: 'Route completed successfully',
                mileage: 25.5
            };

            const response = await request(app)
                .post(`/api/v1/mobile/driver/routes/${testTrip.id}/complete`)
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send(completionData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('completed');
            expect(response.body.data.metrics.completedStops).toBe(1);
        });
    });

    describe('Push Notification Delivery', () => {
        beforeEach(async () => {
            // Register push tokens for test devices
            await pushNotificationService.registerPushToken(
                testWorker.id,
                testWorkerDevice.id,
                'worker-push-token-123',
                'ios',
                '1.0.0'
            );

            await pushNotificationService.registerPushToken(
                testDriver.id,
                testDriverDevice.id,
                'driver-push-token-456',
                'android',
                '1.0.0'
            );
        });

        it('should register push token successfully', async () => {
            const pushTokenData = {
                token: 'new-push-token-789',
                platform: 'ios',
                appVersion: '1.1.0'
            };

            const response = await request(app)
                .post('/api/v1/mobile/push/register')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(pushTokenData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Push token registered successfully');
        });

        it('should send trip assignment notification', async () => {
            // Create and assign trip
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'assigned',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 }
                }])
            });

            // Send notification
            const notificationId = await pushNotificationService.sendNotification(
                testWorker.id,
                'trip_assigned',
                {
                    title: 'New Trip Assigned',
                    body: `Your pickup is scheduled for ${new Date().toLocaleTimeString()}`,
                    data: { tripId: trip.id }
                }
            );

            expect(notificationId).toBeDefined();

            // Verify notification history
            const response = await request(app)
                .get('/api/v1/mobile/notifications')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.notifications).toHaveLength(1);
            expect(response.body.data.notifications[0].type).toBe('trip_assigned');
        });

        it('should mark notification as read', async () => {
            // Send notification first
            const notificationId = await pushNotificationService.sendNotification(
                testWorker.id,
                'driver_arrived',
                { title: 'Driver Arrived', body: 'Your driver has arrived' }
            );

            // Mark as read
            const response = await request(app)
                .post(`/api/v1/mobile/notifications/${notificationId}/read`)
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Notification marked as read');
        });

        it('should send location-based notifications', async () => {
            // First, share worker location
            await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send({
                    latitude: 14.5995,
                    longitude: 120.9842,
                    accuracy: 10
                });

            // Send location-based notification
            const notificationIds = await pushNotificationService.sendLocationBasedNotification(
                { latitude: 14.5995, longitude: 120.9842 },
                1000, // 1km radius
                'system_alert',
                {
                    title: 'Area Alert',
                    body: 'Important announcement for your area'
                }
            );

            expect(notificationIds).toHaveLength(1);

            // Verify worker received the notification
            const response = await request(app)
                .get('/api/v1/mobile/notifications')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint);

            expect(response.body.data.notifications.some(n => n.type === 'system_alert')).toBe(true);
        });
    });

    describe('Offline Synchronization Logic', () => {
        it('should sync pending location data', async () => {
            const syncRequest = {
                lastSyncTimestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                pendingData: [
                    {
                        id: 'offline-location-1',
                        dataType: 'location_point',
                        operation: 'create',
                        data: {
                            coordinates: { latitude: 14.5995, longitude: 120.9842 },
                            accuracy: 10,
                            timestamp: new Date().toISOString()
                        },
                        clientTimestamp: new Date().toISOString()
                    },
                    {
                        id: 'offline-location-2',
                        dataType: 'location_point',
                        operation: 'create',
                        data: {
                            coordinates: { latitude: 14.6000, longitude: 120.9850 },
                            accuracy: 8,
                            timestamp: new Date().toISOString()
                        },
                        clientTimestamp: new Date().toISOString()
                    }
                ]
            };

            const response = await request(app)
                .post('/api/v1/mobile/sync')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(syncRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.syncedItems).toHaveLength(2);
            expect(response.body.data.syncedItems).toContain('offline-location-1');
            expect(response.body.data.syncedItems).toContain('offline-location-2');
            expect(response.body.data.conflicts).toHaveLength(0);

            // Verify locations were stored
            const locations = await locationService.getLocationHistory(testWorker.id, 1, 10);
            expect(locations).toHaveLength(2);
        });

        it('should handle sync conflicts', async () => {
            // Create a trip that will conflict
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'in_progress', // Server state
                updated_at: new Date() // Recent update
            });

            const syncRequest = {
                lastSyncTimestamp: new Date(Date.now() - 3600000).toISOString(),
                pendingData: [
                    {
                        id: 'offline-trip-update-1',
                        dataType: 'trip_status',
                        operation: 'update',
                        data: {
                            tripId: trip.id,
                            status: 'completed', // Client thinks it's completed
                            notes: 'Trip completed offline'
                        },
                        clientTimestamp: new Date(Date.now() - 1800000).toISOString() // 30 minutes ago
                    }
                ]
            };

            const response = await request(app)
                .post('/api/v1/mobile/sync')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send(syncRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.conflicts).toHaveLength(1);
            expect(response.body.data.conflicts[0].conflictType).toBe('version');
            expect(response.body.data.conflicts[0].clientId).toBe('offline-trip-update-1');
        });

        it('should sync incident reports', async () => {
            const syncRequest = {
                lastSyncTimestamp: new Date(Date.now() - 3600000).toISOString(),
                pendingData: [
                    {
                        id: 'offline-incident-1',
                        dataType: 'incident_report',
                        operation: 'create',
                        data: {
                            type: 'safety',
                            description: 'Unsafe pickup location reported offline',
                            location: { latitude: 14.5995, longitude: 120.9842 },
                            severity: 'medium'
                        },
                        clientTimestamp: new Date().toISOString()
                    }
                ]
            };

            const response = await request(app)
                .post('/api/v1/mobile/sync')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send(syncRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.syncedItems).toContain('offline-incident-1');

            // Verify incident was created
            const incidents = await transportService.getIncidentReports(testWorker.id);
            expect(incidents.some(i => i.type === 'safety')).toBe(true);
        });

        it('should get pending sync data', async () => {
            // Queue some data for sync
            await offlineSyncService.queueForSync(
                testWorker.id,
                testWorkerDevice.id,
                'availability_update',
                'update',
                { available: false, reason: 'Break time' }
            );

            const response = await request(app)
                .get('/api/v1/mobile/sync/pending?limit=50')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.pendingData).toHaveLength(1);
            expect(response.body.data.pendingData[0].dataType).toBe('availability_update');
        });

        it('should resolve sync conflicts', async () => {
            // First create a conflict by syncing conflicting data
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'in_progress',
                updated_at: new Date()
            });

            const syncResponse = await request(app)
                .post('/api/v1/mobile/sync')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send({
                    lastSyncTimestamp: new Date(Date.now() - 3600000).toISOString(),
                    pendingData: [{
                        id: 'conflict-trip-1',
                        dataType: 'trip_status',
                        operation: 'update',
                        data: { tripId: trip.id, status: 'completed' },
                        clientTimestamp: new Date(Date.now() - 1800000).toISOString()
                    }]
                });

            const conflictId = syncResponse.body.data.conflicts[0]?.id;
            if (conflictId) {
                // Resolve the conflict
                const resolveResponse = await request(app)
                    .post(`/api/v1/mobile/sync/conflicts/${conflictId}/resolve`)
                    .set('Authorization', `Bearer ${driverToken}`)
                    .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                    .send({
                        resolution: 'server_wins'
                    })
                    .expect(200);

                expect(resolveResponse.body.success).toBe(true);
                expect(resolveResponse.body.message).toBe('Conflict resolved successfully');
            }
        });

        it('should provide server updates since last sync', async () => {
            // Create some server-side updates
            const trip = await TestDataFactory.createTrip({
                driver_id: testDriver.id,
                status: 'assigned',
                planned_stops: JSON.stringify([{
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 }
                }])
            });

            // Update trip status on server
            await transportService.updateTripStatus(trip.id, 'in_progress', {
                updatedBy: testDriver.id,
                timestamp: new Date()
            });

            // Sync with old timestamp to get server updates
            const response = await request(app)
                .post('/api/v1/mobile/sync')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send({
                    lastSyncTimestamp: new Date(Date.now() - 3600000).toISOString(),
                    pendingData: []
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.serverUpdates).toHaveLength(1);
            expect(response.body.data.serverUpdates[0].dataType).toBe('trip_status');
            expect(response.body.data.serverUpdates[0].operation).toBe('update');
        });
    });

    describe('Mobile API Security and Error Handling', () => {
        it('should require device fingerprint for all mobile endpoints', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/health')
                .set('Authorization', `Bearer ${workerToken}`)
                .expect(401);

            expect(response.body.error.code).toBe('MISSING_DEVICE_FINGERPRINT');
        });

        it('should validate device ownership', async () => {
            const otherDevice = await TestDataFactory.createDevice(testDriver.id);

            const response = await request(app)
                .get('/api/v1/mobile/worker/profile')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', otherDevice.device_fingerprint)
                .expect(403);

            expect(response.body.error.code).toBe('DEVICE_NOT_BOUND');
        });

        it('should enforce trust level requirements', async () => {
            // Update device to low trust
            await TestDataFactory.updateDevice(testDriverDevice.id, {
                trust_level: 40 // Below high trust threshold
            });

            const response = await request(app)
                .post('/api/v1/mobile/driver/location')
                .set('Authorization', `Bearer ${driverToken}`)
                .set('x-device-fingerprint', testDriverDevice.device_fingerprint)
                .send({
                    latitude: 14.5995,
                    longitude: 120.9842,
                    accuracy: 5
                })
                .expect(403);

            expect(response.body.error.code).toBe('INSUFFICIENT_TRUST_LEVEL');
        });

        it('should handle invalid coordinates gracefully', async () => {
            const response = await request(app)
                .post('/api/v1/mobile/worker/location')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .send({
                    latitude: 200, // Invalid
                    longitude: 120.9842,
                    accuracy: 10
                })
                .expect(400);

            expect(response.body.error.code).toBe('INVALID_COORDINATES');
        });

        it('should return mobile app configuration', async () => {
            const response = await request(app)
                .get('/api/v1/mobile/config')
                .set('Authorization', `Bearer ${workerToken}`)
                .set('x-device-fingerprint', testWorkerDevice.device_fingerprint)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.apiVersion).toBeDefined();
            expect(response.body.data.features.locationTracking).toBe(true);
            expect(response.body.data.features.pushNotifications).toBe(true);
            expect(response.body.data.features.offlineSync).toBe(true);
            expect(response.body.data.intervals.locationUpdate).toBe(30);
            expect(response.body.data.limits.maxLocationAccuracy).toBe(100);
        });
    });
});