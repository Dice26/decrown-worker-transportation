import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
    // Clear existing entries
    await knex('devices').del();
    await knex('users').del();

    // Hash passwords
    const defaultPassword = await bcrypt.hash('password123', 10);

    // Insert seed users
    await knex('users').insert([
        {
            id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'admin@decrown.com',
            role: 'admin',
            department: 'IT',
            status: 'active',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: defaultPassword,
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440002',
            email: 'dispatcher@decrown.com',
            role: 'dispatcher',
            department: 'Operations',
            status: 'active',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: true,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: defaultPassword,
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440003',
            email: 'driver1@decrown.com',
            role: 'driver',
            department: 'Transport',
            status: 'active',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: defaultPassword,
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440004',
            email: 'worker1@decrown.com',
            role: 'worker',
            department: 'Engineering',
            status: 'active',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: defaultPassword,
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440005',
            email: 'worker2@decrown.com',
            role: 'worker',
            department: 'Engineering',
            status: 'active',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: true,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: defaultPassword,
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440006',
            email: 'finance@decrown.com',
            role: 'finance',
            department: 'Finance',
            status: 'active',
            consent_flags: {
                locationTracking: false,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date().toISOString()
            },
            password_hash: defaultPassword,
            created_at: new Date(),
            updated_at: new Date()
        }
    ]);

    // Insert seed devices
    await knex('devices').insert([
        {
            id: '660e8400-e29b-41d4-a716-446655440001',
            user_id: '550e8400-e29b-41d4-a716-446655440003', // driver1
            device_fingerprint: 'driver1-mobile-device-001',
            device_type: 'mobile',
            device_name: 'iPhone 14 Pro',
            os_version: 'iOS 17.1',
            app_version: '1.0.0',
            status: 'active',
            trust_level: 85,
            last_seen: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '660e8400-e29b-41d4-a716-446655440002',
            user_id: '550e8400-e29b-41d4-a716-446655440004', // worker1
            device_fingerprint: 'worker1-mobile-device-001',
            device_type: 'mobile',
            device_name: 'Samsung Galaxy S23',
            os_version: 'Android 14',
            app_version: '1.0.0',
            status: 'active',
            trust_level: 90,
            last_seen: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        },
        {
            id: '660e8400-e29b-41d4-a716-446655440003',
            user_id: '550e8400-e29b-41d4-a716-446655440005', // worker2
            device_fingerprint: 'worker2-mobile-device-001',
            device_type: 'mobile',
            device_name: 'iPhone 15',
            os_version: 'iOS 17.2',
            app_version: '1.0.0',
            status: 'active',
            trust_level: 95,
            last_seen: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        }
    ]);
}