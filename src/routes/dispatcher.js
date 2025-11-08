// DeCrown Worker Transportation - Dispatcher Routes
// Dispatcher tools (Adminfront)

const express = require('express');
const router = express.Router();

// Middleware
const { authenticateDispatcher } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditMiddleware');
const { dryRunToggle } = require('../middleware/dryRunMiddleware');

// Controllers
const dispatcherController = require('../controllers/dispatcherController');

// Apply authentication to all dispatcher routes
router.use(authenticateDispatcher);
router.use(auditLog('dispatcher'));

/**
 * @route   GET /api/dispatcher/logs
 * @desc    Get ride logs, timestamps, and status
 * @access  Dispatcher
 */
router.get('/logs', dispatcherController.getLogs);

/**
 * @route   POST /api/dispatcher/assign-route
 * @desc    Assign route to driver with ETA
 * @access  Dispatcher
 */
router.post('/assign-route', dryRunToggle, dispatcherController.assignRoute);

/**
 * @route   GET /api/dispatcher/active-rides
 * @desc    Get all active rides in real-time
 * @access  Dispatcher
 */
router.get('/active-rides', dispatcherController.getActiveRides);

/**
 * @route   GET /api/dispatcher/drivers
 * @desc    Get all available drivers
 * @access  Dispatcher
 */
router.get('/drivers', dispatcherController.getDrivers);

/**
 * @route   PUT /api/dispatcher/driver/:id/status
 * @desc    Update driver status (available, busy, offline)
 * @access  Dispatcher
 */
router.put('/driver/:id/status', dryRunToggle, dispatcherController.updateDriverStatus);

/**
 * @route   GET /api/dispatcher/routes
 * @desc    Get all routes and their assignments
 * @access  Dispatcher
 */
router.get('/routes', dispatcherController.getRoutes);

/**
 * @route   POST /api/dispatcher/optimize-routes
 * @desc    Optimize routes based on current conditions
 * @access  Dispatcher
 */
router.post('/optimize-routes', dryRunToggle, dispatcherController.optimizeRoutes);

/**
 * @route   GET /api/dispatcher/analytics
 * @desc    Get dispatcher analytics and metrics
 * @access  Dispatcher
 */
router.get('/analytics', dispatcherController.getAnalytics);

/**
 * @route   POST /api/dispatcher/emergency
 * @desc    Handle emergency situations
 * @access  Dispatcher
 */
router.post('/emergency', dispatcherController.handleEmergency);

/**
 * @route   GET /api/dispatcher/workers
 * @desc    Get all workers and their status
 * @access  Dispatcher
 */
router.get('/workers', dispatcherController.getWorkers);

module.exports = router;
