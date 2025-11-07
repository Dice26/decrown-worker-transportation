import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/authService';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest } from '@/types/auth';

const authService = new AuthService();

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        throw new AppError('Access token required', 401, 'MISSING_TOKEN');
    }

    authService.validateAccessToken(token)
        .then(payload => {
            // Add user info to request
            (req as AuthenticatedRequest).user = {
                id: payload.userId,
                email: payload.email,
                role: payload.role,
                permissions: payload.permissions
            };

            (req as AuthenticatedRequest).correlationId = req.headers['x-correlation-id'] as string;

            next();
        })
        .catch(error => {
            logger.warn('Token validation failed', {
                error: error.message,
                correlationId: req.headers['x-correlation-id']
            });
            next(error);
        });
}

export function requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthenticatedRequest;

        if (!authReq.user) {
            throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
        }

        const hasPermission = authService.hasPermission(authReq.user.permissions, permission);

        if (!hasPermission) {
            logger.warn('Permission denied', {
                userId: authReq.user.id,
                requiredPermission: permission,
                userPermissions: authReq.user.permissions,
                correlationId: authReq.correlationId
            });

            throw new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
        }

        next();
    };
}

export function requireRole(role: string | string[]) {
    const roles = Array.isArray(role) ? role : [role];

    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthenticatedRequest;

        if (!authReq.user) {
            throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
        }

        if (!roles.includes(authReq.user.role)) {
            logger.warn('Role access denied', {
                userId: authReq.user.id,
                userRole: authReq.user.role,
                requiredRoles: roles,
                correlationId: authReq.correlationId
            });

            throw new AppError('Insufficient role permissions', 403, 'INSUFFICIENT_ROLE');
        }

        next();
    };
}

// Alias for backward compatibility
export const authenticateToken = authMiddleware;

// Optional authentication - adds user info if token is valid, but doesn't require it
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    authService.validateAccessToken(token)
        .then(payload => {
            (req as AuthenticatedRequest).user = {
                id: payload.userId,
                email: payload.email,
                role: payload.role,
                permissions: payload.permissions
            };
            next();
        })
        .catch(() => {
            // Invalid token, but we don't fail the request
            next();
        });
}