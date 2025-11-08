// DeCrown Worker Transportation - Worker Routes
// Worker-facing endpoints (Userfront)

const express = require('express');
const router = express.Router();

// Middleware
const { authenticateWorker } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditMiddleware');
const { dryRunToggle } = require('../middleware/dryRunMiddleware');

// Controllers
const workerController = require('../controllers/workerController');

// Apply authentication to all worker routes
router.use(authenticateWorker);
router.use(auditLog('worker'));

/**
 * @route   GET /api/worker/location
 * @desc    Get current location of assigned transport
 * @access  Worker
 */
router.get('/location', workerController.getLocation);

/**
 * @route   POST /api/worker/book-ride
 * @desc    Book a ride with route and time
 * @access  Worker
 */
router.post('/book-ride', dryRunToggle, workerController.bookRide);

/**
 * @route   GET /api/worker/rides
 * @desc    Get worker's ride history
 * @access  Worker
 */
router.get('/rides', workerController.getRideHistory);

/**
 * @route   GET /api/worker/profile
 * @desc    Get worker profile information
 * @access  Worker
 */
router.get('/profile', workerController.getProfile);

/**
 * @route   PUT /api/worker/profile
 * @desc    Update worker profile
 * @access  Worker
 */
router.put('/profile', dryRunToggle, workerController.updateProfile);

/**
 * @route   GET /api/worker/schedule
 * @desc    Get worker's transportation schedule
 * @access  Worker
 */
router.get('/schedule', workerController.getSchedule);

/**
 * @route   POST /api/worker/check-in
 * @desc    Check in for scheduled ride
 * @access  Worker
 */
router.post('/check-in', dryRunToggle, workerController.checkIn);

/**
 * @route   GET /api/worker/eta
 * @desc    Get estimated time of arrival for current ride
 * @access  Worker
 */
router.get('/eta', workerController.getETA);

module.exports = router;
