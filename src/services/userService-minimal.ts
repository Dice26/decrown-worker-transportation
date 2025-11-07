import { Knex } from 'knex';
import { Redis } from 'ioredis';
import { User, ConsentFlags } from '@/types/auth';
import { logger } from '@/utils/logger';

export class UserService {
    private db: Knex;
    private redis: Redis;
    private readonly CURRENT_CONSENT_VERSION = '1.0';

    constructor(db: Knex, redis: Redis) {
        this.db = db;
        this.redis = redis;
    }

    async getUser(userId: string): Promise<User | null> {
        try {
            const user = await this.db('users').where('id', userId).first();
            return user ? this.mapUserFromDb(user) : null;
        } catch (error: any) {
            logger.error('Failed to get user', { error: error.message });
            throw error;
        }
    }

    async updateConsentFlags(userId: string, consentUpdates: any): Promise<User> {
        try {
            const user = await this.getUser(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const updatedConsentFlags: ConsentFlags = {
                ...user.consentFlags,
                ...consentUpdates,
                consentVersion: this.CURRENT_CONSENT_VERSION,
                consentDate: new Date()
            };

            await this.db('users')
                .where({ id: userId })
                .update({
                    consent_flags: JSON.stringify(updatedConsentFlags),
                    updated_at: new Date()
                });

            logger.info('User consent flags updated', { userId });
            return await this.getUser(userId) as User;
        } catch (error: any) {
            logger.error('Failed to update consent flags', { error: error.message });
            throw error;
        }
    }

    private mapUserFromDb(dbUser: any): User {
        return {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            department: dbUser.department,
            status: dbUser.status,
            consentFlags: JSON.parse(dbUser.consent_flags || '{}'),
            createdAt: dbUser.created_at,
            updatedAt: dbUser.updated_at
        };
    }
}

export const userService = new UserService(
    require('@/config/database').db,
    require('@/config/redis').redisClient
);