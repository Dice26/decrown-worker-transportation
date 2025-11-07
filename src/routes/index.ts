import { Express, Request, Response } from 'express';
import { loadConfig } from '@/config/config';
import { generateCorrelationId } from '@/utils/logger';
import { defaultRateLimit } from '@/middleware/rateLimiter';
import { APIGateway } from '@/middleware/apiGateway';
import { createCircuitBreakerMiddleware } from '@/middleware/circuitBreaker';
import { createTimeoutMiddleware } from '@/middleware/requestTimeout';
import { createRetryMiddleware } from '@/middleware/retryLogic';
import authRoutes from './auth';
import deviceRoutes from './devices';
import userRoutes from './users';
import locationRoutes from './location';
import transportRoutes from './transport';
import paymentRoutes from './payment';
import auditRoutes from './audit';
import reportingRoutes from './reporting';
import healthRoutes from './health';
import mobileRoutes from './mobile';
import monitoringRoutes from './monitoring';

export function setupRoutes(app: Express): void {
    const config = loadConfig();
    const apiVersion = config.server.apiVersion;

    // Initialize API Gateway
    const apiGateway = new APIGateway();

    // Add correlation ID to all requests
    app.use((req, res, next) => {
        const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();
        req.headers['x-correlation-id'] = correlationId;
        res.setHeader('x-correlation-id', correlationId);
        next();
    });

    // Setup API Gateway middleware (request logging and service routing)
    apiGateway.setupGatewayMiddleware(app);

    // Add retry logic middleware
    app.use(createRetryMiddleware());

    // Apply default rate limiting to all API routes
    app.use(`/api/${apiVersion}`, defaultRateLimit);

    // Health check endpoints
    app.get('/health', (req: Request, res: Response) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: apiVersion,
            environment: config.server.environment
        });
    });

    // Detailed health checks
    app.use('/health', healthRoutes);

    // API status endpoint
    app.get(`/api/${apiVersion}/status`, (req: Request, res: Response) => {
        res.json({
            api: 'DeCrown Worker Transport',
            version: apiVersion,
            status: 'operational',
            timestamp: new Date().toISOString()
        });
    });

    // Gateway status endpoint
    app.get(`/api/${apiVersion}/gateway/status`, (req: Request, res: Response) => {
        const serviceHealth = apiGateway.getServiceHealth();
        res.json({
            gateway: 'operational',
            timestamp: new Date().toISOString(),
            services: serviceHealth
        });
    });

    // Service routes with circuit breakers and timeouts
    app.use(`/api/${apiVersion}/auth`,
        createCircuitBreakerMiddleware('auth'),
        createTimeoutMiddleware('auth'),
        authRoutes
    );

    app.use(`/api/${apiVersion}/devices`,
        createCircuitBreakerMiddleware('device'),
        createTimeoutMiddleware('device'),
        deviceRoutes
    );

    app.use(`/api/${apiVersion}/users`,
        createCircuitBreakerMiddleware('user'),
        createTimeoutMiddleware('user'),
        userRoutes
    );

    app.use(`/api/${apiVersion}/location`,
        createCircuitBreakerMiddleware('location'),
        createTimeoutMiddleware('location'),
        locationRoutes
    );

    app.use(`/api/${apiVersion}/transport`,
        createCircuitBreakerMiddleware('transport'),
        createTimeoutMiddleware('transport'),
        transportRoutes
    );

    app.use(`/api/${apiVersion}/payment`,
        createCircuitBreakerMiddleware('payment'),
        createTimeoutMiddleware('payment'),
        paymentRoutes
    );

    app.use(`/api/${apiVersion}/audit`,
        createCircuitBreakerMiddleware('audit'),
        createTimeoutMiddleware('audit'),
        auditRoutes
    );

    app.use(`/api/${apiVersion}/reports`,
        createCircuitBreakerMiddleware('reporting'),
        createTimeoutMiddleware('reporting'),
        reportingRoutes
    );

    app.use(`/api/${apiVersion}/mobile`,
        createCircuitBreakerMiddleware('mobile'),
        createTimeoutMiddleware('mobile'),
        mobileRoutes
    );

    app.use(`/api/${apiVersion}/monitoring`,
        createCircuitBreakerMiddleware('monitoring'),
        createTimeoutMiddleware('monitoring'),
        monitoringRoutes
    );

    // 404 handler for API routes
    app.use(`/api/${apiVersion}/*`, (req: Request, res: Response) => {
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
}