import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatusCodes: number[];
    retryableErrors: string[];
}

export interface RetryContext {
    attempt: number;
    maxRetries: number;
    lastError?: Error;
    delays: number[];
}

export class RetryManager {
    private config: RetryConfig;

    constructor(config: Partial<RetryConfig> = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000, // 1 second
            maxDelay: config.maxDelay || 10000,  // 10 seconds
            retryableStatusCodes: config.retryableStatusCodes || [502, 503, 504],
            retryableErrors: config.retryableErrors || [
                'ECONNRESET',
                'ECONNREFUSED',
                'ETIMEDOUT',
                'ENOTFOUND'
            ]
        };
    }

    private calculateDelay(attempt: number): number {
        // Exponential backoff with jitter
        const exponentialDelay = Math.min(
            this.config.baseDelay * Math.pow(2, attempt - 1),
            this.config.maxDelay
        );

        // Add jitter (±25%)
        const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
        return Math.max(100, exponentialDelay + jitter);
    }

    private isRetryableError(error: Error): boolean {
        return this.config.retryableErrors.some(code =>
            error.message.includes(code) || error.name.includes(code)
        );
    }

    private isRetryableStatusCode(statusCode: number): boolean {
        return this.config.retryableStatusCodes.includes(statusCode);
    }

    public async executeWithRetry<T>(
        operation: () => Promise<T>,
        context: Partial<RetryContext> = {}
    ): Promise<T> {
        const retryContext: RetryContext = {
            attempt: 1,
            maxRetries: context.maxRetries || this.config.maxRetries,
            delays: []
        };

        while (retryContext.attempt <= retryContext.maxRetries) {
            try {
                const result = await operation();

                if (retryContext.attempt > 1) {
                    logger.info('Operation succeeded after retry', {
                        attempt: retryContext.attempt,
                        totalDelays: retryContext.delays
                    });
                }

                return result;
            } catch (error) {
                retryContext.lastError = error;

                const shouldRetry = retryContext.attempt < retryContext.maxRetries &&
                    this.isRetryableError(error);

                if (!shouldRetry) {
                    logger.error('Operation failed after all retries', {
                        attempt: retryContext.attempt,
                        maxRetries: retryContext.maxRetries,
                        error: error.message,
                        delays: retryContext.delays
                    });
                    throw error;
                }

                const delay = this.calculateDelay(retryContext.attempt);
                retryContext.delays.push(delay);

                logger.warn('Operation failed, retrying', {
                    attempt: retryContext.attempt,
                    maxRetries: retryContext.maxRetries,
                    delay,
                    error: error.message
                });

                await new Promise(resolve => setTimeout(resolve, delay));
                retryContext.attempt++;
            }
        }

        throw retryContext.lastError;
    }

    public createRetryMiddleware() {
        return (req: Request, res: Response, next: NextFunction): void => {
            // Add retry utility to request object
            (req as any).retry = {
                execute: <T>(operation: () => Promise<T>, context?: Partial<RetryContext>) =>
                    this.executeWithRetry(operation, context)
            };

            next();
        };
    }
}

// Global retry manager
const retryManager = new RetryManager();

// Export middleware
export function createRetryMiddleware() {
    return retryManager.createRetryMiddleware();
}

// Export retry manager for direct use
export { retryManager };

// Utility function for external service calls
export async function retryExternalCall<T>(
    operation: () => Promise<T>,
    options: Partial<RetryConfig & RetryContext> = {}
): Promise<T> {
    const manager = new RetryManager(options);
    return manager.executeWithRetry(operation, options);
}