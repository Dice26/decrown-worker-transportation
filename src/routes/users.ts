import { Router } from 'express';
import { UserService, UserUpdateData, ConsentUpdateData } from '@/services/userService';
import { authMiddleware, requirePermission } from '@/middleware/auth';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest } from '@/types/auth';

const router = Router();
const userService = new UserService();

// Apply authentication middleware to all user routes
router.use(authMiddleware);

/**
 * Get current user profile
 * GET /api/users/me
 */
router.get('/me', async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const user = await userService.getUserById(userId);

        if (!user) {
            throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Failed to get user profile', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update current user profile
 * PUT /api/users/me
 */
router.put('/me', requirePermission('profile:update'), async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const updateData: UserUpdateData = req.body;

        // Users can only update their own profile (except admins)
        const user = await userService.updateUser(userId, updateData);

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Failed to update user profile', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Update user consent preferences
 * PUT /api/users/me/consent
 */
router.put('/me/consent', requirePermission('profile:update'), async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const consentData: ConsentUpdateData = req.body;

        const updatedConsent = await userService.updateConsent(userId, consentData);

        res.json({
            success: true,
            data: updatedConsent,
            message: 'Consent preferences updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update user consent', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Get user consent history
 * GET /api/users/me/consent/history
 */
router.get('/me/consent/history', requirePermission('profile:read'), async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const consentHistory = await userService.getConsentHistory(userId);

        res.json({
            success: true,
            data: consentHistory
        });
    } catch (error) {
        logger.error('Failed to get consent history', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Change password
 * POST /api/users/me/change-password
 */
router.post('/me/change-password', requirePermission('profile:update'), async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError('Current password and new password are required', 400, 'VALIDATION_ERROR');
        }

        if (newPassword.length < 8) {
            throw new AppError('New password must be at least 8 characters long', 400, 'VALIDATION_ERROR');
        }

        await userService.changePassword(userId, currentPassword, newPassword);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.error('Failed to change password', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Verify email address
 * POST /api/users/verify-email
 */
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            throw new AppError('Verification token is required', 400, 'VALIDATION_ERROR');
        }

        const verified = await userService.verifyEmail(token);

        res.json({
            success: true,
            data: { verified },
            message: 'Email verified successfully'
        });
    } catch (error) {
        logger.error('Failed to verify email', {
            error: error.message,
            correlationId: req.headers['x-correlation-id']
        });
        throw error;
    }
});

/**
 * Resend email verification
 * POST /api/users/resend-verification
 */
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
        }

        await userService.resendEmailVerification(email);

        res.json({
            success: true,
            message: 'Verification email sent successfully'
        });
    } catch (error) {
        logger.error('Failed to resend verification email', {
            error: error.message,
            email: req.body?.email,
            correlationId: req.headers['x-correlation-id']
        });
        throw error;
    }
});

/**
 * Deactivate current user account
 * DELETE /api/users/me
 */
router.delete('/me', requirePermission('profile:update'), async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;

        await userService.deactivateUser(userId);

        res.json({
            success: true,
            message: 'Account deactivated successfully'
        });
    } catch (error) {
        logger.error('Failed to deactivate user account', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Admin only: Get user by ID
 * GET /api/users/:userId
 */
router.get('/:userId', requirePermission('users:read'), async (req: AuthenticatedRequest, res) => {
    try {
        const { userId } = req.params;
        const user = await userService.getUserById(userId);

        if (!user) {
            throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Failed to get user by ID', {
            error: error.message,
            targetUserId: req.params.userId,
            requesterId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Admin only: Update user by ID
 * PUT /api/users/:userId
 */
router.put('/:userId', requirePermission('users:update'), async (req: AuthenticatedRequest, res) => {
    try {
        const { userId } = req.params;
        const updateData: UserUpdateData = req.body;

        const user = await userService.updateUser(userId, updateData);

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Failed to update user by ID', {
            error: error.message,
            targetUserId: req.params.userId,
            requesterId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Admin only: Suspend user
 * POST /api/users/:userId/suspend
 */
router.post('/:userId/suspend', requirePermission('users:suspend'), async (req: AuthenticatedRequest, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            throw new AppError('Reason is required for suspending user', 400, 'VALIDATION_ERROR');
        }

        await userService.suspendUser(userId, reason);

        res.json({
            success: true,
            message: 'User suspended successfully'
        });
    } catch (error) {
        logger.error('Failed to suspend user', {
            error: error.message,
            targetUserId: req.params.userId,
            requesterId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

/**
 * Check consent compliance for current user
 * GET /api/users/me/consent/compliance
 */
router.get('/me/consent/compliance', requirePermission('profile:read'), async (req: AuthenticatedRequest, res) => {
    try {
        const userId = req.user.id;
        const isCompliant = await userService.checkConsentCompliance(userId);

        res.json({
            success: true,
            data: {
                userId,
                isCompliant,
                message: isCompliant ? 'Consent is compliant' : 'Consent update required'
            }
        });
    } catch (error) {
        logger.error('Failed to check consent compliance', {
            error: error.message,
            userId: req.user?.id,
            correlationId: req.correlationId
        });
        throw error;
    }
});

export default router;