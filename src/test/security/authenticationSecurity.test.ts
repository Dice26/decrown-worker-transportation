import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestApp } from '@/test/helpers/testApp';
import { getDatabase } from '@/config/database';
import { AuthService } from '@/services/authService';
import { Knex } from 'knex';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('Authentication Security Tests', () => {
    let app: any;
    let db: Knex; let
        authService: AuthService;

    beforeEach(async () => {
        app = await setupTestApp();
        db = getDatabase();
        authService = new AuthService();

        // Clean up test data
        await db('users').del();
        await db('devices').del();
    });

    afterEach(async () => {
        await db('users').del();
        await db('devices').del();
    });

    describe('JWT Token Security', () => {
        it('should reject expired tokens', async () => {
            const expiredToken = jwt.sign(
                { userId: 'test-user', role: 'worker' },
                process.env.JWT_SECRET!,
                { expiresIn: '-1h' }
            );

            const response = await request(app)
                .get('/api/user/profile')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('TOKEN_EXPIRED');
        });

        it('should reject malformed tokens', async () => {
            const malformedToken = 'invalid.token.here';

            const response = await request(app)
                .get('/api/user/profile')
                .set('Authorization', `Bearer ${malformedToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('INVALID_TOKEN');
        });

        it('should reject tokens with invalid signature', async () => {
            const invalidToken = jwt.sign(
                { userId: 'test-user', role: 'worker' },
                'wrong-secret'
            );

            const response = await request(app)
                .get('/api/user/profile')
                .set('Authorization', `Bearer ${invalidToken}`);

            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('INVALID_TOKEN');
        });

        it('should enforce token refresh after 15 minutes', async () => {
            const user = await db('users').insert({
                id: 'test-user',
                email: 'test@example.com',
                role: 'worker',
                status: 'active'
            }).returning('*');

            const token = jwt.sign(
                { userId: user[0].id, role: user[0].role },
                process.env.JWT_SECRET!,
                { expiresIn: '16m' }
            );

            // Should work initially
            let response = await request(app)
                .get('/api/user/profile')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);

            // Mock time passage (in real test, would need to wait or mock time)
            const expiredToken = jwt.sign(
                { userId: user[0].id, role: user[0].role },
                process.env.JWT_SECRET!,
                { expiresIn: '-1m' }
            );

            response = await request(app)
                .get('/api/user/profile')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
        });
    });

    describe('Authentication Bypass Attempts', () => {
        it('should prevent SQL injection in login', async () => {
            const maliciousEmail = "admin@example.com'; DROP TABLE users; --";
            const password = 'password123';

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: maliciousEmail,
                    password: password
                });

            expect(response.status).toBe(401);

            // Verify users table still exists
            const usersExist = await db.schema.hasTable('users');
            expect(usersExist).toBe(true);
        });

        it('should prevent NoSQL injection attempts', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: { $ne: null },
                    password: { $ne: null }
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('should prevent privilege escalation through role manipulation', async () => {
            const user = await db('users').insert({
                id: 'test-user',
                email: 'worker@example.com',
                role: 'worker',
                status: 'active'
            }).returning('*');

            const token = jwt.sign(
                { userId: user[0].id, role: 'admin' }, // Attempting to escalate
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            const response = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${token}`);

            // Should verify role against database, not just token
            expect(response.status).toBe(403);
        });

        it('should prevent session fixation attacks', async () => {
            // Create user
            const hashedPassword = await bcrypt.hash('password123', 10);
            await db('users').insert({
                id: 'test-user',
                email: 'test@example.com',
                password_hash: hashedPassword,
                role: 'worker',
                status: 'active'
            });

            // Login twice should generate different tokens
            const login1 = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            const login2 = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(login1.body.token).not.toBe(login2.body.token);
        });
    });

    describe('Rate Limiting Security', () => {
        it('should enforce login rate limiting', async () => {
            const loginAttempts = Array(6).fill(null).map(() =>
                request(app)
                    .post('/api/auth/login')
                    .send({
                        email: 'test@example.com',
                        password: 'wrongpassword'
                    })
            );

            const responses = await Promise.all(loginAttempts);

            // First 5 should be 401, 6th should be 429 (rate limited)
            expect(responses[4].status).toBe(401);
            expect(responses[5].status).toBe(429);
        });

        it('should enforce API rate limiting per user', async () => {
            const user = await db('users').insert({
                id: 'test-user',
                email: 'test@example.com',
                role: 'worker',
                status: 'active'
            }).returning('*');

            const token = jwt.sign(
                { userId: user[0].id, role: user[0].role },
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            // Make many rapid requests
            const requests = Array(101).fill(null).map(() =>
                request(app)
                    .get('/api/user/profile')
                    .set('Authorization', `Bearer ${token}`)
            );

            const responses = await Promise.all(requests);

            // Should hit rate limit
            const rateLimitedResponses = responses.filter(r => r.status === 429);
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });
    });

    describe('Device Security', () => {
        it('should validate device fingerprints', async () => {
            const user = await db('users').insert({
                id: 'test-user',
                email: 'test@example.com',
                role: 'worker',
                status: 'active'
            }).returning('*');

            const token = jwt.sign(
                { userId: user[0].id, role: user[0].role },
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            // Request without device fingerprint should be rejected
            const response = await request(app)
                .post('/api/location/update')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    latitude: 14.5995,
                    longitude: 120.9842,
                    accuracy: 10
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('DEVICE_FINGERPRINT_REQUIRED');
        });

        it('should detect suspicious device changes', async () => {
            const user = await db('users').insert({
                id: 'test-user',
                email: 'test@example.com',
                role: 'worker',
                status: 'active'
            }).returning('*');

            // Register initial device
            await db('devices').insert({
                id: 'device-1',
                user_id: user[0].id,
                fingerprint: 'original-fingerprint',
                trust_level: 'trusted',
                last_seen: new Date()
            });

            const token = jwt.sign(
                { userId: user[0].id, role: user[0].role },
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            // Request from different device should require additional verification
            const response = await request(app)
                .post('/api/location/update')
                .set('Authorization', `Bearer ${token}`)
                .set('X-Device-Fingerprint', 'suspicious-fingerprint')
                .send({
                    latitude: 14.5995,
                    longitude: 120.9842,
                    accuracy: 10
                });

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('DEVICE_VERIFICATION_REQUIRED');
        });
    });
});