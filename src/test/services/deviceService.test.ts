import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceService } from '@/services/deviceService';
import { TestDataFactory } from '@/test/helpers/testData';
import { AppError } from '@/middleware/errorHandler';
import { getDatabase } from '@/config/database';
import { getRedisClient } from '@/config/redis';

describe('DeviceService', () => {
    let deviceService: DeviceService;
    let db: any;
    let redis: any;
    let testUser: any;

    beforeEach(async () => {
        deviceService = new DeviceService();
        db = getDatabase();
        redis = getRedisClient();

        // Create a test user for device operations
        testUser = await TestDataFactory.createUser();
    });

    describe('registerDevice', () => {
        it('should register a new device', async () => {
            const deviceData = {
                deviceFingerprint: 'test-fingerprint-123',
                deviceType: 'mobile' as const,
                deviceName: 'iPhone 15',
                osVersion: 'iOS 17.0',
                appVersion: '1.0.0'
            };

            const device = await deviceService.registerDevice(testUser.id, deviceData);

            expect(device).toBeDefined();
            expect(device.userId).toBe(testUser.id);
            expect(device.deviceFingerprint).toBe(deviceData.deviceFingerprint);
            expect(device.deviceType).toBe(deviceData.deviceType);
            expect(device.deviceName).toBe(deviceData.deviceName);
            expect(device.status).toBe('active');
            expect(device.trustLevel).toBe(50); // Initial trust level
        });

        it('should update existing device when registering with same fingerprint', async () => {
            const deviceFingerprint = 'test-fingerprint-123';

            // Create initial device
            await TestDataFactory.createDevice(testUser.id, {
                device_fingerprint: deviceFingerprint,
                device_name: 'Old Device Name'
            });

            const deviceData = {
                deviceFingerprint,
                deviceType: 'mobile' as const,
                deviceName: 'Updated Device Name',
                osVersion: 'iOS 17.1',
                appVersion: '1.1.0'
            };

            const device = await deviceService.registerDevice(testUser.id, deviceData);

            expect(device.deviceName).toBe('Updated Device Name');
            expect(device.osVersion).toBe('iOS 17.1');
            expect(device.appVersion).toBe('1.1.0');
        });

        it('should cache device after registration', async () => {
            const deviceData = {
                deviceFingerprint: 'test-fingerprint-123',
                deviceType: 'mobile' as const
            };

            const device = await deviceService.registerDevice(testUser.id, deviceData);

            // Verify cache exists
            const cachedData = await redis.get(`cache:device:${device.id}`);
            expect(cachedData).toBeDefined();

            const cachedDevice = JSON.parse(cachedData);
            expect(cachedDevice.id).toBe(device.id);
        });
    });

    describe('getDevicesByUser', () => {
        it('should return all devices for a user', async () => {
            // Create multiple devices for user
            await TestDataFactory.createDevice(testUser.id, { device_fingerprint: 'device-1' });
            await TestDataFactory.createDevice(testUser.id, { device_fingerprint: 'device-2' });

            // Create device for different user
            const otherUser = await TestDataFactory.createUser();
            await TestDataFactory.createDevice(otherUser.id, { device_fingerprint: 'device-3' });

            const devices = await deviceService.getDevicesByUser(testUser.id);

            expect(devices).toHaveLength(2);
            expect(devices.every(d => d.userId === testUser.id)).toBe(true);
        });

        it('should return empty array for user with no devices', async () => {
            const devices = await deviceService.getDevicesByUser(testUser.id);
            expect(devices).toHaveLength(0);
        });
    });

    describe('getDevice', () => {
        it('should return device by ID', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            const device = await deviceService.getDevice(dbDevice.id);

            expect(device).toBeDefined();
            expect(device!.id).toBe(dbDevice.id);
            expect(device!.userId).toBe(testUser.id);
        });

        it('should return null for non-existent device', async () => {
            const device = await deviceService.getDevice('non-existent-id');
            expect(device).toBeNull();
        });

        it('should use cache when available', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            // First call should cache the device
            const device1 = await deviceService.getDevice(dbDevice.id);

            // Second call should use cache
            const device2 = await deviceService.getDevice(dbDevice.id);

            expect(device1).toEqual(device2);
        });
    });

    describe('updateDevice', () => {
        it('should update device information', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            const updateData = {
                deviceName: 'Updated Device Name',
                osVersion: 'iOS 17.1',
                status: 'inactive' as const
            };

            const updatedDevice = await deviceService.updateDevice(dbDevice.id, testUser.id, updateData);

            expect(updatedDevice.deviceName).toBe(updateData.deviceName);
            expect(updatedDevice.osVersion).toBe(updateData.osVersion);
            expect(updatedDevice.status).toBe(updateData.status);
        });

        it('should throw error if device does not belong to user', async () => {
            const otherUser = await TestDataFactory.createUser();
            const dbDevice = await TestDataFactory.createDevice(otherUser.id);

            await expect(deviceService.updateDevice(dbDevice.id, testUser.id, {
                deviceName: 'Hacked Device'
            })).rejects.toThrow(AppError);
        });

        it('should throw error for non-existent device', async () => {
            await expect(deviceService.updateDevice('non-existent-id', testUser.id, {
                deviceName: 'Test'
            })).rejects.toThrow(AppError);
        });
    });

    describe('deactivateDevice', () => {
        it('should deactivate device', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            await deviceService.deactivateDevice(dbDevice.id, testUser.id);

            const updatedDevice = await db('devices').where({ id: dbDevice.id }).first();
            expect(updatedDevice.status).toBe('inactive');
        });

        it('should throw error if device does not belong to user', async () => {
            const otherUser = await TestDataFactory.createUser();
            const dbDevice = await TestDataFactory.createDevice(otherUser.id);

            await expect(deviceService.deactivateDevice(dbDevice.id, testUser.id))
                .rejects.toThrow(AppError);
        });

        it('should remove device from cache', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            // Cache the device first
            await deviceService.getDevice(dbDevice.id);

            await deviceService.deactivateDevice(dbDevice.id, testUser.id);

            // Verify cache is cleared
            const cachedData = await redis.get(`cache:device:${dbDevice.id}`);
            expect(cachedData).toBeNull();
        });
    });

    describe('blockDevice', () => {
        it('should block device with reason', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);
            const reason = 'Suspicious activity detected';

            await deviceService.blockDevice(dbDevice.id, reason);

            const updatedDevice = await db('devices').where({ id: dbDevice.id }).first();
            expect(updatedDevice.status).toBe('blocked');
        });

        it('should log security event when blocking device', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);
            const reason = 'Security violation';

            await deviceService.blockDevice(dbDevice.id, reason);

            // Check if security event was logged
            const securityEvent = await db('device_security_events')
                .where({ device_id: dbDevice.id })
                .first();

            expect(securityEvent).toBeDefined();
            expect(securityEvent.event_type).toBe('security_violation');
            expect(securityEvent.severity).toBe('high');
        });

        it('should throw error for non-existent device', async () => {
            await expect(deviceService.blockDevice('non-existent-id', 'Test reason'))
                .rejects.toThrow(AppError);
        });
    });

    describe('updateTrustLevel', () => {
        it('should update device trust level', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 50 });

            const newTrustLevel = await deviceService.updateTrustLevel(dbDevice.id, 10, 'Successful login');

            expect(newTrustLevel).toBe(60);

            const updatedDevice = await db('devices').where({ id: dbDevice.id }).first();
            expect(updatedDevice.trust_level).toBe(60);
        });

        it('should cap trust level at 100', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 95 });

            const newTrustLevel = await deviceService.updateTrustLevel(dbDevice.id, 20, 'Bonus points');

            expect(newTrustLevel).toBe(100);
        });

        it('should cap trust level at 0', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 10 });

            const newTrustLevel = await deviceService.updateTrustLevel(dbDevice.id, -20, 'Security incident');

            expect(newTrustLevel).toBe(0);
        });

        it('should throw error for non-existent device', async () => {
            await expect(deviceService.updateTrustLevel('non-existent-id', 10, 'Test'))
                .rejects.toThrow(AppError);
        });
    });

    describe('getTrustLevel', () => {
        it('should return high trust level', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 90 });

            const trustLevel = await deviceService.getTrustLevel(dbDevice.id);
            expect(trustLevel).toBe('high');
        });

        it('should return medium trust level', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 70 });

            const trustLevel = await deviceService.getTrustLevel(dbDevice.id);
            expect(trustLevel).toBe('medium');
        });

        it('should return low trust level', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 40 });

            const trustLevel = await deviceService.getTrustLevel(dbDevice.id);
            expect(trustLevel).toBe('low');
        });

        it('should return very_low trust level', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 20 });

            const trustLevel = await deviceService.getTrustLevel(dbDevice.id);
            expect(trustLevel).toBe('very_low');
        });

        it('should return unknown for non-existent device', async () => {
            const trustLevel = await deviceService.getTrustLevel('non-existent-id');
            expect(trustLevel).toBe('unknown');
        });
    });

    describe('calculateTrustScore', () => {
        it('should calculate trust score based on factors', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 50 });

            const factors = {
                loginFrequency: 0.9, // High login frequency
                locationConsistency: 0.8, // Good location consistency
                behaviorPattern: 0.9, // Consistent behavior
                securityIncidents: 0 // No security incidents
            };

            const trustScore = await deviceService.calculateTrustScore(dbDevice.id, factors);

            expect(trustScore).toBeGreaterThan(50); // Should increase from base
            expect(trustScore).toBeLessThanOrEqual(100);
        });

        it('should decrease trust score for poor factors', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, { trust_level: 50 });

            const factors = {
                loginFrequency: 0.1, // Low login frequency
                locationConsistency: 0.2, // Poor location consistency
                behaviorPattern: 0.3, // Inconsistent behavior
                securityIncidents: 2 // Multiple security incidents
            };

            const trustScore = await deviceService.calculateTrustScore(dbDevice.id, factors);

            expect(trustScore).toBeLessThan(50); // Should decrease from base
            expect(trustScore).toBeGreaterThanOrEqual(0);
        });

        it('should throw error for non-existent device', async () => {
            const factors = {
                loginFrequency: 0.5,
                locationConsistency: 0.5,
                behaviorPattern: 0.5,
                securityIncidents: 0
            };

            await expect(deviceService.calculateTrustScore('non-existent-id', factors))
                .rejects.toThrow(AppError);
        });
    });

    describe('enforceDeviceSecurity', () => {
        it('should return true for trusted active device', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, {
                trust_level: 80,
                status: 'active'
            });

            const isSecure = await deviceService.enforceDeviceSecurity(dbDevice.id, testUser.id);
            expect(isSecure).toBe(true);
        });

        it('should block device with very low trust level', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id, {
                trust_level: 20,
                status: 'active'
            });

            const isSecure = await deviceService.enforceDeviceSecurity(dbDevice.id, testUser.id);
            expect(isSecure).toBe(false);

            // Verify device was blocked
            const updatedDevice = await db('devices').where({ id: dbDevice.id }).first();
            expect(updatedDevice.status).toBe('blocked');
        });

        it('should return false for non-existent device', async () => {
            const isSecure = await deviceService.enforceDeviceSecurity('non-existent-id', testUser.id);
            expect(isSecure).toBe(false);
        });
    });

    describe('logSecurityEvent', () => {
        it('should log security event to database', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            const securityEvent = {
                deviceId: dbDevice.id,
                eventType: 'suspicious_login' as const,
                severity: 'medium' as const,
                description: 'Login from unusual location',
                metadata: { location: 'Unknown City' },
                timestamp: new Date()
            };

            await deviceService.logSecurityEvent(securityEvent);

            const loggedEvent = await db('device_security_events')
                .where({ device_id: dbDevice.id })
                .first();

            expect(loggedEvent).toBeDefined();
            expect(loggedEvent.event_type).toBe(securityEvent.eventType);
            expect(loggedEvent.severity).toBe(securityEvent.severity);
            expect(loggedEvent.description).toBe(securityEvent.description);
        });

        it('should cache recent security events', async () => {
            const dbDevice = await TestDataFactory.createDevice(testUser.id);

            const securityEvent = {
                deviceId: dbDevice.id,
                eventType: 'location_anomaly' as const,
                severity: 'high' as const,
                description: 'Unusual location detected',
                timestamp: new Date()
            };

            await deviceService.logSecurityEvent(securityEvent);

            // Verify event is cached
            const cachedEvents = await redis.lRange(`security_events:${dbDevice.id}`, 0, -1);
            expect(cachedEvents).toHaveLength(1);

            const cachedEvent = JSON.parse(cachedEvents[0]);
            expect(cachedEvent.eventType).toBe(securityEvent.eventType);
        });
    });
});