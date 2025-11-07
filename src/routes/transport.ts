import { Router } from 'express';
import { TransportService } from '@/services/transportService';
import { RouteOptimizationService } from '@/services/routeOptimizationService';
import { LocationService } from '@/services/locationService';
import { authenticateToken } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import {
    TripCreationRequest,
    TripUpdateRequest,
    IncidentReportRequest,
    RouteOptimizationConfig,
    RouteConstraints
} from '@/types/transport';

const router = Router();
const transportService = new TransportService();
const routeOptimizationService = new RouteOptimizationService();
const locationService = new LocationService();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/transport/workers/locations
 * Get real-time worker locations for dispatcher console
 */
router.get('/workers/locations', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { active_only = 'true', limit = '100' } = req.query;

        // Get active workers (those who have shared location in last 30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const locations = await locationService.getRecentWorkerLocations(
            thirtyMinutesAgo,
            parseInt(limit as string),
            req.user.id,
            role
        );

        res.json({
            locations,
            timestamp: new Date(),
            count: locations.length
        });
    } catch (error) {
        logger.error('Failed to get worker locations:', error);
        res.status(500).json({ error: 'Failed to retrieve worker locations' });
    }
});

/**
 * POST /api/transport/trips
 * Create a new trip with route optimization
 */
router.post('/trips', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const tripRequest: TripCreationRequest = req.body;

        // Validate request
        if (!tripRequest.workerIds || tripRequest.workerIds.length === 0) {
            return res.status(400).json({ error: 'Worker IDs are required' });
        }

        if (!tripRequest.scheduledAt) {
            return res.status(400).json({ error: 'Scheduled time is required' });
        }

        const trip = await transportService.createTrip(tripRequest, req.user.id);

        res.status(201).json({
            trip,
            message: 'Trip created successfully'
        });
    } catch (error) {
        logger.error('Failed to create trip:', error);
        res.status(500).json({ error: 'Failed to create trip' });
    }
});

/**
 * GET /api/transport/trips
 * Get trips with filtering and pagination
 */
router.get('/trips', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin', 'driver'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const {
            status,
            driver_id,
            date_from,
            date_to,
            limit = '50',
            offset = '0'
        } = req.query;

        let trips;

        if (role === 'driver') {
            // Drivers can only see their own trips
            trips = await transportService.getDriverActiveTrips(req.user.id);
        } else {
            // Dispatchers and admins can see all trips
            if (status) {
                trips = await transportService.getTripsByStatus(
                    status as any,
                    parseInt(limit as string),
                    parseInt(offset as string)
                );
            } else {
                trips = await transportService.getAllTrips(
                    {
                        driverId: driver_id as string,
                        dateFrom: date_from ? new Date(date_from as string) : undefined,
                        dateTo: date_to ? new Date(date_to as string) : undefined
                    },
                    parseInt(limit as string),
                    parseInt(offset as string)
                );
            }
        }

        res.json({
            trips,
            count: trips.length,
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            }
        });
    } catch (error) {
        logger.error('Failed to get trips:', error);
        res.status(500).json({ error: 'Failed to retrieve trips' });
    }
});

/**
 * GET /api/transport/trips/:id
 * Get trip details by ID
 */
router.get('/trips/:id', async (req, res) => {
    try {
        const { role } = req.user;
        const { id } = req.params;

        const trip = await transportService.getTripById(id);

        if (!trip) {
            return res.status(404).json({ error: 'Trip not found' });
        }

        // Check permissions
        if (role === 'driver' && trip.driverId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ trip });
    } catch (error) {
        logger.error('Failed to get trip:', error);
        res.status(500).json({ error: 'Failed to retrieve trip' });
    }
});

/**
 * PUT /api/transport/trips/:id/status
 * Update trip status
 */
router.put('/trips/:id/status', async (req, res) => {
    try {
        const { role } = req.user;
        const { id } = req.params;
        const { status, ...additionalData }: TripUpdateRequest & { status: string } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        // Check permissions
        const trip = await transportService.getTripById(id);
        if (!trip) {
            return res.status(404).json({ error: 'Trip not found' });
        }

        if (role === 'driver' && trip.driverId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const updatedTrip = await transportService.updateTripStatus(
            id,
            status as any,
            req.user.id,
            additionalData
        );

        res.json({
            trip: updatedTrip,
            message: 'Trip status updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update trip status:', error);
        res.status(500).json({ error: 'Failed to update trip status' });
    }
});

/**
 * POST /api/transport/trips/:id/complete
 * Complete a trip with final metrics
 */
router.post('/trips/:id/complete', async (req, res) => {
    try {
        const { role } = req.user;
        const { id } = req.params;
        const { finalStops } = req.body;

        if (!finalStops || !Array.isArray(finalStops)) {
            return res.status(400).json({ error: 'Final stops are required' });
        }

        // Check permissions
        const trip = await transportService.getTripById(id);
        if (!trip) {
            return res.status(404).json({ error: 'Trip not found' });
        }

        if (role === 'driver' && trip.driverId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const completedTrip = await transportService.completeTrip(id, req.user.id, finalStops);

        res.json({
            trip: completedTrip,
            message: 'Trip completed successfully'
        });
    } catch (error) {
        logger.error('Failed to complete trip:', error);
        res.status(500).json({ error: 'Failed to complete trip' });
    }
});

/**
 * POST /api/transport/trips/:id/incidents
 * Report an incident during a trip
 */
router.post('/trips/:id/incidents', async (req, res) => {
    try {
        const { id } = req.params;
        const incidentRequest: IncidentReportRequest = {
            ...req.body,
            tripId: id
        };

        // Validate request
        if (!incidentRequest.incidentType || !incidentRequest.severity || !incidentRequest.description) {
            return res.status(400).json({ error: 'Incident type, severity, and description are required' });
        }

        const incident = await transportService.reportIncident(incidentRequest, req.user.id);

        res.status(201).json({
            incident,
            message: 'Incident reported successfully'
        });
    } catch (error) {
        logger.error('Failed to report incident:', error);
        res.status(500).json({ error: 'Failed to report incident' });
    }
});

/**
 * POST /api/transport/routes/optimize
 * Optimize a route for given worker locations
 */
router.post('/routes/optimize', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const {
            workerIds,
            optimizationConfig,
            constraints,
            startLocation
        }: {
            workerIds: string[];
            optimizationConfig: RouteOptimizationConfig;
            constraints: RouteConstraints;
            startLocation?: { latitude: number; longitude: number };
        } = req.body;

        if (!workerIds || workerIds.length === 0) {
            return res.status(400).json({ error: 'Worker IDs are required' });
        }

        // Get current worker locations
        const workerLocations = await locationService.getWorkerCurrentLocations(workerIds);

        // Convert to optimization format
        const locations = workerLocations.map(worker => ({
            id: worker.userId,
            latitude: worker.coordinates.latitude,
            longitude: worker.coordinates.longitude
        }));

        const result = await routeOptimizationService.optimizeRoute(
            locations,
            optimizationConfig,
            constraints,
            startLocation
        );

        res.json({
            optimization: result,
            message: 'Route optimized successfully'
        });
    } catch (error) {
        logger.error('Failed to optimize route:', error);
        res.status(500).json({ error: 'Failed to optimize route' });
    }
});

/**
 * GET /api/transport/drivers/capacity
 * Get driver capacity information
 */
router.get('/drivers/capacity', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { available_only = 'true' } = req.query;

        const capacities = await transportService.getDriverCapacities(
            available_only === 'true'
        );

        res.json({
            capacities,
            count: capacities.length,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('Failed to get driver capacities:', error);
        res.status(500).json({ error: 'Failed to retrieve driver capacities' });
    }
});

/**
 * POST /api/transport/trips/:id/assign-driver
 * Assign a driver to a trip
 */
router.post('/trips/:id/assign-driver', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { id } = req.params;
        const { driverId } = req.body;

        if (!driverId) {
            return res.status(400).json({ error: 'Driver ID is required' });
        }

        const updatedTrip = await transportService.assignDriver(id, driverId, req.user.id);

        res.json({
            trip: updatedTrip,
            message: 'Driver assigned successfully'
        });
    } catch (error) {
        logger.error('Failed to assign driver:', error);
        res.status(500).json({ error: 'Failed to assign driver' });
    }
});

/**
 * GET /api/transport/dashboard/stats
 * Get real-time dashboard statistics
 */
router.get('/dashboard/stats', async (req, res) => {
    try {
        const { role } = req.user;

        if (!['dispatcher', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const stats = await transportService.getDashboardStats();

        res.json({
            stats,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('Failed to get dashboard stats:', error);
        res.status(500).json({ error: 'Failed to retrieve dashboard statistics' });
    }
});

export default router;