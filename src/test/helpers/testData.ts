import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/config/database';
import { User, UserRole } from '@/types/auth';
import { Invoice, PaymentAttempt, UsageLedger } from '@/types/payment';

export class TestDataFactory {
    private static db = getDatabase();

    // Export helper functions for backward compatibility
    static createTestUser = TestDataFactory.createUser;
    static createTestDevice = TestDataFactory.createDevice;

    static async createUser(overrides: Partial<any> = {}): Promise<any> {
        const defaultUser = {
            id: uuidv4(),
            email: `test-${Date.now()}@example.com`,
            role: 'worker' as UserRole,
            department: 'Engineering',
            status: 'active',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: await bcrypt.hash('password123', 10),
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides
        };

        const [user] = await this.db('users').insert(defaultUser).returning('*');
        return user;
    }

    static async createDevice(userId: string, overrides: Partial<any> = {}): Promise<any> {
        const defaultDevice = {
            id: uuidv4(),
            user_id: userId,
            device_fingerprint: `test-device-${Date.now()}`,
            device_type: 'mobile',
            device_name: 'Test Device',
            os_version: 'iOS 17.0',
            app_version: '1.0.0',
            status: 'active',
            trust_level: 75,
            last_seen: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides
        };

        const [device] = await this.db('devices').insert(defaultDevice).returning('*');
        return device;
    }

    static generateValidPassword(): string {
        return 'TestPass123!';
    }

    static generateWeakPassword(): string {
        return '123';
    }

    static generateValidEmail(): string {
        return `test-${Date.now()}@example.com`;
    }

    static generateInvalidEmail(): string {
        return 'invalid-email';
    }

    static async createTrip(userId: string, overrides: Partial<any> = {}): Promise<any> {
        const defaultTrip = {
            id: uuidv4(),
            status: 'completed',
            planned_stops: JSON.stringify([]),
            actual_stops: JSON.stringify([{
                userId,
                status: 'picked_up',
                location: { latitude: 14.5995, longitude: 120.9842 }
            }]),
            metrics: JSON.stringify({
                totalDistance: 5000,
                totalDuration: 30,
                pickupCount: 1,
                noShowCount: 0
            }),
            scheduled_at: new Date(),
            completed_at: new Date(),
            created_at: new Date(),
            ...overrides
        };

        const [trip] = await this.db('trips').insert(defaultTrip).returning('*');
        return trip;
    }

    static async createInvoice(userId: string, overrides: Partial<any> = {}): Promise<any> {
        const defaultInvoice = {
            id: uuidv4(),
            user_id: userId,
            billing_period_start: new Date('2024-01-01'),
            billing_period_end: new Date('2024-01-31'),
            line_items: JSON.stringify([{
                id: uuidv4(),
                description: 'Test transportation charges',
                quantity: 1,
                unitPrice: 100,
                totalPrice: 100
            }]),
            total_amount: 100,
            currency: 'PHP',
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides
        };

        const [invoice] = await this.db('invoices').insert(defaultInvoice).returning('*');
        return invoice;
    }

    static async createPaymentAttempt(invoiceId: string, overrides: Partial<any> = {}): Promise<any> {
        const defaultAttempt = {
            id: uuidv4(),
            invoice_id: invoiceId,
            amount: 100,
            currency: 'PHP',
            payment_method: 'card',
            status: 'pending',
            idempotency_key: uuidv4(),
            attempted_at: new Date(),
            retry_count: 0,
            ...overrides
        };

        const [attempt] = await this.db('payment_attempts').insert(defaultAttempt).returning('*');
        return attempt;
    }

    static async createUsageLedger(userId: string, overrides: Partial<any> = {}): Promise<any> {
        const defaultLedger = {
            id: uuidv4(),
            user_id: userId,
            month: '2024-01',
            rides_count: 1,
            total_distance: 5000,
            total_duration: 30,
            cost_components: JSON.stringify({
                baseFare: 50,
                distanceFee: 75,
                timeFee: 60,
                surcharges: 0,
                discounts: 0
            }),
            final_amount: 185,
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides
        };

        const [ledger] = await this.db('usage_ledgers').insert(defaultLedger).returning('*');
        return ledger;
    }

    static async createTripStop(tripId: string, userId: string, overrides: Partial<any> = {}): Promise<any> {
        const defaultStop = {
            id: uuidv4(),
            trip_id: tripId,
            user_id: userId,
            location: JSON.stringify({ latitude: 14.5995, longitude: 120.9842 }),
            status: 'picked_up',
            actual_arrival: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            ...overrides
        };

        const [stop] = await this.db('trip_stops').insert(defaultStop).returning('*');
        return stop;
    }

    static async updateUser(userId: string, updates: Partial<any>): Promise<any> {
        const [user] = await this.db('users')
            .where({ id: userId })
            .update({ ...updates, updated_at: new Date() })
            .returning('*');
        return user;
    }

    static async updateDevice(deviceId: string, updates: Partial<any>): Promise<any> {
        const [device] = await this.db('devices')
            .where({ id: deviceId })
            .update({ ...updates, updated_at: new Date() })
            .returning('*');
        return device;
    }

    static async cleanupTestData(): Promise<void> {
        // Clean up test data in reverse dependency order
        await this.db('payment_attempts').where('idempotency_key', 'like', '%test%').del();
        await this.db('invoices').where('user_id', 'like', '%test%').del();
        await this.db('trip_stops').where('user_id', 'like', '%test%').del();
        await this.db('trips').where('id', 'like', '%test%').del();
        await this.db('usage_ledgers').where('user_id', 'like', '%test%').del();
        await this.db('devices').where('user_id', 'like', '%test%').del();
        await this.db('users').where('email', 'like', '%test%').del();
    }
}