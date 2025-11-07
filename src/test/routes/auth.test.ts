import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRoutes } from '@/routes';
import { TestDataFactory } from '@/test/helpers/testData';
import { setupDatabase } from '@/config/database';
import { setupRedis } from '@/config/redis';

describe('Auth Routes', () => {
    let app: express.Application;

    beforeEach(async () => {
        app = express();
        app.use(express.json());

        // Setup routes
        setupRoutes(app);
    });

    describe('POST /api/v1/auth/register', () => {
        it('should register a new user successfully', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker',
                department: 'Engineering'
            };

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(registerData)
                .expect(201);

            expect(response.body.message).toBe('User registered successfully');
            expect(response.body.user).toBeDefined();
            expect(response.body.user.email).toBe(registerData.email);
            expect(response.body.user.role).toBe(registerData.role);
            expect(response.body.user.id).toBeDefined();
        });

        it('should return validation error for invalid email', async () => {
            const registerData = {
                email: TestDataFactory.generateInvalidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker',
                department: 'Engineering'
            };

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(registerData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return validation error for weak password', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateWeakPassword(),
                role: 'worker',
                department: 'Engineering'
            };

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(registerData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return error for duplicate email', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker',
                department: 'Engineering'
            };

            // Register first user
            await request(app)
                .post('/api/v1/auth/register')
                .send(registerData)
                .expect(201);

            // Try to register with same email
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(registerData)
                .expect(409);

            expect(response.body.error.code).toBe('USER_EXISTS');
        });
    });

    describe('POST /api/v1/auth/login', () => {
        it('should login successfully with valid credentials', async () => {
            // First register a user
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const loginData = {
                email: user.email,
                password: password
            };

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send(loginData)
                .expect(200);

            expect(response.body.message).toBe('Login successful');
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
            expect(response.body.expiresIn).toBeDefined();
        });

        it('should return error for invalid credentials', async () => {
            const loginData = {
                email: 'nonexistent@example.com',
                password: 'wrongpassword'
            };

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send(loginData)
                .expect(401);

            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });

        it('should return validation error for invalid email format', async () => {
            const loginData = {
                email: 'invalid-email',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send(loginData)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('POST /api/v1/auth/refresh', () => {
        it('should refresh token successfully', async () => {
            // First login to get tokens
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const loginResponse = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: user.email,
                    password: password
                })
                .expect(200);

            // Use refresh token
            const response = await request(app)
                .post('/api/v1/auth/refresh')
                .send({
                    refreshToken: loginResponse.body.refreshToken
                })
                .expect(200);

            expect(response.body.message).toBe('Token refreshed successfully');
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
            expect(response.body.accessToken).not.toBe(loginResponse.body.accessToken);
        });

        it('should return error for invalid refresh token', async () => {
            const response = await request(app)
                .post('/api/v1/auth/refresh')
                .send({
                    refreshToken: 'invalid.refresh.token'
                })
                .expect(401);

            expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
        });
    });

    describe('GET /api/v1/auth/me', () => {
        it('should return user info for authenticated user', async () => {
            // First login to get token
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const loginResponse = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: user.email,
                    password: password
                })
                .expect(200);

            // Get user info
            const response = await request(app)
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
                .expect(200);

            expect(response.body.user).toBeDefined();
            expect(response.body.user.id).toBe(user.id);
            expect(response.body.user.email).toBe(user.email);
            expect(response.body.user.role).toBe(user.role);
            expect(response.body.user.permissions).toBeDefined();
        });

        it('should return error for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/v1/auth/me')
                .expect(401);

            expect(response.body.error.code).toBe('MISSING_TOKEN');
        });
    });

    describe('POST /api/v1/auth/logout', () => {
        it('should logout successfully', async () => {
            // First login to get tokens
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const loginResponse = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: user.email,
                    password: password
                })
                .expect(200);

            // Logout
            const response = await request(app)
                .post('/api/v1/auth/logout')
                .send({
                    refreshToken: loginResponse.body.refreshToken
                })
                .expect(200);

            expect(response.body.message).toBe('Logout successful');
        });
    });
});