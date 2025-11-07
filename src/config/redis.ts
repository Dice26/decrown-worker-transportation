import { createClient, RedisClientType } from 'redis';
import { loadConfig } from './config';
import { logger } from '@/utils/logger';

let redisClient: RedisClientType;

export async function setupRedis(): Promise<RedisClientType> {
    const config = loadConfig();

    const redisUrl = process.env.REDIS_URL ||
        `redis://${config.redis.password ? `:${config.redis.password}@` : ''}${config.redis.host}:${config.redis.port}/${config.redis.db}`;

    redisClient = createClient({
        url: redisUrl,
        socket: {
            connectTimeout: 10000,
            lazyConnect: true,
            reconnectStrategy: (retries) => {
                if (retries > 10) {
                    logger.error('Redis connection failed after 10 retries');
                    return new Error('Redis connection failed');
                }
                return Math.min(retries * 50, 1000);
            }
        }
    });

    redisClient.on('error', (error) => {
        logger.error('Redis client error:', error);
    });

    redisClient.on('connect', () => {
        logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
        logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
        logger.info('Redis client disconnected');
    });

    try {
        await redisClient.connect();

        // Test the connection
        await redisClient.ping();
        logger.info('Redis connection successful');

        return redisClient;
    } catch (error) {
        logger.error('Redis connection failed:', error);
        throw error;
    }
}

export function getRedisClient(): RedisClientType {
    if (!redisClient) {
        throw new Error('Redis not initialized. Call setupRedis() first.');
    }
    return redisClient;
}

export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        logger.info('Redis connection closed');
    }
}

// Export the client instance for direct access
export { redisClient };

// Redis key patterns for different data types
export const RedisKeys = {
    // Session management
    session: (sessionId: string) => `session:${sessionId}`,
    refreshToken: (tokenId: string) => `refresh_token:${tokenId}`,

    // Rate limiting
    rateLimit: (identifier: string) => `rate_limit:${identifier}`,

    // Location data caching
    userLocation: (userId: string) => `location:user:${userId}`,
    driverLocation: (driverId: string) => `location:driver:${driverId}`,

    // Real-time subscriptions
    locationUpdates: (userId: string) => `location_updates:${userId}`,
    tripUpdates: (tripId: string) => `trip_updates:${tripId}`,

    // Queue management
    locationQueue: 'queue:location_processing',
    paymentQueue: 'queue:payment_processing',
    notificationQueue: 'queue:notifications',

    // Caching
    userCache: (userId: string) => `cache:user:${userId}`,
    device: (deviceId: string) => `cache:device:${deviceId}`,
    tripCache: (tripId: string) => `cache:trip:${tripId}`,
    routeCache: (routeId: string) => `cache:route:${routeId}`,

    // Feature flags
    featureFlag: (flagName: string) => `feature_flag:${flagName}`,

    // Circuit breaker
    circuitBreaker: (service: string) => `circuit_breaker:${service}`,

    // Mobile and push notifications
    pushToken: (deviceId: string) => `push_token:${deviceId}`,
    notificationQueue: () => 'queue:push_notifications',
    scheduledNotifications: () => 'scheduled_notifications',

    // Offline sync
    syncQueue: (deviceId: string) => `sync_queue:${deviceId}`,
    lastSync: (deviceId: string) => `last_sync:${deviceId}`,

    // Temporary data
    passwordReset: (token: string) => `password_reset:${token}`,
    emailVerification: (token: string) => `email_verification:${token}`
};