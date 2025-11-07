import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { AuthService } from '@/services/authService';
import { TestDataFactory } from '@/test/helpers/testData';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { AppError } from '@/middleware/errorHandler';

describe('AuthService', () => {
    let authService: AuthService;
    let redis: any;

    beforeEach(() => {
        authService = new AuthService();
        redis = getRedisClient();
    });

    describe('register', () => {
        it('should register a new user successfully', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker' as const,
                department: 'Engineering'
            };

            const user = await authService.register(registerData);

            expect(user).toBeDefined();
            expect(user.email).toBe(registerData.email);
            expect(user.role).toBe(registerData.role);
            expect(user.department).toBe(registerData.department);
            expect(user.status).toBe('pending');
            expect(user.id).toBeDefined();
        });

        it('should hash the password correctly', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker' as const,
                department: 'Engineering'
            };

            await authService.register(registerData);

            // Verify password is hashed in database
            const { getDatabase } = await import('@/config/database');
            const db = getDatabase();
            const dbUser = await db('users').where({ email: registerData.email }).first();

            expect(dbUser.password_hash).toBeDefined();
            expect(dbUser.password_hash).not.toBe(registerData.password);
            expect(dbUser.password_hash.length).toBeGreaterThan(50); // bcrypt hash length
        });

        it('should throw error for duplicate email', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker' as const,
                department: 'Engineering'
            };

            await authService.register(registerData);

            await expect(authService.register(registerData))
                .rejects.toThrow(AppError);
        });

        it('should register device when fingerprint provided', async () => {
            const registerData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker' as const,
                department: 'Engineering',
                deviceFingerprint: 'test-device-fingerprint'
            };

            const user = await authService.register(registerData);

            // Verify device was created
            const { getDatabase } = await import('@/config/database');
            const db = getDatabase();
            const device = await db('devices').where({ user_id: user.id }).first();

            expect(device).toBeDefined();
            expect(device.device_fingerprint).toBe(registerData.deviceFingerprint);
        });
    });

    describe('login', () => {
        it('should login successfully with valid credentials', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const loginData = {
                email: user.email,
                password: password
            };

            const tokens = await authService.login(loginData);

            expect(tokens).toBeDefined();
            expect(tokens.accessToken).toBeDefined();
            expect(tokens.refreshToken).toBeDefined();
            expect(tokens.expiresIn).toBeDefined();
            expect(typeof tokens.expiresIn).toBe('number');
        });

        it('should throw error for invalid email', async () => {
            const loginData = {
                email: 'nonexistent@example.com',
                password: 'password123'
            };

            await expect(authService.login(loginData))
                .rejects.toThrow(AppError);
        });

        it('should throw error for invalid password', async () => {
            const user = await TestDataFactory.createUser({ status: 'active' });

            const loginData = {
                email: user.email,
                password: 'wrongpassword'
            };

            await expect(authService.login(loginData))
                .rejects.toThrow(AppError);
        });

        it('should throw error for inactive user', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'suspended',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const loginData = {
                email: user.email,
                password: password
            };

            await expect(authService.login(loginData))
                .rejects.toThrow(AppError);
        });

        it('should store refresh token in Redis', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const tokens = await authService.login({
                email: user.email,
                password: password
            });

            // Decode refresh token to get token ID
            const { loadConfig } = await import('@/config/config');
            const config = loadConfig();
            const payload = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret) as any;

            // Check if token exists in Redis
            const storedToken = await redis.get(RedisKeys.refreshToken(payload.tokenId));
            expect(storedToken).toBe(tokens.refreshToken);
        });
    });

    describe('refreshToken', () => {
        it('should refresh token successfully', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const initialTokens = await authService.login({
                email: user.email,
                password: password
            });

            const newTokens = await authService.refreshToken(initialTokens.refreshToken);

            expect(newTokens).toBeDefined();
            expect(newTokens.accessToken).toBeDefined();
            expect(newTokens.refreshToken).toBeDefined();
            expect(newTokens.accessToken).not.toBe(initialTokens.accessToken);
            expect(newTokens.refreshToken).not.toBe(initialTokens.refreshToken);
        });

        it('should throw error for invalid refresh token', async () => {
            const invalidToken = 'invalid.refresh.token';

            await expect(authService.refreshToken(invalidToken))
                .rejects.toThrow(AppError);
        });

        it('should throw error for non-existent token in Redis', async () => {
            const { loadConfig } = await import('@/config/config');
            const config = loadConfig();

            // Create a valid JWT but don't store it in Redis
            const payload = {
                userId: 'test-user-id',
                tokenId: 'test-token-id'
            };

            const token = jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: '7d' });

            await expect(authService.refreshToken(token))
                .rejects.toThrow(AppError);
        });
    });

    describe('validateAccessToken', () => {
        it('should validate valid access token', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const tokens = await authService.login({
                email: user.email,
                password: password
            });

            const payload = await authService.validateAccessToken(tokens.accessToken);

            expect(payload).toBeDefined();
            expect(payload.userId).toBe(user.id);
            expect(payload.email).toBe(user.email);
            expect(payload.role).toBe(user.role);
            expect(payload.permissions).toBeDefined();
        });

        it('should throw error for invalid access token', async () => {
            const invalidToken = 'invalid.access.token';

            await expect(authService.validateAccessToken(invalidToken))
                .rejects.toThrow(AppError);
        });

        it('should throw error for token of inactive user', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const tokens = await authService.login({
                email: user.email,
                password: password
            });

            // Deactivate user
            const { getDatabase } = await import('@/config/database');
            const db = getDatabase();
            await db('users').where({ id: user.id }).update({ status: 'suspended' });

            await expect(authService.validateAccessToken(tokens.accessToken))
                .rejects.toThrow(AppError);
        });
    });

    describe('logout', () => {
        it('should remove refresh token from Redis', async () => {
            const password = TestDataFactory.generateValidPassword();
            const user = await TestDataFactory.createUser({
                status: 'active',
                password_hash: await import('bcryptjs').then(bcrypt => bcrypt.hash(password, 10))
            });

            const tokens = await authService.login({
                email: user.email,
                password: password
            });

            await authService.logout(tokens.refreshToken);

            // Verify token is removed from Redis
            const { loadConfig } = await import('@/config/config');
            const config = loadConfig();
            const payload = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret) as any;
            const storedToken = await redis.get(RedisKeys.refreshToken(payload.tokenId));

            expect(storedToken).toBeNull();
        });

        it('should handle invalid refresh token gracefully', async () => {
            const invalidToken = 'invalid.refresh.token';

            // Should not throw error
            await expect(authService.logout(invalidToken))
                .resolves.toBeUndefined();
        });
    });

    describe('hasPermission', () => {
        it('should return true for admin with any permission', () => {
            const adminPermissions = ['*'];
            const result = authService.hasPermission(adminPermissions, 'any:permission');
            expect(result).toBe(true);
        });

        it('should return true for exact permission match', () => {
            const permissions = ['trips:read', 'trips:update'];
            const result = authService.hasPermission(permissions, 'trips:read');
            expect(result).toBe(true);
        });

        it('should return true for wildcard permission match', () => {
            const permissions = ['trips:*'];
            const result = authService.hasPermission(permissions, 'trips:read');
            expect(result).toBe(true);
        });

        it('should return false for no permission match', () => {
            const permissions = ['trips:read'];
            const result = authService.hasPermission(permissions, 'users:read');
            expect(result).toBe(false);
        });
    });
});