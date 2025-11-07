export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'card' | 'bank_transfer' | 'digital_wallet';
export type DunningStatus = 'none' | 'notice_1' | 'notice_2' | 'notice_3' | 'suspended';

export interface Invoice {
    id: string;
    userId: string;
    billingPeriod: {
        start: Date;
        end: Date;
    };
    lineItems: InvoiceLineItem[];
    totalAmount: number;
    currency: string;
    dueDate: Date;
    status: InvoiceStatus;
    paymentAttempts: PaymentAttempt[];
    createdAt: Date;
    updatedAt: Date;
    paidAt?: Date;
    notes?: string;
}

export interface InvoiceLineItem {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    metadata?: Record<string, any>;
}

export interface UsageLedger {
    id: string;
    userId: string;
    month: string; // YYYY-MM format
    ridesCount: number;
    totalDistance: number;
    totalDuration: number;
    costComponents: CostComponents;
    adjustments: LedgerAdjustment[];
    finalAmount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CostComponents {
    baseFare: number;
    distanceFee: number;
    timeFee: number;
    surcharges: number;
    discounts: number;
}

export interface LedgerAdjustment {
    id: string;
    type: 'credit' | 'debit';
    amount: number;
    reason: string;
    appliedBy: string;
    appliedAt: Date;
    metadata?: Record<string, any>;
}

export interface PaymentAttempt {
    id: string;
    invoiceId: string;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    status: PaymentStatus;
    providerTransactionId?: string;
    providerResponse?: Record<string, any>;
    failureReason?: string;
    idempotencyKey: string;
    attemptedAt: Date;
    completedAt?: Date;
    retryCount: number;
    nextRetryAt?: Date;
}

export interface PaymentProvider {
    createCustomer(user: { id: string; email: string; }): Promise<string>;
    tokenizePaymentMethod(paymentData: any): Promise<string>;
    chargeCustomer(customerId: string, amount: number, currency: string, idempotencyKey: string): Promise<ChargeResult>;
    handleWebhook(payload: any, signature: string): Promise<WebhookEvent>;
    refundCharge(chargeId: string, amount?: number): Promise<RefundResult>;
}

export interface ChargeResult {
    success: boolean;
    transactionId?: string;
    status: PaymentStatus;
    failureReason?: string;
    metadata?: Record<string, any>;
}

export interface RefundResult {
    success: boolean;
    refundId?: string;
    amount: number;
    status: 'pending' | 'succeeded' | 'failed';
    failureReason?: string;
}

export interface WebhookEvent {
    id: string;
    type: string;
    data: Record<string, any>;
    timestamp: Date;
}

export interface DunningNotice {
    id: string;
    invoiceId: string;
    userId: string;
    status: DunningStatus;
    noticeLevel: number;
    sentAt: Date;
    dueDate: Date;
    amount: number;
    message: string;
    deliveryMethod: 'email' | 'sms' | 'push';
    delivered: boolean;
    deliveredAt?: Date;
}

export interface PaymentConfiguration {
    baseFarePerRide: number;
    distanceFeePerKm: number;
    timeFeePerMinute: number;
    currency: string;
    paymentRetryAttempts: number;
    retryDelayMinutes: number[];
    dunningNoticeDays: number[];
    suspensionGraceDays: number;
    dryRunMode: boolean;
}

export interface InvoiceGenerationRequest {
    userId: string;
    billingPeriod: {
        start: Date;
        end: Date;
    };
    dryRun?: boolean;
}

export interface PaymentProcessingRequest {
    invoiceId: string;
    paymentMethodToken?: string;
    dryRun?: boolean;
}

export interface UsageAggregationResult {
    userId: string;
    period: string;
    ridesCount: number;
    totalDistance: number;
    totalDuration: number;
    rawCost: number;
    adjustments: number;
    finalCost: number;
}

export interface BillingCycleResult {
    processedUsers: number;
    generatedInvoices: number;
    totalAmount: number;
    errors: Array<{
        userId: string;
        error: string;
    }>;
}

export interface PaymentRetryConfig {
    maxAttempts: number;
    baseDelayMinutes: number;
    maxDelayMinutes: number;
    backoffMultiplier: number;
}

export interface WebhookValidationResult {
    isValid: boolean;
    event?: WebhookEvent;
    error?: string;
}