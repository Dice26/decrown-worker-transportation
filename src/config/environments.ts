import { readFileSync } from 'fs';
import { join } from 'path';
import * as toml from 'toml';

export interface EnvironmentConfig {
    environment: string;
    server: {
        port: number;
        host: string;
        cors: {
            origin: string[];
            credentials: boolean;
        };
    };
    database: {
        host: string;
        port: number;
        name: string;
        user: string;
        password: string;
        ssl: boolean;
        pool: {
            min: number;
            max: number;
        };
    };
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    auth: {
        jwtSecret: string;
        jwtExpiration: string;
        refreshTokenExpiration: string;
        bcryptRounds: number;
    };
    payment: {
        provider: 'stripe' | 'paymongo';
        secretKey: string;
        webhookSecret: string;
        dryRun: boolean;
    };
    features: {
        locationTracking: boolean;
        realTimeUpdates: boolean;
        paymentProcessing: boolean;
        auditLogging: boolean;
        performanceMonitoring: boolean;
    };
    monitoring: {
        metricsEnabled: boolean;
        healthCheckInterval: number;
        alerting: {
            enabled: boolean;
            webhookUrl?: string;
        };
    };
    logging: {
        level: 'error' | 'warn' | 'info' | 'debug';
        format: 'json' | 'simple';
        file: {
            enabled: boolean;
            path: string;
            maxSize: string;
            maxFiles: number;
        };
    };
}

class EnvironmentManager {
    private config: EnvironmentConfig;
    private featureFlags: Map<string, boolean> = new Map();

    constructor() {
        this.config = this.loadConfiguration();
        this.initializeFeatureFlags();
    }

    private loadConfiguration(): EnvironmentConfig {
        const env = process.env.NODE_ENV || 'development';

        // Load base configuration from TOML file
        let baseConfig: Partial<EnvironmentConfig> = {};
        try {
            const configPath = join(process.cwd(), 'config.toml');
            const configContent = readFileSync(configPath, 'utf-8');
            baseConfig = toml.parse(configContent);
        } catch (error) {
            console.warn('Could not load config.toml, using environment variables only');
        }

        // Override with environment-specific values
        const config: EnvironmentConfig = {
            environment: env,
            server: {
                port: parseInt(process.env.PORT || '3000'),
                host: process.env.HOST || '0.0.0.0',
                cors: {
                    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
                    credentials: process.env.CORS_CREDENTIALS === 'true'
                }
            },
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                name: process.env.DB_NAME || 'decrown_transport',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'password',
                ssl: process.env.DB_SSL === 'true',
                pool: {
                    min: parseInt(process.env.DB_POOL_MIN || '2'),
                    max: parseInt(process.env.DB_POOL_MAX || '10')
                }
            },
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '0')
            },
            auth: {
                jwtSecret: process.env.JWT_SECRET || 'default-secret-key',
                jwtExpiration: process.env.JWT_EXPIRATION || '15m',
                refreshTokenExpiration: process.env.REFRESH_TOKEN_EXPIRATION || '7d',
                bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12')
            },
            payment: {
                provider: (process.env.PAYMENT_PROVIDER as 'stripe' | 'paymongo') || 'stripe',
                secretKey: process.env.STRIPE_SECRET_KEY || process.env.PAYMONGO_SECRET_KEY || '',
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || process.env.PAYMONGO_WEBHOOK_SECRET || '',
                dryRun: process.env.PAYMENT_DRY_RUN === 'true' || env === 'development'
            },
            features: {
                locationTracking: process.env.FEATURE_LOCATION_TRACKING !== 'false',
                realTimeUpdates: process.env.FEATURE_REAL_TIME_UPDATES !== 'false',
                paymentProcessing: process.env.FEATURE_PAYMENT_PROCESSING !== 'false',
                auditLogging: process.env.FEATURE_AUDIT_LOGGING !== 'false',
                performanceMonitoring: process.env.FEATURE_PERFORMANCE_MONITORING !== 'false'
            },
            monitoring: {
                metricsEnabled: process.env.METRICS_ENABLED !== 'false',
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
                alerting: {
                    enabled: process.env.ALERTING_ENABLED === 'true',
                    webhookUrl: process.env.ALERTING_WEBHOOK_URL
                }
            },
            logging: {
                level: (process.env.LOG_LEVEL as any) || (env === 'production' ? 'info' : 'debug'),
                format: (process.env.LOG_FORMAT as any) || (env === 'production' ? 'json' : 'simple'),
                file: {
                    enabled: process.env.LOG_FILE_ENABLED === 'true',
                    path: process.env.LOG_FILE_PATH || './logs/app.log',
                    maxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
                    maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5')
                }
            },
            ...baseConfig
        };

        return config;
    }

    private initializeFeatureFlags(): void {
        // Initialize feature flags from configuration
        Object.entries(this.config.features).forEach(([key, value]) => {
            this.featureFlags.set(key, value);
        });

        // Load additional feature flags from environment variables
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('FEATURE_FLAG_')) {
                const flagName = key.replace('FEATURE_FLAG_', '').toLowerCase();
                const flagValue = process.env[key] === 'true';
                this.featureFlags.set(flagName, flagValue);
            }
        });
    }

    getConfig(): EnvironmentConfig {
        return this.config;
    }

    isFeatureEnabled(featureName: string): boolean {
        return this.featureFlags.get(featureName) || false;
    }

    setFeatureFlag(featureName: string, enabled: boolean): void {
        this.featureFlags.set(featureName, enabled);
    }

    getAllFeatureFlags(): Record<string, boolean> {
        return Object.fromEntries(this.featureFlags);
    }

    isDevelopment(): boolean {
        return this.config.environment === 'development';
    }

    isProduction(): boolean {
        return this.config.environment === 'production';
    }

    isTest(): boolean {
        return this.config.environment === 'test';
    }
}

export const environmentManager = new EnvironmentManager();
export default environmentManager;