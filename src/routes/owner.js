// DeCrown Worker Transportation - Owner Routes
// Admin/audit endpoints (Owner access)

const express = require('express');
const router = express.Router();

// Middleware
const { authenticateOwner } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditMiddleware');
const { dryRunToggle } = require('../middleware/dryRunMiddleware');

// Controllers
const ownerController = require('../controllers/ownerController');

// Apply authentication to all owner routes
router.use(authenticateOwner);
router.use(auditLog('owner'));

/**
 * @route   GET /api/owner/audit-trail
 * @desc    Get system-wide logs for compliance
 * @access  Owner
 */
router.get('/audit-trail', ownerController.getAuditTrail);

/**
 * @route   POST /api/owner/update-branding
 * @desc    Update logo, color palette, and public metadata
 * @access  Owner
 */
router.post('/update-branding', dryRunToggle, ownerController.updateBranding);

/**
 * @route   GET /api/owner/system-health
 * @desc    Get comprehensive system health metrics
 * @access  Owner
 */
router.get('/system-health', ownerController.getSystemHealth);

/**
 * @route   GET /api/owner/users
 * @desc    Get all users (workers, dispatchers, drivers)
 * @access  Owner
 */
router.get('/users', ownerController.getAllUsers);

/**
 * @route   POST /api/owner/user
 * @desc    Create new user with role assignment
 * @access  Owner
 */
router.post('/user', dryRunToggle, ownerController.createUser);

/**
 * @route   PUT /api/owner/user/:id
 * @desc    Update user information and permissions
 * @access  Owner
 */
router.put('/user/:id', dryRunToggle, ownerController.updateUser);

/**
 * @route   DELETE /api/owner/user/:id
 * @desc    Deactivate user account
 * @access  Owner
 */
router.delete('/user/:id', dryRunToggle, ownerController.deactivateUser);

/**
 * @route   GET /api/owner/reports
 * @desc    Get comprehensive business reports
 * @access  Owner
 */
router.get('/reports', ownerController.getReports);

/**
 * @route   GET /api/owner/financial
 * @desc    Get financial analytics and payment data
 * @access  Owner
 */
router.get('/financial', ownerController.getFinancialData);

/**
 * @route   POST /api/owner/config
 * @desc    Update system configuration
 * @access  Owner
 */
router.post('/config', dryRunToggle, ownerController.updateConfig);

/**
 * @route   GET /api/owner/compliance
 * @desc    Get compliance reports and certifications
 * @access  Owner
 */
router.get('/compliance', ownerController.getComplianceReports);

/**
 * @route   POST /api/owner/backup
 * @desc    Trigger system backup
 * @access  Owner
 */
router.post('/backup', dryRunToggle, ownerController.triggerBackup);

/**
 * @route   GET /api/owner/security-logs
 * @desc    Get security audit logs
 * @access  Owner
 */
router.get('/security-logs', ownerController.getSecurityLogs);

module.exports = router;
