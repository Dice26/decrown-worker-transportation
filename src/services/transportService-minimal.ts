import { Knex } from 'knex';
import { Redis } from 'ioredis';
import { Trip, TripStatus, TripStop } from '@/types/transport';
import { logger } from '@/utils/logger';

export class TransportService {
    private db: Knex;
    private redis: Redis;

    constructor(db: Knex, redis: Redis) {
        this.db = db;
        this.redis = redis;
    }

    async createTrip(tripData: any): Promise<Trip> {
        try {
            const [trip] = await this.db('trips').insert({
                route_id: tripData.routeId,
                status: 'planned',
                planned_stops: JSON.stringify(tripData.stops || []),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                created_at: new Date(),
                scheduled_at: tripData.scheduledAt
            }).returning('*');

            return this.mapTripFromDb(trip);
        } catch (error: any) {
            logger.error('Failed to create trip', { error: error.message });
            throw error;
        }
    }

    async getTrip(tripId: string): Promise<Trip | null> {
        try {
            const trip = await this.db('trips').where('id', tripId).first();
            return trip ? this.mapTripFromDb(trip) : null;
        } catch (error: any) {
            logger.error('Failed to get trip', { error: error.message });
            throw error;
        }
    }

    private mapTripFromDb(dbTrip: any): Trip {
        return {
            id: dbTrip.id,
            routeId: dbTrip.route_id,
            driverId: dbTrip.driver_id,
            status: dbTrip.status,
            plannedStops: JSON.parse(dbTrip.planned_stops || '[]'),
            actualStops: JSON.parse(dbTrip.actual_stops || '[]'),
            metrics: JSON.parse(dbTrip.metrics || '{}'),
            createdAt: dbTrip.created_at,
            scheduledAt: dbTrip.scheduled_at,
            completedAt: dbTrip.completed_at
        };
    }
}

export const transportService = new TransportService(
    require('@/config/database').db,
    require('@/config/redis').redisClient
);