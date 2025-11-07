import { beforeAll, afterAll, beforeEach } from 'vitest';
import dotenv from 'dotenv';
import { setupDatabase, closeDatabase } from '@/config/database';
import { setupRedis, closeRedis } from '@/config/redis';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

let dbSetup = false;
let redisSetup = false;

beforeAll(async () => {
    try {
        // Setup test database
        await setupDatabase();
        dbSetup = true;

        // Setup test Redis
        await setupRedis();
        redisSetup = true;

        console.log('Test environment setup complete');
    } catch (error) {
        console.error('Test setup failed:', error);
        throw error;
    }
});

afterAll(async () => {
    try {
        if (dbSetup) {
            await closeDatabase();
        }
        if (redisSetup) {
            await closeRedis();
        }
        console.log('Test environment cleanup complete');
    } catch (error) {
        console.error('Test cleanup failed:', error);
    }
});

beforeEach(async () => {
    // Clean up test data before each test
    if (dbSetup) {
        const { getDatabase } = await import('@/config/database');
        const db = getDatabase();

        // Clear test data in reverse order of dependencies
        await db('audit_events').del();
        await db('webhook_events').del();
        await db('dunning_notices').del();
        await db('ledger_adjustments').del();
        await db('payment_attempts').del();
        await db('usage_ledgers').del();
        await db('invoices').del();
        await db('trip_stops').del();
        await db('trips').del();
        await db('routes').del();
        await db('location_points').del();
        await db('devices').del();
        await db('users').del();
    }

    if (redisSetup) {
        const { getRedisClient } = await import('@/config/redis');
        const redis = getRedisClient();
        await redis.flushDb();
    }
});