import cron from 'node-cron';
import { auditService } from '@/services/auditService';
import { logger } from '@/utils/logger';

/**
 * Daily job to update audit trail integrity checkpoints
 */
export function startAuditIntegrityJob(): void {
    // Run daily at 1:00 AM
    cron.schedule('0 1 * * *', async () => {
        try {
            logger.info('Starting daily audit integrity checkpoint update');

            // Update checkpoint for yesterday
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            await auditService.updateIntegrityCheckpoint(yesterday);

            logger.info('Daily audit integrity checkpoint update completed', {
                date: yesterday.toISOString().split('T')[0]
            });
        } catch (error) {
            logger.error('Failed to update daily audit integrity checkpoint', {
                error: error.message,
                stack: error.stack
            });
        }
    }, {
        scheduled: true,
        timezone: 'UTC'
    });

    logger.info('Audit integrity job scheduled to run daily at 1:00 AM UTC');
}

/**
 * Manual integrity checkpoint update for a specific date
 */
export async function updateIntegrityCheckpointForDate(date: Date): Promise<void> {
    try {
        await auditService.updateIntegrityCheckpoint(date);
        logger.info('Manual integrity checkpoint update completed', {
            date: date.toISOString().split('T')[0]
        });
    } catch (error) {
        logger.error('Failed to update manual integrity checkpoint', {
            error: error.message,
            date: date.toISOString().split('T')[0]
        });
        throw error;
    }
}

/**
 * Verify integrity for a date range and log results
 */
export async function verifyIntegrityForDateRange(
    startDate: Date,
    endDate: Date
): Promise<{ isValid: boolean; brokenChains: string[]; totalEvents: number }> {
    try {
        logger.info('Starting integrity verification', {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        });

        const result = await auditService.verifyIntegrity({ start: startDate, end: endDate });

        if (!result.isValid) {
            logger.warn('Audit trail integrity issues detected', {
                brokenChains: result.brokenChains,
                totalEvents: result.totalEvents,
                dateRange: {
                    start: startDate.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0]
                }
            });
        } else {
            logger.info('Audit trail integrity verification passed', {
                totalEvents: result.totalEvents,
                dateRange: {
                    start: startDate.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0]
                }
            });
        }

        return result;
    } catch (error) {
        logger.error('Failed to verify audit trail integrity', {
            error: error.message,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        });
        throw error;
    }
}