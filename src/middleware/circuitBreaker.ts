import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { getRedisClient, RedisKeys } from '@/config/redis';

export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringPeriod: number;
    minimumRequests: number;
}

export interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
    nextAttemptTime?: Date;
}

export class CircuitBreaker {
    private config: CircuitBreakerConfig;
    private redis = getRedisClient();

    constructor(config: Partial<CircuitBreakerConfig> = {}) {
        this.config = {
            failureThreshold: config.failureThreshold || 5,
            recoveryTimeout: config.recoveryTimeout || 60000, // 1 minute
            monitoringPeriod: config.monitoringPeriod || 300000, // 5 minutes
            minimumRequests: config.minimumRequests || 10
        };
    }

    private getStateKey(service: string): string {
        return RedisKeys.circuitBreaker(service);
    }

    private async getState(service: string): Promise<CircuitBreakerState> {
        try {
            const stateData = await this.redis.get(this.getStateKey(service));

            if (stateData) {
                const parsed = JSON.parse(stateData);
                return {
                    ...parsed,
                    lastFailureTime: parsed.lastFailureTime ? new Date(parsed.lastFailureTime) : undefined,
                    lastSuccessTime: parsed.lastSuccessTime ? new Date(parsed.lastSuccessTime) : undefined,
                    nextAttemptTime: parsed.nextAttemptTime ? new Date(parsed.nextAttemptTime) : undefined
                };
            }
        } catch (error) {
            logger.error('Failed to get circuit breaker state', { service, error: error.message });
        }

        // Default state
        return {
            state: 'closed',
            failureCount: 0,
            successCount: 0
        };
    }

    private async setState(service: string, state: CircuitBreakerState): Promise<void> {
        try {
            await this.redis.setex(
                this.getStateKey(service),
                Math.ceil(this.config.monitoringPeriod / 1000),
                JSON.stringify(state)
            );
        } catch (error) {
            logger.error('Failed to set circuit breaker state', { service, error: error.message });
        }
    }

    private shouldAttemptRecovery(state: CircuitBreakerState): boolean {
        if (state.state !== 'open') {
            return false;
        }

        if (!state.nextAttemptTime) {
            return true;
        }

        return Date.now() >= state.nextAttemptTime.getTime();
    }

    private shouldOpenCircuit(state: CircuitBreakerState): boolean {
        const totalRequests = state.failureCount + state.successCount;

        return totalRequests >= this.config.minimumRequests &&
            state.failureCount >= this.config.failureThreshold;
    }

    public async recordSuccess(service: string): Promise<void> {
        const state = await this.getState(service);

        state.successCount++;
        state.lastSuccessTime = new Date();

        if (state.state === 'half-open') {
            // Successful request in half-open state - close the circuit
            state.state = 'closed';
            state.failureCount = 0;
            state.nextAttemptTime = undefined;

            logger.info('Circuit breaker closed after successful recovery', { service });
        }

        await this.setState(service, state);
    }

    public async recordFailure(service: string, error: Error): Promise<void> {
        const state = await this.getState(service);

        state.failureCount++;
        state.lastFailureTime = new Date();

        if (state.state === 'half-open') {
            // Failed request in half-open state - open the circuit again
            state.state = 'open';
            state.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);

            logger.warn('Circuit breaker opened again after failed recovery attempt', {
                service,
                error: error.message
            });
        } else if (state.state === 'closed' && this.shouldOpenCircuit(state)) {
            // Too many failures - open the circuit
            state.state = 'open';
            state.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);

            logger.warn('Circuit breaker opened due to failure threshold', {
                service,
                failureCount: state.failureCount,
                threshold: this.config.failureThreshold
            });
        }

        await this.setState(service, state);
    }

    public async canExecute(service: string): Promise<boolean> {
        const state = await this.getState(service);

        switch (state.state) {
            case 'closed':
                return true;

            case 'open':
                if (this.shouldAttemptRecovery(state)) {
                    // Transition to half-open for recovery attempt
                    state.state = 'half-open';
                    await this.setState(service, state);

                    logger.info('Circuit breaker transitioning to half-open for recovery attempt', { service });
                    return true;
                }
                return false;

            case 'half-open':
                return true;

            default:
                return true;
        }
    }

    public async getCircuitState(service: string): Promise<CircuitBreakerState> {
        return this.getState(service);
    }

    public createMiddleware(service: string) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const canExecute = await this.canExecute(service);

            if (!canExecute) {
                logger.warn('Circuit breaker blocked request', {
                    service,
                    path: req.path,
                    correlationId: req.headers['x-correlation-id']
                });

                return res.status(503).json({
                    error: {
                        code: 'SERVICE_CIRCUIT_OPEN',
                        message: `Service ${service} is temporarily unavailable`,
                        correlationId: req.headers['x-correlation-id'],
                        timestamp: new Date().toISOString(),
                        retryable: true
                    }
                });
            }

            // Override res.end to record success/failure
            const originalEnd = res.end;
            let responseRecorded = false;

            res.end = function (chunk?: any, encoding?: any) {
                if (!responseRecorded) {
                    responseRecorded = true;

                    if (res.statusCode >= 500) {
                        // Server error - record as failure
                        const error = new Error(`HTTP ${res.statusCode}`);
                        circuitBreaker.recordFailure(service, error).catch(err => {
                            logger.error('Failed to record circuit breaker failure', {
                                service,
                                error: err.message
                            });
                        });
                    } else {
                        // Success or client error - record as success
                        circuitBreaker.recordSuccess(service).catch(err => {
                            logger.error('Failed to record circuit breaker success', {
                                service,
                                error: err.message
                            });
                        });
                    }
                }

                originalEnd.call(this, chunk, encoding);
            };

            next();
        };
    }
}

// Global circuit breaker instance
const circuitBreaker = new CircuitBreaker();

// Export middleware factory
export function createCircuitBreakerMiddleware(service: string) {
    return circuitBreaker.createMiddleware(service);
}

// Export circuit breaker for direct use
export { circuitBreaker };