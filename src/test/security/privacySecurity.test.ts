import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestApp } from '@/test/helpers/testApp';
import { getDatabase } from '@/config/database';
import { Knex } from 'knex';
import jwt from 'jsonwebtoken';

describe('Privacy and Access Control Security Tests', () => {
    let app: any;
    let db: Knex;
    let workerToken: string;
    let dispatcherToken: string;
    let adminToken: string;
    let workerId: string;
    let dispatcherId: string;
    let adminId: string;

    beforeEach(async () => {
        app = await setupTestApp();
        db = getDatabase();

        // Clean up test data
        await db('users').del();
        await db('location_points').del();
        await db('audit_events').del();
        await db('consent_logs').del();

        // Create test users with different roles
        const worker = await db('users').insert({
            id: 'worker-user',
            email: 'worker@example.com',
            role: 'worker',
            status: 'active',
            consent_flags: JSON.stringify({
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            })
        }).returning('*');

        const dispatcher = await db('users').insert({
            id: 'dispatcher-user',
            email: 'dispatcher@example.com',
            role: 'dispatcher',
            status: 'active'
        }).returning('*');

        const admin = await db('users').insert({
            id: 'admin-user',
            email: 'admin@example.com',
            role: 'admin',
            status: 'active'
        }).returning('*');

        workerId = worker[0].id;
        dispatcherId = dispatcher[0].id;
        adminId = admin[0].id;

        workerToken = jwt.sign(
            { userId: workerId, role: 'worker' },
            process.env.JWT_SECRET!,
            { expiresIn: '15m' }
        );

        dispatcherToken = jwt.sign(
            { userId: dispatcherId, role: 'dispatcher' },
            process.env.JWT_SECRET!,
            { expiresIn: '15m' }
        );

        adminToken = jwt.sign(
            { userId: adminId, role: 'admin' },
            process.env.JWT_SECRET!,
            { expiresIn: '15m' }
        );
    });

    afterEach(async () => {
        await db('users').del();
        await db('location_points').del();
        await db('audit_events').del();
        await db('consent_logs').del();
    });

    describe('Role-Based Access Control', () => {
        it('should prevent workers from accessing other users data', async () => {
            // Worker tries to access dispatcher's profile
            const response = await request(app)
                .get(`/api/users/${dispatcherId}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should prevent dispatchers from accessing admin functions', async () => {
            const response = await request(app)
                .get('/api/admin/system-config')
                .set('Authorization', `Bearer ${dispatcherToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should allow users to access only their own data', async () => {
            // Worker accessing own profile should work
            const response = await request(app)
                .get(`/api/users/${workerId}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(workerId);
        });

        it('should enforce resource-level permissions', async () => {
            // Create location data for worker
            await db('location_points').insert({
                user_id: workerId,
                device_id: 'device-1',
                coordinates: db.raw("ST_GeomFromText('POINT(120.9842 14.5995)', 4326)"),
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(),
                consent_version: '1.0',
                hash_chain: 'test-hash',
                retention_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });

            // Dispatcher should be able to view worker locations
            const dispatcherResponse = await request(app)
                .get(`/api/locations/user/${workerId}`)
                .set('Authorization', `Bearer ${dispatcherToken}`);

            expect(dispatcherResponse.status).toBe(200);

            // Worker should not be able to view other workers' locations
            const workerResponse = await request(app)
                .get(`/api/locations/user/${dispatcherId}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(workerResponse.status).toBe(403);
        });
    });

    describe('Data Privacy Controls', () => {
        it('should enforce location tracking consent', async () => {
            // Update user to revoke location consent
            await db('users')
                .where('id', workerId)
                .update({
                    consent_flags: JSON.stringify({
                        locationTracking: false,
                        dataProcessing: true,
                        marketingCommunications: false,
                        consentVersion: '1.0',
                        consentDate: new Date()
                    })
                });

            const response = await request(app)
                .post('/api/location/update')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    latitude: 14.5995,
                    longitude: 120.9842,
                    accuracy: 10
                });

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('LOCATION_CONSENT_REQUIRED');
        });

        it('should automatically delete expired location data', async () => {
            // Insert old location data (beyond retention period)
            const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
            await db('location_points').insert({
                user_id: workerId,
                device_id: 'device-1',
                coordinates: db.raw("ST_GeomFromText('POINT(120.9842 14.5995)', 4326)"),
                accuracy: 10,
                source: 'gps',
                timestamp: oldDate,
                consent_version: '1.0',
                hash_chain: 'test-hash',
                retention_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
            });

            // Trigger cleanup job
            const response = await request(app)
                .post('/api/admin/cleanup-expired-data')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Verify old data is deleted
            const remainingData = await db('location_points')
                .where('user_id', workerId)
                .where('timestamp', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

            expect(remainingData).toHaveLength(0);
        });

        it('should redact PII in audit logs for non-admin users', async () => {
            // Create audit event with PII
            await db('audit_events').insert({
                event_id: 'test-event',
                correlation_id: 'test-correlation',
                actor_id: workerId,
                actor_role: 'worker',
                action: 'profile_updated',
                entity_type: 'user',
                entity_id: workerId,
                timestamp: new Date(),
                metadata: JSON.stringify({
                    email: 'worker@example.com',
                    phone: '+1234567890',
                    address: '123 Main St'
                }),
                hash_chain: 'test-hash'
            });

            // Worker accessing audit logs should get redacted data
            const workerResponse = await request(app)
                .get('/api/audit/events')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(workerResponse.status).toBe(200);
            const event = workerResponse.body.events[0];
            expect(event.metadata.email).toBe('****@example.com');
            expect(event.metadata.phone).toBe('****567890');
            expect(event.metadata.address).toBe('*** Main St');

            // Admin should get full data
            const adminResponse = await request(app)
                .get('/api/audit/events')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(adminResponse.status).toBe(200);
            const adminEvent = adminResponse.body.events[0];
            expect(adminEvent.metadata.email).toBe('worker@example.com');
            expect(adminEvent.metadata.phone).toBe('+1234567890');
        });

        it('should implement data minimization principles', async () => {
            // Request should only return necessary fields
            const response = await request(app)
                .get('/api/users/search?q=worker')
                .set('Authorization', `Bearer ${dispatcherToken}`);

            expect(response.status).toBe(200);
            const user = response.body.users[0];

            // Should include necessary fields for dispatcher
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('name');
            expect(user).toHaveProperty('department');

            // Should not include sensitive fields
            expect(user).not.toHaveProperty('email');
            expect(user).not.toHaveProperty('phone');
            expect(user).not.toHaveProperty('address');
            expect(user).not.toHaveProperty('payment_token_ref');
        });
    });

    describe('GDPR Compliance', () => {
        it('should provide data export functionality', async () => {
            // Create some data for the user
            await db('location_points').insert({
                user_id: workerId,
                device_id: 'device-1',
                coordinates: db.raw("ST_GeomFromText('POINT(120.9842 14.5995)', 4326)"),
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(),
                consent_version: '1.0',
                hash_chain: 'test-hash',
                retention_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });

            const response = await request(app)
                .post('/api/user/data-export')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.exportId).toBeDefined();
            expect(response.body.status).toBe('processing');
        });

        it('should provide data deletion functionality', async () => {
            const response = await request(app)
                .post('/api/user/delete-account')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    confirmation: 'DELETE_MY_ACCOUNT',
                    reason: 'No longer needed'
                });

            expect(response.status).toBe(200);
            expect(response.body.deletionId).toBeDefined();
            expect(response.body.status).toBe('scheduled');
        });

        it('should handle consent withdrawal properly', async () => {
            const response = await request(app)
                .post('/api/user/withdraw-consent')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    consentType: 'locationTracking',
                    reason: 'Privacy concerns'
                });

            expect(response.status).toBe(200);

            // Verify consent is updated
            const user = await db('users').where('id', workerId).first();
            const consentFlags = JSON.parse(user.consent_flags);
            expect(consentFlags.locationTracking).toBe(false);

            // Verify consent log is created
            const consentLog = await db('consent_logs')
                .where('user_id', workerId)
                .where('action', 'withdrawn')
                .first();

            expect(consentLog).toBeDefined();
            expect(consentLog.consent_type).toBe('locationTracking');
        });

        it('should provide consent history', async () => {
            // Create consent history
            await db('consent_logs').insert([
                {
                    id: 'consent-1',
                    user_id: workerId,
                    consent_type: 'locationTracking',
                    action: 'granted',
                    consent_version: '1.0',
                    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000)
                },
                {
                    id: 'consent-2',
                    user_id: workerId,
                    consent_type: 'locationTracking',
                    action: 'withdrawn',
                    consent_version: '1.0',
                    timestamp: new Date()
                }
            ]);

            const response = await request(app)
                .get('/api/user/consent-history')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.history).toHaveLength(2);
            expect(response.body.history[0].action).toBe('withdrawn');
            expect(response.body.history[1].action).toBe('granted');
        });
    });

    describe('Data Integrity and Tamper Detection', () => {
        it('should detect tampered location data', async () => {
            // Insert location with invalid hash chain
            await db('location_points').insert({
                user_id: workerId,
                device_id: 'device-1',
                coordinates: db.raw("ST_GeomFromText('POINT(120.9842 14.5995)', 4326)"),
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(),
                consent_version: '1.0',
                hash_chain: 'invalid-hash',
                retention_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });

            const response = await request(app)
                .post('/api/admin/verify-data-integrity')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    entityType: 'location_points',
                    userId: workerId
                });

            expect(response.status).toBe(200);
            expect(response.body.integrityViolations).toHaveLength(1);
            expect(response.body.integrityViolations[0].type).toBe('INVALID_HASH_CHAIN');
        });

        it('should detect audit log tampering', async () => {
            // Create audit event
            await db('audit_events').insert({
                event_id: 'test-event',
                correlation_id: 'test-correlation',
                actor_id: workerId,
                actor_role: 'worker',
                action: 'profile_updated',
                entity_type: 'user',
                entity_id: workerId,
                timestamp: new Date(),
                metadata: JSON.stringify({ field: 'value' }),
                hash_chain: 'valid-hash'
            });

            // Manually tamper with the event
            await db('audit_events')
                .where('event_id', 'test-event')
                .update({ metadata: JSON.stringify({ field: 'tampered' }) });

            const response = await request(app)
                .post('/api/admin/verify-audit-integrity')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.tamperedEvents).toHaveLength(1);
            expect(response.body.tamperedEvents[0].eventId).toBe('test-event');
        });
    });

    describe('Cross-User Data Isolation', () => {
        it('should prevent data leakage between users', async () => {
            // Create data for both users
            await db('location_points').insert([
                {
                    user_id: workerId,
                    device_id: 'device-1',
                    coordinates: db.raw("ST_GeomFromText('POINT(120.9842 14.5995)', 4326)"),
                    accuracy: 10,
                    source: 'gps',
                    timestamp: new Date(),
                    consent_version: '1.0',
                    hash_chain: 'hash-1',
                    retention_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                },
                {
                    user_id: dispatcherId,
                    device_id: 'device-2',
                    coordinates: db.raw("ST_GeomFromText('POINT(121.0000 14.6000)', 4326)"),
                    accuracy: 15,
                    source: 'gps',
                    timestamp: new Date(),
                    consent_version: '1.0',
                    hash_chain: 'hash-2',
                    retention_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
            ]);

            // Worker requesting their own data should only get their data
            const response = await request(app)
                .get('/api/location/history')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.locations).toHaveLength(1);
            expect(response.body.locations[0].userId).toBe(workerId);
        });

        it('should prevent SQL injection to access other users data', async () => {
            const maliciousUserId = `${workerId}' OR '1'='1' --`;

            const response = await request(app)
                .get(`/api/users/${encodeURIComponent(maliciousUserId)}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_USER_ID');
        });
    });
});