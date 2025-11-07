import { Router } from 'express';
import { LocationService } from '@/services/locationService';
import { TransportService } from '@/services/transportService';
import { UserService } from '@/services/userService';
import { mobileAuthMiddleware, requireTrustLevel, MobileAuthRequest } from '@/middleware/mobileAuth';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

const router = Router();
const locationService = new LocationService();
const transportService = new TransportService();
const userService = new UserService();

// Apply mobile authentication to all worker routes
router.use(mobileAuthMiddleware);

/**
 * Update worker location with consent validation
 * POST /api/mobile/worker/location
 */
router.post('/location', requireTrustLevel('medium'), async (req: MobileAuthRequest, res) => {
    try {
        const { latitude, longitude, accuracy, timestamp } = req.body;
        const userId = req.user.id;
        const deviceId = req.device!.id;

        // Validate location data
        if (!latitude || !longitude || !accuracy) {
            throw new AppError('Location coordinates and accuracy are required', 400, 'VALIDATION_ERROR');
        }

        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            throw new AppError('Invalid coordinates', 400, 'INVALID_COORDINATES');
        }

        if (accuracy > 100) {
            throw new AppError('Location accuracy must be better than 100 meters', 400, 'POOR_ACCURACY');
        }

        // Check user consent for location tracking
        const user = await userService.getUser(userId);
        if (!user?.consentFlags.locationTracking) {
            throw new AppError('Location tracking consent required', 403, 'CONSENT_REQUIRED');
        }

        // Store location point
        const locationPoint = await locationService.storeLocationPoint({
            userId,
            deviceId,
            coordinates: { latitude, longitude },
            accuracy,
            source: 'gps',
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            consentVersion: user.consentFlags.consentVersion
        });

        res.json({
            success: true,
            data: {
                locationId: locationPoint.id,
                timestamp: locationPoint.timestamp,
                accepted: true
            }
        });
    } catch (error) {
        logger.error('Worker location update failed', {
            error: error.message,
            userId: req.user?.id,
            deviceId: req.device?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get worker's current trip status
 * GET /api/mobile/worker/trip/status
 */
router.get('/trip/status', async (req: MobileAuthRequest, res) => {
    try {
        const userId = req.user.id;

        // Get active trip for worker
        const activeTrip = await transportService.getActiveTripForWorker(userId);

        if (!activeTrip) {
            return res.json({
                success: true,
                data: {
                    hasActiveTrip: false,
                    status: 'no_trip'
                }
            });
        }

        // Get worker's stop in the trip
        const workerStop = activeTrip.plannedStops.find(stop => stop.userId === userId);

        res.json({
            success: true,
            data: {
                hasActiveTrip: true,
                tripId: activeTrip.id,
                status: workerStop?.status || 'pending',
                estimatedArrival: workerStop?.estimatedArrival,
                actualArrival: workerStop?.actualArrival,
                driverInfo: activeTrip.driverId ? {
                    id: activeTrip.driverId,
                    // Driver details would be fetched separately for privacy
                } : null,
                route: {
                    totalStops: activeTrip.plannedStops.length,
                    currentStop: activeTrip.actualStops.length + 1
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get worker trip status', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update worker availability status
 * POST /api/mobile/worker/availability
 */
router.post('/availability', async (req: MobileAuthRequest, res) => {
    try {
        const { available, reason } = req.body;
        const userId = req.user.id;

        if (typeof available !== 'boolean') {
            throw new AppError('Availability status must be boolean', 400, 'VALIDATION_ERROR');
        }

        // Update worker availability
        await userService.updateWorkerAvailability(userId, available, reason);

        // If becoming unavailable, check for active trips
        if (!available) {
            const activeTrip = await transportService.getActiveTripForWorker(userId);
            if (activeTrip) {
                logger.warn('Worker marked unavailable with active trip', {
                    userId,
                    tripId: activeTrip.id,
                    reason,
                    correlationId: req.correlationId
                });
            }
        }

        res.json({
            success: true,
            data: {
                userId,
                available,
                reason,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        logger.error('Failed to update worker availability', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get worker's trip history
 * GET /api/mobile/worker/trips/history
 */
router.get('/trips/history', async (req: MobileAuthRequest, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);

        if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
            throw new AppError('Invalid pagination parameters', 400, 'VALIDATION_ERROR');
        }

        const trips = await transportService.getWorkerTripHistory(userId, pageNum, limitNum);

        res.json({
            success: true,
            data: {
                trips: trips.map(trip => ({
                    id: trip.id,
                    scheduledAt: trip.scheduledAt,
                    completedAt: trip.completedAt,
                    status: trip.status,
                    pickupLocation: trip.plannedStops.find(s => s.userId === userId)?.location,
                    actualPickupTime: trip.actualStops.find(s => s.userId === userId)?.actualArrival,
                    metrics: {
                        distance: trip.metrics.totalDistance,
                        duration: trip.metrics.totalDuration
                    }
                })),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    hasMore: trips.length === limitNum
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get worker trip history', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Report an issue or incident
 * POST /api/mobile/worker/incident
 */
router.post('/incident', async (req: MobileAuthRequest, res) => {
    try {
        const { type, description, location, tripId } = req.body;
        const userId = req.user.id;

        if (!type || !description) {
            throw new AppError('Incident type and description are required', 400, 'VALIDATION_ERROR');
        }

        const validTypes = ['safety', 'vehicle', 'route', 'driver', 'other'];
        if (!validTypes.includes(type)) {
            throw new AppError('Invalid incident type', 400, 'INVALID_INCIDENT_TYPE');
        }

        // Create incident report
        const incident = await transportService.reportIncident({
            reporterId: userId,
            reporterType: 'worker',
            type,
            description,
            location,
            tripId,
            severity: 'medium', // Default severity, can be escalated
            timestamp: new Date()
        });

        // Log incident for immediate attention
        logger.warn('Worker incident reported', {
            incidentId: incident.id,
            type,
            userId,
            tripId,
            correlationId: req.correlationId
        });

        res.status(201).json({
            success: true,
            data: {
                incidentId: incident.id,
                status: 'reported',
                referenceNumber: incident.referenceNumber,
                estimatedResponseTime: '15 minutes'
            }
        });
    } catch (error) {
        logger.error('Failed to report incident', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update consent preferences
 * POST /api/mobile/worker/consent
 */
router.post('/consent', async (req: MobileAuthRequest, res) => {
    try {
        const { locationTracking, dataProcessing, marketingCommunications } = req.body;
        const userId = req.user.id;

        const consentUpdates: any = {};

        if (typeof locationTracking === 'boolean') {
            consentUpdates.locationTracking = locationTracking;
        }
        if (typeof dataProcessing === 'boolean') {
            consentUpdates.dataProcessing = dataProcessing;
        }
        if (typeof marketingCommunications === 'boolean') {
            consentUpdates.marketingCommunications = marketingCommunications;
        }

        if (Object.keys(consentUpdates).length === 0) {
            throw new AppError('At least one consent preference must be provided', 400, 'VALIDATION_ERROR');
        }

        // Update consent flags
        const updatedUser = await userService.updateConsentFlags(userId, consentUpdates);

        // If location tracking is disabled, stop location collection immediately
        if (locationTracking === false) {
            await locationService.stopLocationTracking(userId);
            logger.info('Location tracking disabled for user', { userId, correlationId: req.correlationId });
        }

        res.json({
            success: true,
            data: {
                consentFlags: updatedUser.consentFlags,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        logger.error('Failed to update consent preferences', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get worker profile and preferences
 * GET /api/mobile/worker/profile
 */
router.get('/profile', async (req: MobileAuthRequest, res) => {
    try {
        const userId = req.user.id;

        const user = await userService.getUser(userId);
        if (!user) {
            throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        }

        // Get device info
        const device = req.device;

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    department: user.department,
                    status: user.status,
                    consentFlags: user.consentFlags
                },
                device: {
                    id: device!.id,
                    trustLevel: device!.trustLevel,
                    isSecure: device!.isSecure
                },
                preferences: {
                    notifications: true, // Would be stored in user preferences
                    locationSharing: user.consentFlags.locationTracking
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get worker profile', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

export default router;