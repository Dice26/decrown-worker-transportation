import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '@/middleware/auth';
import { healthMonitoringService } from '@/services/healthMonitoringService';
import { performanceMonitoringService } from '@/services/performanceMonitoringService';
import { featureFlagService } from '@/services/featureFlagService';
import { backupService } from '@/services/backupService';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
    try {
        const health = await healthMonitoringService.performHealthCheck();

        const statusCode = health.status === 'healthy' ? 200 :
            health.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(health);
    } catch (error) {
        logger.error('Health check failed', { error });
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date(),
            error: 'Health check failed'
        });
    }
});

/**
 * Detailed health status (admin only)
 */
router.get('/health/detailed',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const health = await healthMonitoringService.performHealthCheck();
            const history = await healthMonitoringService.getHealthHistory(24);
            const performance = await healthMonitoringService.getPerformanceMetrics();

            res.json({
                current: health,
                history,
                performance
            });
        } catch (error) {
            logger.error('Detailed health check failed', { error });
            res.status(500).json({ error: 'Failed to get detailed health status' });
        }
    }
);

/**
 * Performance metrics endpoint
 */
router.get('/performance',
    authenticateToken,
    requireRole(['admin', 'dispatcher']),
    async (req: Request, res: Response) => {
        try {
            const performance = await performanceMonitoringService.getSystemPerformance();
            res.json(performance);
        } catch (error) {
            logger.error('Failed to get performance metrics', { error });
            res.status(500).json({ error: 'Failed to get performance metrics' });
        }
    }
);

/**
 * Endpoint statistics
 */
router.get('/performance/endpoints',
    authenticateToken,
    requireRole(['admin', 'dispatcher']),
    async (req: Request, res: Response) => {
        try {
            const { endpoint } = req.query;
            const stats = await performanceMonitoringService.getEndpointStats(endpoint as string);
            res.json(stats);
        } catch (error) {
            logger.error('Failed to get endpoint stats', { error });
            res.status(500).json({ error: 'Failed to get endpoint statistics' });
        }
    }
);

/**
 * Performance report
 */
router.get('/performance/report',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const { timeRange } = req.query;
            const report = await performanceMonitoringService.generateReport(
                timeRange as 'hour' | 'day' | 'week'
            );
            res.json(report);
        } catch (error) {
            logger.error('Failed to generate performance report', { error });
            res.status(500).json({ error: 'Failed to generate performance report' });
        }
    }
);

/**
 * Prometheus metrics endpoint
 */
router.get('/metrics', (req: Request, res: Response) => {
    try {
        const metrics = performanceMonitoringService.getPrometheusMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        logger.error('Failed to get Prometheus metrics', { error });
        res.status(500).send('# Error getting metrics\n');
    }
});

/**
 * Feature flags endpoints
 */
router.get('/feature-flags',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const flags = await featureFlagService.getAllFeatureFlags();
            res.json(flags);
        } catch (error) {
            logger.error('Failed to get feature flags', { error });
            res.status(500).json({ error: 'Failed to get feature flags' });
        }
    }
);

router.post('/feature-flags',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const flag = req.body;
            await featureFlagService.setFeatureFlag(flag);
            res.status(201).json({ message: 'Feature flag created/updated successfully' });
        } catch (error) {
            logger.error('Failed to create/update feature flag', { error });
            res.status(500).json({ error: 'Failed to create/update feature flag' });
        }
    }
);

router.get('/feature-flags/:name',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { name } = req.params;
            const context = {
                userId: (req as any).user.id,
                userRole: (req as any).user.role,
                ipAddress: req.ip
            };

            const enabled = await featureFlagService.isEnabled(name, context);
            res.json({ enabled });
        } catch (error) {
            logger.error('Failed to check feature flag', { error });
            res.status(500).json({ error: 'Failed to check feature flag' });
        }
    }
);

router.delete('/feature-flags/:name',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const { name } = req.params;
            await featureFlagService.deleteFeatureFlag(name);
            res.json({ message: 'Feature flag deleted successfully' });
        } catch (error) {
            logger.error('Failed to delete feature flag', { error });
            res.status(500).json({ error: 'Failed to delete feature flag' });
        }
    }
);

/**
 * Backup endpoints
 */
router.get('/backups',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const { type } = req.query;
            const backups = await backupService.listBackups(type as string);
            res.json(backups);
        } catch (error) {
            logger.error('Failed to list backups', { error });
            res.status(500).json({ error: 'Failed to list backups' });
        }
    }
);

router.post('/backups/database',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const options = req.body;
            const backup = await backupService.createDatabaseBackup(options);
            res.status(201).json(backup);
        } catch (error) {
            logger.error('Failed to create database backup', { error });
            res.status(500).json({ error: 'Failed to create database backup' });
        }
    }
);

router.post('/backups/redis',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const options = req.body;
            const backup = await backupService.createRedisBackup(options);
            res.status(201).json(backup);
        } catch (error) {
            logger.error('Failed to create Redis backup', { error });
            res.status(500).json({ error: 'Failed to create Redis backup' });
        }
    }
);

router.post('/backups/:id/restore',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const options = { ...req.body, backupId: id };

            if (options.type === 'redis') {
                await backupService.restoreRedis(id, options.dryRun);
            } else {
                await backupService.restoreDatabase(options);
            }

            res.json({ message: 'Restore completed successfully' });
        } catch (error) {
            logger.error('Failed to restore backup', { error });
            res.status(500).json({ error: 'Failed to restore backup' });
        }
    }
);

export default router;