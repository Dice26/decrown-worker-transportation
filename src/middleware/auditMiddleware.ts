import { Request, Response, NextFunction } from 'express';
import { auditService } from '@/services/auditService';
import { AuthenticatedRequest } from '@/types/auth';
import { AuditAction } from '@/types/audit';
import { logger } from '@/utils/logger';

interface AuditableRequest extends AuthenticatedRequest {
    auditAction?: AuditAction;
    auditEntityType?: string;
    auditEntityId?: string;
    auditMetadata?: Record<string, any>;
    originalBody?: any;
}

/**
 * Middleware to automatically log audit events for API requests
 */
export function auditMiddleware(
    action: AuditAction,
    entityType: string,
    getEntityId?: (req: AuditableRequest) => string
) {
    return async (req: AuditableRequest, res: Response, next: NextFunction) => {
        // Store original body for diff tracking
        req.originalBody = req.body ? JSON.parse(JSON.stringify(req.body)) : undefined;

        // Store audit information for post-processing
        req.auditAction = action;
        req.auditEntityType = entityType;
        req.auditEntityId = getEntityId ? getEntityId(req) : req.params.id;
        req.auditMetadata = {
            method: req.method,
            path: req.path,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        };

        // Override res.json to capture response data
        const originalJson = res.json;
        res.json = function (body: any) {
            // Log audit event after successful response
            if (res.statusCode >= 200 && res.statusCode < 300) {
                setImmediate(async () => {
                    try {
                        await logAuditEvent(req, body);
                    } catch (error) {
                        logger.error('Failed to log audit event in middleware', {
                            error: error.message,
                            correlationId: req.correlationId
                        });
                    }
                });
            }

            return originalJson.call(this, body);
        };

        next();
    };
}

/**
 * Log audit event with request/response data
 */
async function logAuditEvent(req: AuditableRequest, responseBody: any): Promise<void> {
    if (!req.user || !req.auditAction) {
        return;
    }

    const diff = createDiff(req, responseBody);

    await auditService.logEvent({
        correlationId: req.correlationId,
        actor: {
            id: req.user.id,
            role: req.user.role,
            ipAddress: req.ip
        },
        action: req.auditAction,
        entityType: req.auditEntityType!,
        entityId: req.auditEntityId || 'unknown',
        diff,
        metadata: {
            ...req.auditMetadata,
            requestSize: JSON.stringify(req.body || {}).length,
            responseSize: JSON.stringify(responseBody || {}).length,
            processingTime: Date.now() - parseInt(req.correlationId.split('_')[1])
        }
    });
}

/**
 * Create diff object for before/after comparison
 */
function createDiff(req: AuditableRequest, responseBody: any): { before: any; after: any } | undefined {
    const method = req.method.toUpperCase();

    if (method === 'POST') {
        // For creation, before is empty, after is the created entity
        return {
            before: null,
            after: responseBody
        };
    } else if (method === 'PUT' || method === 'PATCH') {
        // For updates, before is original body, after is response
        return {
            before: req.originalBody,
            after: responseBody
        };
    } else if (method === 'DELETE') {
        // For deletion, before is the entity, after is null
        return {
            before: responseBody,
            after: null
        };
    }

    // For GET requests, no diff needed
    return undefined;
}

/**
 * Manual audit logging function for custom events
 */
export async function logAuditEvent(
    req: AuthenticatedRequest,
    action: AuditAction,
    entityType: string,
    entityId: string,
    metadata?: Record<string, any>,
    diff?: { before: any; after: any }
): Promise<void> {
    try {
        await auditService.logEvent({
            correlationId: req.correlationId,
            actor: {
                id: req.user.id,
                role: req.user.role,
                ipAddress: req.ip
            },
            action,
            entityType,
            entityId,
            diff,
            metadata: {
                method: req.method,
                path: req.path,
                userAgent: req.get('User-Agent'),
                ...metadata
            }
        });
    } catch (error) {
        logger.error('Failed to log manual audit event', {
            error: error.message,
            action,
            entityType,
            entityId,
            correlationId: req.correlationId
        });
        throw error;
    }
}

/**
 * Audit decorator for service methods
 */
export function auditServiceCall(
    action: AuditAction,
    entityType: string,
    getEntityId: (args: any[]) => string = (args) => args[0]
) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const correlationId = `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const entityId = getEntityId(args);

            try {
                const result = await method.apply(this, args);

                // Log successful service call
                await auditService.logEvent({
                    correlationId,
                    actor: {
                        id: 'system',
                        role: 'system'
                    },
                    action,
                    entityType,
                    entityId,
                    metadata: {
                        service: target.constructor.name,
                        method: propertyName,
                        success: true
                    }
                });

                return result;
            } catch (error) {
                // Log failed service call
                await auditService.logEvent({
                    correlationId,
                    actor: {
                        id: 'system',
                        role: 'system'
                    },
                    action: `${action}.failed` as AuditAction,
                    entityType,
                    entityId,
                    metadata: {
                        service: target.constructor.name,
                        method: propertyName,
                        success: false,
                        error: error.message
                    }
                });

                throw error;
            }
        };
    };
}