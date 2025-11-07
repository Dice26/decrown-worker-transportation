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
 * PayMongo payment provider implementation with enhanced webhook security
 */
export class PayMongoPaymentProvider implements PaymentProvider {
    private secretKey: string;
    private publicKey: string;
    private webhookSecret: string;
    private baseUrl: string = 'https://api.paymongo.com/v1';

    constructor(secretKey?: string, publicKey?: string, webhookSecret?: string) {
        this.secretKey = secretKey || process.env.PAYMONGO_SECRET_KEY || '';
        this.publicKey = publicKey || process.env.PAYMONGO_PUBLIC_KEY || '';
        this.webhookSecret = webhookSecret || process.env.PAYMONGO_WEBHOOK_SECRET || '';

        if (!this.secretKey) {
            throw new Error('PayMongo secret key is required');
        }
        if (!this.webhookSecret) {
            throw new Error('PayMongo webhook secret is required');
        }
    }

    async createCustomer(user: { id: string; email: string }): Promise<string> {
        try {
            const response = await this.makePayMongoRequest('POST', '/customers', {
                data: {
                    attributes: {
                        email: user.email,
                        first_name: 'User',
                        last_name: user.id,
                        metadata: {
                            user_id: user.id
                        }
                    }
                }
            });

            logger.info('PayMongo customer created', {
                customerId: response.data.id,
                userId: user.id,
                email: user.email
            });

            return response.data.id;
        } catch (error) {
            logger.error('Failed to create PayMongo customer:', error);
            throw error;
        }
    }

    async tokenizePaymentMethod(paymentData: any): Promise<string> {
        try {
            const response = await this.makePayMongoRequest('POST', '/payment_methods', {
                data: {
                    attributes: {
                        type: 'card',
                        details: {
                            card_number: paymentData.number,
                            exp_month: paymentData.expMonth,
                            exp_year: paymentData.expYear,
                            cvc: paymentData.cvc
                        }
                    }
                }
            });

            logger.info('PayMongo payment method tokenized', {
                paymentMethodId: response.data.id,
                last4: response.data.attributes.details?.last4
            });

            return response.data.id;
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
            // First create a payment intent
            const intentResponse = await this.makePayMongoRequest('POST', '/payment_intents', {
                data: {
                    attributes: {
                        amount: Math.round(amount * 100), // Convert to centavos
                        currency: currency.toUpperCase(),
                        payment_method_allowed: ['card'],
                        payment_method_options: {
                            card: {
                                request_three_d_secure: 'automatic'
                            }
                        },
                        metadata: {
                            customer_id: customerId,
                            idempotency_key: idempotencyKey
                        }
                    }
                }
            }, {
                'Idempotency-Key': idempotencyKey
            });

            // Attach payment method and confirm
            const confirmResponse = await this.makePayMongoRequest('POST', `/payment_intents/${intentResponse.data.id}/attach`, {
                data: {
                    attributes: {
                        payment_method: customerId, // Assuming customer has default payment method
                        client_key: this.publicKey
                    }
                }
            });

            const success = confirmResponse.data.attributes.status === 'succeeded';
            const status: PaymentStatus = this.mapPayMongoStatus(confirmResponse.data.attributes.status);

            logger.info('PayMongo payment processed', {
                paymentIntentId: confirmResponse.data.id,
                customerId,
                amount,
                currency,
                status: confirmResponse.data.attributes.status,
                idempotencyKey
            });

            return {
                success,
                transactionId: confirmResponse.data.id,
                status,
                failureReason: success ? undefined : confirmResponse.data.attributes.last_payment_error?.message,
                metadata: {
                    payMongoPaymentIntent: confirmResponse.data.id,
                    payMongoStatus: confirmResponse.data.attributes.status,
                    clientKey: confirmResponse.data.attributes.client_key
                }
            };
        } catch (error) {
            logger.error('Failed to charge PayMongo customer:', error);

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
                data: {
                    attributes: {
                        payment_intent: chargeId,
                        reason: 'requested_by_customer'
                    }
                }
            };

            if (amount !== undefined) {
                refundData.data.attributes.amount = Math.round(amount * 100); // Convert to centavos
            }

            const response = await this.makePayMongoRequest('POST', '/refunds', refundData);

            const success = response.data.attributes.status === 'succeeded';

            logger.info('PayMongo refund processed', {
                refundId: response.data.id,
                paymentIntentId: chargeId,
                amount: response.data.attributes.amount / 100,
                status: response.data.attributes.status
            });

            return {
                success,
                refundId: response.data.id,
                amount: response.data.attributes.amount / 100,
                status: success ? 'succeeded' : 'failed',
                failureReason: success ? undefined : response.data.attributes.failure_reason
            };
        } catch (error) {
            logger.error('Failed to refund PayMongo charge:', error);

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
                id: payload.data.id,
                type: payload.data.attributes.type,
                data: payload.data.attributes.data,
                timestamp: new Date(payload.data.attributes.created_at)
            };

            logger.info('PayMongo webhook processed', {
                eventId: event.id,
                eventType: event.type,
                timestamp: event.timestamp
            });

            return event;
        } catch (error) {
            logger.error('Failed to process PayMongo webhook:', error);
            throw error;
        }
    }

    /**
     * Validate PayMongo webhook signature
     */
    private validateWebhookSignature(payload: any, signature: string): void {
        const payloadString = JSON.stringify(payload);

        const computedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(payloadString, 'utf8')
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
            throw new Error('Invalid PayMongo webhook signature');
        }
    }

    /**
     * Make authenticated request to PayMongo API
     */
    private async makePayMongoRequest(
        method: string,
        endpoint: string,
        data?: any,
        additionalHeaders?: Record<string, string>
    ): Promise<any> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers: Record<string, string> = {
            'Authorization': `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...additionalHeaders
        };

        // In a real implementation, this would use fetch or axios
        // For now, we'll simulate the response
        return this.simulatePayMongoResponse(method, endpoint, data);
    }

    /**
     * Simulate PayMongo API responses for testing
     */
    private simulatePayMongoResponse(method: string, endpoint: string, data?: any): any {
        const baseResponse = {
            data: {
                id: `paymongo_${uuidv4().replace(/-/g, '')}`,
                type: this.getResourceType(endpoint),
                attributes: {
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    live_mode: false
                }
            }
        };

        switch (true) {
            case endpoint === '/customers':
                return {
                    ...baseResponse,
                    data: {
                        ...baseResponse.data,
                        attributes: {
                            ...baseResponse.data.attributes,
                            email: data?.data?.attributes?.email,
                            first_name: data?.data?.attributes?.first_name,
                            last_name: data?.data?.attributes?.last_name,
                            metadata: data?.data?.attributes?.metadata || {}
                        }
                    }
                };

            case endpoint === '/payment_methods':
                return {
                    ...baseResponse,
                    data: {
                        ...baseResponse.data,
                        attributes: {
                            ...baseResponse.data.attributes,
                            type: 'card',
                            details: {
                                last4: '4242',
                                exp_month: data?.data?.attributes?.details?.exp_month,
                                exp_year: data?.data?.attributes?.details?.exp_year
                            }
                        }
                    }
                };

            case endpoint === '/payment_intents':
                const success = Math.random() > 0.1; // 90% success rate
                return {
                    ...baseResponse,
                    data: {
                        ...baseResponse.data,
                        attributes: {
                            ...baseResponse.data.attributes,
                            amount: data?.data?.attributes?.amount,
                            currency: data?.data?.attributes?.currency,
                            status: success ? 'awaiting_payment_method' : 'failed',
                            client_key: `pi_${baseResponse.data.id}_client`,
                            metadata: data?.data?.attributes?.metadata || {}
                        }
                    }
                };

            case endpoint.includes('/attach'):
                const attachSuccess = Math.random() > 0.1; // 90% success rate
                return {
                    ...baseResponse,
                    data: {
                        ...baseResponse.data,
                        attributes: {
                            ...baseResponse.data.attributes,
                            status: attachSuccess ? 'succeeded' : 'failed',
                            client_key: data?.data?.attributes?.client_key,
                            last_payment_error: attachSuccess ? null : {
                                message: 'Your card was declined.',
                                type: 'card_error',
                                code: 'card_declined'
                            }
                        }
                    }
                };

            case endpoint === '/refunds':
                return {
                    ...baseResponse,
                    data: {
                        ...baseResponse.data,
                        attributes: {
                            ...baseResponse.data.attributes,
                            amount: data?.data?.attributes?.amount,
                            payment_intent: data?.data?.attributes?.payment_intent,
                            status: 'succeeded',
                            reason: data?.data?.attributes?.reason
                        }
                    }
                };

            default:
                return baseResponse;
        }
    }

    private getResourceType(endpoint: string): string {
        const typeMap: Record<string, string> = {
            '/customers': 'customer',
            '/payment_methods': 'payment_method',
            '/payment_intents': 'payment_intent',
            '/refunds': 'refund'
        };

        for (const [path, type] of Object.entries(typeMap)) {
            if (endpoint.includes(path)) {
                return type;
            }
        }

        return 'unknown';
    }

    private mapPayMongoStatus(payMongoStatus: string): PaymentStatus {
        const statusMap: Record<string, PaymentStatus> = {
            'succeeded': 'succeeded',
            'processing': 'processing',
            'awaiting_payment_method': 'pending',
            'awaiting_next_action': 'pending',
            'failed': 'failed',
            'cancelled': 'cancelled'
        };
        return statusMap[payMongoStatus] || 'failed';
    }
}