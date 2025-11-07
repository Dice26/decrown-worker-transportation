import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/config/database';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { logger } from '@/utils/logger';
import { AppError } from '@/middleware/errorHandler';
import {
    Device,
    DeviceStatus,
    DeviceType,
    DeviceRegistrationRequest,
    DeviceUpdateRequest,
    DeviceTrustFactors,
    DeviceSecurityEvent
} from '@/types/device';

export class DeviceService {
    private db = getDatabase();
    private redis = getRedisClient();

    // Trust level thresholds
    private readonly TRUST_THRESHOLDS = {
        LOW: 30,
        MEDIUM: 60,
        HIGH: 85
    };

    // Trust level adjustments
    private readonly TRUST_ADJUSTMENTS = {
        SUCCESSFUL_LOGIN: 2,
        FAILED_LOGIN: -5,
        LOCATION_CONSISTENCY: 1,
        LOCATION_ANOMALY: -10,
        SECURITY_INCIDENT: -20,
        INACTIVITY_PENALTY: -1
    };

    async registerDevice(userId: string, deviceData: DeviceRegistrationRequest): Promise<Device> {
        const { deviceFingerprint, deviceType, deviceName, osVersion, appVersion } = deviceData;

        // Check if device already exists for this user
        const existingDevice = await this.db('devices')
            .where({ user_id: userId, device_fingerprint: deviceFingerprint })
            .first();

        if (existingDevice) {
            // Update existing device with new information
            const [updatedDevice] = await this.db('devices')
                .where({ id: existingDevice.id })
                .update({
                    device_name: deviceName || existingDevice.device_name,
                    os_version: osVersion || existingDevice.os_version,
                    app_version: appVersion || existingDevice.app_version,
                    last_seen: new Date(),
                    updated_at: new Date()
                })
                .returning('*');

            logger.info('Device updated', {
                deviceId: updatedDevice.id,
                userId,
                deviceFingerprint: deviceFingerprint.substring(0, 8) + '...'
            });

            return this.mapDeviceFromDb(updatedDevice);
        }

        // Create new device
        const [device] = await this.db('devices').insert({
            user_id: userId,
            device_fingerprint: deviceFingerprint,
            device_type: deviceType,
            device_name: deviceName,
            os_version: osVersion,
            app_version: appVersion,
            status: 'active',
            trust_level: 50, // Initial trust level
            last_seen: new Date()
        }).returning('*');

        // Cache device for quick access
        await this.cacheDevice(device);

        logger.info('Device registered', {
            deviceId: device.id,
            userId,
            deviceType,
            deviceFingerprint: deviceFingerprint.substring(0, 8) + '...'
        });

        return this.mapDeviceFromDb(device);
    }

    async getDevicesByUser(userId: string): Promise<Device[]> {
        const devices = await this.db('devices')
            .where({ user_id: userId })
            .orderBy('last_seen', 'desc');

        return devices.map(this.mapDeviceFromDb);
    }

    async getDevice(deviceId: string): Promise<Device | null> {
        // Try cache first
        const cachedDevice = await this.redis.get(RedisKeys.device(deviceId));
        if (cachedDevice) {
            return JSON.parse(cachedDevice);
        }

        const device = await this.db('devices').where({ id: deviceId }).first();
        if (!device) {
            return null;
        }

        const mappedDevice = this.mapDeviceFromDb(device);
        await this.cacheDevice(device);

        return mappedDevice;
    }

    async updateDevice(deviceId: string, userId: string, updateData: DeviceUpdateRequest): Promise<Device> {
        // Verify device belongs to user
        const existingDevice = await this.db('devices')
            .where({ id: deviceId, user_id: userId })
            .first();

        if (!existingDevice) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        const [updatedDevice] = await this.db('devices')
            .where({ id: deviceId })
            .update({
                ...updateData,
                updated_at: new Date()
            })
            .returning('*');

        // Update cache
        await this.cacheDevice(updatedDevice);

        logger.info('Device updated', { deviceId, userId });

        return this.mapDeviceFromDb(updatedDevice);
    }

    async deactivateDevice(deviceId: string, userId: string): Promise<void> {
        const result = await this.db('devices')
            .where({ id: deviceId, user_id: userId })
            .update({
                status: 'inactive',
                updated_at: new Date()
            });

        if (result === 0) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        // Remove from cache
        await this.redis.del(RedisKeys.device(deviceId));

        logger.info('Device deactivated', { deviceId, userId });
    }

    async blockDevice(deviceId: string, reason: string): Promise<void> {
        const [device] = await this.db('devices')
            .where({ id: deviceId })
            .update({
                status: 'blocked',
                updated_at: new Date()
            })
            .returning('*');

        if (!device) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        // Log security event
        await this.logSecurityEvent({
            deviceId,
            eventType: 'security_violation',
            severity: 'high',
            description: `Device blocked: ${reason}`,
            timestamp: new Date()
        });

        // Remove from cache
        await this.redis.del(RedisKeys.device(deviceId));

        logger.warn('Device blocked', { deviceId, reason });
    }

    async updateTrustLevel(deviceId: string, adjustment: number, reason: string): Promise<number> {
        const device = await this.db('devices').where({ id: deviceId }).first();
        if (!device) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        const newTrustLevel = Math.max(0, Math.min(100, device.trust_level + adjustment));

        await this.db('devices')
            .where({ id: deviceId })
            .update({
                trust_level: newTrustLevel,
                updated_at: new Date()
            });

        // Update cache
        const updatedDevice = await this.db('devices').where({ id: deviceId }).first();
        await this.cacheDevice(updatedDevice);

        logger.info('Device trust level updated', {
            deviceId,
            oldTrustLevel: device.trust_level,
            newTrustLevel,
            adjustment,
            reason
        });

        return newTrustLevel;
    }

    async calculateTrustScore(deviceId: string, factors: DeviceTrustFactors): Promise<number> {
        const device = await this.getDevice(deviceId);
        if (!device) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        // Base trust score calculation
        let trustScore = device.trustLevel;

        // Adjust based on login frequency (more frequent = higher trust)
        if (factors.loginFrequency > 0.8) {
            trustScore += this.TRUST_ADJUSTMENTS.SUCCESSFUL_LOGIN * 2;
        } else if (factors.loginFrequency < 0.2) {
            trustScore += this.TRUST_ADJUSTMENTS.INACTIVITY_PENALTY * 5;
        }

        // Adjust based on location consistency
        if (factors.locationConsistency > 0.7) {
            trustScore += this.TRUST_ADJUSTMENTS.LOCATION_CONSISTENCY * 3;
        } else if (factors.locationConsistency < 0.3) {
            trustScore += this.TRUST_ADJUSTMENTS.LOCATION_ANOMALY;
        }

        // Adjust based on behavior patterns
        if (factors.behaviorPattern > 0.8) {
            trustScore += 5; // Consistent behavior bonus
        } else if (factors.behaviorPattern < 0.4) {
            trustScore -= 10; // Inconsistent behavior penalty
        }

        // Adjust based on security incidents
        trustScore -= factors.securityIncidents * this.TRUST_ADJUSTMENTS.SECURITY_INCIDENT;

        // Ensure trust score stays within bounds
        const finalTrustScore = Math.max(0, Math.min(100, trustScore));

        // Update the device trust level if significantly different
        if (Math.abs(finalTrustScore - device.trustLevel) > 5) {
            await this.updateTrustLevel(
                deviceId,
                finalTrustScore - device.trustLevel,
                'Automated trust calculation'
            );
        }

        return finalTrustScore;
    }

    async getTrustLevel(deviceId: string): Promise<string> {
        const device = await this.getDevice(deviceId);
        if (!device) {
            return 'unknown';
        }

        if (device.trustLevel >= this.TRUST_THRESHOLDS.HIGH) {
            return 'high';
        } else if (device.trustLevel >= this.TRUST_THRESHOLDS.MEDIUM) {
            return 'medium';
        } else if (device.trustLevel >= this.TRUST_THRESHOLDS.LOW) {
            return 'low';
        } else {
            return 'very_low';
        }
    }

    async enforceDeviceSecurity(deviceId: string, userId: string): Promise<boolean> {
        const device = await this.getDevice(deviceId);
        if (!device) {
            return false;
        }

        // Block device if trust level is too low
        if (device.trustLevel < this.TRUST_THRESHOLDS.LOW && device.status === 'active') {
            await this.blockDevice(deviceId, 'Trust level below minimum threshold');
            return false;
        }

        // Check for multiple active sessions (potential account sharing)
        const activeSessions = await this.redis.keys(`session:${userId}:*`);
        if (activeSessions.length > 3) {
            await this.logSecurityEvent({
                deviceId,
                eventType: 'multiple_sessions',
                severity: 'medium',
                description: `Multiple active sessions detected: ${activeSessions.length}`,
                timestamp: new Date()
            });

            await this.updateTrustLevel(deviceId, -5, 'Multiple active sessions');
        }

        return device.status === 'active';
    }

    async logSecurityEvent(event: DeviceSecurityEvent): Promise<void> {
        // Store security event in database
        await this.db('device_security_events').insert({
            device_id: event.deviceId,
            event_type: event.eventType,
            severity: event.severity,
            description: event.description,
            metadata: event.metadata || {},
            timestamp: event.timestamp
        });

        // Cache recent security events for quick access
        const cacheKey = `security_events:${event.deviceId}`;
        const events = await this.redis.lRange(cacheKey, 0, 9); // Get last 10 events
        events.unshift(JSON.stringify(event));

        await this.redis.lTrim(cacheKey, 0, 9); // Keep only last 10 events
        await this.redis.lPush(cacheKey, JSON.stringify(event));
        await this.redis.expire(cacheKey, 86400 * 7); // Expire after 7 days

        logger.warn('Device security event logged', {
            deviceId: event.deviceId,
            eventType: event.eventType,
            severity: event.severity
        });
    }

    private async cacheDevice(device: any): Promise<void> {
        const mappedDevice = this.mapDeviceFromDb(device);
        await this.redis.setEx(
            RedisKeys.device(device.id),
            3600, // 1 hour cache
            JSON.stringify(mappedDevice)
        );
    }

    private mapDeviceFromDb(dbDevice: any): Device {
        return {
            id: dbDevice.id,
            userId: dbDevice.user_id,
            deviceFingerprint: dbDevice.device_fingerprint,
            deviceType: dbDevice.device_type,
            deviceName: dbDevice.device_name,
            osVersion: dbDevice.os_version,
            appVersion: dbDevice.app_version,
            status: dbDevice.status,
            trustLevel: dbDevice.trust_level,
            lastSeen: dbDevice.last_seen,
            createdAt: dbDevice.created_at,
            updatedAt: dbDevice.updated_at
        };
    }
}