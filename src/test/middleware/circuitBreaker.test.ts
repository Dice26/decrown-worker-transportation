import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, createCircuitBreakerMiddleware } from '@/middleware/circuitBreaker';
import { getRedisClient } from '@/config/redis';

// Mock Redis
vi.mock('@/config/redis', () => ({
    getRedisClient: vi.fn(() => ({
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn()
    })),
    RedisKeys: {
        circuitBreaker: (service: string) => `circuit_breaker:${service}`
    }
}));

vi.mock('@/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('Circuit Breaker Tests', () => {
    let circuitBreaker: CircuitBreaker;
    let mockRedis: any;

    beforeEach(() => {
        circuitBreaker = new CircuitBreaker({
            failureThreshold: 3,
            recoveryTimeout: 5000,
            monitoringPeriod: 60000,
            minimumRequests: 5
        });

        mockRedis = getRedisClient();
        vi.clearAllMocks();
    });

    describe('Circuit State Management', () => {
        it('should start with closed circuit', async () => {
            mockRedis.get.mockResolvedValue(null);

            const canExecute = await circuitBreaker.canExecute('test-service');
            expect(canExecute).toBe(true);
        });

        it('should record successful operations', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'closed',
                failureCount: 0,
                successCount: 0
            }));

            await circuitBreaker.recordSuccess('test-service');

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"successCount":1')
            );
        });

        it('should record failed operations', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'closed',
                failureCount: 0,
                successCount: 0
            }));

            const error = new Error('Service failure');
            await circuitBreaker.recordFailure('test-service', error);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"failureCount":1')
            );
        });

        it('should open circuit after failure threshold', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'closed',
                failureCount: 2,
                successCount: 5
            }));

            const error = new Error('Service failure');
            await circuitBreaker.recordFailure('test-service', error);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"state":"open"')
            );
        });

        it('should transition to half-open for recovery attempt', async () => {
            const pastTime = new Date(Date.now() - 10000); // 10 seconds ago
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'open',
                failureCount: 5,
                successCount: 0,
                nextAttemptTime: pastTime.toISOString()
            }));

            const canExecute = await circuitBreaker.canExecute('test-service');
            expect(canExecute).toBe(true);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"state":"half-open"')
            );
        });

        it('should close circuit after successful recovery', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'half-open',
                failureCount: 5,
                successCount: 0
            }));

            await circuitBreaker.recordSuccess('test-service');

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"state":"closed"')
            );
        });

        it('should reopen circuit after failed recovery', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'half-open',
                failureCount: 5,
                successCount: 0
            }));

            const error = new Error('Recovery failed');
            await circuitBreaker.recordFailure('test-service', error);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"state":"open"')
            );
        });
    });

    describe('Circuit Breaker Middleware', () => {
        it('should allow requests when circuit is closed', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'closed',
                failureCount: 0,
                successCount: 0
            }));

            const middleware = createCircuitBreakerMiddleware('test-service');
            const req = { headers: { 'x-correlation-id': 'test-id' }, path: '/test' } as any;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn(),
                statusCode: 200
            } as any;
            const next = vi.fn();

            await middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should block requests when circuit is open', async () => {
            const futureTime = new Date(Date.now() + 10000); // 10 seconds in future
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'open',
                failureCount: 5,
                successCount: 0,
                nextAttemptTime: futureTime.toISOString()
            }));

            const middleware = createCircuitBreakerMiddleware('test-service');
            const req = { headers: { 'x-correlation-id': 'test-id' }, path: '/test' } as any;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn()
            } as any;
            const next = vi.fn();

            await middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    code: 'SERVICE_CIRCUIT_OPEN',
                    message: 'Service test-service is temporarily unavailable',
                    correlationId: 'test-id',
                    timestamp: expect.any(String),
                    retryable: true
                }
            });
            expect(next).not.toHaveBeenCalled();
        });

        it('should record success for successful responses', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'closed',
                failureCount: 0,
                successCount: 0
            }));

            const middleware = createCircuitBreakerMiddleware('test-service');
            const req = { headers: { 'x-correlation-id': 'test-id' }, path: '/test' } as any;

            let endCallback: Function;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                statusCode: 200,
                end: vi.fn((chunk?: any, encoding?: any) => {
                    if (endCallback) endCallback(chunk, encoding);
                })
            } as any;

            const next = vi.fn();

            await middleware(req, res, next);

            // Simulate response end
            const originalEnd = res.end;
            res.end('response data');

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"successCount":1')
            );
        });

        it('should record failure for server error responses', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({
                state: 'closed',
                failureCount: 0,
                successCount: 0
            }));

            const middleware = createCircuitBreakerMiddleware('test-service');
            const req = { headers: { 'x-correlation-id': 'test-id' }, path: '/test' } as any;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                statusCode: 500,
                end: vi.fn()
            } as any;
            const next = vi.fn();

            await middleware(req, res, next);

            // Simulate response end
            res.end('error response');

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'circuit_breaker:test-service',
                60,
                expect.stringContaining('"failureCount":1')
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle Redis errors gracefully', async () => {
            mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

            const canExecute = await circuitBreaker.canExecute('test-service');
            expect(canExecute).toBe(true); // Should default to allowing requests
        });

        it('should handle Redis set errors gracefully', async () => {
            mockRedis.get.mockResolvedValue(null);
            mockRedis.setex.mockRejectedValue(new Error('Redis write failed'));

            // Should not throw error
            await expect(circuitBreaker.recordSuccess('test-service')).resolves.toBeUndefined();
        });
    });
});