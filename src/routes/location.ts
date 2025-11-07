import { Router } from 'express';
import { LocationService } from '@/services/locationService';
import { LocationBroadcastService } from '@/services/locationBroadcastService';
import { LocationQueueProcessor } from '@/services/locationQueueProcessor';
import { authMiddleware } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import { LocationIngestionRequest, LocationExportRequest } from '@/types/location';
import Joi from 'joi';

const router = Router();
const locationService = new LocationService();

// Validation schemas
const locationIngestionSchema = Joi.object({
    coordinates: Joi.object({
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required()
    }).required(),
    accuracy: Joi.number().positive().required(),
    source: Joi.string().valid('gps', 'network', 'passive').required(),
    timestamp: Joi.string().isoDate().required(),
    deviceId: Joi.string().required()
});

const locationExportSchema = Joi.object({
    userId: Joi.string().uuid().optional(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    includeRedacted: Joi.boolean().default(false),
    format: Joi.string().valid('json', 'csv').default('json')
});

/**
 * POST /api/location/ingest
 * Ingest location data for the authenticated user
 */
router.post('/ingest', authMiddleware, async (req, res) => {
    try {
        const { error, value } = locationIngestionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_FAILED',
                    message: 'Invalid location data',
                    details: error.details,
                    correlationId: req.correlationId
                }
            });
        }

        const locationData: LocationIngestionRequest = value;
        const user = req.user;

        const locationPoint = await locationService.ingestLocation(user.id, locationData, user);

        res.status(201).json({
            success: true,
            data: {
                timestamp: locationPoint.timestamp,
                accuracy: locationPoint.accuracy,
                source: locationPoint.source
            },
            correlationId: req.correlationId
        });

    } catch (error) {
        logger.error('Location ingestion failed:', error);

        if (error.message.includes('consent')) {
            return res.status(403).json({
                error: {
                    code: 'CONSENT_REQUIRED',
                    message: error.message,
                    correlationId: req.correlationId
                }
            });
        }

        if (error.message.includes('accuracy')) {
            return res.status(400).json({
                error: {
                    code: 'ACCURACY_THRESHOLD',
                    message: error.message,
                    correlationId: req.correlationId
                }
            });
        }

        res.status(500).json({
            error: {
                code: 'INGESTION_FAILED',
                message: 'Failed to process location data',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * GET /api/location/user/:userId
 * Get recent locations for a specific user
 */
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        // Validate UUID format
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_USER_ID',
                    message: 'Invalid user ID format',
                    correlationId: req.correlationId
                }
            });
        }

        const locations = await locationService.getUserLocations(
            userId,
            Math.min(limit, 1000), // Cap at 1000
            req.user.id,
            req.user.role
        );

        res.json({
            success: true,
            data: {
                userId,
                locations,
                count: locations.length
            },
            correlationId: req.correlationId
        });

    } catch (error) {
        logger.error('Failed to get user locations:', error);
        res.status(500).json({
            error: {
                code: 'LOCATION_FETCH_FAILED',
                message: 'Failed to retrieve location data',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * POST /api/location/export
 * Export location data with privacy controls
 */
router.post('/export', authMiddleware, async (req, res) => {
    try {
        // Only admin and dispatcher roles can export location data
        if (!['admin', 'dispatcher'].includes(req.user.role)) {
            return res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'Export functionality requires admin or dispatcher role',
                    correlationId: req.correlationId
                }
            });
        }

        const { error, value } = locationExportSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_FAILED',
                    message: 'Invalid export request',
                    details: error.details,
                    correlationId: req.correlationId
                }
            });
        }

        const exportRequest: LocationExportRequest = value;
        const locationData = await locationService.exportLocationData(exportRequest, req.user.role);

        if (exportRequest.format === 'csv') {
            // Convert to CSV format
            const csvHeader = 'userId,latitude,longitude,accuracy,timestamp,source,isRedacted\n';
            const csvData = locationData.map(item =>
                `${item.userId},${item.coordinates.latitude},${item.coordinates.longitude},${item.accuracy},${item.timestamp.toISOString()},${item.source},${item.isRedacted}`
            ).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="location_export_${Date.now()}.csv"`);
            res.send(csvHeader + csvData);
        } else {
            res.json({
                success: true,
                data: {
                    exportRequest,
                    locations: locationData,
                    count: locationData.length,
                    exportedAt: new Date()
                },
                correlationId: req.correlationId
            });
        }

    } catch (error) {
        logger.error('Location export failed:', error);
        res.status(500).json({
            error: {
                code: 'EXPORT_FAILED',
                message: 'Failed to export location data',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * POST /api/location/cleanup
 * Manually trigger location data cleanup
 */
router.post('/cleanup', authMiddleware, async (req, res) => {
    try {
        // Only admin role can trigger cleanup
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'Cleanup functionality requires admin role',
                    correlationId: req.correlationId
                }
            });
        }

        const result = await locationService.cleanupExpiredLocations();

        res.json({
            success: true,
            data: {
                deletedCount: result.deletedCount,
                batchesProcessed: result.batchesProcessed,
                cleanupAt: new Date()
            },
            correlationId: req.correlationId
        });

    } catch (error) {
        logger.error('Manual cleanup failed:', error);
        res.status(500).json({
            error: {
                code: 'CLEANUP_FAILED',
                message: 'Failed to cleanup location data',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * POST /api/location/verify-integrity
 * Verify hash chain integrity for a user
 */
router.post('/verify-integrity', authMiddleware, async (req, res) => {
    try {
        // Only admin and the user themselves can verify integrity
        const { userId, startDate, endDate } = req.body;

        if (req.user.role !== 'admin' && req.user.id !== userId) {
            return res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'Can only verify integrity of your own data',
                    correlationId: req.correlationId
                }
            });
        }

        const verification = await locationService.verifyHashChain(
            userId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined
        );

        res.json({
            success: true,
            data: {
                userId,
                verification,
                verifiedAt: new Date()
            },
            correlationId: req.correlationId
        });

    } catch (error) {
        logger.error('Hash chain verification failed:', error);
        res.status(500).json({
            error: {
                code: 'VERIFICATION_FAILED',
                message: 'Failed to verify data integrity',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * GET /api/location/stats
 * Get location service statistics (admin only)
 */
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'Statistics require admin role',
                    correlationId: req.correlationId
                }
            });
        }

        // Get WebSocket stats if broadcast service is available
        let broadcastStats = null;
        try {
            // This would be injected in a real application
            // broadcastStats = locationBroadcastService.getStats();
        } catch (error) {
            logger.debug('Broadcast service not available for stats');
        }

        // Get queue stats if processor is available
        let queueStats = null;
        try {
            const queueProcessor = new LocationQueueProcessor();
            queueStats = await queueProcessor.getQueueStats();
        } catch (error) {
            logger.debug('Queue processor not available for stats');
        }

        res.json({
            success: true,
            data: {
                broadcastStats,
                queueStats,
                timestamp: new Date()
            },
            correlationId: req.correlationId
        });

    } catch (error) {
        logger.error('Failed to get location stats:', error);
        res.status(500).json({
            error: {
                code: 'STATS_FAILED',
                message: 'Failed to retrieve statistics',
                correlationId: req.correlationId
            }
        });
    }
});

export default router;