import { createClient, RedisClientType } from 'redis';
import { LocationService } from './locationService';
import { logger } from '@/utils/logger';
import { loadConfig } from '@/config/config';
import { LocationIngestionRequest } from '@/types/location';
import { getDatabase } from '@/config/database';

interface QueuedLocationUpdate {
    type: 'location_update';
    userId: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    accuracy: number;
    source: string;
    timestamp: Date;
    deviceId: string;
}

export class LocationQueueProcessor {
    private redis: RedisClientType;
    private locationService: LocationService;
    private config: any;
    private isProcessing: boolean = false;
    private processingInterval: NodeJS.Timeout | null = null;
    private db: any;

    constructor() {
        this.config = loadConfig();
        this.locationService = new LocationService();
        this.db = getDatabase();
        this.setupRedisClient();
    }

    private async setupRedisClient(): Promise<void> {
        this.redis = createClient({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password
        });

        this.redis.on('error', (err) => {
            logger.error('Redis client error in queue processor:', err);
        });

        await this.redis.connect();
        logger.info('Location queue processor Redis client connected');
    }

    /**
     * Start processing the location update queue
     */
    start(): void {
        if (this.processingInterval) {
            logger.warn('Location queue processor already running');
            return;
        }

        // Process queue every 1 second
        this.processingInterval = setInterval(() => {
            this.processQueue();
        }, 1000);

        logger.info('Location queue processor started');
    }

    /**
     * Stop processing the queue
     */
    stop(): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        this.isProcessing = false;
        logger.info('Location queue processor stopped');
    }

    /**
     * Process queued location updates
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            return; // Already processing
        }

        this.isProcessing = true;

        try {
            // Process up to 50 items per batch to avoid overwhelming the database
            const batchSize = 50;
            const processedItems: QueuedLocationUpdate[] = [];

            for (let i = 0; i < batchSize; i++) {
                const item = await this.redis.rPop('location_update_queue');
                if (!item) {
                    break; // Queue is empty
                }

                try {
                    const locationUpdate: QueuedLocationUpdate = JSON.parse(item);
                    processedItems.push(locationUpdate);
                } catch (parseError) {
                    logger.error('Failed to parse queued location update:', parseError);
                    // Move to dead letter queue for manual inspection
                    await this.redis.lPush('location_update_dlq', item);
                }
            }

            if (processedItems.length > 0) {
                await this.processBatch(processedItems);
                logger.debug(`Processed ${processedItems.length} location updates from queue`);
            }

        } catch (error) {
            logger.error('Error processing location queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a batch of location updates
     */
    private async processBatch(locationUpdates: QueuedLocationUpdate[]): Promise<void> {
        const userCache = new Map<string, any>();

        for (const update of locationUpdates) {
            try {
                // Get user data (with caching to reduce database queries)
                let user = userCache.get(update.userId);
                if (!user) {
                    const userResult = await this.db('users')
                        .select('id', 'email', 'role', 'status', 'consent_flags')
                        .where('id', update.userId)
                        .first();

                    if (!userResult) {
                        logger.warn(`User not found for location update: ${update.userId}`);
                        continue;
                    }

                    user = {
                        id: userResult.id,
                        email: userResult.email,
                        role: userResult.role,
                        status: userResult.status,
                        consentFlags: userResult.consent_flags
                    };

                    userCache.set(update.userId, user);
                }

                // Skip if user is not active
                if (user.status !== 'active') {
                    logger.debug(`Skipping location update for inactive user: ${update.userId}`);
                    continue;
                }

                // Convert to LocationIngestionRequest format
                const locationRequest: LocationIngestionRequest = {
                    coordinates: update.coordinates,
                    accuracy: update.accuracy,
                    source: update.source,
                    timestamp: update.timestamp.toISOString(),
                    deviceId: update.deviceId
                };

                // Process the location update
                await this.locationService.ingestLocation(update.userId, locationRequest, user);

            } catch (error) {
                logger.error(`Failed to process location update for user ${update.userId}:`, error);

                // Move failed items to dead letter queue for retry or manual inspection
                await this.redis.lPush('location_update_dlq', JSON.stringify(update));
            }
        }
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(): Promise<{
        queueLength: number;
        deadLetterQueueLength: number;
        isProcessing: boolean;
    }> {
        const queueLength = await this.redis.lLen('location_update_queue');
        const deadLetterQueueLength = await this.redis.lLen('location_update_dlq');

        return {
            queueLength,
            deadLetterQueueLength,
            isProcessing: this.isProcessing
        };
    }

    /**
     * Retry failed items from dead letter queue
     */
    async retryFailedItems(maxItems: number = 10): Promise<number> {
        let retriedCount = 0;

        for (let i = 0; i < maxItems; i++) {
            const item = await this.redis.rPop('location_update_dlq');
            if (!item) {
                break;
            }

            // Move back to main queue for retry
            await this.redis.lPush('location_update_queue', item);
            retriedCount++;
        }

        if (retriedCount > 0) {
            logger.info(`Retried ${retriedCount} failed location updates`);
        }

        return retriedCount;
    }

    /**
     * Clear dead letter queue (use with caution)
     */
    async clearDeadLetterQueue(): Promise<number> {
        const length = await this.redis.lLen('location_update_dlq');
        await this.redis.del('location_update_dlq');

        logger.warn(`Cleared dead letter queue with ${length} items`);
        return length;
    }

    /**
     * Shutdown the processor
     */
    async shutdown(): Promise<void> {
        this.stop();
        await this.redis.disconnect();
        logger.info('Location queue processor shut down');
    }
}