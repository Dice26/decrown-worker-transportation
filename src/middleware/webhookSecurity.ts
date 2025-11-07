import { Request, Response, NextFunction } from 'express';
import { WebhookSecurityService } from '@/services/webhookSecurityService';
import { logger } from '@/utils/logger';
import { getDatabase } from '@/config/database';

export interface WebhookRequest extends Request {
    webhook?: {
        provider: string;
        eventId: string;
        timestamp?: Date;
        validated: boolean;
    };
}

/**
 * Middleware for webhook security validation
 */
export class WebhookSecurityMiddleware {
    private webhookSecurity: WebhookSecurityService;
    private db = getDatabase();

    constructor() {
        this.webhookSecurity = new WebhookSecurityService();
    }

    /**
     * Validate webhook signature and prevent replay attacks
     */
    validateWebhook = (provider: string) => {
        return async (req: WebhookRequest, res: Response, next: NextFunction) => {
            try {
                const signature = this.extractSignature(req, provider);
                const timestamp = this.extractTimestamp(req, provider);

                if (!signature) {
                    await this.logSecurityEvent(provider, 'unknown', 'invalid_signature', 'Missing signature', req);
                    return res.status(400).json({
                        error: 'Missing webhook signature',
                        code: 'MISSING_SIGNATURE'
                    });
                }

                // Validate webhook
                const validation = await this.webhookSecurity.validateWebhook(
                    provider,
                    req.body,
                    signature,
                    timestamp
                );

                if (!validation.isValid) {
                    await this.logSecurityEvent(
                        provider,
                        'unknown',
                        'invalid_signature',
                        validation.error || 'Validation failed',
                        req
                    );

                    return res.status(401).json({
                        error: 'Invalid webhook signature',
                        code: 'INVALID_SIGNATURE',
                        details: validation.error
                    });
                }

                // Check for duplicate events
                if (validation.eventId) {
                    const isDuplicate = await this.webhookSecurity.isDuplicateEvent(validation.eventId);

                    if (isDuplicate) {
                        await this.logSecurityEvent(
                            provider,
                            req.body.type || 'unknown',
                            'duplicate',
                            'Duplicate event detected',
                            req
                        );

                        // Return success for duplicate events to prevent retries
                        return res.status(200).json({
                            message: 'Event already processed',
                            code: 'DUPLICATE_EVENT'
                        });
                    }

                    // Store event for deduplication
                    await this.storeDeduplicationRecord(
                        validation.eventId,
                        provider,
                        req.body.type || 'unknown'
                    );
                }

                // Add webhook info to request
                req.webhook = {
                    provider,
                    eventId: validation.eventId || 'unknown',
                    timestamp: validation.timestamp,
                    validated: true
                };

                await this.logSecurityEvent(
                    provider,
                    req.body.type || 'unknown',
                    'valid',
                    'Webhook validated successfully',
                    req
                );

                next();
            } catch (error) {
                logger.error('Webhook validation error:', error);

                await this.logSecurityEvent(
                    provider,
                    'unknown',
                    'error',
                    error instanceof Error ? error.message : 'Unknown error',
                    req
                );

                res.status(500).json({
                    error: 'Webhook validation failed',
                    code: 'VALIDATION_ERROR'
                });
            }
        };
    };

    /**
     * Rate limiting for webhook endpoints
     */
    rateLimitWebhooks = (maxRequestsPerMinute: number = 100) => {
        const requestCounts = new Map<string, { count: number; resetTime: number }>();

        return (req: Request, res: Response, next: NextFunction) => {
            const clientIp = this.getClientIp(req);
            const now = Date.now();
            const windowStart = Math.floor(now / 60000) * 60000; // 1-minute window

            const current = requestCounts.get(clientIp);

            if (!current || current.resetTime !== windowStart) {
                requestCounts.set(clientIp, { count: 1, resetTime: windowStart });
                return next();
            }

            if (current.count >= maxRequestsPerMinute) {
                logger.warn('Webhook rate limit exceeded', {
                    clientIp,
                    count: current.count,
                    limit: maxRequestsPerMinute
                });

                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil((windowStart + 60000 - now) / 1000)
                });
            }

            current.count++;
            next();
        };
    };

    /**
     * Middleware to store webhook events for processing
     */
    storeWebhookEvent = async (req: WebhookRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.webhook?.validated) {
                return next();
            }

            const { provider, eventId } = req.webhook;
            const eventType = req.body.type || 'unknown';
            const signature = this.extractSignature(req, provider) || '';

            // Store webhook event
            const webhookId = await this.webhookSecurity.storeWebhookEvent(
                provider,
                eventType,
                req.body,
                signature,
                eventId,
                req.webhook.timestamp
            );

            // Add webhook ID to request for processing
            req.webhook.webhookId = webhookId;

            next();
        } catch (error) {
            logger.error('Failed to store webhook event:', error);

            // Don't fail the request, just log the error
            next();
        }
    };

    /**
     * Error handler for webhook processing
     */
    handleWebhookError = async (
        error: Error,
        req: WebhookRequest,
        res: Response,
        next: NextFunction
    ) => {
        logger.error('Webhook processing error:', error);

        // Mark webhook event as failed if we have the webhook ID
        if (req.webhook?.webhookId) {
            try {
                await this.webhookSecurity.markEventProcessed(
                    req.webhook.webhookId,
                    false,
                    error.message
                );
            } catch (markError) {
                logger.error('Failed to mark webhook event as failed:', markError);
            }
        }

        // Log security event
        if (req.webhook?.provider) {
            await this.logSecurityEvent(
                req.webhook.provider,
                req.body?.type || 'unknown',
                'error',
                error.message,
                req
            );
        }

        res.status(500).json({
            error: 'Webhook processing failed',
            code: 'PROCESSING_ERROR',
            message: error.message
        });
    };

    // Private helper methods

    private extractSignature(req: Request, provider: string): string | undefined {
        const headerMap: Record<string, string> = {
            stripe: 'stripe-signature',
            paymongo: 'paymongo-signature',
            mock: 'x-webhook-signature'
        };

        const headerName = headerMap[provider] || 'x-webhook-signature';
        return req.headers[headerName] as string;
    }

    private extractTimestamp(req: Request, provider: string): string | undefined {
        const headerMap: Record<string, string> = {
            stripe: 'stripe-timestamp',
            paymongo: 'paymongo-timestamp',
            mock: 'x-webhook-timestamp'
        };

        const headerName = headerMap[provider] || 'x-webhook-timestamp';
        return req.headers[headerName] as string;
    }

    private getClientIp(req: Request): string {
        return (
            req.headers['x-forwarded-for'] as string ||
            req.headers['x-real-ip'] as string ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            'unknown'
        ).split(',')[0].trim();
    }

    private async logSecurityEvent(
        provider: string,
        eventType: string,
        validationResult: 'valid' | 'invalid_signature' | 'invalid_timestamp' | 'duplicate' | 'error',
        errorMessage: string,
        req: Request
    ): Promise<void> {
        try {
            await this.db('webhook_security_logs').insert({
                provider,
                event_type: eventType,
                event_id: req.body?.id || 'unknown',
                validation_result: validationResult,
                error_message: validationResult !== 'valid' ? errorMessage : null,
                source_ip: this.getClientIp(req),
                user_agent: req.headers['user-agent'] || null,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Failed to log webhook security event:', error);
        }
    }

    private async storeDeduplicationRecord(
        eventId: string,
        provider: string,
        eventType: string
    ): Promise<void> {
        try {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await this.db('webhook_deduplication')
                .insert({
                    event_id: eventId,
                    provider,
                    event_type: eventType,
                    first_seen: new Date(),
                    last_seen: new Date(),
                    occurrence_count: 1,
                    expires_at: expiresAt
                })
                .onConflict('event_id')
                .merge({
                    last_seen: new Date(),
                    occurrence_count: this.db.raw('occurrence_count + 1')
                });
        } catch (error) {
            logger.error('Failed to store deduplication record:', error);
        }
    }
}

// Export singleton instance
export const webhookSecurityMiddleware = new WebhookSecurityMiddleware();

// Export individual middleware functions for convenience
export const validateWebhook = (provider: string) =>
    webhookSecurityMiddleware.validateWebhook(provider);

export const rateLimitWebhooks = (maxRequestsPerMinute?: number) =>
    webhookSecurityMiddleware.rateLimitWebhooks(maxRequestsPerMinute);

export const storeWebhookEvent = webhookSecurityMiddleware.storeWebhookEvent;

export const handleWebhookError = webhookSecurityMiddleware.handleWebhookError;