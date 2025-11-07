import { LocationService } from '@/services/locationService';
import { logger } from '@/utils/logger';
import cron from 'node-cron';

export class LocationCleanupJob {
    private locationService: LocationService;
    private isRunning: boolean = false;

    constructor() {
        this.locationService = new LocationService();
    }

    /**
     * Start the automated cleanup job
     * Runs daily at 2 AM
     */
    start(): void {
        // Run daily at 2:00 AM
        cron.schedule('0 2 * * *', async () => {
            if (this.isRunning) {
                logger.warn('Location cleanup job already running, skipping this execution');
                return;
            }

            await this.runCleanup();
        });

        logger.info('Location cleanup job scheduled to run daily at 2:00 AM');
    }

    /**
     * Run cleanup manually
     */
    async runCleanup(): Promise<void> {
        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('Starting location data cleanup job');

            const result = await this.locationService.cleanupExpiredLocations();

            const duration = Date.now() - startTime;
            logger.info('Location cleanup job completed successfully', {
                deletedCount: result.deletedCount,
                batchesProcessed: result.batchesProcessed,
                durationMs: duration
            });

        } catch (error) {
            logger.error('Location cleanup job failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Check if cleanup job is currently running
     */
    isJobRunning(): boolean {
        return this.isRunning;
    }
}