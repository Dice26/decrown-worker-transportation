import { Router, Request, Response, NextFunction } from 'express';
import { PaymentService } from '@/services/paymentService';
import { PaymentRetryService } from '@/services/paymentRetryService';
import { PaymentTestingService } from '@/services/paymentTestingService';
import { MockPaymentProvider } from '@/services/paymentProviders/mockPaymentProvider';
import { WebhookSecurityService } from '@/services/webhookSecurityService';
import {
    validateWebhook,
    rateLimitWebhooks,
    storeWebhookEvent,
    handleWebhookError,
    WebhookRequest
} from '@/middleware/webhookSecurity';
import { authenticateToken, requireRole } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import Joi from 'joi';

const router = Router();

// Initialize services
const mockProvider = new MockPaymentProvider();
const paymentService = new PaymentService(mockProvider);
const paymentRetryService = new PaymentRetryService(paymentService, mockProvider);
const paymentTestingService = new PaymentTestingService();
const webhookSecurityService = new WebhookSecurityService();

// Validation schemas
const invoiceGenerationSchema = Joi.object({
    userId: Joi.string().uuid().required(),
    billingPeriod: Joi.object({
        start: Joi.date().required(),
        end: Joi.date().required()
    }).required(),
    dryRun: Joi.boolean().default(false)
});

const paymentProcessingSchema = Joi.object({
    invoiceId: Joi.string().uuid().required(),
    paymentMethodToken: Joi.string().optional(),
    dryRun: Joi.boolean().default(false)
});

const billingCycleSchema = Joi.object({
    year: Joi.number().integer().min(2020).max(2030).required(),
    month: Joi.number().integer().min(1).max(12).required(),
    dryRun: Joi.boolean().default(false)
});

const usageAggregationSchema = Joi.object({
    userId: Joi.string().uuid().required(),
    year: Joi.number().integer().min(2020).max(2030).required(),
    month: Joi.number().integer().min(1).max(12).required()
});

/**
 * GET /api/payment/usage/:userId/:year/:month
 * Aggregate monthly usage data for a user
 */
router.get('/usage/:userId/:year/:month',
    authenticateToken,
    requireRole(['finance', 'admin']),
    async (req: Request, res: Response) => {
        try {
            const { error, value } = usageAggregationSchema.validate({
                userId: req.params.userId,
                year: parseInt(req.params.year),
                month: parseInt(req.params.month)
            });

            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.details
                });
            }

            const { userId, year, month } = value;
            const usageData = await paymentService.aggregateMonthlyUsage(userId, year, month);

            res.json({
                success: true,
                data: usageData
            });
        } catch (error) {
            logger.error('Failed to aggregate usage data:', error);
            res.status(500).json({
                error: 'Failed to aggregate usage data',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/invoices/generate
 * Generate invoice for user's monthly usage
 */
router.post('/invoices/generate',
    authenticateToken,
    requireRole(['finance', 'admin']),
    async (req: Request, res: Response) => {
        try {
            const { error, value } = invoiceGenerationSchema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.details
                });
            }

            const invoice = await paymentService.generateInvoice(value);

            res.json({
                success: true,
                data: invoice
            });
        } catch (error) {
            logger.error('Failed to generate invoice:', error);
            res.status(500).json({
                error: 'Failed to generate invoice',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * GET /api/payment/invoices/:invoiceId
 * Get invoice by ID
 */
router.get('/invoices/:invoiceId',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const invoiceId = req.params.invoiceId;
            const invoice = await paymentService.getInvoiceById(invoiceId);

            if (!invoice) {
                return res.status(404).json({
                    error: 'Invoice not found'
                });
            }

            // Check if user can access this invoice
            const user = req.user as any;
            if (user.role !== 'admin' && user.role !== 'finance' && invoice.userId !== user.id) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            res.json({
                success: true,
                data: invoice
            });
        } catch (error) {
            logger.error('Failed to get invoice:', error);
            res.status(500).json({
                error: 'Failed to get invoice',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/process
 * Process payment for an invoice
 */
router.post('/process',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { error, value } = paymentProcessingSchema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.details
                });
            }

            // Check if user can process payment for this invoice
            const invoice = await paymentService.getInvoiceById(value.invoiceId);
            if (!invoice) {
                return res.status(404).json({
                    error: 'Invoice not found'
                });
            }

            const user = req.user as any;
            if (user.role !== 'admin' && user.role !== 'finance' && invoice.userId !== user.id) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            const paymentAttempt = await paymentService.processPayment(value);

            res.json({
                success: true,
                data: paymentAttempt
            });
        } catch (error) {
            logger.error('Failed to process payment:', error);
            res.status(500).json({
                error: 'Failed to process payment',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/billing-cycle
 * Run monthly billing cycle
 */
router.post('/billing-cycle',
    authenticateToken,
    requireRole(['finance', 'admin']),
    async (req: Request, res: Response) => {
        try {
            const { error, value } = billingCycleSchema.validate(req.body);

            if (error) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.details
                });
            }

            const { year, month, dryRun } = value;
            const result = await paymentService.runBillingCycle(year, month, dryRun);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error('Failed to run billing cycle:', error);
            res.status(500).json({
                error: 'Failed to run billing cycle',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * GET /api/payment/ledger/:userId/:month
 * Get usage ledger for user and month
 */
router.get('/ledger/:userId/:month',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { userId, month } = req.params;

            // Check access permissions
            const user = req.user as any;
            if (user.role !== 'admin' && user.role !== 'finance' && userId !== user.id) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            const ledger = await paymentService.getUsageLedger(userId, month);

            if (!ledger) {
                return res.status(404).json({
                    error: 'Usage ledger not found'
                });
            }

            res.json({
                success: true,
                data: ledger
            });
        } catch (error) {
            logger.error('Failed to get usage ledger:', error);
            res.status(500).json({
                error: 'Failed to get usage ledger',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/retry/process
 * Process payment retries
 */
router.post('/retry/process',
    authenticateToken,
    requireRole(['finance', 'admin']),
    async (req: Request, res: Response) => {
        try {
            const result = await paymentRetryService.processPaymentRetries();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error('Failed to process payment retries:', error);
            res.status(500).json({
                error: 'Failed to process payment retries',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/dunning/process
 * Process dunning notices
 */
router.post('/dunning/process',
    authenticateToken,
    requireRole(['finance', 'admin']),
    async (req: Request, res: Response) => {
        try {
            const result = await paymentRetryService.processDunningNotices();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error('Failed to process dunning notices:', error);
            res.status(500).json({
                error: 'Failed to process dunning notices',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/webhook/:provider
 * Handle payment provider webhooks with security validation
 */
router.post('/webhook/:provider',
    validateWebhook('mock'), // Default to mock for now, would be dynamic based on :provider param
    rateLimitWebhooks(100), // 100 requests per minute
    storeWebhookEvent,
    async (req: WebhookRequest, res: Response, next: NextFunction) => {
        try {
            const provider = req.params.provider;
            const signature = req.headers['x-webhook-signature'] as string ||
                req.headers['stripe-signature'] as string ||
                req.headers['paymongo-signature'] as string;

            if (!signature) {
                return res.status(400).json({
                    error: 'Missing webhook signature',
                    code: 'MISSING_SIGNATURE'
                });
            }

            // Process the webhook event
            await paymentRetryService.handleWebhookEvent(req.body, signature);

            // Mark webhook as successfully processed
            if (req.webhook?.webhookId) {
                await webhookSecurityService.markEventProcessed(req.webhook.webhookId, true);
            }

            res.json({
                success: true,
                message: 'Webhook processed successfully',
                eventId: req.webhook?.eventId
            });
        } catch (error) {
            next(error); // Pass to error handler
        }
    },
    handleWebhookError
);

/**
 * POST /api/payment/test/run
 * Run payment system tests (admin only)
 */
router.post('/test/run',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const result = await paymentTestingService.runPaymentTests();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error('Failed to run payment tests:', error);
            res.status(500).json({
                error: 'Failed to run payment tests',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * POST /api/payment/test/generate-data
 * Generate test data for payment testing (admin only)
 */
router.post('/test/generate-data',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            const result = await paymentTestingService.generateTestData();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error('Failed to generate test data:', error);
            res.status(500).json({
                error: 'Failed to generate test data',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * DELETE /api/payment/test/cleanup
 * Clean up test data (admin only)
 */
router.delete('/test/cleanup',
    authenticateToken,
    requireRole(['admin']),
    async (req: Request, res: Response) => {
        try {
            await paymentTestingService.cleanupTestData();

            res.json({
                success: true,
                message: 'Test data cleaned up successfully'
            });
        } catch (error) {
            logger.error('Failed to cleanup test data:', error);
            res.status(500).json({
                error: 'Failed to cleanup test data',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

export default router;