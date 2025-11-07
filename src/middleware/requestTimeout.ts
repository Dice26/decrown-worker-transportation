import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface TimeoutConfig {
    defaultTimeout: number;
    serviceTimeouts: Record<string, number>;
}

export class RequestTimeoutManager {
    private config: TimeoutConfig;

    constructor(config: Partial<TimeoutConfig> = {}) {
        this.config = {
            defaultTimeout: config.defaultTimeout || 30000, // 30 seconds
            serviceTimeouts: {
                auth: 5000,      // 5 seconds for auth
                location: 10000, // 10 seconds for location updates
                transport: 15000, // 15 seconds for route calculations
                payment: 30000,   // 30 seconds for payment processing
                reporting: 60000, // 60 seconds for report generation
                ...config.serviceTimeouts
            }
        };
    }

    private getTimeoutForService(service?: string): number {
        if (service && this.config.serviceTimeouts[service]) {
            return this.config.serviceTimeouts[service];
        }
        return this.config.defaultTimeout;
    }

    public createTimeoutMiddleware(service?: string) {
        const timeout = this.getTimeoutForService(service);

        return (req: Request, res: Response, next: NextFunction): void => {
            const timeoutId = setTimeout(() => {
                if (!res.headersSent) {
                    logger.warn('Request timeout', {
                        service,
                        timeout,
                        path: req.path,
                        method: req.method,
                        correlationId: req.headers['x-correlation-id']
                    });

                    res.status(504).json({
                        error: {
                            code: 'REQUEST_TIMEOUT',
                            message: `Request timed out after ${timeout}ms`,
                            correlationId: req.headers['x-correlation-id'],
                            timestamp: new Date().toISOString(),
                            retryable: true
                        }
                    });
                }
            }, timeout);

            // Clear timeout when response is sent
            const originalEnd = res.end;
            res.end = function (chunk?: any, encoding?: any) {
                clearTimeout(timeoutId);
                originalEnd.call(this, chunk, encoding);
            };

            // Clear timeout if connection is closed
            req.on('close', () => {
                clearTimeout(timeoutId);
            });

            next();
        };
    }
}

// Global timeout manager
const timeoutManager = new RequestTimeoutManager();

// Export middleware factory
export function createTimeoutMiddleware(service?: string) {
    return timeoutManager.createTimeoutMiddleware(service);
}

// Export timeout manager for configuration
export { timeoutManager };