import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { redisClient } from '@/config/redis';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { environmentManager } from '@/config/environments';

export interface HealthCheck {
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime: number;
    timestamp: Date;
    details?: Record<string, any>;
    error?: string;
}

export interface SystemHealth {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: Date;
    checks: HealthCheck[];
    uptime: number;
    version: string;
}

export interface PerformanceMetrics {
    timestamp: Date;
    cpu: {
        usage: number;
        loadAverage: number[];
    };
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    database: {
        activeConnections: number;
        totalConnections: number;
        queryTime: number;
    };
    redis: {
        connectedClients: number;
        usedMemory: number;
        keyspaceHits: number;
        keyspaceMisses: number;
    };
    http: {
        requestsPerSecond: number;
        averageResponseTime: number;
        errorRate: number;
    };
}

class HealthMonitoringService {
    private redis: Redis;
    private dbPool: Pool;
    private startTime: Date;
    private healthChecks: Map<string, () => Promise<HealthCheck>> = new Map();
    private performanceHistory: PerformanceMetrics[] = [];
    private alertThresholds = {
        responseTime: 5000, // 5 seconds
        errorRate: 0.05, // 5%
        memoryUsage: 0.85, // 85%
        cpuUsage: 0.80, // 80%
        dbConnections: 0.90 // 90% of pool
    };

    constructor() {
        this.redis = redisClient;
        this.dbPool = db;
        this.startTime = new Date();
        this.initializeHealthChecks();
    }

    /**
     * Initialize all health checks
     */
    private initializeHealthChecks(): void {
        this.healthChecks.set('database', this.checkDatabase.bind(this));
        this.healthChecks.set('redis', this.checkRedis.bind(this));
        this.healthChecks.set('memory', this.checkMemory.bind(this));
        this.healthChecks.set('disk', this.checkDisk.bind(this));
        this.healthChecks.set('external_services', this.checkExternalServices.bind(this));
    }

    /**
     * Perform all health checks
     */
    async performHealthCheck(): Promise<SystemHealth> {
        const startTime = Date.now();
        const checks: HealthCheck[] = [];

        // Run all health checks in parallel
        const checkPromises = Array.from(this.healthChecks.entries()).map(async ([name, checkFn]) => {
            try {
                return await checkFn();
            } catch (error) {
                return {
                    name,
                    status: 'unhealthy' as const,
                    responseTime: Date.now() - startTime,
                    timestamp: new Date(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        });

        const results = await Promise.allSettled(checkPromises);

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                checks.push(result.value);
            } else {
                const checkName = Array.from(this.healthChecks.keys())[index];
                checks.push({
                    name: checkName,
                    status: 'unhealthy',
                    responseTime: Date.now() - startTime,
                    timestamp: new Date(),
                    error: result.reason?.message || 'Health check failed'
                });
            }
        });

        // Determine overall system status
        const overallStatus = this.determineOverallStatus(checks);

        const systemHealth: SystemHealth = {
            status: overallStatus,
            timestamp: new Date(),
            checks,
            uptime: Date.now() - this.startTime.getTime(),
            version: process.env.npm_package_version || '1.0.0'
        };

        // Store health check result
        await this.storeHealthCheck(systemHealth);

        // Send alerts if necessary
        if (overallStatus !== 'healthy') {
            await this.sendHealthAlert(systemHealth);
        }

        return systemHealth;
    }

    /**
     * Check database connectivity and performance
     */
    private async checkDatabase(): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            // Test basic connectivity
            const client = await this.dbPool.connect();

            // Test query performance
            const queryStart = Date.now();
            await client.query('SELECT 1');
            const queryTime = Date.now() - queryStart;

            // Get connection pool stats
            const poolStats = {
                totalCount: this.dbPool.totalCount,
                idleCount: this.dbPool.idleCount,
                waitingCount: this.dbPool.waitingCount
            };

            client.release();

            const responseTime = Date.now() - startTime;
            const status = queryTime > this.alertThresholds.responseTime ? 'degraded' : 'healthy';

            return {
                name: 'database',
                status,
                responseTime,
                timestamp: new Date(),
                details: {
                    queryTime,
                    poolStats,
                    connectionString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
                }
            };
        } catch (error) {
            return {
                name: 'database',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                error: error instanceof Error ? error.message : 'Database connection failed'
            };
        }
    }

    /**
     * Check Redis connectivity and performance
     */
    private async checkRedis(): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            // Test basic connectivity
            const pong = await this.redis.ping();
            if (pong !== 'PONG') {
                throw new Error('Redis ping failed');
            }

            // Test read/write performance
            const testKey = `health_check_${Date.now()}`;
            const writeStart = Date.now();
            await this.redis.set(testKey, 'test', 'EX', 10);
            const writeTime = Date.now() - writeStart;

            const readStart = Date.now();
            const value = await this.redis.get(testKey);
            const readTime = Date.now() - readStart;

            await this.redis.del(testKey);

            // Get Redis info
            const info = await this.redis.info();
            const infoLines = info.split('\r\n');
            const stats: Record<string, string> = {};

            infoLines.forEach(line => {
                if (line.includes(':')) {
                    const [key, value] = line.split(':');
                    stats[key] = value;
                }
            });

            const responseTime = Date.now() - startTime;
            const avgTime = (writeTime + readTime) / 2;
            const status = avgTime > 100 ? 'degraded' : 'healthy'; // 100ms threshold

            return {
                name: 'redis',
                status,
                responseTime,
                timestamp: new Date(),
                details: {
                    writeTime,
                    readTime,
                    connectedClients: parseInt(stats.connected_clients || '0'),
                    usedMemory: parseInt(stats.used_memory || '0'),
                    keyspaceHits: parseInt(stats.keyspace_hits || '0'),
                    keyspaceMisses: parseInt(stats.keyspace_misses || '0')
                }
            };
        } catch (error) {
            return {
                name: 'redis',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                error: error instanceof Error ? error.message : 'Redis connection failed'
            };
        }
    }

    /**
     * Check memory usage
     */
    private async checkMemory(): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            const memUsage = process.memoryUsage();
            const totalMemory = require('os').totalmem();
            const freeMemory = require('os').freemem();
            const usedMemory = totalMemory - freeMemory;
            const memoryPercentage = usedMemory / totalMemory;

            const status = memoryPercentage > this.alertThresholds.memoryUsage ? 'degraded' : 'healthy';

            return {
                name: 'memory',
                status,
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                details: {
                    processMemory: {
                        rss: memUsage.rss,
                        heapTotal: memUsage.heapTotal,
                        heapUsed: memUsage.heapUsed,
                        external: memUsage.external
                    },
                    systemMemory: {
                        total: totalMemory,
                        free: freeMemory,
                        used: usedMemory,
                        percentage: memoryPercentage
                    }
                }
            };
        } catch (error) {
            return {
                name: 'memory',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                error: error instanceof Error ? error.message : 'Memory check failed'
            };
        }
    }

    /**
     * Check disk usage
     */
    private async checkDisk(): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            const fs = require('fs');
            const path = require('path');

            // Check disk space for logs directory
            const logsPath = path.join(process.cwd(), 'logs');
            let diskStats = null;

            try {
                const stats = fs.statSync(logsPath);
                diskStats = {
                    exists: true,
                    size: stats.size,
                    modified: stats.mtime
                };
            } catch {
                diskStats = { exists: false };
            }

            // Check if we can write to temp directory
            const tempFile = path.join(require('os').tmpdir(), `health_check_${Date.now()}.tmp`);
            fs.writeFileSync(tempFile, 'test');
            fs.unlinkSync(tempFile);

            return {
                name: 'disk',
                status: 'healthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                details: {
                    logsDirectory: diskStats,
                    tempWritable: true
                }
            };
        } catch (error) {
            return {
                name: 'disk',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                error: error instanceof Error ? error.message : 'Disk check failed'
            };
        }
    }

    /**
     * Check external services
     */
    private async checkExternalServices(): Promise<HealthCheck> {
        const startTime = Date.now();

        try {
            const checks = [];

            // Check payment provider (if not in dry-run mode)
            if (!environmentManager.getConfig().payment.dryRun) {
                try {
                    // This would be a simple API call to check connectivity
                    // For now, we'll simulate it
                    checks.push({ service: 'payment_provider', status: 'healthy', responseTime: 50 });
                } catch {
                    checks.push({ service: 'payment_provider', status: 'unhealthy', responseTime: 0 });
                }
            }

            const overallStatus = checks.every(check => check.status === 'healthy') ? 'healthy' : 'degraded';

            return {
                name: 'external_services',
                status: overallStatus,
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                details: { checks }
            };
        } catch (error) {
            return {
                name: 'external_services',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                error: error instanceof Error ? error.message : 'External services check failed'
            };
        }
    }

    /**
     * Determine overall system status
     */
    private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
        const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
        const degradedChecks = checks.filter(check => check.status === 'degraded');

        if (unhealthyChecks.length > 0) {
            return 'unhealthy';
        }

        if (degradedChecks.length > 0) {
            return 'degraded';
        }

        return 'healthy';
    }

    /**
     * Store health check result
     */
    private async storeHealthCheck(health: SystemHealth): Promise<void> {
        try {
            const key = `health_check:${Date.now()}`;
            await this.redis.setex(key, 3600, JSON.stringify(health)); // Store for 1 hour

            // Keep only last 100 health checks
            const keys = await this.redis.keys('health_check:*');
            if (keys.length > 100) {
                const sortedKeys = keys.sort();
                const keysToDelete = sortedKeys.slice(0, keys.length - 100);
                if (keysToDelete.length > 0) {
                    await this.redis.del(...keysToDelete);
                }
            }
        } catch (error) {
            logger.error('Error storing health check', { error });
        }
    }

    /**
     * Send health alert
     */
    private async sendHealthAlert(health: SystemHealth): Promise<void> {
        try {
            const config = environmentManager.getConfig();

            if (!config.monitoring.alerting.enabled || !config.monitoring.alerting.webhookUrl) {
                return;
            }

            const alert = {
                timestamp: health.timestamp,
                status: health.status,
                message: `System health is ${health.status}`,
                checks: health.checks.filter(check => check.status !== 'healthy'),
                uptime: health.uptime,
                environment: config.environment
            };

            // This would send to your alerting system (Slack, PagerDuty, etc.)
            logger.warn('Health alert triggered', alert);

            // Store alert in Redis for dashboard
            await this.redis.lpush('health_alerts', JSON.stringify(alert));
            await this.redis.ltrim('health_alerts', 0, 99); // Keep last 100 alerts

        } catch (error) {
            logger.error('Error sending health alert', { error });
        }
    }

    /**
     * Get health check history
     */
    async getHealthHistory(limit: number = 24): Promise<SystemHealth[]> {
        try {
            const keys = await this.redis.keys('health_check:*');
            const sortedKeys = keys.sort().slice(-limit);

            if (sortedKeys.length === 0) {
                return [];
            }

            const healthData = await this.redis.mget(...sortedKeys);
            return healthData
                .filter(data => data !== null)
                .map(data => JSON.parse(data!))
                .map(health => ({
                    ...health,
                    timestamp: new Date(health.timestamp),
                    checks: health.checks.map((check: any) => ({
                        ...check,
                        timestamp: new Date(check.timestamp)
                    }))
                }));
        } catch (error) {
            logger.error('Error getting health history', { error });
            return [];
        }
    }

    /**
     * Get current performance metrics
     */
    async getPerformanceMetrics(): Promise<PerformanceMetrics> {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const loadAvg = require('os').loadavg();

        // Get database stats
        const dbStats = {
            activeConnections: this.dbPool.totalCount - this.dbPool.idleCount,
            totalConnections: this.dbPool.totalCount,
            queryTime: 0 // This would be tracked separately
        };

        // Get Redis stats
        let redisStats = {
            connectedClients: 0,
            usedMemory: 0,
            keyspaceHits: 0,
            keyspaceMisses: 0
        };

        try {
            const info = await this.redis.info();
            const infoLines = info.split('\r\n');
            const stats: Record<string, string> = {};

            infoLines.forEach(line => {
                if (line.includes(':')) {
                    const [key, value] = line.split(':');
                    stats[key] = value;
                }
            });

            redisStats = {
                connectedClients: parseInt(stats.connected_clients || '0'),
                usedMemory: parseInt(stats.used_memory || '0'),
                keyspaceHits: parseInt(stats.keyspace_hits || '0'),
                keyspaceMisses: parseInt(stats.keyspace_misses || '0')
            };
        } catch (error) {
            logger.error('Error getting Redis stats', { error });
        }

        const metrics: PerformanceMetrics = {
            timestamp: new Date(),
            cpu: {
                usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
                loadAverage: loadAvg
            },
            memory: {
                used: memUsage.heapUsed,
                total: memUsage.heapTotal,
                percentage: memUsage.heapUsed / memUsage.heapTotal
            },
            database: dbStats,
            redis: redisStats,
            http: {
                requestsPerSecond: 0, // This would be tracked by middleware
                averageResponseTime: 0, // This would be tracked by middleware
                errorRate: 0 // This would be tracked by middleware
            }
        };

        // Store metrics for history
        this.performanceHistory.push(metrics);
        if (this.performanceHistory.length > 1440) { // Keep 24 hours of minute-by-minute data
            this.performanceHistory.shift();
        }

        return metrics;
    }

    /**
     * Start health monitoring
     */
    startMonitoring(): void {
        const interval = environmentManager.getConfig().monitoring.healthCheckInterval;

        setInterval(async () => {
            try {
                await this.performHealthCheck();
                await this.getPerformanceMetrics();
            } catch (error) {
                logger.error('Error during health monitoring', { error });
            }
        }, interval);

        logger.info('Health monitoring started', { interval });
    }
}

export const healthMonitoringService = new HealthMonitoringService();
export default healthMonitoringService;