import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTimeoutMiddleware, timeoutManager } from '@/middleware/requestTimeout';

vi.mock('@/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('Request Timeout Middleware Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Timeout Configuration', () => {
        it('should use default timeout when no service specified', () => {
            const middleware = createTimeoutMiddleware();

            const req = {
                path: '/test',
                method: 'GET',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any;

            const res = {
                headersSent: false,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn()
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should use service-specific timeout', () => {
            const middleware = createTimeoutMiddleware('auth');

            const req = {
                path: '/auth/login',
                method: 'POST',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any;

            const res = {
                headersSent: false,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn()
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });

    describe('Timeout Behavior', () => {
        it('should timeout requests that exceed the limit', () => {
            const middleware = createTimeoutMiddleware('auth'); // 5 second timeout

            const req = {
                path: '/auth/login',
                method: 'POST',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any;

            const res = {
                headersSent: false,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn()
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            // Fast-forward time to trigger timeout
            vi.advanceTimersByTime(6000); // 6 seconds

            expect(res.status).toHaveBeenCalledWith(504);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    code: 'REQUEST_TIMEOUT',
                    message: 'Request timed out after 5000ms',
                    correlationId: 'test-id',
                    timestamp: expect.any(String),
                    retryable: true
                }
            });
        });

        it('should not timeout if response is already sent', () => {
            const middleware = createTimeoutMiddleware('auth');

            const req = {
                path: '/auth/login',
                method: 'POST',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any;

            const res = {
                headersSent: true, // Response already sent
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn()
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            // Fast-forward time to trigger timeout
            vi.advanceTimersByTime(6000);

            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
        });

        it('should clear timeout when response ends normally', () => {
            const middleware = createTimeoutMiddleware('auth');

            const req = {
                path: '/auth/login',
                method: 'POST',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any;

            let originalEnd: Function;
            const res = {
                headersSent: false,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn((chunk?: any, encoding?: any) => {
                    if (originalEnd) originalEnd.call(res, chunk, encoding);
                })
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            // Store original end function
            originalEnd = res.end;

            // Simulate normal response
            res.end('response data');

            // Fast-forward time - should not timeout now
            vi.advanceTimersByTime(6000);

            expect(res.status).not.toHaveBeenCalledWith(504);
        });

        it('should clear timeout when connection is closed', () => {
            const middleware = createTimeoutMiddleware('auth');

            let closeCallback: Function;
            const req = {
                path: '/auth/login',
                method: 'POST',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn((event: string, callback: Function) => {
                    if (event === 'close') {
                        closeCallback = callback;
                    }
                })
            } as any;

            const res = {
                headersSent: false,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn()
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            // Simulate connection close
            if (closeCallback) closeCallback();

            // Fast-forward time - should not timeout now
            vi.advanceTimersByTime(6000);

            expect(res.status).not.toHaveBeenCalledWith(504);
        });
    });

    describe('Service-Specific Timeouts', () => {
        it('should use different timeouts for different services', () => {
            const authMiddleware = createTimeoutMiddleware('auth');
            const reportingMiddleware = createTimeoutMiddleware('reporting');

            const createMockReq = (path: string) => ({
                path,
                method: 'GET',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any);

            const createMockRes = () => ({
                headersSent: false,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                end: vi.fn()
            } as any);

            // Auth service (5 second timeout)
            const authReq = createMockReq('/auth/login');
            const authRes = createMockRes();
            authMiddleware(authReq, authRes, vi.fn());

            // Reporting service (60 second timeout)
            const reportingReq = createMockReq('/reports/monthly');
            const reportingRes = createMockRes();
            reportingMiddleware(reportingReq, reportingRes, vi.fn());

            // Fast-forward 6 seconds - auth should timeout, reporting should not
            vi.advanceTimersByTime(6000);

            expect(authRes.status).toHaveBeenCalledWith(504);
            expect(reportingRes.status).not.toHaveBeenCalled();

            // Fast-forward to 61 seconds - reporting should now timeout
            vi.advanceTimersByTime(55000); // Total 61 seconds

            expect(reportingRes.status).toHaveBeenCalledWith(504);
        });
    });

    describe('Error Handling', () => {
        it('should handle errors in timeout callback gracefully', () => {
            const middleware = createTimeoutMiddleware('auth');

            const req = {
                path: '/auth/login',
                method: 'POST',
                headers: { 'x-correlation-id': 'test-id' },
                on: vi.fn()
            } as any;

            const res = {
                headersSent: false,
                status: vi.fn(() => {
                    throw new Error('Response error');
                }),
                json: vi.fn(),
                end: vi.fn()
            } as any;

            const next = vi.fn();

            middleware(req, res, next);

            // Should not throw when timeout triggers
            expect(() => {
                vi.advanceTimersByTime(6000);
            }).not.toThrow();
        });
    });
});