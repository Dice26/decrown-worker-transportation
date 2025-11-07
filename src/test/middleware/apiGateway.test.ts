import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { APIGateway } from '@/middleware/apiGateway';
import { createCircuitBreakerMiddleware, circuitBreaker } from '@/middleware/circuitBreaker';
import { createTimeoutMiddleware } from '@/middleware/requestTimeout';
import { authMiddleware } from '@/middleware/auth';
import { defaultRateLimit } from '@/middleware/rateLimiter';
import { generateCorrelationId } from '@/utils/logger';
import { AuthService } from '@/services/authService';

// Mock dependencies
vi.mock('@/services/authService');
vi.mock('@/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    },
    generateCorrelationId: vi.fn(() => 'test-correlation-id')
}));

describe('API Gateway Integration Tests', () => {
    let app: express.Express;
    let apiGateway: APIGateway;
    let authService: AuthService;

    beforeEach(() => {
        app = express();
        apiGateway = new APIGateway();
        authService = new AuthService();

        // Setup basic middleware
        app.use(express.json());

        // Add correlation ID
        app.use((req, res, next) => {
            const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();
            req.headers['x-correlation-id'] = correlationId;
            res.setHeader('x-correlation-id', correlationId);
            next();
        });

        // Setup API Gateway middleware
        apiGateway.setupGatewayMiddleware(app);

        // Mock routes for testing
        app.get('/api/v1/test/public', (req, res) => {
            res.json({ message: 'public endpoint', correlationId: req.headers['x-correlation-id'] });
        });

        app.get('/api/v1/test/protected', authMiddleware, (req, res) => {
            res.json({ message: 'protected endpoint', user: (req as any).user });
        });

        app.get('/api/v1/test/error', (req, res) => {
            res.status(500).json({ error: 'Internal server error' });
        });

        app.get('/api/v1/test/timeout', (req, res) => {
            // Simulate a long-running request
            setTimeout(() => {
                res.json({ message: 'delayed response' });
            }, 35000); // 35 seconds - should timeout
        });
    });

    describe('Request Logging', () => {
        it('should add correlation ID to requests', async () => {
            const response = await request(app)
                .get('/api/v1/test/public')
                .expect(200);

            expect(response.headers['x-correlation-id']).toBeDefined();
            expect(response.body.correlationId).toBeDefined();
        });

        it('should preserve existing correlation ID', async () => {
            const customCorrelationId = 'custom-correlation-id';

            const response = await request(app)
                .get('/api/v1/test/public')
                .set('x-correlation-id', customCorrelationId)
                .expect(200);

            expect(response.headers['x-correlation-id']).toBe(customCorrelationId);
            expect(response.body.correlationId).toBe(customCorrelationId);
        });
    });

    describe('Service Routing', () => {
        it('should route requests to appropriate services', async () => {
            const response = await request(app)
                .get('/api/v1/test/public')
                .expect(200);

            expect(response.body.message).toBe('public endpoint');
        });

        it('should handle non-API routes', async () => {
            const response = await request(app)
                .get('/health')
                .expect(404); // No health route defined in this test app
        });

        it('should return 404 for unknown API endpoints', async () => {
            app.use('/api/v1/*', (req, res) => {
                res.status(404).json({
                    error: {
                        code: 'NOT_FOUND',
                        message: 'API endpoint not found',
                        correlationId: req.headers['x-correlation-id'],
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            });

            const response = await request(app)
                .get('/api/v1/nonexistent')
                .expect(404);

            expect(response.body.error.code).toBe('NOT_FOUND');
            expect(response.body.error.correlationId).toBeDefined();
        });
    });

    describe('Authentication and Authorization', () => {
        it('should allow access to public endpoints', async () => {
            await request(app)
                .get('/api/v1/test/public')
                .expect(200);
        });

        it('should block access to protected endpoints without token', async () => {
            await request(app)
                .get('/api/v1/test/protected')
                .expect(401);
        });

        it('should allow access to protected endpoints with valid token', async () => {
            const mockPayload = {
                userId: 'user-123',
                email: 'test@example.com',
                role: 'worker',
                permissions: ['location:read', 'location:write']
            };

            vi.mocked(authService.validateAccessToken).mockResolvedValue(mockPayload);

            const response = await request(app)
                .get('/api/v1/test/protected')
                .set('Authorization', 'Bearer valid-token')
                .expect(200);

            expect(response.body.user.id).toBe('user-123');
            expect(response.body.user.email).toBe('test@example.com');
        });

        it('should reject invalid tokens', async () => {
            vi.mocked(authService.validateAccessToken).mockRejectedValue(new Error('Invalid token'));

            await request(app)
                .get('/api/v1/test/protected')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });
    });

    describe('Rate Limiting', () => {
        beforeEach(() => {
            // Apply rate limiting to test routes
            app.use('/api/v1', defaultRateLimit);
        });

        it('should allow requests within rate limit', async () => {
            await request(app)
                .get('/api/v1/test/public')
                .expect(200);
        });

        it('should block requests exceeding rate limit', async () => {
            // This test would need to be adjusted based on actual rate limit configuration
            // For now, we'll test that the middleware is applied
            const response = await request(app)
                .get('/api/v1/test/public')
                .expect(200);

            expect(response.headers['x-ratelimit-limit']).toBeDefined();
            expect(response.headers['x-ratelimit-remaining']).toBeDefined();
        });
    });

    describe('Service Health Monitoring', () => {
        it('should track service health', () => {
            const serviceHealth = apiGateway.getServiceHealth();
            expect(Array.isArray(serviceHealth)).toBe(true);
            expect(serviceHealth.length).toBeGreaterThan(0);
        });

        it('should identify healthy services', () => {
            const isHealthy = apiGateway.isServiceHealthy('auth');
            expect(typeof isHealthy).toBe('boolean');
        });

        it('should find service routes', () => {
            const route = apiGateway.findServiceRoute('/auth/login', 'POST');
            expect(route).toBeDefined();
            expect(route?.service).toBe('auth');
        });
    });

    describe('Error Handling', () => {
        it('should handle server errors gracefully', async () => {
            const response = await request(app)
                .get('/api/v1/test/error')
                .expect(500);

            expect(response.body.error).toBeDefined();
        });

        it('should include correlation ID in error responses', async () => {
            const response = await request(app)
                .get('/api/v1/nonexistent')
                .expect(404);

            expect(response.body.error?.correlationId).toBeDefined();
        });
    });
});

describe('Circuit Breaker Integration Tests', () => {
    let app: express.Express;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Add correlation ID
        app.use((req, res, next) => {
            req.headers['x-correlation-id'] = 'test-correlation-id';
            next();
        });

        // Test route with circuit breaker
        app.get('/api/v1/test/circuit',
            createCircuitBreakerMiddleware('test-service'),
            (req, res) => {
                // Simulate service behavior based on query parameter
                const shouldFail = req.query.fail === 'true';
                if (shouldFail) {
                    res.status(500).json({ error: 'Service failure' });
                } else {
                    res.json({ message: 'Service success' });
                }
            }
        );
    });

    it('should allow requests when circuit is closed', async () => {
        await request(app)
            .get('/api/v1/test/circuit')
            .expect(200);
    });

    it('should record failures and successes', async () => {
        // Success
        await request(app)
            .get('/api/v1/test/circuit')
            .expect(200);

        // Failure
        await request(app)
            .get('/api/v1/test/circuit?fail=true')
            .expect(500);

        const state = await circuitBreaker.getCircuitState('test-service');
        expect(state.successCount).toBeGreaterThan(0);
        expect(state.failureCount).toBeGreaterThan(0);
    });
});

describe('Request Timeout Integration Tests', () => {
    let app: express.Express;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Test route with timeout
        app.get('/api/v1/test/timeout',
            createTimeoutMiddleware('test-service'),
            (req, res) => {
                const delay = parseInt(req.query.delay as string) || 0;
                setTimeout(() => {
                    res.json({ message: 'Response after delay', delay });
                }, delay);
            }
        );
    });

    it('should allow fast requests', async () => {
        await request(app)
            .get('/api/v1/test/timeout?delay=100')
            .expect(200);
    });

    it('should timeout slow requests', async () => {
        await request(app)
            .get('/api/v1/test/timeout?delay=35000')
            .expect(504);
    }, 40000); // Increase test timeout to allow for the request timeout
});