import knex, { Knex } from 'knex';
import { loadConfig } from './config';
import { logger } from '@/utils/logger';

let db: Knex;

export async function setupDatabase(): Promise<Knex> {
    const config = loadConfig();

    const knexConfig: Knex.Config = {
        client: 'postgresql',
        connection: {
            host: config.database.host,
            port: config.database.port,
            database: config.database.database,
            user: config.database.username,
            password: config.database.password,
            ssl: config.database.ssl ? { rejectUnauthorized: false } : false
        },
        pool: {
            min: config.database.pool.min,
            max: config.database.pool.max,
            acquireTimeoutMillis: 30000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 200
        },
        migrations: {
            directory: './src/database/migrations',
            tableName: 'knex_migrations'
        },
        seeds: {
            directory: './src/database/seeds'
        }
    };

    db = knex(knexConfig);

    try {
        // Test the connection
        await db.raw('SELECT 1');
        logger.info('Database connection successful');

        // Run migrations in development
        if (config.server.environment === 'development') {
            await db.migrate.latest();
            logger.info('Database migrations completed');
        }

        return db;
    } catch (error) {
        logger.error('Database connection failed:', error);
        throw error;
    }
}

export function getDatabase(): Knex {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }
    return db;
}

export async function closeDatabase(): Promise<void> {
    if (db) {
        await db.destroy();
        logger.info('Database connection closed');
    }
}

// Export the db instance for direct access
export { db };