import { Router, Request, Response } from 'express';
import { APIGateway } from '@/middleware/apiGateway';
import { circuitBreaker } from '@/middleware/circuitBreaker';
import { getRedisClient } from '@/config/redis';
import { knex } from '@/config/database';
import { logger } from '@/utils/logger';
import { loadConfig } from '@/config/config';

const router = Router();
const config = loadConfig();

// Individual service health checks
router.get('/auth', async (req: Request, res: Response) => {
    try {
        // Check if auth service dependencies are available
        const startTime = Date.now();

        // Test database connection
        await knex.raw('SELECT 1');

        // Test Redis connection
        const redis = getRedisClient();
        await redis.ping();

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'auth',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy',
                redis: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Auth service health check failed', { error: error.message });
        res.status(503).json({
            service: 'auth',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/user', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test user service specific functionality
        await knex('users').select('id').limit(1);

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'user',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy'
            }
        });
    } catch (error) {
        logger.error('User service health check failed', { error: error.message });
        res.status(503).json({
            service: 'user',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/device', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test device service specific functionality
        await knex('devices').select('id').limit(1);

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'device',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Device service health check failed', { error: error.message });
        res.status(503).json({
            service: 'device',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/location', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test location service specific functionality
        await knex('location_points').select('user_id').limit(1);

        const redis = getRedisClient();
        await redis.ping();

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'location',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy',
                redis: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Location service health check failed', { error: error.message });
        res.status(503).json({
            service: 'location',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/transport', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test transport service specific functionality
        await knex('trips').select('id').limit(1);

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'transport',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Transport service health check failed', { error: error.message });
        res.status(503).json({
            service: 'transport',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/payment', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test payment service specific functionality
        await knex('invoices').select('id').limit(1);

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'payment',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Payment service health check failed', { error: error.message });
        res.status(503).json({
            service: 'payment',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/audit', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test audit service specific functionality
        await knex('audit_events').select('event_id').limit(1);

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'audit',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Audit service health check failed', { error: error.message });
        res.status(503).json({
            service: 'audit',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/reporting', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();

        // Test reporting service specific functionality
        await knex('usage_ledger').select('user_id').limit(1);

        const responseTime = Date.now() - startTime;

        res.json({
            service: 'reporting',
            status: 'healthy',
            responseTime,
            timestamp: new Date().toISOString(),
            dependencies: {
                database: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Reporting service health check failed', { error: error.message });
        res.status(503).json({
            service: 'reporting',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Overall system health check
router.get('/system', async (req: Request, res: Response) => {
    try {
        const startTime = Date.now();
        const healthChecks = [];

        // Check all services
        const services = ['auth', 'user', 'device', 'location', 'transport', 'payment', 'audit', 'reporting'];

        for (const service of services) {
            try {
                const serviceStartTime = Date.now();

                // Perform basic health check for each service
                switch (service) {
                    case 'auth':
                        await knex.raw('SELECT 1');
                        await getRedisClient().ping();
                        break;
                    case 'user':
                        await knex('users').select('id').limit(1);
                        break;
                    case 'device':
                        await knex('devices').select('id').limit(1);
                        break;
                    case 'location':
                        await knex('location_points').select('user_id').limit(1);
                        break;
                    case 'transport':
                        await knex('trips').select('id').limit(1);
                        break;
                    case 'payment':
                        await knex('invoices').select('id').limit(1);
                        break;
                    case 'audit':
                        await knex('audit_events').select('event_id').limit(1);
                        break;
                    case 'reporting':
                        await knex('usage_ledger').select('user_id').limit(1);
                        break;
                }

                const serviceResponseTime = Date.now() - serviceStartTime;

                healthChecks.push({
                    service,
                    status: 'healthy',
                    responseTime: serviceResponseTime
                });
            } catch (error) {
                healthChecks.push({
                    service,
                    status: 'unhealthy',
                    error: error.message
                });
            }
        }

        const totalResponseTime = Date.now() - startTime;
        const unhealthyServices = healthChecks.filter(check => check.status === 'unhealthy');
        const overallStatus = unhealthyServices.length === 0 ? 'healthy' : 'degraded';

        const response = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            responseTime: totalResponseTime,
            services: healthChecks,
            environment: config.server.environment,
            version: config.server.apiVersion
        };

        if (overallStatus === 'degraded') {
            res.status(503).json(response);
        } else {
            res.json(response);
        }
    } catch (error) {
        logger.error('System health check failed', { error: error.message });
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Circuit breaker status endpoint
router.get('/circuit-breakers', async (req: Request, res: Response) => {
    try {
        const services = ['auth', 'user', 'device', 'location', 'transport', 'payment', 'audit', 'reporting'];
        const circuitStates = [];

        for (const service of services) {
            const state = await circuitBreaker.getCircuitState(service);
            circuitStates.push({
                service,
                ...state
            });
        }

        res.json({
            timestamp: new Date().toISOString(),
            circuitBreakers: circuitStates
        });
    } catch (error) {
        logger.error('Circuit breaker status check failed', { error: error.message });
        res.status(500).json({
            error: {
                code: 'CIRCUIT_BREAKER_STATUS_ERROR',
                message: 'Failed to retrieve circuit breaker status',
                timestamp: new Date().toISOString()
            }
        });
    }
});

export default router;