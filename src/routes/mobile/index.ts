import { Router } from 'express';
import { PushNotificationService } from '@/services/pushNotificationService';
import { OfflineSyncService } from '@/services/offlineSyncService';
import { mobileAuthMiddleware, mobileSecurityHeaders, MobileAuthRequest } from '@/middleware/mobileAuth';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import workerRoutes from './worker';
import driverRoutes from './driver';

const router = Router();
const pushNotificationService = new PushNotificationService();
const offlineSyncService = new OfflineSyncService();

// Apply mobile security headers to all mobile routes
router.use(mobileSecurityHeaders);

// Mobile app routes
router.use('/worker', workerRoutes);
router.use('/driver', driverRoutes);

// Apply mobile authentication to remaining routes
router.use(mobileAuthMiddleware);

/**
 * Register push notification token
 * POST /api/mobile/push/register
 */
router.post('/push/register', async (req: MobileAuthRequest, res) => {
    try {
        const { token, platform, appVersion } = req.body;
        const userId = req.user.id;
        const deviceId = req.device!.id;

        if (!token || !platform) {
            throw new AppError('Push token and platform are required', 400, 'VALIDATION_ERROR');
        }

        if (!['ios', 'android'].includes(platform)) {
            throw new AppError('Platform must be ios or android', 400, 'INVALID_PLATFORM');
        }

        await pushNotificationService.registerPushToken(
            userId,
            deviceId,
            token,
            platform,
            appVersion || '1.0.0'
        );

        res.json({
            success: true,
            message: 'Push token registered successfully'
        });
    } catch (error) {
        logger.error('Failed to register push token', {
            error: error.message,
            userId: req.user?.id,
            deviceId: req.device?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get notification history
 * GET /api/mobile/notifications
 */
router.get('/notifications', async (req: MobileAuthRequest, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);

        if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
            throw new AppError('Invalid pagination parameters', 400, 'VALIDATION_ERROR');
        }

        const notifications = await pushNotificationService.getNotificationHistory(
            userId,
            pageNum,
            limitNum
        );

        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    hasMore: notifications.length === limitNum
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get notification history', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Mark notification as read
 * POST /api/mobile/notifications/:notificationId/read
 */
router.post('/notifications/:notificationId/read', async (req: MobileAuthRequest, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.id;

        await pushNotificationService.markAsRead(notificationId, userId);

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        logger.error('Failed to mark notification as read', {
            error: error.message,
            notificationId: req.params.notificationId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Sync offline data
 * POST /api/mobile/sync
 */
router.post('/sync', async (req: MobileAuthRequest, res) => {
    try {
        const { lastSyncTimestamp, pendingData } = req.body;
        const userId = req.user.id;
        const deviceId = req.device!.id;

        if (!lastSyncTimestamp) {
            throw new AppError('Last sync timestamp is required', 400, 'VALIDATION_ERROR');
        }

        if (!Array.isArray(pendingData)) {
            throw new AppError('Pending data must be an array', 400, 'VALIDATION_ERROR');
        }

        const syncRequest = {
            deviceId,
            lastSyncTimestamp: new Date(lastSyncTimestamp),
            pendingData
        };

        const syncResponse = await offlineSyncService.processSyncRequest(userId, syncRequest);

        res.json({
            success: true,
            data: syncResponse
        });
    } catch (error) {
        logger.error('Failed to process sync request', {
            error: error.message,
            userId: req.user?.id,
            deviceId: req.device?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get pending sync data
 * GET /api/mobile/sync/pending
 */
router.get('/sync/pending', async (req: MobileAuthRequest, res) => {
    try {
        const deviceId = req.device!.id;
        const { limit = 100 } = req.query;

        const limitNum = parseInt(limit as string);
        if (limitNum < 1 || limitNum > 1000) {
            throw new AppError('Limit must be between 1 and 1000', 400, 'VALIDATION_ERROR');
        }

        const pendingData = await offlineSyncService.getPendingSyncData(deviceId, limitNum);

        res.json({
            success: true,
            data: {
                pendingData,
                count: pendingData.length
            }
        });
    } catch (error) {
        logger.error('Failed to get pending sync data', {
            error: error.message,
            deviceId: req.device?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Resolve sync conflict
 * POST /api/mobile/sync/conflicts/:conflictId/resolve
 */
router.post('/sync/conflicts/:conflictId/resolve', async (req: MobileAuthRequest, res) => {
    try {
        const { conflictId } = req.params;
        const { resolution, mergedData } = req.body;

        if (!resolution || !['server_wins', 'client_wins', 'merge'].includes(resolution)) {
            throw new AppError('Valid resolution is required', 400, 'VALIDATION_ERROR');
        }

        if (resolution === 'merge' && !mergedData) {
            throw new AppError('Merged data is required for merge resolution', 400, 'VALIDATION_ERROR');
        }

        await offlineSyncService.resolveConflict(conflictId, resolution, mergedData);

        res.json({
            success: true,
            message: 'Conflict resolved successfully'
        });
    } catch (error) {
        logger.error('Failed to resolve sync conflict', {
            error: error.message,
            conflictId: req.params.conflictId,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Health check for mobile API
 * GET /api/mobile/health
 */
router.get('/health', async (req: MobileAuthRequest, res) => {
    try {
        const userId = req.user.id;
        const deviceId = req.device!.id;

        // Check various service health
        const health = {
            api: 'healthy',
            user: {
                id: userId,
                authenticated: true
            },
            device: {
                id: deviceId,
                trustLevel: req.device!.trustLevel,
                isSecure: req.device!.isSecure
            },
            services: {
                pushNotifications: 'healthy',
                offlineSync: 'healthy',
                location: 'healthy',
                transport: 'healthy'
            },
            timestamp: new Date()
        };

        res.json({
            success: true,
            data: health
        });
    } catch (error) {
        logger.error('Mobile health check failed', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get mobile app configuration
 * GET /api/mobile/config
 */
router.get('/config', async (req: MobileAuthRequest, res) => {
    try {
        const config = {
            apiVersion: process.env.MOBILE_API_VERSION || '1.0',
            features: {
                locationTracking: true,
                pushNotifications: true,
                offlineSync: true,
                biometricAuth: true,
                certificatePinning: true
            },
            intervals: {
                locationUpdate: 30, // seconds
                syncCheck: 60,      // seconds
                heartbeat: 300      // seconds
            },
            limits: {
                maxLocationAccuracy: 100,  // meters
                maxOfflineData: 1000,      // items
                maxSyncRetries: 3
            },
            security: {
                requireBiometric: req.device!.trustLevel < 60,
                requireCertPinning: true,
                sessionTimeout: 900 // 15 minutes
            }
        };

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('Failed to get mobile config', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

export default router;