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
 * Stripe payment provider implementation with enhanced webhook security
 */
export class StripePaymentProvider implements PaymentProvider {
    private apiKey: string;
    private webhookSecret: string;
    private apiVersion: string = '2023-10-16';
    private baseUrl: string = 'https://api.stripe.com/v1';

    constructor(apiKey?: string, webhookSecret?: string) {
        this.apiKey = apiKey || process.env.STRIPE_SECRET_KEY || '';
        this.webhookSecret = webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';

        if (!this.apiKey) {
            throw new Error('Stripe API key is required');
        }
        if (!this.webhookSecret) {
            throw new Error('Stripe webhook secret is required');
        }
    }

    async createCustomer(user: { id: string; email: string }): Promise<string> {
        try {
            const response = await this.makeStripeRequest('POST', '/customers', {
                email: user.email,
                metadata: {
                    user_id: user.id
                }
            });

            logger.info('Stripe customer created', {
                customerId: response.id,
                userId: user.id,
                email: user.email
            });

            return response.id;
        } catch (error) {
            logger.error('Failed to create Stripe customer:', error);
            throw error;
        }
    }

    async tokenizePaymentMethod(paymentData: any): Promise<string> {
        try {
            const response = await this.makeStripeRequest('POST', '/payment_methods', {
                type: 'card',
                card: {
                    number: paymentData.number,
                    exp_month: paymentData.expMonth,
                    exp_year: paymentData.expYear,
                    cvc: paymentData.cvc
                }
            });

            logger.info('Stripe payment method tokenized', {
                paymentMethodId: response.id,
                last4: response.card?.last4
            });

            return response.id;
        } catch (error) {
            logger.error('Failed to tokenize payment method:', error);
            throw error;
        }
    }

    async chargeCustomer(
        customerId: string,
        amount: number,
        currency: string,
        idempotencyKey: string
    ): Promise<ChargeResult> {
        try {
            const response = await this.makeStripeRequest('POST', '/payment_intents', {
                customer: customerId,
                amount: Math.round(amount * 100), // Convert to cents
                currency: currency.toLowerCase(),
                automatic_payment_methods: {
                    enabled: true
                },
                confirm: true,
                metadata: {
                    idempotency_key: idempotencyKey
                }
            }, {
                'Idempotency-Key': idempotencyKey
            });

            const success = response.status === 'succeeded';
            const status: PaymentStatus = this.mapStripeStatus(response.status);

            logger.info('Stripe payment processed', {
                paymentIntentId: response.id,
                customerId,
                amount,
                currency,
                status: response.status,
                idempotencyKey
            });

            return {
                success,
                transactionId: response.id,
                status,
                failureReason: success ? undefined : response.last_payment_error?.message,
                metadata: {
                    stripePaymentIntent: response.id,
                    stripeStatus: response.status,
                    clientSecret: response.client_secret
                }
            };
        } catch (error) {
            logger.error('Failed to charge Stripe customer:', error);

            return {
                success: false,
                status: 'failed',
                failureReason: error instanceof Error ? error.message : 'Payment processing failed'
            };
        }
    }

    async refundCharge(chargeId: string, amount?: number): Promise<RefundResult> {
        try {
            const refundData: any = {
                payment_intent: chargeId
            };

            if (amount !== undefined) {
                refundData.amount = Math.round(amount * 100); // Convert to cents
            }

            const response = await this.makeStripeRequest('POST', '/refunds', refundData);

            const success = response.status === 'succeeded';

            logger.info('Stripe refund processed', {
                refundId: response.id,
                paymentIntentId: chargeId,
                amount: response.amount / 100,
                status: response.status
            });

            return {
                success,
                refundId: response.id,
                amount: response.amount / 100,
                status: success ? 'succeeded' : 'failed',
                failureReason: success ? undefined : response.failure_reason
            };
        } catch (error) {
            logger.error('Failed to refund Stripe charge:', error);

            return {
                success: false,
                refundId: undefined,
                amount: amount || 0,
                status: 'failed',
                failureReason: error instanceof Error ? error.message : 'Refund failed'
            };
        }
    }

    async handleWebhook(payload: any, signature: string): Promise<WebhookEvent> {
        try {
            // Validate webhook signature
            this.validateWebhookSignature(payload, signature);

            const event: WebhookEvent = {
                id: payload.id,
                type: payload.type,
                data: payload.data,
                timestamp: new Date(payload.created * 1000)
            };

            logger.info('Stripe webhook processed', {
                eventId: event.id,
                eventType: event.type,
                timestamp: event.timestamp
            });

            return event;
        } catch (error) {
            logger.error('Failed to process Stripe webhook:', error);
            throw error;
        }
    }

    /**
     * Validate Stripe webhook signature
     */
    private validateWebhookSignature(payload: any, signature: string): void {
        const elements = signature.split(',');
        const signatureElements: Record<string, string> = {};

        for (const element of elements) {
            const [key, value] = element.split('=');
            signatureElements[key] = value;
        }

        if (!signatureElements.t || !signatureElements.v1) {
            throw new Error('Invalid Stripe webhook signature format');
        }

        const timestamp = signatureElements.t;
        const expectedSignature = signatureElements.v1;

        // Check timestamp tolerance (5 minutes)
        const webhookTimestamp = parseInt(timestamp, 10);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const timeDifference = Math.abs(currentTimestamp - webhookTimestamp);

        if (timeDifference > 300) { // 5 minutes
            throw new Error('Webhook timestamp too old');
        }

        // Verify signature
        const payloadString = JSON.stringify(payload);
        const signedPayload = `${timestamp}.${payloadString}`;

        const computedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(signedPayload, 'utf8')
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(computedSignature))) {
            throw new Error('Invalid Stripe webhook signature');
        }
    }

    /**
     * Make authenticated request to Stripe API
     */
    private async makeStripeRequest(
        method: string,
        endpoint: string,
        data?: any,
        additionalHeaders?: Record<string, string>
    ): Promise<any> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Stripe-Version': this.apiVersion,
            ...additionalHeaders
        };

        const body = data ? new URLSearchParams(this.flattenObject(data)).toString() : undefined;

        // In a real implementation, this would use fetch or axios
        // For now, we'll simulate the response
        return this.simulateStripeResponse(method, endpoint, data);
    }

    /**
     * Simulate Stripe API responses for testing
     */
    private simulateStripeResponse(method: string, endpoint: string, data?: any): any {
        const baseResponse = {
            id: `stripe_${uuidv4().replace(/-/g, '')}`,
            object: this.getObjectType(endpoint),
            created: Math.floor(Date.now() / 1000),
            livemode: false
        };

        switch (endpoint) {
            case '/customers':
                return {
                    ...baseResponse,
                    email: data?.email,
                    metadata: data?.metadata || {}
                };

            case '/payment_methods':
                return {
                    ...baseResponse,
                    type: 'card',
                    card: {
                        last4: '4242',
                        brand: 'visa',
                        exp_month: data?.card?.exp_month,
                        exp_year: data?.card?.exp_year
                    }
                };

            case '/payment_intents':
                const success = Math.random() > 0.1; // 90% success rate
                return {
                    ...baseResponse,
                    amount: data?.amount,
                    currency: data?.currency,
                    customer: data?.customer,
                    status: success ? 'succeeded' : 'requires_payment_method',
                    client_secret: `pi_${baseResponse.id}_secret_test`,
                    last_payment_error: success ? null : {
                        message: 'Your card was declined.',
                        type: 'card_error',
                        code: 'card_declined'
                    },
                    metadata: data?.metadata || {}
                };

            case '/refunds':
                return {
                    ...baseResponse,
                    amount: data?.amount,
                    payment_intent: data?.payment_intent,
                    status: 'succeeded'
                };

            default:
                return baseResponse;
        }
    }

    private getObjectType(endpoint: string): string {
        const objectMap: Record<string, string> = {
            '/customers': 'customer',
            '/payment_methods': 'payment_method',
            '/payment_intents': 'payment_intent',
            '/refunds': 'refund'
        };
        return objectMap[endpoint] || 'unknown';
    }

    private mapStripeStatus(stripeStatus: string): PaymentStatus {
        const statusMap: Record<string, PaymentStatus> = {
            'succeeded': 'succeeded',
            'processing': 'processing',
            'requires_payment_method': 'failed',
            'requires_confirmation': 'pending',
            'requires_action': 'pending',
            'canceled': 'cancelled'
        };
        return statusMap[stripeStatus] || 'failed';
    }

    private flattenObject(obj: any, prefix: string = ''): Record<string, string> {
        const flattened: Record<string, string> = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = prefix ? `${prefix}[${key}]` : key;

                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    Object.assign(flattened, this.flattenObject(obj[key], newKey));
                } else {
                    flattened[newKey] = String(obj[key]);
                }
            }
        }

        return flattened;
    }
}