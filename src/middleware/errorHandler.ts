import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface ErrorResponse {
    error: {
        code: string;
        message: string;
        correlationId: string;
        timestamp: string;
        details?: Record<string, any>;
        retryable: boolean;
    };
}

export class AppError extends Error {
    public statusCode: number;
    public code: string;
    public retryable: boolean;
    public details?: Record<string, any>;

    constructor(
        message: string,
        statusCode: number = 500,
        code: string = 'INTERNAL_ERROR',
        retryable: boolean = false,
        details?: Record<string, any>
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.retryable = retryable;
        this.details = details;

        Error.captureStackTrace(this, this.constructor);
    }
}

export function errorHandler(
    error: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const correlationId = req.headers['x-correlation-id'] as string || 'unknown';

    // Default error values
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let retryable = false;
    let details: Record<string, any> | undefined;

    // Handle known error types
    if (error instanceof AppError) {
        statusCode = error.statusCode;
        code = error.code;
        retryable = error.retryable;
        details = error.details;
    } else if (error.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_FAILED';
        retryable = false;
        details = { validation: error.message };
    } else if (error.name === 'UnauthorizedError' || error.message.includes('jwt')) {
        statusCode = 401;
        code = 'UNAUTHORIZED';
        retryable = false;
    } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
        code = 'FORBIDDEN';
        retryable = false;
    } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        code = 'NOT_FOUND';
        retryable = false;
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
        statusCode = 503;
        code = 'SERVICE_UNAVAILABLE';
        retryable = true;
    }

    // Log error
    const logLevel = statusCode >= 500 ? 'error' : 'warn';
    logger.log(logLevel, 'Request error', {
        correlationId,
        statusCode,
        code,
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
    });

    // Prepare error response
    const errorResponse: ErrorResponse = {
        error: {
            code,
            message: statusCode >= 500 ? 'Internal server error' : error.message,
            correlationId,
            timestamp: new Date().toISOString(),
            retryable
        }
    };

    // Add details for client errors (4xx) but not server errors (5xx)
    if (statusCode < 500 && details) {
        errorResponse.error.details = details;
    }

    res.status(statusCode).json(errorResponse);
}

// Async error wrapper
export function asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}