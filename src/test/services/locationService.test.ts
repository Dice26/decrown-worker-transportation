import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationService } from '@/services/locationService';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import { LocationIngestionRequest } from '@/types/location';
import { User } from '@/types/auth';

describe('LocationService', () => {
    let locationService: LocationService;
    let db: any;
    let testUser: any;

    beforeEach(async () => {
        locationService = new LocationService();
        db = getDatabase();

        // Create test user with location tracking consent
        testUser = await TestDataFactory.createUser({
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            }
        });
    });

    describe('ingestLocation', () => {
        it('should successfully ingest valid location data', async () => {
            const locationData: LocationIngestionRequest = {
                coordinates: {
                    latitude: 14.5995,
                    longitude: 120.9842
                },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            const result = await locationService.ingestLocation(testUser.id, locationData, testUser);

            expect(result).toBeDefined();
            expect(result.userId).toBe(testUser.id);
            expect(result.coordinates.latitude).toBe(locationData.coordinates.latitude);
            expect(result.coordinates.longitude).toBe(locationData.coordinates.longitude);
            expect(result.accuracy).toBe(locationData.accuracy);
            expect(result.source).toBe(locationData.source);
            expect(result.hashChain).toBeDefined();
            expect(result.retentionDate).toBeInstanceOf(Date);
        });

        it('should reject location data without consent', async () => {
            const userWithoutConsent = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: false,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const locationData: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await expect(locationService.ingestLocation(userWithoutConsent.id, locationData, userWithoutConsent))
                .rejects.toThrow('Location tracking consent not provided');
        });

        it('should reject location data with poor accuracy', async () => {
            const locationData: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 150, // Above 100m threshold
                source: 'network',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await expect(locationService.ingestLocation(testUser.id, locationData, testUser))
                .rejects.toThrow('Location accuracy below threshold (>100m)');
        });

        it('should reject invalid coordinates', async () => {
            const locationData: LocationIngestionRequest = {
                coordinates: { latitude: 95, longitude: 200 }, // Invalid coordinates
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await expect(locationService.ingestLocation(testUser.id, locationData, testUser))
                .rejects.toThrow('Invalid latitude: must be between -90 and 90');
        });

        it('should generate proper hash chain for sequential locations', async () => {
            const locationData1: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            const locationData2: LocationIngestionRequest = {
                coordinates: { latitude: 14.6000, longitude: 120.9850 },
                accuracy: 15,
                source: 'gps',
                timestamp: new Date(Date.now() + 60000).toISOString(),
                deviceId: 'test-device-123'
            };

            const result1 = await locationService.ingestLocation(testUser.id, locationData1, testUser);
            const result2 = await locationService.ingestLocation(testUser.id, locationData2, testUser);

            expect(result1.hashChain).toBeDefined();
            expect(result2.hashChain).toBeDefined();
            expect(result1.hashChain).not.toBe(result2.hashChain);
        });
    });

    describe('getUserLocations', () => {
        beforeEach(async () => {
            // Insert test location data
            const locations = [
                {
                    coordinates: { latitude: 14.5995, longitude: 120.9842 },
                    accuracy: 10,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.6000, longitude: 120.9850 },
                    accuracy: 15,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 180000).toISOString(), // 3 minutes ago
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.6005, longitude: 120.9855 },
                    accuracy: 8,
                    source: 'gps',
                    timestamp: new Date().toISOString(),
                    deviceId: 'test-device-123'
                }
            ];

            for (const location of locations) {
                await locationService.ingestLocation(testUser.id, location, testUser);
            }
        });

        it('should return user locations for admin role', async () => {
            const locations = await locationService.getUserLocations(
                testUser.id,
                10,
                'admin-user-id',
                'admin'
            );

            expect(locations).toHaveLength(3);
            expect(locations[0].userId).toBe(testUser.id);
            expect(typeof locations[0].coordinates.latitude).toBe('number');
            expect(typeof locations[0].coordinates.longitude).toBe('number');
        });

        it('should return user locations for dispatcher role', async () => {
            const locations = await locationService.getUserLocations(
                testUser.id,
                10,
                'dispatcher-user-id',
                'dispatcher'
            );

            expect(locations).toHaveLength(3);
            expect(locations[0].userId).toBe(testUser.id);
            expect(typeof locations[0].coordinates.latitude).toBe('number');
        });

        it('should return own locations for user', async () => {
            const locations = await locationService.getUserLocations(
                testUser.id,
                10,
                testUser.id,
                'worker'
            );

            expect(locations).toHaveLength(3);
            expect(locations[0].userId).toBe(testUser.id);
            expect(typeof locations[0].coordinates.latitude).toBe('number');
        });

        it('should apply privacy filtering for unauthorized users', async () => {
            const locations = await locationService.getUserLocations(
                testUser.id,
                10,
                'other-user-id',
                'worker'
            );

            expect(locations).toHaveLength(3);
            expect(locations[0].userId).toBe(testUser.id);
            // Coordinates should be redacted (string format)
            expect(typeof locations[0].coordinates.latitude).toBe('string');
            expect(typeof locations[0].coordinates.longitude).toBe('string');
        });

        it('should respect limit parameter', async () => {
            const locations = await locationService.getUserLocations(
                testUser.id,
                2,
                testUser.id,
                'worker'
            );

            expect(locations).toHaveLength(2);
        });

        it('should return locations in descending timestamp order', async () => {
            const locations = await locationService.getUserLocations(
                testUser.id,
                10,
                testUser.id,
                'worker'
            );

            expect(locations).toHaveLength(3);
            expect(new Date(locations[0].timestamp).getTime())
                .toBeGreaterThan(new Date(locations[1].timestamp).getTime());
            expect(new Date(locations[1].timestamp).getTime())
                .toBeGreaterThan(new Date(locations[2].timestamp).getTime());
        });
    });

    describe('cleanupExpiredLocations', () => {
        beforeEach(async () => {
            // Insert expired location data
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - 35); // 35 days ago

            await db.raw(`
                INSERT INTO location_points (
                    user_id, device_id, coordinates, accuracy, source, 
                    timestamp, consent_version, hash_chain, retention_date
                ) VALUES (?, ?, ST_GeogFromText(?), ?, ?, ?, ?, ?, ?)
            `, [
                testUser.id,
                'expired-device',
                'POINT(120.9842 14.5995)',
                10,
                'gps',
                expiredDate,
                '1.0',
                'test-hash',
                new Date(Date.now() - 86400000) // Yesterday (expired)
            ]);

            // Insert current location data
            const currentLocation: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'current-device'
            };

            await locationService.ingestLocation(testUser.id, currentLocation, testUser);
        });

        it('should delete expired location data', async () => {
            const result = await locationService.cleanupExpiredLocations();

            expect(result.deletedCount).toBeGreaterThan(0);
            expect(result.batchesProcessed).toBeGreaterThan(0);

            // Verify expired data was deleted
            const remainingLocations = await db('location_points')
                .where('user_id', testUser.id)
                .count('* as count');

            expect(parseInt(remainingLocations[0].count)).toBe(1); // Only current location remains
        });

        it('should not delete current location data', async () => {
            await locationService.cleanupExpiredLocations();

            // Verify current data still exists
            const currentLocations = await db('location_points')
                .where('user_id', testUser.id)
                .where('device_id', 'current-device');

            expect(currentLocations).toHaveLength(1);
        });
    });

    describe('verifyHashChain', () => {
        beforeEach(async () => {
            // Insert sequential location data to create hash chain
            const locations = [
                {
                    coordinates: { latitude: 14.5995, longitude: 120.9842 },
                    accuracy: 10,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 300000).toISOString(),
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.6000, longitude: 120.9850 },
                    accuracy: 15,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 180000).toISOString(),
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.6005, longitude: 120.9855 },
                    accuracy: 8,
                    source: 'gps',
                    timestamp: new Date().toISOString(),
                    deviceId: 'test-device-123'
                }
            ];

            for (const location of locations) {
                await locationService.ingestLocation(testUser.id, location, testUser);
            }
        });

        it('should verify valid hash chain', async () => {
            const verification = await locationService.verifyHashChain(testUser.id);

            expect(verification.isValid).toBe(true);
            expect(verification.brokenAt).toBeUndefined();
            expect(verification.totalPoints).toBe(3);
            expect(verification.verifiedPoints).toBe(3);
        });

        it('should detect tampered hash chain', async () => {
            // Tamper with hash chain
            await db('location_points')
                .where('user_id', testUser.id)
                .orderBy('timestamp', 'asc')
                .limit(1)
                .update({ hash_chain: 'tampered-hash' });

            const verification = await locationService.verifyHashChain(testUser.id);

            expect(verification.isValid).toBe(false);
            expect(verification.brokenAt).toBeDefined();
            expect(verification.totalPoints).toBe(3);
            expect(verification.verifiedPoints).toBeLessThan(3);
        });

        it('should verify hash chain within date range', async () => {
            const startDate = new Date(Date.now() - 200000); // 3.33 minutes ago
            const endDate = new Date();

            const verification = await locationService.verifyHashChain(testUser.id, startDate, endDate);

            expect(verification.isValid).toBe(true);
            expect(verification.totalPoints).toBeLessThan(3); // Should only include locations in range
        });
    });

    describe('exportLocationData', () => {
        beforeEach(async () => {
            // Insert test location data
            const locations = [
                {
                    coordinates: { latitude: 14.5995, longitude: 120.9842 },
                    accuracy: 10,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 300000).toISOString(),
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.6000, longitude: 120.9850 },
                    accuracy: 15,
                    source: 'network',
                    timestamp: new Date(Date.now() - 180000).toISOString(),
                    deviceId: 'test-device-123'
                }
            ];

            for (const location of locations) {
                await locationService.ingestLocation(testUser.id, location, testUser);
            }
        });

        it('should export location data for admin role', async () => {
            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 400000),
                endDate: new Date(),
                includeRedacted: false,
                format: 'json' as const
            };

            const exportData = await locationService.exportLocationData(exportRequest, 'admin');

            expect(exportData).toHaveLength(2);
            expect(exportData[0].userId).toBe(testUser.id);
            expect(typeof exportData[0].coordinates.latitude).toBe('number');
            expect(exportData[0].isRedacted).toBe(false);
        });

        it('should apply privacy redaction for non-admin roles', async () => {
            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 400000),
                endDate: new Date(),
                includeRedacted: false,
                format: 'json' as const
            };

            const exportData = await locationService.exportLocationData(exportRequest, 'worker');

            expect(exportData).toHaveLength(2);
            expect(exportData[0].coordinates.latitude).toBe('[REDACTED]');
            expect(exportData[0].coordinates.longitude).toBe('[REDACTED]');
            expect(exportData[0].isRedacted).toBe(true);
        });

        it('should export all users data when no userId specified', async () => {
            // Create another user with location data
            const otherUser = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const locationData: LocationIngestionRequest = {
                coordinates: { latitude: 14.7000, longitude: 121.0000 },
                accuracy: 20,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'other-device'
            };

            await locationService.ingestLocation(otherUser.id, locationData, otherUser);

            const exportRequest = {
                startDate: new Date(Date.now() - 400000),
                endDate: new Date(),
                includeRedacted: false,
                format: 'json' as const
            };

            const exportData = await locationService.exportLocationData(exportRequest, 'admin');

            expect(exportData.length).toBeGreaterThan(2);

            const userIds = [...new Set(exportData.map(item => item.userId))];
            expect(userIds).toContain(testUser.id);
            expect(userIds).toContain(otherUser.id);
        });

        it('should filter by date range', async () => {
            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 200000), // Only last 3.33 minutes
                endDate: new Date(),
                includeRedacted: false,
                format: 'json' as const
            };

            const exportData = await locationService.exportLocationData(exportRequest, 'admin');

            expect(exportData.length).toBeLessThan(2); // Should exclude older location
        });
    });

    describe('applyLocationFiltering', () => {
        beforeEach(async () => {
            // Insert noisy location data that needs smoothing
            const noisyLocations = [
                {
                    coordinates: { latitude: 14.5995, longitude: 120.9842 },
                    accuracy: 10,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 240000).toISOString(), // 4 minutes ago
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.5997, longitude: 120.9844 }, // Slight movement
                    accuracy: 15,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 180000).toISOString(), // 3 minutes ago
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.5999, longitude: 120.9846 }, // Continued movement
                    accuracy: 8,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
                    deviceId: 'test-device-123'
                },
                {
                    coordinates: { latitude: 14.6001, longitude: 120.9848 }, // Final position
                    accuracy: 12,
                    source: 'gps',
                    timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
                    deviceId: 'test-device-123'
                }
            ];

            for (const location of noisyLocations) {
                await locationService.ingestLocation(testUser.id, location, testUser);
            }
        });

        it('should apply smoothing to location data', async () => {
            // Get original locations
            const originalLocations = await locationService.getUserLocations(
                testUser.id,
                10,
                testUser.id,
                'admin'
            );

            expect(originalLocations).toHaveLength(4);

            // Apply filtering/smoothing
            await locationService.applyLocationFiltering(testUser.id, 5);

            // Get smoothed locations
            const smoothedLocations = await locationService.getUserLocations(
                testUser.id,
                10,
                testUser.id,
                'admin'
            );

            expect(smoothedLocations).toHaveLength(4);

            // Verify that coordinates have been modified (smoothed)
            // Note: This is a basic test - in practice, you'd want more sophisticated verification
            expect(smoothedLocations[0].coordinates).toBeDefined();
        });

        it('should handle insufficient data points gracefully', async () => {
            // Create user with only one location
            const singleLocationUser = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const locationData: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'single-device'
            };

            await locationService.ingestLocation(singleLocationUser.id, locationData, singleLocationUser);

            // Should not throw error with insufficient data
            await expect(locationService.applyLocationFiltering(singleLocationUser.id, 5))
                .resolves.not.toThrow();
        });
    });

    describe('geofence detection', () => {
        beforeEach(async () => {
            // Create a test geofence rule
            await db('geofence_rules').insert({
                id: 'test-geofence-id',
                name: 'Test Pickup Zone',
                polygon: {
                    type: 'Polygon',
                    coordinates: [[
                        [120.9840, 14.5990], // Southwest corner
                        [120.9850, 14.5990], // Southeast corner
                        [120.9850, 14.6000], // Northeast corner
                        [120.9840, 14.6000], // Northwest corner
                        [120.9840, 14.5990]  // Close the polygon
                    ]]
                },
                type: 'pickup_zone',
                alert_on_entry: true,
                alert_on_exit: true,
                is_active: true
            });
        });

        it('should detect geofence entry', async () => {
            // First location outside geofence
            const outsideLocation: LocationIngestionRequest = {
                coordinates: { latitude: 14.5980, longitude: 120.9830 }, // Outside
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(Date.now() - 60000).toISOString(),
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, outsideLocation, testUser);

            // Second location inside geofence
            const insideLocation: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9845 }, // Inside
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, insideLocation, testUser);

            // Check if geofence alert was created
            const alerts = await db('geofence_alerts')
                .where('user_id', testUser.id)
                .where('event_type', 'entry');

            expect(alerts).toHaveLength(1);
            expect(alerts[0].geofence_id).toBe('test-geofence-id');
        });

        it('should detect geofence exit', async () => {
            // First location inside geofence
            const insideLocation: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9845 }, // Inside
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(Date.now() - 60000).toISOString(),
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, insideLocation, testUser);

            // Second location outside geofence
            const outsideLocation: LocationIngestionRequest = {
                coordinates: { latitude: 14.5980, longitude: 120.9830 }, // Outside
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, outsideLocation, testUser);

            // Check if geofence alert was created
            const alerts = await db('geofence_alerts')
                .where('user_id', testUser.id)
                .where('event_type', 'exit');

            expect(alerts).toHaveLength(1);
            expect(alerts[0].geofence_id).toBe('test-geofence-id');
        });
    });

    describe('anomaly detection', () => {
        it('should detect speed violations', async () => {
            // First location
            const location1: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, location1, testUser);

            // Second location very far away (impossible speed)
            const location2: LocationIngestionRequest = {
                coordinates: { latitude: 14.7000, longitude: 121.0000 }, // ~15km away
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(), // Now
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, location2, testUser);

            // Check if anomaly was detected
            const anomalies = await db('location_anomalies')
                .where('user_id', testUser.id)
                .where('anomaly_type', 'speed_violation');

            expect(anomalies.length).toBeGreaterThan(0);
            expect(anomalies[0].severity).toBe('high');
        });

        it('should detect location jumps', async () => {
            // First location
            const location1: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, location1, testUser);

            // Second location far away in short time
            const location2: LocationIngestionRequest = {
                coordinates: { latitude: 14.6100, longitude: 120.9950 }, // >1km away
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(), // Now (30 seconds later)
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, location2, testUser);

            // Check if anomaly was detected
            const anomalies = await db('location_anomalies')
                .where('user_id', testUser.id)
                .where('anomaly_type', 'location_jump');

            expect(anomalies.length).toBeGreaterThan(0);
            expect(anomalies[0].severity).toBe('medium');
        });

        it('should detect accuracy degradation', async () => {
            // First location with good accuracy
            const location1: LocationIngestionRequest = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 15, // Good accuracy
                source: 'gps',
                timestamp: new Date(Date.now() - 60000).toISOString(),
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, location1, testUser);

            // Second location with poor accuracy
            const location2: LocationIngestionRequest = {
                coordinates: { latitude: 14.5997, longitude: 120.9844 },
                accuracy: 80, // Poor accuracy (degraded from 15m)
                source: 'network',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await locationService.ingestLocation(testUser.id, location2, testUser);

            // Check if anomaly was detected
            const anomalies = await db('location_anomalies')
                .where('user_id', testUser.id)
                .where('anomaly_type', 'accuracy_degradation');

            expect(anomalies.length).toBeGreaterThan(0);
            expect(anomalies[0].severity).toBe('low');
        });
    });
});