import { Redis } from 'ioredis';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';
import { environmentManager } from '@/config/environments';

export interface FeatureFlag {
    name: string;
    enabled: boolean;
    description: string;
    rolloutPercentage: number;
    userSegments: string[];
    startDate?: Date;
    endDate?: Date;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export interface FeatureFlagContext {
    userId?: string;
    userRole?: string;
    department?: string;
    deviceType?: string;
    version?: string;
    ipAddress?: string;
}

class FeatureFlagService {
    private redis: Redis;
    private cache: Map<string, FeatureFlag> = new Map();
    private cacheExpiry: number = 300000; // 5 minutes
    private lastCacheUpdate: number = 0;

    constructor() {
        this.redis = redisClient;
        this.loadFeatureFlags();
    }

    /**
     * Check if a feature is enabled for a given context
     */
    async isEnabled(flagName: string, context: FeatureFlagContext = {}): Promise<boolean> {
        try {
            // Check environment-level feature flags first
            if (environmentManager.isFeatureEnabled(flagName)) {
                return true;
            }

            const flag = await this.getFeatureFlag(flagName);
            if (!flag) {
                logger.debug(`Feature flag '${flagName}' not found, defaulting to false`);
                return false;
            }

            // Check if flag is globally disabled
            if (!flag.enabled) {
                return false;
            }

            // Check date range
            const now = new Date();
            if (flag.startDate && now < flag.startDate) {
                return false;
            }
            if (flag.endDate && now > flag.endDate) {
                return false;
            }

            // Check user segments
            if (flag.userSegments.length > 0 && context.userRole) {
                if (!flag.userSegments.includes(context.userRole)) {
                    return false;
                }
            }

            // Check rollout percentage
            if (flag.rolloutPercentage < 100) {
                const hash = this.hashContext(flagName, context);
                const percentage = hash % 100;
                if (percentage >= flag.rolloutPercentage) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            logger.error('Error checking feature flag', { flagName, error });
            return false;
        }
    }

    /**
     * Get a feature flag by name
     */
    async getFeatureFlag(flagName: string): Promise<FeatureFlag | null> {
        try {
            // Check cache first
            if (this.shouldUseCache()) {
                const cached = this.cache.get(flagName);
                if (cached) {
                    return cached;
                }
            }

            // Load from Redis
            const flagData = await this.redis.hget('feature_flags', flagName);
            if (!flagData) {
                return null;
            }

            const flag: FeatureFlag = JSON.parse(flagData);

            // Parse dates
            if (flag.startDate) {
                flag.startDate = new Date(flag.startDate);
            }
            if (flag.endDate) {
                flag.endDate = new Date(flag.endDate);
            }
            flag.createdAt = new Date(flag.createdAt);
            flag.updatedAt = new Date(flag.updatedAt);

            // Update cache
            this.cache.set(flagName, flag);

            return flag;
        } catch (error) {
            logger.error('Error getting feature flag', { flagName, error });
            return null;
        }
    }

    /**
     * Create or update a feature flag
     */
    async setFeatureFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): Promise<void> {
        try {
            const now = new Date();
            const existingFlag = await this.getFeatureFlag(flag.name);

            const fullFlag: FeatureFlag = {
                ...flag,
                createdAt: existingFlag?.createdAt || now,
                updatedAt: now
            };

            await this.redis.hset('feature_flags', flag.name, JSON.stringify(fullFlag));

            // Update cache
            this.cache.set(flag.name, fullFlag);

            // Publish update event
            await this.redis.publish('feature_flag_updates', JSON.stringify({
                action: 'update',
                flagName: flag.name,
                flag: fullFlag
            }));

            logger.info('Feature flag updated', { flagName: flag.name });
        } catch (error) {
            logger.error('Error setting feature flag', { flagName: flag.name, error });
            throw error;
        }
    }

    /**
     * Delete a feature flag
     */
    async deleteFeatureFlag(flagName: string): Promise<void> {
        try {
            await this.redis.hdel('feature_flags', flagName);
            this.cache.delete(flagName);

            // Publish delete event
            await this.redis.publish('feature_flag_updates', JSON.stringify({
                action: 'delete',
                flagName
            }));

            logger.info('Feature flag deleted', { flagName });
        } catch (error) {
            logger.error('Error deleting feature flag', { flagName, error });
            throw error;
        }
    }

    /**
     * Get all feature flags
     */
    async getAllFeatureFlags(): Promise<FeatureFlag[]> {
        try {
            const flags = await this.redis.hgetall('feature_flags');
            return Object.values(flags).map(flagData => {
                const flag: FeatureFlag = JSON.parse(flagData);
                if (flag.startDate) flag.startDate = new Date(flag.startDate);
                if (flag.endDate) flag.endDate = new Date(flag.endDate);
                flag.createdAt = new Date(flag.createdAt);
                flag.updatedAt = new Date(flag.updatedAt);
                return flag;
            });
        } catch (error) {
            logger.error('Error getting all feature flags', { error });
            return [];
        }
    }

    /**
     * Get feature flags for a specific context
     */
    async getEnabledFeatures(context: FeatureFlagContext = {}): Promise<string[]> {
        try {
            const allFlags = await this.getAllFeatureFlags();
            const enabledFeatures: string[] = [];

            for (const flag of allFlags) {
                if (await this.isEnabled(flag.name, context)) {
                    enabledFeatures.push(flag.name);
                }
            }

            return enabledFeatures;
        } catch (error) {
            logger.error('Error getting enabled features', { error });
            return [];
        }
    }

    /**
     * Initialize default feature flags
     */
    async initializeDefaultFlags(): Promise<void> {
        const defaultFlags: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>[] = [
            {
                name: 'location_tracking',
                enabled: true,
                description: 'Enable real-time location tracking for workers',
                rolloutPercentage: 100,
                userSegments: ['worker', 'driver', 'dispatcher'],
                metadata: { version: '1.0' }
            },
            {
                name: 'payment_processing',
                enabled: !environmentManager.isDevelopment(),
                description: 'Enable automated payment processing',
                rolloutPercentage: environmentManager.isProduction() ? 100 : 0,
                userSegments: ['finance', 'admin'],
                metadata: { version: '1.0' }
            },
            {
                name: 'route_optimization_v2',
                enabled: false,
                description: 'Enable new route optimization algorithm',
                rolloutPercentage: 10,
                userSegments: ['dispatcher'],
                metadata: { version: '2.0', algorithm: 'genetic' }
            },
            {
                name: 'mobile_push_notifications',
                enabled: true,
                description: 'Enable push notifications for mobile apps',
                rolloutPercentage: 100,
                userSegments: ['worker', 'driver'],
                metadata: { version: '1.0' }
            },
            {
                name: 'audit_detailed_logging',
                enabled: environmentManager.isProduction(),
                description: 'Enable detailed audit logging',
                rolloutPercentage: 100,
                userSegments: [],
                metadata: { version: '1.0' }
            }
        ];

        for (const flag of defaultFlags) {
            const existing = await this.getFeatureFlag(flag.name);
            if (!existing) {
                await this.setFeatureFlag(flag);
            }
        }
    }

    /**
     * Load feature flags into cache
     */
    private async loadFeatureFlags(): Promise<void> {
        try {
            const flags = await this.getAllFeatureFlags();
            this.cache.clear();
            flags.forEach(flag => {
                this.cache.set(flag.name, flag);
            });
            this.lastCacheUpdate = Date.now();
            logger.debug(`Loaded ${flags.length} feature flags into cache`);
        } catch (error) {
            logger.error('Error loading feature flags', { error });
        }
    }

    /**
     * Check if cache should be used
     */
    private shouldUseCache(): boolean {
        return Date.now() - this.lastCacheUpdate < this.cacheExpiry;
    }

    /**
     * Hash context for consistent rollout
     */
    private hashContext(flagName: string, context: FeatureFlagContext): number {
        const key = `${flagName}:${context.userId || context.ipAddress || 'anonymous'}`;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Subscribe to feature flag updates
     */
    subscribeToUpdates(): void {
        const subscriber = this.redis.duplicate();
        subscriber.subscribe('feature_flag_updates');

        subscriber.on('message', (channel, message) => {
            if (channel === 'feature_flag_updates') {
                try {
                    const update = JSON.parse(message);
                    if (update.action === 'update') {
                        this.cache.set(update.flagName, update.flag);
                    } else if (update.action === 'delete') {
                        this.cache.delete(update.flagName);
                    }
                    logger.debug('Feature flag cache updated', { flagName: update.flagName, action: update.action });
                } catch (error) {
                    logger.error('Error processing feature flag update', { error });
                }
            }
        });
    }
}

export const featureFlagService = new FeatureFlagService();
export default featureFlagService;