import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { loadConfig } from '@/config/config';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest } from '@/types/auth';

const config = loadConfig();
const redis = getRedisClient();

// Custom rate limit store using Redis
class RedisStore {
    private windowMs: number;

    constructor(windowMs: number) {
        this.windowMs = windowMs;
    }

    async increment(key: string): Promise<{ totalHits: number; timeToExpire?: number }> {
        const redisKey = RedisKeys.rateLimit(key);

        try {
            const current = await redis.incr(redisKey);

            if (current === 1) {
                // First request in window, set expiration
                await redis.expire(redisKey, Math.ceil(this.windowMs / 1000));
            }

            const ttl = await redis.ttl(redisKey);

            return {
                totalHits: current,
                timeToExpire: ttl > 0 ? ttl * 1000 : undefined
            };
        } catch (error) {
            logger.error('Redis rate limit error', { error: error.message, key });
            // Fallback to allowing the request if Redis fails
            return { totalHits: 1 };
        }
    }

    async decrement(key: string): Promise<void> {
        try {
            await redis.decr(RedisKeys.rateLimit(key));
        } catch (error) {
            logger.error('Redis rate limit decrement error', { error: error.message, key });
        }
    }

    async resetKey(key: string): Promise<void> {
        try {
            await redis.del(RedisKeys.rateLimit(key));
        } catch (error) {
            logger.error('Redis rate limit reset error', { error: error.message, key });
        }
    }
}

// Key generator function
function generateKey(req: Request): string {
    const authReq = req as AuthenticatedRequest;

    // Use user ID if authenticated, otherwise use IP
    if (authReq.user) {
        return `user:${authReq.user.id}`;
    }

    return `ip:${req.ip}`;
}

// Default rate limiter
export const defaultRateLimit = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            retryable: true
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: generateKey,
    store: new RedisStore(config.rateLimit.windowMs),
    onLimitReached: (req: Request) => {
        logger.warn('Rate limit exceeded', {
            key: generateKey(req),
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            correlationId: req.headers['x-correlation-id']
        });
    }
});

// Strict rate limiter for sensitive endpoints
export const strictRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many attempts, please try again later',
            retryable: true
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: generateKey,
    store: new RedisStore(15 * 60 * 1000),
    onLimitReached: (req: Request) => {
        logger.warn('Strict rate limit exceeded', {
            key: generateKey(req),
            ip: req.ip,
            endpoint: req.path,
            correlationId: req.headers['x-correlation-id']
        });
    }
});

// Auth-specific rate limiter
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per window
    message: {
        error: {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts, please try again later',
            retryable: true
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Use email from request body if available, otherwise IP
        const email = req.body?.email;
        return email ? `auth:email:${email}` : `auth:ip:${req.ip}`;
    },
    store: new RedisStore(15 * 60 * 1000),
    onLimitReached: (req: Request) => {
        logger.warn('Auth rate limit exceeded', {
            email: req.body?.email,
            ip: req.ip,
            correlationId: req.headers['x-correlation-id']
        });
    }
});

// Location update rate limiter (higher limit for real-time updates)
export const locationRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 location updates per minute (2 per second)
    message: {
        error: {
            code: 'LOCATION_RATE_LIMIT_EXCEEDED',
            message: 'Too many location updates, please slow down',
            retryable: true
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const authReq = req as AuthenticatedRequest;
        return `location:user:${authReq.user?.id || req.ip}`;
    },
    store: new RedisStore(60 * 1000),
    skip: (req: Request) => {
        // Skip rate limiting for high-trust devices
        // This would be implemented based on device trust level
        return false;
    }
});