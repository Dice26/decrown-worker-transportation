import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { AuthService } from '@/services/authService';
import { asyncHandler, AppError } from '@/middleware/errorHandler';
import { authRateLimit, strictRateLimit } from '@/middleware/rateLimiter';
import { authenticateToken } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest, LoginRequest, RegisterRequest } from '@/types/auth';

const router = Router();
const authService = new AuthService();

// Validation schemas
const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    deviceFingerprint: Joi.string().optional()
});

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
        .messages({
            'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
        }),
    role: Joi.string().valid('worker', 'driver', 'dispatcher', 'finance', 'admin').required(),
    department: Joi.string().min(2).max(100).required(),
    deviceFingerprint: Joi.string().optional()
});

const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required()
});

// Validation middleware
function validateRequest(schema: Joi.ObjectSchema) {
    return (req: Request, res: Response, next: Function) => {
        const { error } = schema.validate(req.body);
        if (error) {
            throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
        }
        next();
    };
}

// POST /api/v1/auth/register
router.post('/register',
    strictRateLimit,
    validateRequest(registerSchema),
    asyncHandler(async (req: Request, res: Response) => {
        const registerData: RegisterRequest = req.body;

        const user = await authService.register(registerData);

        logger.info('User registration successful', {
            userId: user.id,
            email: user.email,
            correlationId: req.headers['x-correlation-id']
        });

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                department: user.department,
                status: user.status
            }
        });
    })
);

// POST /api/v1/auth/login
router.post('/login',
    authRateLimit,
    validateRequest(loginSchema),
    asyncHandler(async (req: Request, res: Response) => {
        const loginData: LoginRequest = req.body;

        const tokens = await authService.login(loginData);

        logger.info('User login successful', {
            email: loginData.email,
            correlationId: req.headers['x-correlation-id']
        });

        res.json({
            message: 'Login successful',
            ...tokens
        });
    })
);

// POST /api/v1/auth/refresh
router.post('/refresh',
    authRateLimit,
    validateRequest(refreshTokenSchema),
    asyncHandler(async (req: Request, res: Response) => {
        const { refreshToken } = req.body;

        const tokens = await authService.refreshToken(refreshToken);

        res.json({
            message: 'Token refreshed successfully',
            ...tokens
        });
    })
);

// POST /api/v1/auth/logout
router.post('/logout',
    validateRequest(refreshTokenSchema),
    asyncHandler(async (req: Request, res: Response) => {
        const { refreshToken } = req.body;

        await authService.logout(refreshToken);

        res.json({
            message: 'Logout successful'
        });
    })
);

// GET /api/v1/auth/me
router.get('/me',
    authenticateToken,
    asyncHandler(async (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;

        res.json({
            user: {
                id: authReq.user.id,
                email: authReq.user.email,
                role: authReq.user.role,
                permissions: authReq.user.permissions
            }
        });
    })
);

// POST /api/v1/auth/verify-token
router.post('/verify-token',
    asyncHandler(async (req: Request, res: Response) => {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            throw new AppError('Token required', 400, 'MISSING_TOKEN');
        }

        const payload = await authService.validateAccessToken(token);

        res.json({
            valid: true,
            payload: {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
                permissions: payload.permissions,
                expiresAt: new Date(payload.exp * 1000)
            }
        });
    })
);

export default router;