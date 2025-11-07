import { Router } from 'express';
import { DeviceService } from '@/services/deviceService';
import { authMiddleware } from '@/middleware/auth';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest } from '@/types/auth';
import { DeviceRegistrationRequest, DeviceUpdateRequest } from '@/types/device';

const router = Router();
const deviceService = new DeviceService();

// Apply authentication middleware to all device routes
router.use(authMiddleware);

/**
 * Register a new device
 * POST /api/devices
 */
router.post('/', async (req: AuthenticatedRequest, res) => {
    try {
        const deviceData: DeviceRegistrationRequest = req.body;
        const userId = req.user.id;

        // Validate required fields
        if (!deviceData.deviceFingerprint || !deviceData.deviceType) {
            throw new AppError('Device fingerprint and type are required', 400, 'VALIDATION_ERROR');
        }

        const device = await deviceService.registerDevice(userId, deviceData);

        res.status(201).json({
            success: true,
            data: device
        });
    } catch (error) {
        logger.error('Device registration failed', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get all devices for the authenticated user
 * GET /api/devices
 */
router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const devices = await deviceService.getDevicesByUser(userId);

        res.json({
            success: true,
            data: devices
        });
    } catch (error) {
        logger.error('Failed to get user devices', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get a specific device
 * GET /api/devices/:deviceId
 */
router.get('/:deviceId', async (req: AuthenticatedRequest, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.id;

        const device = await deviceService.getDevice(deviceId);

        if (!device) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        // Ensure user can only access their own devices (unless admin)
        if (device.userId !== userId && req.user.role !== 'admin') {
            throw new AppError('Access denied', 403, 'ACCESS_DENIED');
        }

        res.json({
            success: true,
            data: device
        });
    } catch (error) {
        logger.error('Failed to get device', {
            error: error.message,
            deviceId: req.params.deviceId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update a device
 * PUT /api/devices/:deviceId
 */
router.put('/:deviceId', async (req: AuthenticatedRequest, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.id;
        const updateData: DeviceUpdateRequest = req.body;

        const device = await deviceService.updateDevice(deviceId, userId, updateData);

        res.json({
            success: true,
            data: device
        });
    } catch (error) {
        logger.error('Failed to update device', {
            error: error.message,
            deviceId: req.params.deviceId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Deactivate a device
 * DELETE /api/devices/:deviceId
 */
router.delete('/:deviceId', async (req: AuthenticatedRequest, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.id;

        await deviceService.deactivateDevice(deviceId, userId);

        res.json({
            success: true,
            message: 'Device deactivated successfully'
        });
    } catch (error) {
        logger.error('Failed to deactivate device', {
            error: error.message,
            deviceId: req.params.deviceId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get device trust level
 * GET /api/devices/:deviceId/trust
 */
router.get('/:deviceId/trust', async (req: AuthenticatedRequest, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.id;

        // Verify device belongs to user (unless admin)
        const device = await deviceService.getDevice(deviceId);
        if (!device) {
            throw new AppError('Device not found', 404, 'DEVICE_NOT_FOUND');
        }

        if (device.userId !== userId && req.user.role !== 'admin') {
            throw new AppError('Access denied', 403, 'ACCESS_DENIED');
        }

        const trustLevel = await deviceService.getTrustLevel(deviceId);

        res.json({
            success: true,
            data: {
                deviceId,
                trustLevel,
                trustScore: device.trustLevel
            }
        });
    } catch (error) {
        logger.error('Failed to get device trust level', {
            error: error.message,
            deviceId: req.params.deviceId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Admin only: Block a device
 * POST /api/devices/:deviceId/block
 */
router.post('/:deviceId/block', async (req: AuthenticatedRequest, res) => {
    try {
        // Check admin permissions
        if (req.user.role !== 'admin') {
            throw new AppError('Admin access required', 403, 'ACCESS_DENIED');
        }

        const { deviceId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            throw new AppError('Reason is required for blocking device', 400, 'VALIDATION_ERROR');
        }

        await deviceService.blockDevice(deviceId, reason);

        res.json({
            success: true,
            message: 'Device blocked successfully'
        });
    } catch (error) {
        logger.error('Failed to block device', {
            error: error.message,
            deviceId: req.params.deviceId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Admin only: Update device trust level
 * POST /api/devices/:deviceId/trust
 */
router.post('/:deviceId/trust', async (req: AuthenticatedRequest, res) => {
    try {
        // Check admin permissions
        if (req.user.role !== 'admin') {
            throw new AppError('Admin access required', 403, 'ACCESS_DENIED');
        }

        const { deviceId } = req.params;
        const { adjustment, reason } = req.body;

        if (typeof adjustment !== 'number' || !reason) {
            throw new AppError('Adjustment (number) and reason are required', 400, 'VALIDATION_ERROR');
        }

        const newTrustLevel = await deviceService.updateTrustLevel(deviceId, adjustment, reason);

        res.json({
            success: true,
            data: {
                deviceId,
                newTrustLevel,
                adjustment,
                reason
            }
        });
    } catch (error) {
        logger.error('Failed to update device trust level', {
            error: error.message,
            deviceId: req.params.deviceId,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

export default router;