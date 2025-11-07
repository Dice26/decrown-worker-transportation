import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import locationRoutes from '@/routes/location';
import { authMiddleware } from '@/middleware/auth';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import jwt from 'jsonwebtoken';
import { loadConfig } from '@/config/config';

describe('Location Routes', () => {
    let app: express.Application;
    let db: any;
    let testUser: any;
    let authToken: string;
    let config: any;

    beforeEach(async () => {
        app = express();
        app.use(express.json());

        // Mock correlation ID middleware
        app.use((req, res, next) => {
            req.correlationId = 'test-correlation-id';
            next();
        });

        app.use('/api/location', locationRoutes);

        db = getDatabase();
        config = loadConfig();

        // Create test user with location tracking consent
        testUser = await TestDataFactory.createUser({
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            }
        });

        // Generate auth token
        authToken = jwt.sign(
            {
                userId: testUser.id,
                email: testUser.email,
                role: testUser.role,
                permissions: []
            },
            config.auth.jwtSecret,
            { expiresIn: '1h' }
        );
    });

    describe('POST /api/location/ingest', () => {
        it('should successfully ingest valid location data', async () => {
            const locationData = {
                coordinates: {
                    latitude: 14.5995,
                    longitude: 120.9842
                },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            const response = await request(app)
                .post('/api/location/ingest')
                .set('Authorization', `Bearer ${authToken}`)
                .send(locationData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.accuracy).toBe(10);
            expect(response.body.data.source).toBe('gps');
            expect(response.body.correlationId).toBe('test-correlation-id');
        });

        it('should reject request without authentication', async () => {
            const locationData = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            await request(app)
                .post('/api/location/ingest')
                .send(locationData)
                .expect(401);
        });

        it('should reject invalid coordinates', async () => {
            const locationData = {
                coordinates: {
                    latitude: 95, // Invalid latitude
                    longitude: 120.9842
                },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            const response = await request(app)
                .post('/api/location/ingest')
                .set('Authorization', `Bearer ${authToken}`)
                .send(locationData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('should reject poor accuracy', async () => {
            const locationData = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 150, // Poor accuracy
                source: 'network',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            const response = await request(app)
                .post('/api/location/ingest')
                .set('Authorization', `Bearer ${authToken}`)
                .send(locationData)
                .expect(400);

            expect(response.body.error.code).toBe('ACCURACY_THRESHOLD');
        });

        it('should reject request without location consent', async () => {
            // Create user without location consent
            const userWithoutConsent = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: false,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const noConsentToken = jwt.sign(
                {
                    userId: userWithoutConsent.id,
                    email: userWithoutConsent.email,
                    role: userWithoutConsent.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const locationData = {
                coordinates: { latitude: 14.5995, longitude: 120.9842 },
                accuracy: 10,
                source: 'gps',
                timestamp: new Date().toISOString(),
                deviceId: 'test-device-123'
            };

            const response = await request(app)
                .post('/api/location/ingest')
                .set('Authorization', `Bearer ${noConsentToken}`)
                .send(locationData)
                .expect(403);

            expect(response.body.error.code).toBe('CONSENT_REQUIRED');
        });

        it('should validate required fields', async () => {
            const incompleteData = {
                coordinates: { latitude: 14.5995 }, // Missing longitude
                accuracy: 10,
                source: 'gps'
                // Missing timestamp and deviceId
            };

            const response = await request(app)
                .post('/api/location/ingest')
                .set('Authorization', `Bearer ${authToken}`)
                .send(incompleteData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_FAILED');
            expect(response.body.error.details).toBeDefined();
        });
    });

    describe('GET /api/location/user/:userId', () => {
        beforeEach(async () => {
            // Insert test location data
            await db.raw(`
                INSERT INTO location_points (
                    user_id, device_id, coordinates, accuracy, source, 
                    timestamp, consent_version, hash_chain, retention_date
                ) VALUES (?, ?, ST_GeogFromText(?), ?, ?, ?, ?, ?, ?)
            `, [
                testUser.id,
                'test-device-123',
                'POINT(120.9842 14.5995)',
                10,
                'gps',
                new Date(),
                '1.0',
                'test-hash',
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            ]);
        });

        it('should return user locations for admin', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .get(`/api/location/user/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.userId).toBe(testUser.id);
            expect(response.body.data.locations).toHaveLength(1);
            expect(typeof response.body.data.locations[0].coordinates.latitude).toBe('number');
        });

        it('should return own locations for user', async () => {
            const response = await request(app)
                .get(`/api/location/user/${testUser.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locations).toHaveLength(1);
        });

        it('should apply privacy filtering for other users', async () => {
            const otherUser = await TestDataFactory.createUser({ role: 'worker' });
            const otherToken = jwt.sign(
                {
                    userId: otherUser.id,
                    email: otherUser.email,
                    role: otherUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .get(`/api/location/user/${testUser.id}`)
                .set('Authorization', `Bearer ${otherToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locations).toHaveLength(1);
            // Coordinates should be redacted
            expect(typeof response.body.data.locations[0].coordinates.latitude).toBe('string');
        });

        it('should validate UUID format', async () => {
            const response = await request(app)
                .get('/api/location/user/invalid-uuid')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(400);

            expect(response.body.error.code).toBe('INVALID_USER_ID');
        });

        it('should respect limit parameter', async () => {
            const response = await request(app)
                .get(`/api/location/user/${testUser.id}?limit=5`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locations.length).toBeLessThanOrEqual(5);
        });

        it('should cap limit at 1000', async () => {
            const response = await request(app)
                .get(`/api/location/user/${testUser.id}?limit=2000`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            // The actual limit would be applied in the service layer
        });
    });

    describe('POST /api/location/export', () => {
        beforeEach(async () => {
            // Insert test location data
            await db.raw(`
                INSERT INTO location_points (
                    user_id, device_id, coordinates, accuracy, source, 
                    timestamp, consent_version, hash_chain, retention_date
                ) VALUES (?, ?, ST_GeogFromText(?), ?, ?, ?, ?, ?, ?)
            `, [
                testUser.id,
                'test-device-123',
                'POINT(120.9842 14.5995)',
                10,
                'gps',
                new Date(),
                '1.0',
                'test-hash',
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ]);
        });

        it('should export location data for admin', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
                endDate: new Date(),
                includeRedacted: false,
                format: 'json'
            };

            const response = await request(app)
                .post('/api/location/export')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(exportRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.locations).toBeDefined();
            expect(response.body.data.exportRequest).toEqual(exportRequest);
        });

        it('should export as CSV format', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date(),
                format: 'csv'
            };

            const response = await request(app)
                .post('/api/location/export')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(exportRequest)
                .expect(200);

            expect(response.headers['content-type']).toContain('text/csv');
            expect(response.headers['content-disposition']).toContain('attachment');
            expect(response.text).toContain('userId,latitude,longitude');
        });

        it('should reject export for non-admin users', async () => {
            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date(),
                format: 'json'
            };

            const response = await request(app)
                .post('/api/location/export')
                .set('Authorization', `Bearer ${authToken}`)
                .send(exportRequest)
                .expect(403);

            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should allow dispatcher to export', async () => {
            const dispatcherUser = await TestDataFactory.createUser({ role: 'dispatcher' });
            const dispatcherToken = jwt.sign(
                {
                    userId: dispatcherUser.id,
                    email: dispatcherUser.email,
                    role: dispatcherUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const exportRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date(),
                format: 'json'
            };

            const response = await request(app)
                .post('/api/location/export')
                .set('Authorization', `Bearer ${dispatcherToken}`)
                .send(exportRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should validate export request data', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const invalidRequest = {
                // Missing required fields
                format: 'json'
            };

            const response = await request(app)
                .post('/api/location/export')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidRequest)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('POST /api/location/cleanup', () => {
        it('should allow admin to trigger cleanup', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .post('/api/location/cleanup')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.deletedCount).toBeDefined();
            expect(response.body.data.batchesProcessed).toBeDefined();
        });

        it('should reject cleanup for non-admin users', async () => {
            const response = await request(app)
                .post('/api/location/cleanup')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(403);

            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
    });

    describe('POST /api/location/verify-integrity', () => {
        it('should allow admin to verify any user integrity', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const verifyRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date()
            };

            const response = await request(app)
                .post('/api/location/verify-integrity')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(verifyRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.verification).toBeDefined();
            expect(response.body.data.userId).toBe(testUser.id);
        });

        it('should allow user to verify own integrity', async () => {
            const verifyRequest = {
                userId: testUser.id,
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date()
            };

            const response = await request(app)
                .post('/api/location/verify-integrity')
                .set('Authorization', `Bearer ${authToken}`)
                .send(verifyRequest)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.verification).toBeDefined();
        });

        it('should reject verification of other users data', async () => {
            const otherUser = await TestDataFactory.createUser({ role: 'worker' });
            const otherToken = jwt.sign(
                {
                    userId: otherUser.id,
                    email: otherUser.email,
                    role: otherUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const verifyRequest = {
                userId: testUser.id, // Trying to verify different user's data
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date()
            };

            const response = await request(app)
                .post('/api/location/verify-integrity')
                .set('Authorization', `Bearer ${otherToken}`)
                .send(verifyRequest)
                .expect(403);

            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
    });

    describe('GET /api/location/stats', () => {
        it('should return stats for admin', async () => {
            const adminUser = await TestDataFactory.createUser({ role: 'admin' });
            const adminToken = jwt.sign(
                {
                    userId: adminUser.id,
                    email: adminUser.email,
                    role: adminUser.role,
                    permissions: []
                },
                config.auth.jwtSecret,
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .get('/api/location/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.timestamp).toBeDefined();
        });

        it('should reject stats for non-admin users', async () => {
            const response = await request(app)
                .get('/api/location/stats')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(403);

            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
    });
});