import { Request, Response, NextFunction } from 'express';
import { encryptionService } from '@/services/encryptionService';
import { auditService } from '@/services/auditService';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getDatabase } from '@/config/database';

export interface SecurityRequest extends Request {
    correlationId: string;
    deviceFingerprint?: string;
    securityContext: {
        riskScore: number;
        trustLevel: 'low' | 'medium' | 'high';
        requiresAdditionalAuth: boolean;
    };
}

/**
 * Enhanced security headers middleware
 */
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

/**
 * Rate limiting configurations
 */
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts, please try again later',
            retryAfter: 15 * 60
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip + ':' + (req.body?.email || 'unknown');
    }
});

export const apiRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            retryAfter: 60
        }
    },
    keyGenerator: (req: any) => {
        return req.user?.id || req.ip;
    }
});

export const sensitiveApiRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute for sensitive operations
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many sensitive operations, please try again later',
            retryAfter: 60
        }
    },
    keyGenerator: (req: any) => {
        return req.user?.id || req.ip;
    }
});

/**
 * Device fingerprinting middleware
 */
export const deviceFingerprinting = (req: SecurityRequest, res: Response, next: NextFunction) => {
    const fingerprint = req.headers['x-device-fingerprint'] as string;
    const userAgent = req.headers['user-agent'];
    const acceptLanguage = req.headers['accept-language'];
    const acceptEncoding = req.headers['accept-encoding'];

    // Generate device fingerprint if not provided
    if (!fingerprint && userAgent) {
        const fingerprintData = {
            userAgent,
            acceptLanguage,
            acceptEncoding,
            ip: req.ip
        };
        req.deviceFingerprint = encryptionService.hashForSearch(JSON.stringify(fingerprintData));
    } else {
        req.deviceFingerprint = fingerprint;
    }

    next();
};

/**
 * Security context middleware
 */
export const securityContext = async (req: SecurityRequest, res: Response, next: NextFunction) => {
    try {
        const db = getDatabase();
        let riskScore = 0;
        let trustLevel: 'low' | 'medium' | 'high' = 'medium';
        let requiresAdditionalAuth = false;

        // Check for suspicious patterns
        const suspiciousPatterns = [
            /script/i,
            /javascript/i,
            /vbscript/i,
            /onload/i,
            /onerror/i,
            /<.*>/,
            /union.*select/i,
            /drop.*table/i
        ];

        const requestBody = JSON.stringify(req.body || {});
        const requestQuery = JSON.stringify(req.query || {});
        const requestPath = req.path;

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(requestBody) || pattern.test(requestQuery) || pattern.test(requestPath)) {
                riskScore += 20;
            }
        }

        // Check IP reputation (simplified)
        const clientIP = req.ip;
        if (clientIP && (clientIP.includes('tor') || clientIP.includes('proxy'))) {
            riskScore += 15;
        }

        // Check device trust level
        if (req.user && req.deviceFingerprint) {
            const device = await db('devices')
                .where('user_id', req.user.id)
                .where('fingerprint', req.deviceFingerprint)
                .first();

            if (device) {
                if (device.trust_level === 'trusted') {
                    riskScore -= 10;
                    trustLevel = 'high';
                } else if (device.trust_level === 'suspicious') {
                    riskScore += 25;
                    trustLevel = 'low';
                }
            } else {
                // New device
                riskScore += 10;
                requiresAdditionalAuth = true;
            }
        }

        // Check for recent failed attempts
        if (req.user) {
            const recentFailures = await db('audit_events')
                .where('actor_id', req.user.id)
                .where('action', 'like', '%_failed')
                .where('timestamp', '>', new Date(Date.now() - 60 * 60 * 1000))
                .count('* as count');

            const failureCount = parseInt(recentFailures[0].count as string);
            if (failureCount > 3) {
                riskScore += failureCount * 5;
                requiresAdditionalAuth = true;
            }
        }

        // Determine trust level based on risk score
        if (riskScore > 50) {
            trustLevel = 'low';
            requiresAdditionalAuth = true;
        } else if (riskScore > 20) {
            trustLevel = 'medium';
        } else {
            trustLevel = 'high';
        }

        req.securityContext = {
            riskScore,
            trustLevel,
            requiresAdditionalAuth
        };

        // Log high-risk requests
        if (riskScore > 30) {
            await auditService.logEvent({
                correlationId: req.correlationId,
                actor: {
                    id: req.user?.id || 'anonymous',
                    role: req.user?.role || 'anonymous',
                    ipAddress: clientIP
                },
                action: 'high_risk_request_detected',
                entityType: 'security',
                entityId: 'risk_assessment',
                metadata: {
                    riskScore,
                    trustLevel,
                    path: req.path,
                    method: req.method,
                    userAgent: req.headers['user-agent']
                }
            });
        }

        next();
    } catch (error) {
        console.error('Security context middleware error:', error);
        // Don't block request on security context errors
        req.securityContext = {
            riskScore: 50,
            trustLevel: 'medium',
            requiresAdditionalAuth: false
        };
        next();
    }
};

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
            // Remove potentially dangerous characters
            return value
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<.*?>/g, '')
                .replace(/javascript:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
        } else if (typeof value === 'object' && value !== null) {
            const sanitized: any = Array.isArray(value) ? [] : {};
            for (const key in value) {
                sanitized[key] = sanitizeValue(value[key]);
            }
            return sanitized;
        }
        return value;
    };

    if (req.body) {
        req.body = sanitizeValue(req.body);
    }

    if (req.query) {
        req.query = sanitizeValue(req.query);
    }

    next();
};

/**
 * SQL injection prevention middleware
 */
export const preventSQLInjection = (req: Request, res: Response, next: NextFunction) => {
    const sqlInjectionPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
        /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
        /(;|\||&)/g,
        /('|(\\')|('')|(%27)|(%2527))/gi,
        /(--|\#|\/\*|\*\/)/gi
    ];

    const checkForSQLInjection = (value: any): boolean => {
        if (typeof value === 'string') {
            return sqlInjectionPatterns.some(pattern => pattern.test(value));
        } else if (typeof value === 'object' && value !== null) {
            return Object.values(value).some(checkForSQLInjection);
        }
        return false;
    };

    const requestData = { ...req.body, ...req.query, ...req.params };

    if (checkForSQLInjection(requestData)) {
        return res.status(400).json({
            error: {
                code: 'POTENTIAL_SQL_INJECTION',
                message: 'Request contains potentially malicious content',
                correlationId: (req as any).correlationId
            }
        });
    }

    next();
};

/**
 * CSRF protection middleware
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for GET requests and API endpoints with proper authentication
    if (req.method === 'GET' || req.path.startsWith('/api/')) {
        return next();
    }

    const csrfToken = req.headers['x-csrf-token'] as string;
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!csrfToken || !sessionToken) {
        return res.status(403).json({
            error: {
                code: 'CSRF_TOKEN_REQUIRED',
                message: 'CSRF token is required for this operation',
                correlationId: (req as any).correlationId
            }
        });
    }

    // Verify CSRF token (simplified - in production, use proper CSRF library)
    const expectedToken = encryptionService.hashForSearch(sessionToken + req.ip);
    if (csrfToken !== expectedToken) {
        return res.status(403).json({
            error: {
                code: 'INVALID_CSRF_TOKEN',
                message: 'Invalid CSRF token',
                correlationId: (req as any).correlationId
            }
        });
    }

    next();
};

/**
 * Additional authentication requirement middleware
 */
export const requireAdditionalAuth = (req: SecurityRequest, res: Response, next: NextFunction) => {
    if (req.securityContext?.requiresAdditionalAuth) {
        return res.status(403).json({
            error: {
                code: 'ADDITIONAL_AUTH_REQUIRED',
                message: 'Additional authentication required for this operation',
                correlationId: req.correlationId,
                metadata: {
                    riskScore: req.securityContext.riskScore,
                    trustLevel: req.securityContext.trustLevel
                }
            }
        });
    }

    next();
};

/**
 * Sensitive operation protection
 */
export const protectSensitiveOperation = [
    sensitiveApiRateLimit,
    requireAdditionalAuth,
    (req: SecurityRequest, res: Response, next: NextFunction) => {
        // Log sensitive operations
        auditService.logEvent({
            correlationId: req.correlationId,
            actor: {
                id: req.user?.id || 'anonymous',
                role: req.user?.role || 'anonymous',
                ipAddress: req.ip
            },
            action: 'sensitive_operation_attempted',
            entityType: 'security',
            entityId: 'sensitive_operation',
            metadata: {
                path: req.path,
                method: req.method,
                riskScore: req.securityContext.riskScore
            }
        }).catch(console.error);

        next();
    }
];