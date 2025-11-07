import { Request, Response, NextFunction, Express } from 'express';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest } from '@/types/auth';
import { loadConfig } from '@/config/config';

export interface ServiceRoute {
    path: string;
    service: string;
    methods: string[];
    requiresAuth: boolean;
    rateLimit?: {
        windowMs: number;
        maxRequests: number;
    };
}

export interface ServiceHealth {
    service: string;
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: Date;
    responseTime?: number;
    error?: string;
}

export class APIGateway {
    private serviceRoutes: ServiceRoute[] = [];
    private serviceHealth: Map<string, ServiceHealth> = new Map();
    private config = loadConfig();

    constructor() {
        this.initializeServiceRoutes();
        this.startHealthChecks();
    }

    private initializeServiceRoutes(): void {
        this.serviceRoutes = [
            {
                path: '/auth',
                service: 'auth',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                requiresAuth: false
            },
            {
                path: '/users',
                service: 'user',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                requiresAuth: true
            },
            {
                path: '/devices',
                service: 'device',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                requiresAuth: true
            },
            {
                path: '/location',
                service: 'location',
                methods: ['GET', 'POST', 'PUT'],
                requiresAuth: true,
                rateLimit: {
                    windowMs: 60 * 1000, // 1 minute
                    maxRequests: 120 // 2 per second
                }
            },
            {
                path: '/transport',
                service: 'transport',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                requiresAuth: true
            },
            {
                path: '/payment',
                service: 'payment',
                methods: ['GET', 'POST', 'PUT'],
                requiresAuth: true
            },
            {
                path: '/audit',
                service: 'audit',
                methods: ['GET'],
                requiresAuth: true
            },
            {
                path: '/reports',
                service: 'reporting',
                methods: ['GET', 'POST'],
                requiresAuth: true
            }
        ];
    }

    private startHealthChecks(): void {
        // Initialize health status for all services
        this.serviceRoutes.forEach(route => {
            this.serviceHealth.set(route.service, {
                service: route.service,
                status: 'unknown',
                lastCheck: new Date()
            });
        });

        // Start periodic health checks
        setInterval(() => {
            this.performHealthChecks();
        }, 30000); // Check every 30 seconds

        // Initial health check
        this.performHealthChecks();
    }

    private async performHealthChecks(): Promise<void> {
        const services = Array.from(new Set(this.serviceRoutes.map(r => r.service)));

        for (const service of services) {
            try {
                const startTime = Date.now();

                // For now, we'll simulate health checks since services are in the same process
                // In a real microservices setup, this would make HTTP calls to service health endpoints
                const isHealthy = await this.checkServiceHealth(service);
                const responseTime = Date.now() - startTime;

                this.serviceHealth.set(service, {
                    service,
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    lastCheck: new Date(),
                    responseTime
                });

            } catch (error) {
                this.serviceHealth.set(service, {
                    service,
                    status: 'unhealthy',
                    lastCheck: new Date(),
                    error: error.message
                });

                logger.error(`Health check failed for service ${service}`, {
                    service,
                    error: error.message
                });
            }
        }
    }

    private async checkServiceHealth(service: string): Promise<boolean> {
        // In a monolithic setup, we can check if the service modules are properly initialized
        // This is a simplified health check - in microservices, this would be HTTP calls
        try {
            switch (service) {
                case 'auth':
                    // Check if auth service is responsive
                    return true;
                case 'user':
                case 'device':
                case 'location':
                case 'transport':
                case 'payment':
                case 'audit':
                case 'reporting':
                    // For now, assume all services are healthy if no errors
                    return true;
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }

    public getServiceHealth(): ServiceHealth[] {
        return Array.from(this.serviceHealth.values());
    }

    public isServiceHealthy(service: string): boolean {
        const health = this.serviceHealth.get(service);
        return health?.status === 'healthy';
    }

    public findServiceRoute(path: string, method: string): ServiceRoute | null {
        return this.serviceRoutes.find(route =>
            path.startsWith(route.path) &&
            route.methods.includes(method.toUpperCase())
        ) || null;
    }

    public setupGatewayMiddleware(app: Express): void {
        // Request logging middleware
        app.use(this.requestLoggingMiddleware.bind(this));

        // Service routing middleware
        app.use(this.serviceRoutingMiddleware.bind(this));
    }

    private requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
        const startTime = Date.now();
        const correlationId = req.headers['x-correlation-id'] as string;
        const authReq = req as AuthenticatedRequest;

        // Log incoming request
        logger.info('Incoming request', {
            method: req.method,
            path: req.path,
            correlationId,
            userId: authReq.user?.id,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        });

        // Override res.end to log response
        const originalEnd = res.end;
        res.end = function (chunk?: any, encoding?: any) {
            const responseTime = Date.now() - startTime;

            logger.info('Request completed', {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                responseTime,
                correlationId,
                userId: authReq.user?.id
            });

            originalEnd.call(this, chunk, encoding);
        };

        next();
    }

    private serviceRoutingMiddleware(req: Request, res: Response, next: NextFunction): void {
        const apiVersion = this.config.server.apiVersion;
        const basePath = `/api/${apiVersion}`;

        // Skip if not an API request
        if (!req.path.startsWith(basePath)) {
            return next();
        }

        // Extract service path
        const servicePath = req.path.replace(basePath, '');
        const route = this.findServiceRoute(servicePath, req.method);

        if (!route) {
            return next(); // Let the 404 handler deal with it
        }

        // Check service health
        if (!this.isServiceHealthy(route.service)) {
            logger.warn('Service unavailable', {
                service: route.service,
                path: req.path,
                correlationId: req.headers['x-correlation-id']
            });

            return res.status(503).json({
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: `Service ${route.service} is currently unavailable`,
                    correlationId: req.headers['x-correlation-id'],
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }

        // Add service info to request for downstream middleware
        (req as any).serviceRoute = route;

        next();
    }
}