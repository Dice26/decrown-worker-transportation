import crypto from 'crypto';
import { logger } from '@/utils/logger';
import { getDatabase } from '@/config/database';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookSecurityConfig {
    signatureHeader: string;
    timestampHeader: string;
    timestampTolerance: number; // seconds
    maxRetryAttempts: number;
    retryDelayMs: number;
    backoffMultiplier: number;
    maxRetryDelayMs: number;
}

export interface WebhookValidationResult {
    isValid: boolean;
    error?: string;
    timestamp?: Date;
    eventId?: string;
}

export interface WebhookRetryConfig {
    webhookId: string;
    url: string;
    payload: any;
    headers: Record<string, string>;
    maxAttempts: number;
    currentAttempt: number;
    nextRetryAt: Date;
}

export interface WebhookEvent {
    id: string;
    provider: string;
    eventType: string;
    payload: any;
    signature: string;
    timestamp: Date;
    processed: boolean;
    processedAt?: Date;
    processingError?: string;
    receivedAt: Date;
}

/**
 * Service for handling webhook security, validation, and retry logic
 */
export class WebhookSecurityService {
    private db: Knex;
    private config: WebhookSecurityConfig;
    private providerSecrets: Map<string, string> = new Map();

    constructor(config?: Partial<WebhookSecurityConfig>) {
        this.db = getDatabase();
        this.config = {
            signatureHeader: 'x-webhook-signature',
            timestampHeader: 'x-webhook-timestamp',
            timestampTolerance: 300, // 5 minutes
            maxRetryAttempts: 3,
            retryDelayMs: 1000,
            backoffMultiplier: 2,
            maxRetryDelayMs: 30000, // 30 seconds
            ...config
        };

        // Load provider secrets from environment
        this.loadProviderSecrets();
    }

    /**
     * Validate webhook signature and timestamp
     */
    async validateWebhook(
        provider: string,
        payload: any,
        signature: string,
        timestamp?: string
    ): Promise<WebhookValidationResult> {
        try {
            // Check if provider is supported
            const secret = this.providerSecrets.get(provider);
            if (!secret) {
                return {
                    isValid: false,
                    error: `Unsupported webhook provider: ${provider}`
                };
            }

            // Validate timestamp if provided
            let webhookTimestamp: Date | undefined;
            if (timestamp) {
                const timestampValidation = this.validateTimestamp(timestamp);
                if (!timestampValidation.isValid) {
                    return timestampValidation;
                }
                webhookTimestamp = timestampValidation.timestamp;
            }

            // Validate signature
            const signatureValidation = this.validateSignature(
                provider,
                payload,
                signature,
                timestamp
            );

            if (!signatureValidation.isValid) {
                return signatureValidation;
            }

            // Generate event ID for deduplication
            const eventId = this.generateEventId(provider, payload, timestamp);

            return {
                isValid: true,
                timestamp: webhookTimestamp,
                eventId
            };
        } catch (error) {
            logger.error('Webhook validation error:', error);
            return {
                isValid: false,
                error: error instanceof Error ? error.message : 'Validation failed'
            };
        }
    }

    /**
     * Check for duplicate webhook events
     */
    async isDuplicateEvent(eventId: string): Promise<boolean> {
        try {
            const existing = await this.db('webhook_events')
                .select('id')
                .where('event_id', eventId)
                .first();

            return !!existing;
        } catch (error) {
            logger.error('Error checking for duplicate webhook event:', error);
            return false;
        }
    }

    /**
     * Store webhook event for processing
     */
    async storeWebhookEvent(
        provider: string,
        eventType: string,
        payload: any,
        signature: string,
        eventId: string,
        timestamp?: Date
    ): Promise<string> {
        try {
            const webhookId = uuidv4();

            await this.db('webhook_events').insert({
                id: webhookId,
                event_id: eventId,
                provider,
                event_type: eventType,
                payload: JSON.stringify(payload),
                signature,
                timestamp: timestamp || new Date(),
                processed: false,
                received_at: new Date()
            });

            logger.info('Webhook event stored', {
                webhookId,
                eventId,
                provider,
                eventType
            });

            return webhookId;
        } catch (error) {
            logger.error('Failed to store webhook event:', error);
            throw error;
        }
    }

    /**
     * Mark webhook event as processed
     */
    async markEventProcessed(webhookId: string, success: boolean, error?: string): Promise<void> {
        try {
            await this.db('webhook_events')
                .where('id', webhookId)
                .update({
                    processed: true,
                    processed_at: new Date(),
                    processing_error: error || null
                });

            logger.info('Webhook event marked as processed', {
                webhookId,
                success,
                error
            });
        } catch (dbError) {
            logger.error('Failed to mark webhook event as processed:', dbError);
            throw dbError;
        }
    }

    /**
     * Implement webhook retry logic with exponential backoff
     */
    async scheduleWebhookRetry(
        webhookId: string,
        url: string,
        payload: any,
        headers: Record<string, string>,
        currentAttempt: number = 0
    ): Promise<void> {
        try {
            if (currentAttempt >= this.config.maxRetryAttempts) {
                logger.warn('Max webhook retry attempts exceeded', {
                    webhookId,
                    currentAttempt
                });
                return;
            }

            const delayMs = Math.min(
                this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, currentAttempt),
                this.config.maxRetryDelayMs
            );

            const nextRetryAt = new Date(Date.now() + delayMs);

            // Store retry configuration
            await this.db('webhook_retries').insert({
                id: uuidv4(),
                webhook_id: webhookId,
                url,
                payload: JSON.stringify(payload),
                headers: JSON.stringify(headers),
                max_attempts: this.config.maxRetryAttempts,
                current_attempt: currentAttempt + 1,
                next_retry_at: nextRetryAt,
                created_at: new Date()
            });

            logger.info('Webhook retry scheduled', {
                webhookId,
                currentAttempt: currentAttempt + 1,
                nextRetryAt,
                delayMs
            });
        } catch (error) {
            logger.error('Failed to schedule webhook retry:', error);
            throw error;
        }
    }

    /**
     * Process pending webhook retries
     */
    async processPendingRetries(): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
        errors: Array<{ webhookId: string; error: string }>;
    }> {
        const result = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            errors: [] as Array<{ webhookId: string; error: string }>
        };

        try {
            // Get retries that are due for processing
            const pendingRetries = await this.db('webhook_retries')
                .select('*')
                .where('next_retry_at', '<=', new Date())
                .where('current_attempt', '<=', this.db.raw('max_attempts'))
                .orderBy('next_retry_at', 'asc');

            for (const retry of pendingRetries) {
                try {
                    result.processed++;

                    const success = await this.executeWebhookRetry(retry);

                    if (success) {
                        result.succeeded++;
                        // Remove successful retry record
                        await this.db('webhook_retries').where('id', retry.id).del();
                    } else {
                        result.failed++;

                        if (retry.current_attempt >= retry.max_attempts) {
                            // Max attempts reached, mark as failed
                            await this.db('webhook_retries')
                                .where('id', retry.id)
                                .update({
                                    failed_at: new Date(),
                                    failure_reason: 'Max retry attempts exceeded'
                                });
                        } else {
                            // Schedule next retry
                            await this.scheduleWebhookRetry(
                                retry.webhook_id,
                                retry.url,
                                JSON.parse(retry.payload),
                                JSON.parse(retry.headers),
                                retry.current_attempt
                            );

                            // Remove current retry record
                            await this.db('webhook_retries').where('id', retry.id).del();
                        }
                    }
                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        webhookId: retry.webhook_id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });

                    logger.error(`Failed to process webhook retry ${retry.id}:`, error);
                }
            }

            logger.info('Webhook retry processing completed', result);
            return result;
        } catch (error) {
            logger.error('Failed to process pending webhook retries:', error);
            throw error;
        }
    }

    /**
     * Get webhook event statistics
     */
    async getWebhookStats(provider?: string, hours: number = 24): Promise<{
        total: number;
        processed: number;
        failed: number;
        duplicates: number;
        avgProcessingTime: number;
    }> {
        try {
            const since = new Date(Date.now() - hours * 60 * 60 * 1000);

            let query = this.db('webhook_events')
                .where('received_at', '>=', since);

            if (provider) {
                query = query.where('provider', provider);
            }

            const events = await query.select('*');

            const total = events.length;
            const processed = events.filter(e => e.processed).length;
            const failed = events.filter(e => e.processing_error).length;

            // Count duplicates by event_id
            const eventIds = events.map(e => e.event_id);
            const uniqueEventIds = new Set(eventIds);
            const duplicates = total - uniqueEventIds.size;

            // Calculate average processing time
            const processedEvents = events.filter(e => e.processed_at && e.received_at);
            const avgProcessingTime = processedEvents.length > 0
                ? processedEvents.reduce((sum, e) => {
                    return sum + (new Date(e.processed_at).getTime() - new Date(e.received_at).getTime());
                }, 0) / processedEvents.length
                : 0;

            return {
                total,
                processed,
                failed,
                duplicates,
                avgProcessingTime: Math.round(avgProcessingTime)
            };
        } catch (error) {
            logger.error('Failed to get webhook statistics:', error);
            throw error;
        }
    }

    // Private helper methods

    private loadProviderSecrets(): void {
        // Load webhook secrets from environment variables
        const secrets = {
            stripe: process.env.STRIPE_WEBHOOK_SECRET,
            paymongo: process.env.PAYMONGO_WEBHOOK_SECRET,
            mock: process.env.MOCK_WEBHOOK_SECRET || 'mock_webhook_secret'
        };

        for (const [provider, secret] of Object.entries(secrets)) {
            if (secret) {
                this.providerSecrets.set(provider, secret);
            }
        }

        logger.info('Loaded webhook secrets for providers:', Array.from(this.providerSecrets.keys()));
    }

    private validateTimestamp(timestamp: string): WebhookValidationResult {
        try {
            const webhookTime = parseInt(timestamp, 10);
            const currentTime = Math.floor(Date.now() / 1000);
            const timeDiff = Math.abs(currentTime - webhookTime);

            if (timeDiff > this.config.timestampTolerance) {
                return {
                    isValid: false,
                    error: `Webhook timestamp too old or too far in future. Difference: ${timeDiff}s`
                };
            }

            return {
                isValid: true,
                timestamp: new Date(webhookTime * 1000)
            };
        } catch (error) {
            return {
                isValid: false,
                error: 'Invalid timestamp format'
            };
        }
    }

    private validateSignature(
        provider: string,
        payload: any,
        signature: string,
        timestamp?: string
    ): WebhookValidationResult {
        try {
            const secret = this.providerSecrets.get(provider);
            if (!secret) {
                return {
                    isValid: false,
                    error: `No secret configured for provider: ${provider}`
                };
            }

            let expectedSignature: string;

            switch (provider) {
                case 'stripe':
                    expectedSignature = this.generateStripeSignature(payload, timestamp, secret);
                    break;
                case 'paymongo':
                    expectedSignature = this.generatePayMongoSignature(payload, secret);
                    break;
                case 'mock':
                    expectedSignature = this.generateMockSignature(payload, secret);
                    break;
                default:
                    return {
                        isValid: false,
                        error: `Unsupported provider for signature validation: ${provider}`
                    };
            }

            // Use constant-time comparison to prevent timing attacks
            const isValid = crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature)
            );

            return {
                isValid,
                error: isValid ? undefined : 'Invalid webhook signature'
            };
        } catch (error) {
            return {
                isValid: false,
                error: error instanceof Error ? error.message : 'Signature validation failed'
            };
        }
    }

    private generateStripeSignature(payload: any, timestamp: string | undefined, secret: string): string {
        if (!timestamp) {
            throw new Error('Timestamp required for Stripe webhook signature');
        }

        const payloadString = JSON.stringify(payload);
        const signedPayload = `${timestamp}.${payloadString}`;

        return crypto
            .createHmac('sha256', secret)
            .update(signedPayload, 'utf8')
            .digest('hex');
    }

    private generatePayMongoSignature(payload: any, secret: string): string {
        const payloadString = JSON.stringify(payload);

        return crypto
            .createHmac('sha256', secret)
            .update(payloadString, 'utf8')
            .digest('hex');
    }

    private generateMockSignature(payload: any, secret: string): string {
        const payloadString = JSON.stringify(payload);

        return `mock_sig_${crypto
            .createHmac('sha256', secret)
            .update(payloadString, 'utf8')
            .digest('base64')
            .slice(0, 32)}`;
    }

    private generateEventId(provider: string, payload: any, timestamp?: string): string {
        // Create deterministic event ID for deduplication
        const data = {
            provider,
            payload,
            timestamp
        };

        return crypto
            .createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    private async executeWebhookRetry(retry: any): Promise<boolean> {
        try {
            // In a real implementation, this would make an HTTP request
            // For now, we'll simulate the retry logic

            logger.info('Executing webhook retry', {
                webhookId: retry.webhook_id,
                attempt: retry.current_attempt,
                url: retry.url
            });

            // Simulate success/failure (90% success rate)
            const success = Math.random() > 0.1;

            if (success) {
                logger.info('Webhook retry succeeded', {
                    webhookId: retry.webhook_id,
                    attempt: retry.current_attempt
                });
            } else {
                logger.warn('Webhook retry failed', {
                    webhookId: retry.webhook_id,
                    attempt: retry.current_attempt
                });
            }

            return success;
        } catch (error) {
            logger.error('Webhook retry execution failed:', error);
            return false;
        }
    }

    /**
     * Clean up old webhook events and retries
     */
    async cleanupOldWebhooks(olderThanDays: number = 30): Promise<{
        deletedEvents: number;
        deletedRetries: number;
    }> {
        try {
            const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

            const deletedEvents = await this.db('webhook_events')
                .where('received_at', '<', cutoffDate)
                .where('processed', true)
                .del();

            const deletedRetries = await this.db('webhook_retries')
                .where('created_at', '<', cutoffDate)
                .whereNotNull('failed_at')
                .del();

            logger.info('Webhook cleanup completed', {
                deletedEvents,
                deletedRetries,
                cutoffDate
            });

            return { deletedEvents, deletedRetries };
        } catch (error) {
            logger.error('Failed to cleanup old webhooks:', error);
            throw error;
        }
    }
}