import {
    PaymentProvider,
    ChargeResult,
    RefundResult,
    WebhookEvent,
    PaymentStatus
} from '@/types/payment';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Mock payment provider for testing and dry-run mode
 */
export class MockPaymentProvider implements PaymentProvider {
    private customers: Map<string, { id: string; email: string }> = new Map();
    private charges: Map<string, any> = new Map();
    private webhookSecret: string = 'mock_webhook_secret';

    async createCustomer(user: { id: string; email: string }): Promise<string> {
        const customerId = `cust_mock_${uuidv4()}`;
        this.customers.set(customerId, user);

        logger.info('Mock customer created', {
            customerId,
            userId: user.id,
            email: user.email
        });

        return customerId;
    }

    async tokenizePaymentMethod(paymentData: any): Promise<string> {
        const token = `pm_mock_${uuidv4()}`;

        logger.info('Mock payment method tokenized', {
            token,
            paymentData: { ...paymentData, number: '****' } // Mask sensitive data
        });

        return token;
    }

    async chargeCustomer(
        customerId: string,
        amount: number,
        currency: string,
        idempotencyKey: string
    ): Promise<ChargeResult> {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if charge already exists (idempotency)
        if (this.charges.has(idempotencyKey)) {
            const existingCharge = this.charges.get(idempotencyKey);
            return {
                success: existingCharge.status === 'succeeded',
                transactionId: existingCharge.id,
                status: existingCharge.status,
                failureReason: existingCharge.failureReason,
                metadata: existingCharge.metadata
            };
        }

        // Simulate different payment outcomes
        const outcome = this.simulatePaymentOutcome(amount);
        const chargeId = `ch_mock_${uuidv4()}`;

        const charge = {
            id: chargeId,
            customerId,
            amount,
            currency,
            status: outcome.status,
            failureReason: outcome.failureReason,
            metadata: {
                mockProvider: true,
                simulatedAt: new Date().toISOString(),
                idempotencyKey
            },
            createdAt: new Date()
        };

        this.charges.set(idempotencyKey, charge);
        this.charges.set(chargeId, charge);

        logger.info('Mock charge processed', {
            chargeId,
            customerId,
            amount,
            currency,
            status: outcome.status,
            idempotencyKey
        });

        return {
            success: outcome.status === 'succeeded',
            transactionId: chargeId,
            status: outcome.status,
            failureReason: outcome.failureReason,
            metadata: charge.metadata
        };
    }

    async refundCharge(chargeId: string, amount?: number): Promise<RefundResult> {
        const charge = this.charges.get(chargeId);
        if (!charge) {
            return {
                success: false,
                refundId: undefined,
                amount: amount || 0,
                status: 'failed',
                failureReason: 'Charge not found'
            };
        }

        if (charge.status !== 'succeeded') {
            return {
                success: false,
                refundId: undefined,
                amount: amount || 0,
                status: 'failed',
                failureReason: 'Cannot refund unsuccessful charge'
            };
        }

        const refundAmount = amount || charge.amount;
        const refundId = `re_mock_${uuidv4()}`;

        // Simulate refund processing
        const success = Math.random() > 0.05; // 95% success rate

        logger.info('Mock refund processed', {
            refundId,
            chargeId,
            amount: refundAmount,
            success
        });

        return {
            success,
            refundId: success ? refundId : undefined,
            amount: refundAmount,
            status: success ? 'succeeded' : 'failed',
            failureReason: success ? undefined : 'Simulated refund failure'
        };
    }

    async handleWebhook(payload: any, signature: string): Promise<WebhookEvent> {
        // Simulate webhook signature validation with timing attack protection
        const isValidSignature = this.validateWebhookSignature(payload, signature);

        if (!isValidSignature) {
            throw new Error('Invalid webhook signature');
        }

        // Simulate timestamp validation
        const timestamp = payload.created || Math.floor(Date.now() / 1000);
        const currentTime = Math.floor(Date.now() / 1000);
        const timeDiff = Math.abs(currentTime - timestamp);

        if (timeDiff > 300) { // 5 minutes tolerance
            throw new Error('Webhook timestamp too old or too far in future');
        }

        const event: WebhookEvent = {
            id: payload.id || `evt_mock_${uuidv4()}`,
            type: payload.type || 'payment.succeeded',
            data: payload.data || {},
            timestamp: new Date(timestamp * 1000)
        };

        logger.info('Mock webhook processed', {
            eventId: event.id,
            eventType: event.type,
            timestamp: event.timestamp,
            timeDiff
        });

        return event;
    }

    /**
     * Generate a mock webhook for testing with enhanced security
     */
    generateMockWebhook(eventType: string, data: any, options?: {
        timestamp?: number;
        invalidSignature?: boolean;
        oldTimestamp?: boolean;
    }): { payload: any; signature: string } {
        const timestamp = options?.oldTimestamp
            ? Math.floor(Date.now() / 1000) - 600 // 10 minutes old
            : options?.timestamp || Math.floor(Date.now() / 1000);

        const payload = {
            id: `evt_mock_${uuidv4()}`,
            type: eventType,
            data,
            created: timestamp
        };

        let signature = this.generateWebhookSignature(payload);

        if (options?.invalidSignature) {
            signature = 'invalid_signature_' + signature.slice(16);
        }

        return { payload, signature };
    }

    /**
     * Set webhook secret for testing
     */
    setWebhookSecret(secret: string): void {
        this.webhookSecret = secret;
    }

    private simulatePaymentOutcome(amount: number): { status: PaymentStatus; failureReason?: string } {
        // Simulate different failure scenarios based on amount
        if (amount <= 0) {
            return {
                status: 'failed',
                failureReason: 'Invalid amount'
            };
        }

        if (amount > 100000) { // Very large amounts fail more often
            if (Math.random() < 0.3) {
                return {
                    status: 'failed',
                    failureReason: 'Amount exceeds limit'
                };
            }
        }

        // Random failure simulation (10% failure rate)
        const random = Math.random();
        if (random < 0.05) {
            return {
                status: 'failed',
                failureReason: 'Insufficient funds'
            };
        } else if (random < 0.08) {
            return {
                status: 'failed',
                failureReason: 'Card declined'
            };
        } else if (random < 0.1) {
            return {
                status: 'failed',
                failureReason: 'Network error'
            };
        }

        return { status: 'succeeded' };
    }

    private validateWebhookSignature(payload: any, signature: string): boolean {
        try {
            // Enhanced mock validation with timing-safe comparison
            const expectedSignature = this.generateWebhookSignature(payload);

            // Use constant-time comparison to prevent timing attacks
            if (signature.length !== expectedSignature.length) {
                return false;
            }

            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature)
            );
        } catch (error) {
            logger.error('Mock webhook signature validation error:', error);
            return false;
        }
    }

    private generateWebhookSignature(payload: any): string {
        // Enhanced mock signature generation using HMAC
        const payloadString = JSON.stringify(payload);

        return `mock_sig_${crypto
            .createHmac('sha256', this.webhookSecret)
            .update(payloadString, 'utf8')
            .digest('hex')
            .slice(0, 32)}`;
    }

    /**
     * Get all mock charges (for testing)
     */
    getMockCharges(): Map<string, any> {
        return new Map(this.charges);
    }

    /**
     * Clear all mock data (for testing)
     */
    clearMockData(): void {
        this.customers.clear();
        this.charges.clear();
    }
}