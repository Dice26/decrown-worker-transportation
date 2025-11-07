import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/config/database';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { loadConfig } from '@/config/config';
import { logger } from '@/utils/logger';
import { AppError } from '@/middleware/errorHandler';
import {
    User,
    UserRole,
    JWTPayload,
    RefreshTokenPayload,
    AuthTokens,
    LoginRequest,
    RegisterRequest
} from '@/types/auth';
import { UserService } from './userService';

export class AuthService {
    private db = getDatabase();
    private redis = getRedisClient();
    private config = loadConfig();
    private userService = new UserService();

    // Role-based permissions mapping
    private rolePermissions: Record<UserRole, string[]> = {
        worker: ['location:share', 'profile:read', 'profile:update', 'trips:read'],
        driver: ['location:share', 'profile:read', 'profile:update', 'trips:read', 'trips:update', 'routes:read'],
        dispatcher: ['users:read', 'trips:read', 'trips:create', 'trips:update', 'routes:read', 'routes:create', 'routes:update', 'locations:read'],
        finance: ['invoices:read', 'invoices:create', 'payments:read', 'reports:read', 'users:read'],
        admin: ['*'] // All permissions
    };

    async register(registerData: RegisterRequest): Promise<User> {
        const { email, password, role, department, deviceFingerprint } = registerData;

        // Create user using UserService
        const user = await this.userService.createUser({
            email,
            password,
            role,
            department
        });

        // Register device if fingerprint provided
        if (deviceFingerprint) {
            await this.registerDevice(user.id, deviceFingerprint);
        }

        logger.info('User registered', { userId: user.id, email, role });

        return user;
    }

    async login(loginData: LoginRequest): Promise<AuthTokens> {
        const { email, password, deviceFingerprint } = loginData;

        // Get user with password
        const dbUser = await this.db('users')
            .where({ email })
            .first();

        if (!dbUser) {
            throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, dbUser.password_hash);
        if (!isValidPassword) {
            throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }

        // Check user status
        if (dbUser.status !== 'active') {
            throw new AppError('Account not active', 403, 'ACCOUNT_INACTIVE');
        }

        // Update device trust level if fingerprint provided
        if (deviceFingerprint) {
            await this.updateDeviceTrust(dbUser.id, deviceFingerprint);
        }

        // Generate tokens
        const tokens = await this.generateTokens(dbUser);

        logger.info('User logged in', { userId: dbUser.id, email });

        return tokens;
    }

    async refreshToken(refreshToken: string): Promise<AuthTokens> {
        try {
            // Verify refresh token
            const payload = jwt.verify(refreshToken, this.config.jwt.refreshSecret) as RefreshTokenPayload;

            // Check if token exists in Redis
            const storedToken = await this.redis.get(RedisKeys.refreshToken(payload.tokenId));
            if (!storedToken || storedToken !== refreshToken) {
                throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
            }

            // Get user
            const dbUser = await this.db('users').where({ id: payload.userId }).first();
            if (!dbUser || dbUser.status !== 'active') {
                throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
            }

            // Revoke old refresh token
            await this.redis.del(RedisKeys.refreshToken(payload.tokenId));

            // Generate new tokens
            const tokens = await this.generateTokens(dbUser);

            logger.info('Token refreshed', { userId: dbUser.id });

            return tokens;
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
            }
            throw error;
        }
    }

    async logout(refreshToken: string): Promise<void> {
        try {
            const payload = jwt.verify(refreshToken, this.config.jwt.refreshSecret) as RefreshTokenPayload;
            await this.redis.del(RedisKeys.refreshToken(payload.tokenId));
            logger.info('User logged out', { userId: payload.userId });
        } catch (error) {
            // Token might be invalid, but we still want to attempt cleanup
            logger.warn('Logout with invalid token', { error: error.message });
        }
    }

    async validateAccessToken(token: string): Promise<JWTPayload> {
        try {
            const payload = jwt.verify(token, this.config.jwt.secret) as JWTPayload;

            // Verify user still exists and is active
            const user = await this.db('users')
                .where({ id: payload.userId, status: 'active' })
                .first();

            if (!user) {
                throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
            }

            return payload;
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw new AppError('Invalid access token', 401, 'INVALID_ACCESS_TOKEN');
            }
            throw error;
        }
    }

    /**
     * Generate access token for testing purposes
     */
    async generateAccessToken(payload: {
        userId: string;
        email: string;
        role: string;
        permissions: string[];
    }): Promise<string> {
        const tokenId = uuidv4();
        const tokenPayload: JWTPayload = {
            sub: payload.userId,
            email: payload.email,
            role: payload.role,
            permissions: payload.permissions,
            jti: tokenId,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.config.jwt.expiresIn
        };

        return jwt.sign(tokenPayload, this.config.jwt.secret);
    }

    private async generateTokens(user: any): Promise<AuthTokens> {
        const permissions = this.rolePermissions[user.role] || [];
        const tokenId = uuidv4();

        // Create access token payload
        const accessPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
            userId: user.id,
            email: user.email,
            role: user.role,
            permissions
        };

        // Create refresh token payload
        const refreshPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
            userId: user.id,
            tokenId
        };

        // Generate tokens
        const accessToken = jwt.sign(accessPayload, this.config.jwt.secret, {
            expiresIn: this.config.jwt.expiresIn
        });

        const refreshToken = jwt.sign(refreshPayload, this.config.jwt.refreshSecret, {
            expiresIn: this.config.jwt.refreshExpiresIn
        });

        // Store refresh token in Redis
        const refreshExpirySeconds = this.parseExpiryToSeconds(this.config.jwt.refreshExpiresIn);
        await this.redis.setEx(
            RedisKeys.refreshToken(tokenId),
            refreshExpirySeconds,
            refreshToken
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: this.parseExpiryToSeconds(this.config.jwt.expiresIn)
        };
    }

    private async registerDevice(userId: string, deviceFingerprint: string): Promise<void> {
        await this.db('devices').insert({
            user_id: userId,
            device_fingerprint: deviceFingerprint,
            device_type: 'mobile', // Default, can be updated later
            status: 'active',
            trust_level: 50, // Initial trust level
            last_seen: new Date()
        }).onConflict(['user_id', 'device_fingerprint']).merge({
            last_seen: new Date(),
            updated_at: new Date()
        });
    }

    private async updateDeviceTrust(userId: string, deviceFingerprint: string): Promise<void> {
        // Increase trust level for successful logins
        await this.db('devices')
            .where({ user_id: userId, device_fingerprint: deviceFingerprint })
            .increment('trust_level', 5)
            .update({
                last_seen: new Date(),
                updated_at: new Date()
            });
    }

    private parseExpiryToSeconds(expiry: string): number {
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (!match) return 900; // Default 15 minutes

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 60 * 60;
            case 'd': return value * 60 * 60 * 24;
            default: return 900;
        }
    }

    private mapUserFromDb(dbUser: any): User {
        return {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            department: dbUser.department,
            status: dbUser.status,
            consentFlags: dbUser.consent_flags,
            paymentTokenRef: dbUser.payment_token_ref,
            createdAt: dbUser.created_at,
            updatedAt: dbUser.updated_at
        };
    }

    hasPermission(userPermissions: string[], requiredPermission: string): boolean {
        // Admin has all permissions
        if (userPermissions.includes('*')) {
            return true;
        }

        // Check exact permission match
        if (userPermissions.includes(requiredPermission)) {
            return true;
        }

        // Check wildcard permissions (e.g., 'trips:*' matches 'trips:read')
        const wildcardPermissions = userPermissions.filter(p => p.endsWith(':*'));
        for (const wildcardPerm of wildcardPermissions) {
            const prefix = wildcardPerm.slice(0, -1); // Remove '*'
            if (requiredPermission.startsWith(prefix)) {
                return true;
            }
        }

        return false;
    }
}