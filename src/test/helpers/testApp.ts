import express, { Express } from 'express';
import { setupRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { auditMiddleware } from '@/middleware/auditMiddleware';

export async function setupTestApp(): Promise<Express> {
    const app = express();

    // Basic middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Add audit middleware for testing
    app.use(auditMiddleware);

    // Setup routes
    setupRoutes(app);

    // Error handling
    app.use(errorHandler);

    return app;
}