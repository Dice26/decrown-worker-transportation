import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '@/services/userService';
import { TestDataFactory } from '@/test/helpers/testData';
import { AppError } from '@/middleware/errorHandler';
import { getDatabase } from '@/config/database';
import { getRedisClient } from '@/config/redis';

describe('UserService', () => {
    let userService: UserService;
    let db: any;
    let redis: any;

    beforeEach(() => {
        userService = new UserService();
        db = getDatabase();
        redis = getRedisClient();
    });

    describe('createUser', () => {
        it('should create a new user with valid data', async () => {
            const userData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker' as const,
                department: 'Engineering'
            };

            const user = await userService.createUser(userData);

            expect(user).toBeDefined();
            expect(user.email).toBe(userData.email);
            expect(user.role).toBe(userData.role);
            expect(user.department).toBe(userData.department);
            expect(user.status).toBe('pending');
            expect(user.consentFlags.consentVersion).toBe('1.0');
            expect(user.consentFlags.locationTracking).toBe(false);
            expect(user.consentFlags.dataProcessing).toBe(false);
        });

        it('should create user with custom consent flags', async () => {
            const userData = {
                email: TestDataFactory.generateValidEmail(),
                password: TestDataFactory.generateValidPassword(),
                role: 'worker' as const,
                department: 'Engineering',
                consentFlags: {
                    locationTracking: true,
                    dataProcessing: true
                }
            };

            const user = await userService.createUser(userData);

            expect(user.consentFlags.locationTracking).toBe(true);
            expect(user.consentFlags.dataProcessing).toBe(true);
            expect(user.consentFlags.marketingCommunications).toBe(false);
            expect(user.consentFlags.consentVersion).toBe('1.0');
        });

        it('should throw error if user already exists', async () => {
            const email = TestDataFactory.generateValidEmail();

            // Create first user
            await userService.createUser({
                email,
                password: TestDataFactory.generateValidPassword(),
                role: 'worker',
                department: 'Engineering'
            });

            // Try to create duplicate user
            await expect(userService.createUser({
                email,
                password: TestDataFactory.generateValidPassword(),
                role: 'driver',
                department: 'Operations'
            })).rejects.toThrow(AppError);
        });
    });

    describe('getUserById', () => {
        it('should return user by ID', async () => {
            const dbUser = await TestDataFactory.createUser();

            const user = await userService.getUserById(dbUser.id);

            expect(user).toBeDefined();
            expect(user!.id).toBe(dbUser.id);
            expect(user!.email).toBe(dbUser.email);
        });

        it('should return null for non-existent user', async () => {
            const user = await userService.getUserById('non-existent-id');
            expect(user).toBeNull();
        });

        it('should cache user data', async () => {
            const dbUser = await TestDataFactory.createUser();

            // First call should hit database
            const user1 = await userService.getUserById(dbUser.id);

            // Second call should hit cache
            const user2 = await userService.getUserById(dbUser.id);

            expect(user1).toEqual(user2);

            // Verify cache exists
            const cachedData = await redis.get(`cache:user:${dbUser.id}`);
            expect(cachedData).toBeDefined();
        });
    });

    describe('updateUser', () => {
        it('should update user profile', async () => {
            const dbUser = await TestDataFactory.createUser();

            const updateData = {
                department: 'Updated Department',
                email: TestDataFactory.generateValidEmail()
            };

            const updatedUser = await userService.updateUser(dbUser.id, updateData);

            expect(updatedUser.department).toBe(updateData.department);
            expect(updatedUser.email).toBe(updateData.email);
        });

        it('should update consent flags', async () => {
            const dbUser = await TestDataFactory.createUser();

            const updateData = {
                consentFlags: {
                    locationTracking: true,
                    marketingCommunications: true
                }
            };

            const updatedUser = await userService.updateUser(dbUser.id, updateData);

            expect(updatedUser.consentFlags.locationTracking).toBe(true);
            expect(updatedUser.consentFlags.marketingCommunications).toBe(true);
            expect(updatedUser.consentFlags.consentVersion).toBe('1.0');
        });

        it('should throw error for non-existent user', async () => {
            await expect(userService.updateUser('non-existent-id', {
                department: 'Test'
            })).rejects.toThrow(AppError);
        });

        it('should throw error for duplicate email', async () => {
            const user1 = await TestDataFactory.createUser();
            const user2 = await TestDataFactory.createUser();

            await expect(userService.updateUser(user1.id, {
                email: user2.email
            })).rejects.toThrow(AppError);
        });
    });

    describe('updateConsent', () => {
        it('should update consent preferences', async () => {
            const dbUser = await TestDataFactory.createUser();

            const consentData = {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false
            };

            const updatedConsent = await userService.updateConsent(dbUser.id, consentData);

            expect(updatedConsent.locationTracking).toBe(true);
            expect(updatedConsent.dataProcessing).toBe(true);
            expect(updatedConsent.marketingCommunications).toBe(false);
            expect(updatedConsent.consentVersion).toBe('1.0');
            expect(updatedConsent.consentDate).toBeInstanceOf(Date);
        });

        it('should preserve existing consent flags when updating partial', async () => {
            const dbUser = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: true,
                    marketingCommunications: true,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const updatedConsent = await userService.updateConsent(dbUser.id, {
                locationTracking: false
            });

            expect(updatedConsent.locationTracking).toBe(false);
            expect(updatedConsent.dataProcessing).toBe(true);
            expect(updatedConsent.marketingCommunications).toBe(true);
        });

        it('should throw error for non-existent user', async () => {
            await expect(userService.updateConsent('non-existent-id', {
                locationTracking: true
            })).rejects.toThrow(AppError);
        });
    });

    describe('verifyEmail', () => {
        it('should verify email with valid token', async () => {
            const dbUser = await TestDataFactory.createUser({ status: 'pending' });

            // Create verification token
            const token = 'test-verification-token';
            const verificationData = {
                token,
                userId: dbUser.id,
                email: dbUser.email,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            };

            await redis.setEx(
                `email_verification:${token}`,
                24 * 60 * 60,
                JSON.stringify(verificationData)
            );

            const result = await userService.verifyEmail(token);

            expect(result).toBe(true);

            // Verify user status updated
            const updatedUser = await db('users').where({ id: dbUser.id }).first();
            expect(updatedUser.status).toBe('active');
        });

        it('should throw error for invalid token', async () => {
            await expect(userService.verifyEmail('invalid-token'))
                .rejects.toThrow(AppError);
        });
    });

    describe('changePassword', () => {
        it('should change password with valid current password', async () => {
            const password = TestDataFactory.generateValidPassword();
            const dbUser = await TestDataFactory.createUser();

            // Update user with known password
            await db('users')
                .where({ id: dbUser.id })
                .update({ password_hash: await require('bcryptjs').hash(password, 12) });

            const newPassword = 'NewPassword123!';

            await expect(userService.changePassword(dbUser.id, password, newPassword))
                .resolves.not.toThrow();

            // Verify password was changed
            const updatedUser = await db('users').where({ id: dbUser.id }).first();
            const isNewPasswordValid = await require('bcryptjs').compare(newPassword, updatedUser.password_hash);
            expect(isNewPasswordValid).toBe(true);
        });

        it('should throw error for incorrect current password', async () => {
            const dbUser = await TestDataFactory.createUser();

            await expect(userService.changePassword(dbUser.id, 'wrong-password', 'NewPassword123!'))
                .rejects.toThrow(AppError);
        });

        it('should throw error for non-existent user', async () => {
            await expect(userService.changePassword('non-existent-id', 'old', 'new'))
                .rejects.toThrow(AppError);
        });
    });

    describe('checkConsentCompliance', () => {
        it('should return true for compliant user', async () => {
            const dbUser = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const isCompliant = await userService.checkConsentCompliance(dbUser.id);
            expect(isCompliant).toBe(true);
        });

        it('should return false for user without data processing consent', async () => {
            const dbUser = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: false,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            const isCompliant = await userService.checkConsentCompliance(dbUser.id);
            expect(isCompliant).toBe(false);
        });

        it('should return false for user with outdated consent version', async () => {
            const dbUser = await TestDataFactory.createUser({
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '0.9',
                    consentDate: new Date()
                }
            });

            const isCompliant = await userService.checkConsentCompliance(dbUser.id);
            expect(isCompliant).toBe(false);
        });

        it('should return false for non-existent user', async () => {
            const isCompliant = await userService.checkConsentCompliance('non-existent-id');
            expect(isCompliant).toBe(false);
        });
    });
});