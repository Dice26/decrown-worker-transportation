import { getDatabase } from '@/config/database';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { logger } from '@/utils/logger';
import { AppError } from '@/middleware/errorHandler';

export interface PushNotification {
    id: string;
    userId: string;
    deviceId?: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    type: NotificationType;
    priority: 'low' | 'normal' | 'high' | 'critical';
    scheduledAt?: Date;
    expiresAt?: Date;
    createdAt: Date;
}

export type NotificationType =
    | 'trip_assigned'
    | 'trip_updated'
    | 'trip_cancelled'
    | 'driver_arrived'
    | 'pickup_reminder'
    | 'route_optimized'
    | 'incident_reported'
    | 'payment_due'
    | 'system_alert';

export interface PushToken {
    userId: string;
    deviceId: string;
    token: string;
    platform: 'ios' | 'android';
    appVersion: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface NotificationTemplate {
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, any>;
    priority: 'low' | 'normal' | 'high' | 'critical';
}

export class PushNotificationService {
    private db = getDatabase();
    private redis = getRedisClient();

    // Notification templates
    private templates: Record<NotificationType, NotificationTemplate> = {
        trip_assigned: {
            type: 'trip_assigned',
            title: 'Trip Assigned',
            body: 'You have been assigned to a new trip. Tap to view details.',
            priority: 'high',
            data: { action: 'view_trip' }
        },
        trip_updated: {
            type: 'trip_updated',
            title: 'Trip Updated',
            body: 'Your trip details have been updated.',
            priority: 'normal',
            data: { action: 'view_trip' }
        },
        trip_cancelled: {
            type: 'trip_cancelled',
            title: 'Trip Cancelled',
            body: 'Your scheduled trip has been cancelled.',
            priority: 'high',
            data: { action: 'view_trips' }
        },
        driver_arrived: {
            type: 'driver_arrived',
            title: 'Driver Arrived',
            body: 'Your driver has arrived at the pickup location.',
            priority: 'critical',
            data: { action: 'view_trip' }
        },
        pickup_reminder: {
            type: 'pickup_reminder',
            title: 'Pickup Reminder',
            body: 'Your pickup is scheduled in 15 minutes. Please be ready.',
            priority: 'high',
            data: { action: 'view_trip' }
        },
        route_optimized: {
            type: 'route_optimized',
            title: 'Route Updated',
            body: 'Your route has been optimized. Check new pickup times.',
            priority: 'normal',
            data: { action: 'view_route' }
        },
        incident_reported: {
            type: 'incident_reported',
            title: 'Incident Reported',
            body: 'An incident has been reported on your route.',
            priority: 'high',
            data: { action: 'view_incident' }
        },
        payment_due: {
            type: 'payment_due',
            title: 'Payment Due',
            body: 'Your transportation payment is due in 3 days.',
            priority: 'normal',
            data: { action: 'view_billing' }
        },
        system_alert: {
            type: 'system_alert',
            title: 'System Alert',
            body: 'Important system notification.',
            priority: 'high',
            data: { action: 'view_alerts' }
        }
    };

    /**
     * Register push token for a device
     */
    async registerPushToken(
        userId: string,
        deviceId: string,
        token: string,
        platform: 'ios' | 'android',
        appVersion: string
    ): Promise<void> {
        try {
            // Deactivate existing tokens for this device
            await this.db('push_tokens')
                .where({ device_id: deviceId })
                .update({ is_active: false, updated_at: new Date() });

            // Insert new token
            await this.db('push_tokens').insert({
                user_id: userId,
                device_id: deviceId,
                token,
                platform,
                app_version: appVersion,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });

            // Cache active token for quick access
            await this.redis.setEx(
                RedisKeys.pushToken(deviceId),
                86400, // 24 hours
                JSON.stringify({ token, platform, userId })
            );

            logger.info('Push token registered', {
                userId,
                deviceId,
                platform,
                appVersion
            });
        } catch (error) {
            logger.error('Failed to register push token', {
                error: error.message,
                userId,
                deviceId,
                platform
            });
            throw new AppError('Failed to register push token', 500, 'PUSH_TOKEN_REGISTRATION_FAILED');
        }
    }

    /**
     * Send push notification to specific user
     */
    async sendNotification(
        userId: string,
        type: NotificationType,
        customData?: Partial<PushNotification>
    ): Promise<string> {
        try {
            const template = this.templates[type];
            if (!template) {
                throw new AppError(`Unknown notification type: ${type}`, 400, 'INVALID_NOTIFICATION_TYPE');
            }

            // Create notification record
            const [notification] = await this.db('push_notifications').insert({
                user_id: userId,
                device_id: customData?.deviceId,
                title: customData?.title || template.title,
                body: customData?.body || template.body,
                data: JSON.stringify({ ...template.data, ...customData?.data }),
                type,
                priority: customData?.priority || template.priority,
                scheduled_at: customData?.scheduledAt,
                expires_at: customData?.expiresAt,
                created_at: new Date()
            }).returning('*');

            // Get active push tokens for user
            const pushTokens = await this.getActivePushTokens(userId, customData?.deviceId);

            if (pushTokens.length === 0) {
                logger.warn('No active push tokens found for user', { userId, type });
                return notification.id;
            }

            // Send to push notification queue for processing
            await this.queueNotificationDelivery(notification, pushTokens);

            logger.info('Push notification queued', {
                notificationId: notification.id,
                userId,
                type,
                tokenCount: pushTokens.length
            });

            return notification.id;
        } catch (error) {
            logger.error('Failed to send push notification', {
                error: error.message,
                userId,
                type
            });
            throw error;
        }
    }

    /**
     * Send notification to multiple users
     */
    async sendBulkNotification(
        userIds: string[],
        type: NotificationType,
        customData?: Partial<PushNotification>
    ): Promise<string[]> {
        const notificationIds: string[] = [];

        for (const userId of userIds) {
            try {
                const notificationId = await this.sendNotification(userId, type, customData);
                notificationIds.push(notificationId);
            } catch (error) {
                logger.error('Failed to send bulk notification to user', {
                    error: error.message,
                    userId,
                    type
                });
                // Continue with other users
            }
        }

        return notificationIds;
    }

    /**
     * Send location-based notification (geofence)
     */
    async sendLocationBasedNotification(
        location: { latitude: number; longitude: number },
        radius: number,
        type: NotificationType,
        customData?: Partial<PushNotification>
    ): Promise<string[]> {
        try {
            // Find users within the specified radius
            const nearbyUsers = await this.db('location_points')
                .select('user_id')
                .whereRaw(
                    'ST_DWithin(coordinates, ST_Point(?, ?)::geography, ?)',
                    [location.longitude, location.latitude, radius]
                )
                .andWhere('timestamp', '>', new Date(Date.now() - 300000)) // Last 5 minutes
                .groupBy('user_id');

            const userIds = nearbyUsers.map(u => u.user_id);

            if (userIds.length === 0) {
                logger.info('No users found in location radius', { location, radius });
                return [];
            }

            return await this.sendBulkNotification(userIds, type, customData);
        } catch (error) {
            logger.error('Failed to send location-based notification', {
                error: error.message,
                location,
                radius,
                type
            });
            throw error;
        }
    }

    /**
     * Schedule notification for future delivery
     */
    async scheduleNotification(
        userId: string,
        type: NotificationType,
        scheduledAt: Date,
        customData?: Partial<PushNotification>
    ): Promise<string> {
        try {
            const notificationId = await this.sendNotification(userId, type, {
                ...customData,
                scheduledAt
            });

            // Add to scheduled notifications queue
            await this.redis.zAdd(
                RedisKeys.scheduledNotifications(),
                {
                    score: scheduledAt.getTime(),
                    value: notificationId
                }
            );

            logger.info('Notification scheduled', {
                notificationId,
                userId,
                type,
                scheduledAt
            });

            return notificationId;
        } catch (error) {
            logger.error('Failed to schedule notification', {
                error: error.message,
                userId,
                type,
                scheduledAt
            });
            throw error;
        }
    }

    /**
     * Cancel scheduled notification
     */
    async cancelNotification(notificationId: string): Promise<void> {
        try {
            // Update notification status
            await this.db('push_notifications')
                .where({ id: notificationId })
                .update({
                    status: 'cancelled',
                    updated_at: new Date()
                });

            // Remove from scheduled queue
            await this.redis.zRem(RedisKeys.scheduledNotifications(), notificationId);

            logger.info('Notification cancelled', { notificationId });
        } catch (error) {
            logger.error('Failed to cancel notification', {
                error: error.message,
                notificationId
            });
            throw error;
        }
    }

    /**
     * Get notification history for user
     */
    async getNotificationHistory(
        userId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<PushNotification[]> {
        try {
            const offset = (page - 1) * limit;

            const notifications = await this.db('push_notifications')
                .where({ user_id: userId })
                .orderBy('created_at', 'desc')
                .limit(limit)
                .offset(offset);

            return notifications.map(this.mapNotificationFromDb);
        } catch (error) {
            logger.error('Failed to get notification history', {
                error: error.message,
                userId,
                page,
                limit
            });
            throw error;
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId: string, userId: string): Promise<void> {
        try {
            const result = await this.db('push_notifications')
                .where({ id: notificationId, user_id: userId })
                .update({
                    read_at: new Date(),
                    updated_at: new Date()
                });

            if (result === 0) {
                throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
            }

            logger.debug('Notification marked as read', { notificationId, userId });
        } catch (error) {
            logger.error('Failed to mark notification as read', {
                error: error.message,
                notificationId,
                userId
            });
            throw error;
        }
    }

    /**
     * Process scheduled notifications (called by background job)
     */
    async processScheduledNotifications(): Promise<void> {
        try {
            const now = Date.now();

            // Get notifications scheduled for now or earlier
            const scheduledNotifications = await this.redis.zRangeByScore(
                RedisKeys.scheduledNotifications(),
                0,
                now,
                { LIMIT: { offset: 0, count: 100 } }
            );

            for (const notificationId of scheduledNotifications) {
                try {
                    await this.deliverScheduledNotification(notificationId);

                    // Remove from scheduled queue
                    await this.redis.zRem(RedisKeys.scheduledNotifications(), notificationId);
                } catch (error) {
                    logger.error('Failed to deliver scheduled notification', {
                        error: error.message,
                        notificationId
                    });
                }
            }

            if (scheduledNotifications.length > 0) {
                logger.info('Processed scheduled notifications', {
                    count: scheduledNotifications.length
                });
            }
        } catch (error) {
            logger.error('Failed to process scheduled notifications', {
                error: error.message
            });
        }
    }

    // Private helper methods

    private async getActivePushTokens(userId: string, deviceId?: string): Promise<PushToken[]> {
        let query = this.db('push_tokens')
            .where({ user_id: userId, is_active: true });

        if (deviceId) {
            query = query.andWhere({ device_id: deviceId });
        }

        const tokens = await query;
        return tokens.map(this.mapPushTokenFromDb);
    }

    private async queueNotificationDelivery(notification: any, pushTokens: PushToken[]): Promise<void> {
        const deliveryJob = {
            notificationId: notification.id,
            notification: this.mapNotificationFromDb(notification),
            pushTokens
        };

        // Add to Redis queue for background processing
        await this.redis.lPush(
            RedisKeys.notificationQueue(),
            JSON.stringify(deliveryJob)
        );
    }

    private async deliverScheduledNotification(notificationId: string): Promise<void> {
        const notification = await this.db('push_notifications')
            .where({ id: notificationId })
            .first();

        if (!notification) {
            logger.warn('Scheduled notification not found', { notificationId });
            return;
        }

        const pushTokens = await this.getActivePushTokens(notification.user_id, notification.device_id);

        if (pushTokens.length > 0) {
            await this.queueNotificationDelivery(notification, pushTokens);
        }
    }

    private mapNotificationFromDb(dbNotification: any): PushNotification {
        return {
            id: dbNotification.id,
            userId: dbNotification.user_id,
            deviceId: dbNotification.device_id,
            title: dbNotification.title,
            body: dbNotification.body,
            data: dbNotification.data ? JSON.parse(dbNotification.data) : undefined,
            type: dbNotification.type,
            priority: dbNotification.priority,
            scheduledAt: dbNotification.scheduled_at,
            expiresAt: dbNotification.expires_at,
            createdAt: dbNotification.created_at
        };
    }

    private mapPushTokenFromDb(dbToken: any): PushToken {
        return {
            userId: dbToken.user_id,
            deviceId: dbToken.device_id,
            token: dbToken.token,
            platform: dbToken.platform,
            appVersion: dbToken.app_version,
            isActive: dbToken.is_active,
            createdAt: dbToken.created_at,
            updatedAt: dbToken.updated_at
        };
    }
}