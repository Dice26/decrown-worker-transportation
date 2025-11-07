import { Router } from 'express';
import { TransportService } from '@/services/transportService';
import { LocationService } from '@/services/locationService';
import { UserService } from '@/services/userService';
import { mobileAuthMiddleware, requireTrustLevel, MobileAuthRequest } from '@/middleware/mobileAuth';
import { requireRole } from '@/middleware/auth';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

const router = Router();
const transportService = new TransportService();
const locationService = new LocationService();
const userService = new UserService();

// Apply mobile authentication and driver role requirement to all routes
router.use(mobileAuthMiddleware);
router.use(requireRole('driver'));

/**
 * Get assigned routes for driver
 * GET /api/mobile/driver/routes
 */
router.get('/routes', async (req: MobileAuthRequest, res) => {
    try {
        const driverId = req.user.id;
        const { status = 'active' } = req.query;

        const routes = await transportService.getDriverRoutes(driverId, status as string);

        res.json({
            success: true,
            data: {
                routes: routes.map(route => ({
                    id: route.id,
                    status: route.status,
                    scheduledAt: route.scheduledAt,
                    estimatedDuration: route.metrics.estimatedDuration,
                    totalStops: route.plannedStops.length,
                    completedStops: route.actualStops.length,
                    nextStop: route.plannedStops[route.actualStops.length] || null,
                    optimization: {
                        totalDistance: route.metrics.totalDistance,
                        optimizationScore: route.metrics.optimizationScore
                    }
                }))
            }
        });
    } catch (error) {
        logger.error('Failed to get driver routes', {
            error: error.message,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get detailed route information
 * GET /api/mobile/driver/routes/:routeId
 */
router.get('/routes/:routeId', async (req: MobileAuthRequest, res) => {
    try {
        const { routeId } = req.params;
        const driverId = req.user.id;

        const route = await transportService.getRouteDetails(routeId);

        if (!route) {
            throw new AppError('Route not found', 404, 'ROUTE_NOT_FOUND');
        }

        // Verify driver is assigned to this route
        if (route.driverId !== driverId) {
            throw new AppError('Access denied to this route', 403, 'ACCESS_DENIED');
        }

        res.json({
            success: true,
            data: {
                route: {
                    id: route.id,
                    status: route.status,
                    scheduledAt: route.scheduledAt,
                    plannedStops: route.plannedStops.map(stop => ({
                        id: stop.id,
                        userId: stop.userId,
                        location: stop.location,
                        estimatedArrival: stop.estimatedArrival,
                        status: stop.status,
                        workerInfo: {
                            // Basic worker info for pickup
                            department: stop.workerInfo?.department,
                            contactNumber: stop.workerInfo?.contactNumber
                        }
                    })),
                    actualStops: route.actualStops,
                    metrics: route.metrics,
                    navigation: {
                        currentStopIndex: route.actualStops.length,
                        nextStop: route.plannedStops[route.actualStops.length] || null,
                        remainingDistance: route.metrics.remainingDistance,
                        estimatedCompletion: route.metrics.estimatedCompletion
                    }
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get route details', {
            error: error.message,
            routeId: req.params.routeId,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update driver location during route
 * POST /api/mobile/driver/location
 */
router.post('/location', requireTrustLevel('high'), async (req: MobileAuthRequest, res) => {
    try {
        const { latitude, longitude, accuracy, heading, speed } = req.body;
        const driverId = req.user.id;
        const deviceId = req.device!.id;

        // Validate location data
        if (!latitude || !longitude || !accuracy) {
            throw new AppError('Location coordinates and accuracy are required', 400, 'VALIDATION_ERROR');
        }

        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            throw new AppError('Invalid coordinates', 400, 'INVALID_COORDINATES');
        }

        // Store driver location with higher frequency updates
        const locationPoint = await locationService.storeDriverLocation({
            driverId,
            deviceId,
            coordinates: { latitude, longitude },
            accuracy,
            heading: heading || null,
            speed: speed || null,
            timestamp: new Date()
        });

        // Check if driver is on an active route and update ETA
        const activeRoute = await transportService.getActiveRouteForDriver(driverId);
        if (activeRoute) {
            await transportService.updateRouteETAs(activeRoute.id, { latitude, longitude });
        }

        res.json({
            success: true,
            data: {
                locationId: locationPoint.id,
                timestamp: locationPoint.timestamp,
                routeUpdated: !!activeRoute
            }
        });
    } catch (error) {
        logger.error('Driver location update failed', {
            error: error.message,
            driverId: req.user?.id,
            deviceId: req.device?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Check in at pickup location
 * POST /api/mobile/driver/checkin/:stopId
 */
router.post('/checkin/:stopId', async (req: MobileAuthRequest, res) => {
    try {
        const { stopId } = req.params;
        const { location, notes } = req.body;
        const driverId = req.user.id;

        // Validate check-in location if provided
        if (location && (!location.latitude || !location.longitude)) {
            throw new AppError('Valid location coordinates required for check-in', 400, 'VALIDATION_ERROR');
        }

        // Process driver check-in
        const checkIn = await transportService.processDriverCheckIn(driverId, stopId, {
            location,
            notes,
            timestamp: new Date()
        });

        res.json({
            success: true,
            data: {
                stopId,
                checkInTime: checkIn.timestamp,
                status: checkIn.status,
                nextStop: checkIn.nextStop || null,
                routeProgress: {
                    completedStops: checkIn.completedStops,
                    totalStops: checkIn.totalStops,
                    estimatedCompletion: checkIn.estimatedCompletion
                }
            }
        });
    } catch (error) {
        logger.error('Driver check-in failed', {
            error: error.message,
            stopId: req.params.stopId,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Mark worker as picked up
 * POST /api/mobile/driver/pickup/:stopId
 */
router.post('/pickup/:stopId', async (req: MobileAuthRequest, res) => {
    try {
        const { stopId } = req.params;
        const { workerPresent, notes } = req.body;
        const driverId = req.user.id;

        if (typeof workerPresent !== 'boolean') {
            throw new AppError('Worker presence status is required', 400, 'VALIDATION_ERROR');
        }

        // Process worker pickup
        const pickup = await transportService.processWorkerPickup(driverId, stopId, {
            workerPresent,
            notes,
            timestamp: new Date()
        });

        res.json({
            success: true,
            data: {
                stopId,
                pickupTime: pickup.timestamp,
                workerPresent,
                status: pickup.status,
                nextStop: pickup.nextStop || null,
                routeProgress: {
                    completedStops: pickup.completedStops,
                    totalStops: pickup.totalStops,
                    estimatedCompletion: pickup.estimatedCompletion
                }
            }
        });
    } catch (error) {
        logger.error('Worker pickup failed', {
            error: error.message,
            stopId: req.params.stopId,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Complete route
 * POST /api/mobile/driver/routes/:routeId/complete
 */
router.post('/routes/:routeId/complete', async (req: MobileAuthRequest, res) => {
    try {
        const { routeId } = req.params;
        const { finalLocation, notes, mileage } = req.body;
        const driverId = req.user.id;

        // Validate completion data
        if (finalLocation && (!finalLocation.latitude || !finalLocation.longitude)) {
            throw new AppError('Valid final location coordinates required', 400, 'VALIDATION_ERROR');
        }

        // Complete the route
        const completion = await transportService.completeRoute(routeId, driverId, {
            finalLocation,
            notes,
            mileage,
            completionTime: new Date()
        });

        res.json({
            success: true,
            data: {
                routeId,
                completionTime: completion.completionTime,
                metrics: {
                    totalDistance: completion.totalDistance,
                    totalDuration: completion.totalDuration,
                    completedStops: completion.completedStops,
                    noShows: completion.noShows
                },
                summary: {
                    status: 'completed',
                    efficiency: completion.efficiency,
                    onTimePerformance: completion.onTimePerformance
                }
            }
        });
    } catch (error) {
        logger.error('Route completion failed', {
            error: error.message,
            routeId: req.params.routeId,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Report incident or delay
 * POST /api/mobile/driver/incident
 */
router.post('/incident', async (req: MobileAuthRequest, res) => {
    try {
        const { type, description, location, severity, routeId, stopId } = req.body;
        const driverId = req.user.id;

        if (!type || !description) {
            throw new AppError('Incident type and description are required', 400, 'VALIDATION_ERROR');
        }

        const validTypes = ['traffic', 'vehicle', 'weather', 'worker_issue', 'safety', 'other'];
        if (!validTypes.includes(type)) {
            throw new AppError('Invalid incident type', 400, 'INVALID_INCIDENT_TYPE');
        }

        const validSeverities = ['low', 'medium', 'high', 'critical'];
        if (severity && !validSeverities.includes(severity)) {
            throw new AppError('Invalid severity level', 400, 'INVALID_SEVERITY');
        }

        // Create incident report
        const incident = await transportService.reportIncident({
            reporterId: driverId,
            reporterType: 'driver',
            type,
            description,
            location,
            severity: severity || 'medium',
            routeId,
            stopId,
            timestamp: new Date()
        });

        // Update route status if needed
        if (routeId && ['high', 'critical'].includes(severity || 'medium')) {
            await transportService.updateRouteStatus(routeId, 'delayed', `Incident: ${type}`);
        }

        res.status(201).json({
            success: true,
            data: {
                incidentId: incident.id,
                status: 'reported',
                referenceNumber: incident.referenceNumber,
                estimatedResponseTime: severity === 'critical' ? '5 minutes' : '15 minutes'
            }
        });
    } catch (error) {
        logger.error('Failed to report driver incident', {
            error: error.message,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get driver performance metrics
 * GET /api/mobile/driver/metrics
 */
router.get('/metrics', async (req: MobileAuthRequest, res) => {
    try {
        const driverId = req.user.id;
        const { period = 'week' } = req.query;

        const validPeriods = ['day', 'week', 'month'];
        if (!validPeriods.includes(period as string)) {
            throw new AppError('Invalid period. Use: day, week, or month', 400, 'INVALID_PERIOD');
        }

        const metrics = await transportService.getDriverMetrics(driverId, period as string);

        res.json({
            success: true,
            data: {
                period,
                metrics: {
                    routesCompleted: metrics.routesCompleted,
                    totalDistance: metrics.totalDistance,
                    totalDuration: metrics.totalDuration,
                    averageRating: metrics.averageRating,
                    onTimePerformance: metrics.onTimePerformance,
                    efficiency: metrics.efficiency,
                    incidentCount: metrics.incidentCount
                },
                rankings: {
                    efficiency: metrics.efficiencyRank,
                    onTime: metrics.onTimeRank,
                    safety: metrics.safetyRank
                },
                achievements: metrics.achievements || []
            }
        });
    } catch (error) {
        logger.error('Failed to get driver metrics', {
            error: error.message,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update driver availability
 * POST /api/mobile/driver/availability
 */
router.post('/availability', async (req: MobileAuthRequest, res) => {
    try {
        const { available, reason, location } = req.body;
        const driverId = req.user.id;

        if (typeof available !== 'boolean') {
            throw new AppError('Availability status must be boolean', 400, 'VALIDATION_ERROR');
        }

        // Check for active routes before going unavailable
        if (!available) {
            const activeRoute = await transportService.getActiveRouteForDriver(driverId);
            if (activeRoute) {
                throw new AppError('Cannot go unavailable with active route', 400, 'ACTIVE_ROUTE_EXISTS');
            }
        }

        // Update driver availability
        await userService.updateDriverAvailability(driverId, available, reason, location);

        res.json({
            success: true,
            data: {
                driverId,
                available,
                reason,
                location,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        logger.error('Failed to update driver availability', {
            error: error.message,
            driverId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

export default router;