import { Knex } from 'knex';
import { Redis } from 'ioredis';
import { LocationPoint, LocationSource } from '@/types/location';
import { logger } from '@/utils/logger';

export class LocationService {
    private db: Knex;
    private redis: Redis;

    constructor(db: Knex, redis: Redis) {
        this.db = db;
        this.redis = redis;
    }

    async storeLocationPoint(locationData: {
        userId: string;
        deviceId: string;
        coordinates: { latitude: number; longitude: number };
        accuracy: number;
        source: LocationSource;
        timestamp: Date;
        consentVersion: string;
    }): Promise<{ id: string; timestamp: Date }> {
        try {
            const retentionDate = new Date();
            retentionDate.setDate(retentionDate.getDate() + 30);

            const [locationPoint] = await this.db('location_points').insert({
                user_id: locationData.userId,
                device_id: locationData.deviceId,
                coordinates: this.db.raw('ST_Point(?, ?)', [locationData.coordinates.longitude, locationData.coordinates.latitude]),
                accuracy: locationData.accuracy,
                source: locationData.source,
                timestamp: locationData.timestamp,
                consent_version: locationData.consentVersion,
                hash_chain: 'placeholder',
                retention_date: retentionDate
            }).returning(['id', 'timestamp']);

            logger.debug('Location point stored', { id: locationPoint.id });

            return {
                id: locationPoint.id,
                timestamp: locationPoint.timestamp
            };
        } catch (error: any) {
            logger.error('Failed to store location point', { error: error.message });
            throw error;
        }
    }

    async getLocationHistory(userId: string, startTime: Date, endTime: Date): Promise<LocationPoint[]> {
        try {
            const results = await this.db('location_points')
                .where('user_id', userId)
                .whereBetween('timestamp', [startTime, endTime])
                .orderBy('timestamp', 'desc')
                .limit(1000);

            return results.map(row => ({
                id: row.id,
                userId: row.user_id,
                deviceId: row.device_id,
                coordinates: {
                    latitude: row.latitude,
                    longitude: row.longitude
                },
                accuracy: row.accuracy,
                source: row.source,
                timestamp: row.timestamp,
                consentVersion: row.consent_version
            }));
        } catch (error: any) {
            logger.error('Failed to get location history', { error: error.message });
            throw error;
        }
    }
}

export const locationService = new LocationService(
    require('@/config/database').db,
    require('@/config/redis').redisClient
);