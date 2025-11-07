import * as fs from 'fs';
import * as path from 'path';
import * as toml from 'toml';
import { logger } from '@/utils/logger';

export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    pool: {
        min: number;
        max: number;
    };
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
}

export interface JWTConfig {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
    refreshExpiresIn: string;
}

export interface ServerConfig {
    port: number;
    environment: string;
    apiVersion: string;
}

export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

export interface AppConfig {
    database: DatabaseConfig;
    redis: RedisConfig;
    jwt: JWTConfig;
    server: ServerConfig;
    rateLimit: RateLimitConfig;
    cors: {
        allowedOrigins: string[];
    };
    encryption: {
        kmsKeyId: string;
        encryptionKey: string;
    };
    logging: {
        level: string;
        file: string;
    };
}

export function loadConfig(): AppConfig {
    // Try to load TOML config file first
    const configPath = path.join(process.cwd(), 'config.toml');
    let tomlConfig = {};

    if (fs.existsSync(configPath)) {
        try {
            const tomlContent = fs.readFileSync(configPath, 'utf-8');
            tomlConfig = toml.parse(tomlContent);
            logger.info('Loaded configuration from config.toml');
        } catch (error) {
            logger.warn('Failed to parse config.toml, falling back to environment variables');
        }
    }

    // Merge TOML config with environment variables (env vars take precedence)
    const config: AppConfig = {
        database: {
            host: process.env.DATABASE_HOST || tomlConfig.database?.host || 'localhost',
            port: parseInt(process.env.DATABASE_PORT || tomlConfig.database?.port || '5432'),
            database: process.env.DATABASE_NAME || tomlConfig.database?.database || 'decrown_transport',
            username: process.env.DATABASE_USER || tomlConfig.database?.username || 'postgres',
            password: process.env.DATABASE_PASSWORD || tomlConfig.database?.password || '',
            ssl: process.env.NODE_ENV === 'production',
            pool: {
                min: parseInt(process.env.DATABASE_POOL_MIN || tomlConfig.database?.pool?.min || '2'),
                max: parseInt(process.env.DATABASE_POOL_MAX || tomlConfig.database?.pool?.max || '10')
            }
        },
        redis: {
            host: process.env.REDIS_HOST || tomlConfig.redis?.host || 'localhost',
            port: parseInt(process.env.REDIS_PORT || tomlConfig.redis?.port || '6379'),
            password: process.env.REDIS_PASSWORD || tomlConfig.redis?.password,
            db: parseInt(process.env.REDIS_DB || tomlConfig.redis?.db || '0')
        },
        jwt: {
            secret: process.env.JWT_SECRET || tomlConfig.jwt?.secret || 'default-secret-change-in-production',
            refreshSecret: process.env.JWT_REFRESH_SECRET || tomlConfig.jwt?.refreshSecret || 'default-refresh-secret',
            expiresIn: process.env.JWT_EXPIRES_IN || tomlConfig.jwt?.expiresIn || '15m',
            refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || tomlConfig.jwt?.refreshExpiresIn || '7d'
        },
        server: {
            port: parseInt(process.env.PORT || tomlConfig.server?.port || '3000'),
            environment: process.env.NODE_ENV || tomlConfig.server?.environment || 'development',
            apiVersion: process.env.API_VERSION || tomlConfig.server?.apiVersion || 'v1'
        },
        rateLimit: {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || tomlConfig.rateLimit?.windowMs || '900000'),
            maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || tomlConfig.rateLimit?.maxRequests || '100')
        },
        cors: {
            allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || tomlConfig.cors?.allowedOrigins || ['http://localhost:3000']
        },
        encryption: {
            kmsKeyId: process.env.KMS_KEY_ID || tomlConfig.encryption?.kmsKeyId || '',
            encryptionKey: process.env.ENCRYPTION_KEY || tomlConfig.encryption?.encryptionKey || ''
        },
        logging: {
            level: process.env.LOG_LEVEL || tomlConfig.logging?.level || 'info',
            file: process.env.LOG_FILE || tomlConfig.logging?.file || 'logs/app.log'
        }
    };

    return config;
}