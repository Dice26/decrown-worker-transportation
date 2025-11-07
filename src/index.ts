import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { setupDatabase } from '@/config/database';
import { setupRedis } from '@/config/redis';
import { setupRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { loadConfig } from '@/config/config';
import { startAuditIntegrityJob } from '@/utils/auditIntegrityJob';
import { healthMonitoringService } from '@/services/healthMonitoringService';
import { performanceMonitoringService } from '@/services/performanceMonitoringService';
import { featureFlagService } from '@/services/featureFlagService';
import { backupService } from '@/services/backupService';
import { environmentManager } from '@/config/environments';

// Load environment variables
dotenv.config();

async function startServer() {
    try {
        // Load configuration
        const config = loadConfig();

        // Initialize Express app
        const app = express();
        const server = createServer(app);

        // Security middleware
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
            crossOriginEmbedderPolicy: false,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        app.use(cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (mobile apps, Postman, etc.)
                if (!origin) return callback(null, true);

                if (process.env.NODE_ENV === 'production') {
                    if (config.cors.allowedOrigins.includes(origin)) {
                        return callback(null, true);
                    } else {
                        return callback(new Error('Not allowed by CORS'));
                    }
                } else {
                    // Allow all origins in development
                    return callback(null, true);
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
                'X-Correlation-ID',
                'X-Device-ID',
                'X-App-Version'
            ],
            exposedHeaders: ['X-Correlation-ID', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset']
        }));

        // Body parsing middleware
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true }));

        // Performance monitoring middleware
        app.use(performanceMonitoringService.trackRequest());

        // Setup database connection
        await setupDatabase();
        logger.info('Database connection established');

        // Setup Redis connection
        await setupRedis();
        logger.info('Redis connection established');

        // Setup routes
        setupRoutes(app);

        // Start audit integrity job
        startAuditIntegrityJob();
        logger.info('Audit integrity job started');

        // Initialize monitoring services
        if (environmentManager.getConfig().monitoring.metricsEnabled) {
            healthMonitoringService.startMonitoring();
            logger.info('Health monitoring started');
        }

        // Initialize feature flags
        await featureFlagService.initializeDefaultFlags();
        featureFlagService.subscribeToUpdates();
        logger.info('Feature flag service initialized');

        // Schedule backups
        if (environmentManager.isProduction()) {
            backupService.scheduleBackups();
            logger.info('Backup scheduling initialized');
        }

        // Error handling middleware (must be last)
        app.use(errorHandler);

        // Start server
        const port = config.server.port;
        server.listen(port, () => {
            logger.info(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            server.close(() => {
                logger.info('Process terminated');
                process.exit(0);
            });
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();