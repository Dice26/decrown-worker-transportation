import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';
import { environmentManager } from '@/config/environments';

export interface PerformanceMetric {
    timestamp: Date;
    endpoint: string;
    method: string;
    responseTime: number;
    statusCode: number;
    userId?: string;
    userAgent?: string;
    ipAddress: string;
    requestSize: number;
    responseSize: number;
    memoryUsage: number;
    cpuUsage: number;
}

export interface EndpointStats {
    endpoint: string;
    method: string;
    totalRequests: number;
    averageResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    throughput: number; // requests per second
    lastUpdated: Date;
}

export interface SystemPerformance {
    timestamp: Date;
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: {
        used: number;
        total: number;
        percentage: number;
    };
    cpuUsage: number;
    activeConnections: number;
    queueDepth: number;
}

class PerformanceMonitoringService {
    private redis: Redis;
    private metrics: PerformanceMetric[] = [];
    private endpointStats: Map<string, EndpointStats> = new Map();
    private requestCounts: Map<string, number> = new Map();
    private startTime: Date;

    constructor() {
        this.redis = redisClient;
        this.startTime = new Date();
        this.initializeMonitoring();
    }

    /**
     * Express middleware to track request performance
     */
    trackRequest() {
        return (req: Request, res: Response, next: NextFunction) => {
            const startTime = Date.now();
            const startCpuUsage = process.cpuUsage();
            const startMemory = process.memoryUsage();

            // Track request size
            const requestSize = parseInt(req.get('content-length') || '0');

            // Override res.end to capture response metrics
            const originalEnd = res.end;
            res.end = function (chunk?: any, encoding?: any) {
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                const endCpuUsage = process.cpuUsage(startCpuUsage);
                const endMemory = process.memoryUsage();

                // Calculate response size
                let responseSize = 0;
                if (chunk) {
                    responseSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
                }

                // Create performance metric
                const metric: PerformanceMetric = {
                    timestamp: new Date(startTime),
                    endpoint: req.route?.path || req.path,
                    method: req.method,
                    responseTime,
                    statusCode: res.statusCode,
                    userId: (req as any).user?.id,
                    userAgent: req.get('user-agent'),
                    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
                    requestSize,
                    responseSize,
                    memoryUsage: endMemory.heapUsed - startMemory.heapUsed,
                    cpuUsage: (endCpuUsage.user + endCpuUsage.system) / 1000 // Convert to milliseconds
                };

                // Store metric asynchronously
                setImmediate(() => {
                    performanceMonitoringService.recordMetric(metric);
                });

                // Call original end method
                originalEnd.call(this, chunk, encoding);
            };

            next();
        };
    }

    /**
     * Record a performance metric
     */
    async recordMetric(metric: PerformanceMetric): Promise<void> {
        try {
            // Add to in-memory buffer
            this.metrics.push(metric);

            // Keep only last 10000 metrics in memory
            if (this.metrics.length > 10000) {
                this.metrics = this.metrics.slice(-5000);
            }

            // Update endpoint statistics
            await this.updateEndpointStats(metric);

            // Store in Redis for persistence
            const key = `perf:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
            await this.redis.setex(key, 3600, JSON.stringify(metric)); // Store for 1 hour

            // Update request counters
            const minuteKey = `req_count:${Math.floor(Date.now() / 60000)}`;
            await this.redis.incr(minuteKey);
            await this.redis.expire(minuteKey, 3600); // Expire after 1 hour

            // Log slow requests
            if (metric.responseTime > 5000) { // 5 seconds
                logger.warn('Slow request detected', {
                    endpoint: metric.endpoint,
                    method: metric.method,
                    responseTime: metric.responseTime,
                    userId: metric.userId
                });
            }

            // Log errors
            if (metric.statusCode >= 400) {
                logger.warn('Error response', {
                    endpoint: metric.endpoint,
                    method: metric.method,
                    statusCode: metric.statusCode,
                    responseTime: metric.responseTime,
                    userId: metric.userId
                });
            }

        } catch (error) {
            logger.error('Error recording performance metric', { error });
        }
    }

    /**
     * Update endpoint statistics
     */
    private async updateEndpointStats(metric: PerformanceMetric): Promise<void> {
        const key = `${metric.method}:${metric.endpoint}`;
        let stats = this.endpointStats.get(key);

        if (!stats) {
            stats = {
                endpoint: metric.endpoint,
                method: metric.method,
                totalRequests: 0,
                averageResponseTime: 0,
                p50ResponseTime: 0,
                p95ResponseTime: 0,
                p99ResponseTime: 0,
                errorRate: 0,
                throughput: 0,
                lastUpdated: new Date()
            };
        }

        // Update basic stats
        stats.totalRequests++;
        stats.averageResponseTime = (stats.averageResponseTime * (stats.totalRequests - 1) + metric.responseTime) / stats.totalRequests;
        stats.lastUpdated = new Date();

        // Calculate error rate
        const recentMetrics = this.metrics
            .filter(m => m.endpoint === metric.endpoint && m.method === metric.method)
            .slice(-100); // Last 100 requests

        const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
        stats.errorRate = errorCount / recentMetrics.length;

        // Calculate percentiles
        const responseTimes = recentMetrics.map(m => m.responseTime).sort((a, b) => a - b);
        if (responseTimes.length > 0) {
            stats.p50ResponseTime = this.calculatePercentile(responseTimes, 50);
            stats.p95ResponseTime = this.calculatePercentile(responseTimes, 95);
            stats.p99ResponseTime = this.calculatePercentile(responseTimes, 99);
        }

        // Calculate throughput (requests per second over last minute)
        const oneMinuteAgo = Date.now() - 60000;
        const recentRequests = recentMetrics.filter(m => m.timestamp.getTime() > oneMinuteAgo);
        stats.throughput = recentRequests.length / 60;

        this.endpointStats.set(key, stats);

        // Store in Redis
        await this.redis.setex(`endpoint_stats:${key}`, 3600, JSON.stringify(stats));
    }

    /**
     * Calculate percentile from sorted array
     */
    private calculatePercentile(sortedArray: number[], percentile: number): number {
        if (sortedArray.length === 0) return 0;

        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);

        if (lower === upper) {
            return sortedArray[lower];
        }

        const weight = index - lower;
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * Get endpoint statistics
     */
    async getEndpointStats(endpoint?: string): Promise<EndpointStats[]> {
        try {
            if (endpoint) {
                const keys = await this.redis.keys(`endpoint_stats:*:${endpoint}`);
                const stats: EndpointStats[] = [];

                for (const key of keys) {
                    const data = await this.redis.get(key);
                    if (data) {
                        const stat: EndpointStats = JSON.parse(data);
                        stat.lastUpdated = new Date(stat.lastUpdated);
                        stats.push(stat);
                    }
                }

                return stats;
            } else {
                const keys = await this.redis.keys('endpoint_stats:*');
                const stats: EndpointStats[] = [];

                for (const key of keys) {
                    const data = await this.redis.get(key);
                    if (data) {
                        const stat: EndpointStats = JSON.parse(data);
                        stat.lastUpdated = new Date(stat.lastUpdated);
                        stats.push(stat);
                    }
                }

                return stats.sort((a, b) => b.totalRequests - a.totalRequests);
            }
        } catch (error) {
            logger.error('Error getting endpoint stats', { error });
            return [];
        }
    }

    /**
     * Get system performance overview
     */
    async getSystemPerformance(): Promise<SystemPerformance> {
        try {
            // Calculate requests per second
            const now = Date.now();
            const oneMinuteAgo = now - 60000;
            const recentMetrics = this.metrics.filter(m => m.timestamp.getTime() > oneMinuteAgo);
            const requestsPerSecond = recentMetrics.length / 60;

            // Calculate average response time
            const averageResponseTime = recentMetrics.length > 0
                ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
                : 0;

            // Calculate error rate
            const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
            const errorRate = recentMetrics.length > 0 ? errorCount / recentMetrics.length : 0;

            // Get memory usage
            const memUsage = process.memoryUsage();
            const memoryUsage = {
                used: memUsage.heapUsed,
                total: memUsage.heapTotal,
                percentage: memUsage.heapUsed / memUsage.heapTotal
            };

            // Get CPU usage (simplified)
            const cpuUsage = process.cpuUsage();
            const cpuPercentage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

            // Get active connections (this would need to be tracked separately)
            const activeConnections = 0; // Placeholder

            // Get queue depth (this would depend on your queue implementation)
            const queueDepth = 0; // Placeholder

            return {
                timestamp: new Date(),
                requestsPerSecond,
                averageResponseTime,
                errorRate,
                memoryUsage,
                cpuUsage: cpuPercentage,
                activeConnections,
                queueDepth
            };
        } catch (error) {
            logger.error('Error getting system performance', { error });
            throw error;
        }
    }

    /**
     * Get performance metrics for a time range
     */
    async getMetrics(options: {
        startTime?: Date;
        endTime?: Date;
        endpoint?: string;
        method?: string;
        limit?: number;
    } = {}): Promise<PerformanceMetric[]> {
        try {
            let filteredMetrics = [...this.metrics];

            // Filter by time range
            if (options.startTime) {
                filteredMetrics = filteredMetrics.filter(m => m.timestamp >= options.startTime!);
            }
            if (options.endTime) {
                filteredMetrics = filteredMetrics.filter(m => m.timestamp <= options.endTime!);
            }

            // Filter by endpoint
            if (options.endpoint) {
                filteredMetrics = filteredMetrics.filter(m => m.endpoint === options.endpoint);
            }

            // Filter by method
            if (options.method) {
                filteredMetrics = filteredMetrics.filter(m => m.method === options.method);
            }

            // Apply limit
            if (options.limit) {
                filteredMetrics = filteredMetrics.slice(-options.limit);
            }

            return filteredMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        } catch (error) {
            logger.error('Error getting metrics', { error });
            return [];
        }
    }

    /**
     * Generate performance report
     */
    async generateReport(timeRange: 'hour' | 'day' | 'week' = 'hour'): Promise<{
        summary: SystemPerformance;
        topEndpoints: EndpointStats[];
        slowestEndpoints: EndpointStats[];
        errorProne: EndpointStats[];
        recommendations: string[];
    }> {
        try {
            const summary = await this.getSystemPerformance();
            const allStats = await this.getEndpointStats();

            // Top endpoints by request count
            const topEndpoints = allStats
                .sort((a, b) => b.totalRequests - a.totalRequests)
                .slice(0, 10);

            // Slowest endpoints
            const slowestEndpoints = allStats
                .sort((a, b) => b.averageResponseTime - a.averageResponseTime)
                .slice(0, 10);

            // Error-prone endpoints
            const errorProne = allStats
                .filter(s => s.errorRate > 0.01) // More than 1% error rate
                .sort((a, b) => b.errorRate - a.errorRate)
                .slice(0, 10);

            // Generate recommendations
            const recommendations: string[] = [];

            if (summary.averageResponseTime > 1000) {
                recommendations.push('Average response time is high (>1s). Consider optimizing slow endpoints.');
            }

            if (summary.errorRate > 0.05) {
                recommendations.push('Error rate is high (>5%). Investigate failing endpoints.');
            }

            if (summary.memoryUsage.percentage > 0.8) {
                recommendations.push('Memory usage is high (>80%). Consider increasing memory or optimizing memory usage.');
            }

            if (slowestEndpoints.length > 0 && slowestEndpoints[0].averageResponseTime > 5000) {
                recommendations.push(`Endpoint ${slowestEndpoints[0].endpoint} is very slow (${slowestEndpoints[0].averageResponseTime}ms). Needs optimization.`);
            }

            if (errorProne.length > 0) {
                recommendations.push(`${errorProne.length} endpoints have high error rates. Review error handling.`);
            }

            return {
                summary,
                topEndpoints,
                slowestEndpoints,
                errorProne,
                recommendations
            };
        } catch (error) {
            logger.error('Error generating performance report', { error });
            throw error;
        }
    }

    /**
     * Initialize monitoring
     */
    private initializeMonitoring(): void {
        // Clean up old metrics every hour
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 3600000); // 1 hour

        // Generate performance alerts every 5 minutes
        setInterval(() => {
            this.checkPerformanceAlerts();
        }, 300000); // 5 minutes

        logger.info('Performance monitoring initialized');
    }

    /**
     * Clean up old metrics from Redis
     */
    private async cleanupOldMetrics(): Promise<void> {
        try {
            const keys = await this.redis.keys('perf:*');
            const now = Date.now();
            const oneHourAgo = now - 3600000;

            for (const key of keys) {
                const timestamp = parseInt(key.split(':')[1]);
                if (timestamp < oneHourAgo) {
                    await this.redis.del(key);
                }
            }

            logger.debug(`Cleaned up ${keys.length} old performance metrics`);
        } catch (error) {
            logger.error('Error cleaning up old metrics', { error });
        }
    }

    /**
     * Check for performance alerts
     */
    private async checkPerformanceAlerts(): Promise<void> {
        try {
            const performance = await this.getSystemPerformance();
            const alerts: string[] = [];

            // Check response time
            if (performance.averageResponseTime > 5000) {
                alerts.push(`High average response time: ${performance.averageResponseTime}ms`);
            }

            // Check error rate
            if (performance.errorRate > 0.1) {
                alerts.push(`High error rate: ${(performance.errorRate * 100).toFixed(2)}%`);
            }

            // Check memory usage
            if (performance.memoryUsage.percentage > 0.9) {
                alerts.push(`High memory usage: ${(performance.memoryUsage.percentage * 100).toFixed(2)}%`);
            }

            // Send alerts if any
            if (alerts.length > 0) {
                logger.warn('Performance alerts triggered', { alerts });

                // Store alerts in Redis for dashboard
                await this.redis.lpush('performance_alerts', JSON.stringify({
                    timestamp: new Date(),
                    alerts,
                    performance
                }));
                await this.redis.ltrim('performance_alerts', 0, 99); // Keep last 100 alerts
            }
        } catch (error) {
            logger.error('Error checking performance alerts', { error });
        }
    }

    /**
     * Get Prometheus metrics format
     */
    getPrometheusMetrics(): string {
        const metrics: string[] = [];

        // Request duration histogram
        metrics.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
        metrics.push('# TYPE http_request_duration_seconds histogram');

        // Request count
        metrics.push('# HELP http_requests_total Total number of HTTP requests');
        metrics.push('# TYPE http_requests_total counter');

        // Memory usage
        const memUsage = process.memoryUsage();
        metrics.push('# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes');
        metrics.push('# TYPE nodejs_memory_usage_bytes gauge');
        metrics.push(`nodejs_memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}`);
        metrics.push(`nodejs_memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}`);
        metrics.push(`nodejs_memory_usage_bytes{type="external"} ${memUsage.external}`);

        // Add endpoint-specific metrics
        this.endpointStats.forEach((stats, key) => {
            const [method, endpoint] = key.split(':');
            const labels = `method="${method}",endpoint="${endpoint}"`;

            metrics.push(`http_requests_total{${labels}} ${stats.totalRequests}`);
            metrics.push(`http_request_duration_seconds{${labels},quantile="0.5"} ${stats.p50ResponseTime / 1000}`);
            metrics.push(`http_request_duration_seconds{${labels},quantile="0.95"} ${stats.p95ResponseTime / 1000}`);
            metrics.push(`http_request_duration_seconds{${labels},quantile="0.99"} ${stats.p99ResponseTime / 1000}`);
        });

        return metrics.join('\n');
    }
}

export const performanceMonitoringService = new PerformanceMonitoringService();
export default performanceMonitoringService;