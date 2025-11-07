import WebSocket from 'ws';
import { Server } from 'http';
import { logger } from '@/utils/logger';
import { LocationPoint } from '@/types/location';
import { User } from '@/types/auth';
import jwt from 'jsonwebtoken';
import { loadConfig } from '@/config/config';
import { createClient, RedisClientType } from 'redis';

interface AuthenticatedWebSocket extends WebSocket {
    userId: string;
    userRole: string;
    isAlive: boolean;
    subscriptions: Set<string>;
}

interface LocationSubscription {
    userId: string;
    subscriberRole: string;
    subscriberId: string;
    filters?: {
        accuracy?: number;
        sources?: string[];
        geofence?: string;
    };
}

interface LocationUpdate {
    type: 'location_update';
    userId: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    accuracy: number;
    source: string;
    timestamp: Date;
    deviceId: string;
}

interface RateLimitInfo {
    count: number;
    resetTime: number;
}

export class LocationBroadcastService {
    private wss: WebSocket.Server;
    private redis: RedisClientType;
    private config: any;
    private clients: Map<string, AuthenticatedWebSocket> = new Map();
    private subscriptions: Map<string, Set<LocationSubscription>> = new Map();
    private rateLimits: Map<string, RateLimitInfo> = new Map();

    // Rate limiting: max 10 location updates per minute per user
    private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
    private readonly RATE_LIMIT_MAX = 10;

    constructor(server: Server) {
        this.config = loadConfig();
        this.setupWebSocketServer(server);
        this.setupRedisClient();
        this.startHeartbeat();
    }

    private setupWebSocketServer(server: Server): void {
        this.wss = new WebSocket.Server({
            server,
            path: '/ws/location',
            verifyClient: this.verifyClient.bind(this)
        });

        this.wss.on('connection', this.handleConnection.bind(this));
        logger.info('WebSocket server initialized for location broadcasting');
    }

    private async setupRedisClient(): Promise<void> {
        this.redis = createClient({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password
        });

        this.redis.on('error', (err) => {
            logger.error('Redis client error:', err);
        });

        await this.redis.connect();

        // Subscribe to location updates from Redis pub/sub
        await this.redis.subscribe('location_updates', this.handleLocationUpdate.bind(this));
        logger.info('Subscribed to Redis location updates channel');
    }

    private verifyClient(info: any): boolean {
        try {
            const url = new URL(info.req.url, `http://${info.req.headers.host}`);
            const token = url.searchParams.get('token');

            if (!token) {
                logger.warn('WebSocket connection rejected: No token provided');
                return false;
            }

            const decoded = jwt.verify(token, this.config.auth.jwtSecret) as any;
            info.req.user = decoded;
            return true;
        } catch (error) {
            logger.warn('WebSocket connection rejected: Invalid token', { error: error.message });
            return false;
        }
    }

    private handleConnection(ws: WebSocket, req: any): void {
        const authenticatedWs = ws as AuthenticatedWebSocket;
        const user = req.user;

        authenticatedWs.userId = user.userId;
        authenticatedWs.userRole = user.role;
        authenticatedWs.isAlive = true;
        authenticatedWs.subscriptions = new Set();

        this.clients.set(user.userId, authenticatedWs);

        logger.info('WebSocket client connected', {
            userId: user.userId,
            role: user.role,
            totalClients: this.clients.size
        });

        // Handle incoming messages
        authenticatedWs.on('message', (data: WebSocket.Data) => {
            this.handleMessage(authenticatedWs, data);
        });

        // Handle client disconnect
        authenticatedWs.on('close', () => {
            this.handleDisconnect(authenticatedWs);
        });

        // Handle pong responses for heartbeat
        authenticatedWs.on('pong', () => {
            authenticatedWs.isAlive = true;
        });

        // Send welcome message
        this.sendMessage(authenticatedWs, {
            type: 'connected',
            message: 'Connected to location broadcast service',
            timestamp: new Date()
        });
    }

    private handleMessage(ws: AuthenticatedWebSocket, data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'subscribe_user_locations':
                    this.handleLocationSubscription(ws, message);
                    break;
                case 'unsubscribe_user_locations':
                    this.handleLocationUnsubscription(ws, message);
                    break;
                case 'location_update':
                    this.handleIncomingLocationUpdate(ws, message);
                    break;
                case 'ping':
                    this.sendMessage(ws, { type: 'pong', timestamp: new Date() });
                    break;
                default:
                    logger.warn('Unknown message type received', { type: message.type, userId: ws.userId });
            }
        } catch (error) {
            logger.error('Error handling WebSocket message:', error);
            this.sendMessage(ws, {
                type: 'error',
                message: 'Invalid message format',
                timestamp: new Date()
            });
        }
    }

    private handleLocationSubscription(ws: AuthenticatedWebSocket, message: any): void {
        const { userIds, filters } = message;

        // Validate subscription permissions
        if (!this.canSubscribeToUsers(ws.userRole, ws.userId, userIds)) {
            this.sendMessage(ws, {
                type: 'subscription_error',
                message: 'Insufficient permissions to subscribe to these users',
                timestamp: new Date()
            });
            return;
        }

        // Add subscriptions
        for (const userId of userIds) {
            const subscription: LocationSubscription = {
                userId,
                subscriberRole: ws.userRole,
                subscriberId: ws.userId,
                filters
            };

            if (!this.subscriptions.has(userId)) {
                this.subscriptions.set(userId, new Set());
            }

            this.subscriptions.get(userId)!.add(subscription);
            ws.subscriptions.add(userId);
        }

        this.sendMessage(ws, {
            type: 'subscription_success',
            subscribedUsers: userIds,
            timestamp: new Date()
        });

        logger.info('Location subscription added', {
            subscriberId: ws.userId,
            subscriberRole: ws.userRole,
            userIds,
            filters
        });
    }

    private handleLocationUnsubscription(ws: AuthenticatedWebSocket, message: any): void {
        const { userIds } = message;

        for (const userId of userIds) {
            const subscriptions = this.subscriptions.get(userId);
            if (subscriptions) {
                // Remove subscription for this client
                for (const sub of subscriptions) {
                    if (sub.subscriberId === ws.userId) {
                        subscriptions.delete(sub);
                        break;
                    }
                }

                // Clean up empty subscription sets
                if (subscriptions.size === 0) {
                    this.subscriptions.delete(userId);
                }
            }

            ws.subscriptions.delete(userId);
        }

        this.sendMessage(ws, {
            type: 'unsubscription_success',
            unsubscribedUsers: userIds,
            timestamp: new Date()
        });
    }

    private async handleIncomingLocationUpdate(ws: AuthenticatedWebSocket, message: any): Promise<void> {
        // Rate limiting check
        if (!this.checkRateLimit(ws.userId)) {
            this.sendMessage(ws, {
                type: 'rate_limit_exceeded',
                message: 'Location update rate limit exceeded',
                timestamp: new Date()
            });
            return;
        }

        // Validate that user can only send their own location updates
        if (message.userId !== ws.userId) {
            this.sendMessage(ws, {
                type: 'error',
                message: 'Cannot send location updates for other users',
                timestamp: new Date()
            });
            return;
        }

        // Queue the location update in Redis for processing
        const locationUpdate: LocationUpdate = {
            type: 'location_update',
            userId: message.userId,
            coordinates: message.coordinates,
            accuracy: message.accuracy,
            source: message.source,
            timestamp: new Date(message.timestamp),
            deviceId: message.deviceId
        };

        await this.redis.lPush('location_update_queue', JSON.stringify(locationUpdate));

        // Also publish for real-time broadcasting
        await this.redis.publish('location_updates', JSON.stringify(locationUpdate));

        logger.debug('Location update queued and published', {
            userId: message.userId,
            accuracy: message.accuracy,
            source: message.source
        });
    }

    private async handleLocationUpdate(message: string): Promise<void> {
        try {
            const locationUpdate: LocationUpdate = JSON.parse(message);

            // Get subscribers for this user
            const subscribers = this.subscriptions.get(locationUpdate.userId);
            if (!subscribers || subscribers.size === 0) {
                return;
            }

            // Broadcast to all subscribers
            for (const subscription of subscribers) {
                const client = this.clients.get(subscription.subscriberId);
                if (!client || client.readyState !== WebSocket.OPEN) {
                    continue;
                }

                // Apply filters if specified
                if (!this.passesFilters(locationUpdate, subscription.filters)) {
                    continue;
                }

                // Apply privacy filtering based on subscriber role
                const filteredUpdate = this.applyPrivacyFiltering(locationUpdate, subscription);

                this.sendMessage(client, {
                    type: 'location_update',
                    data: filteredUpdate,
                    timestamp: new Date()
                });
            }

            logger.debug('Location update broadcasted', {
                userId: locationUpdate.userId,
                subscriberCount: subscribers.size
            });

        } catch (error) {
            logger.error('Error handling location update from Redis:', error);
        }
    }

    private handleDisconnect(ws: AuthenticatedWebSocket): void {
        // Clean up subscriptions
        for (const userId of ws.subscriptions) {
            const subscriptions = this.subscriptions.get(userId);
            if (subscriptions) {
                for (const sub of subscriptions) {
                    if (sub.subscriberId === ws.userId) {
                        subscriptions.delete(sub);
                        break;
                    }
                }

                if (subscriptions.size === 0) {
                    this.subscriptions.delete(userId);
                }
            }
        }

        this.clients.delete(ws.userId);

        logger.info('WebSocket client disconnected', {
            userId: ws.userId,
            totalClients: this.clients.size
        });
    }

    private startHeartbeat(): void {
        setInterval(() => {
            this.wss.clients.forEach((ws: WebSocket) => {
                const authenticatedWs = ws as AuthenticatedWebSocket;

                if (!authenticatedWs.isAlive) {
                    logger.info('Terminating inactive WebSocket connection', { userId: authenticatedWs.userId });
                    return authenticatedWs.terminate();
                }

                authenticatedWs.isAlive = false;
                authenticatedWs.ping();
            });
        }, 30000); // 30 seconds
    }

    private sendMessage(ws: AuthenticatedWebSocket, message: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    private canSubscribeToUsers(subscriberRole: string, subscriberId: string, userIds: string[]): boolean {
        // Admin and dispatcher can subscribe to all users
        if (['admin', 'dispatcher'].includes(subscriberRole)) {
            return true;
        }

        // Users can only subscribe to their own location updates
        if (subscriberRole === 'worker' || subscriberRole === 'driver') {
            return userIds.length === 1 && userIds[0] === subscriberId;
        }

        return false;
    }

    private checkRateLimit(userId: string): boolean {
        const now = Date.now();
        const rateLimitInfo = this.rateLimits.get(userId);

        if (!rateLimitInfo || now > rateLimitInfo.resetTime) {
            // Reset or initialize rate limit
            this.rateLimits.set(userId, {
                count: 1,
                resetTime: now + this.RATE_LIMIT_WINDOW
            });
            return true;
        }

        if (rateLimitInfo.count >= this.RATE_LIMIT_MAX) {
            return false;
        }

        rateLimitInfo.count++;
        return true;
    }

    private passesFilters(locationUpdate: LocationUpdate, filters?: any): boolean {
        if (!filters) return true;

        // Accuracy filter
        if (filters.accuracy && locationUpdate.accuracy > filters.accuracy) {
            return false;
        }

        // Source filter
        if (filters.sources && !filters.sources.includes(locationUpdate.source)) {
            return false;
        }

        // Additional filters can be added here (geofence, time range, etc.)

        return true;
    }

    private applyPrivacyFiltering(locationUpdate: LocationUpdate, subscription: LocationSubscription): any {
        const canViewFullData = ['admin', 'dispatcher'].includes(subscription.subscriberRole) ||
            subscription.subscriberId === locationUpdate.userId;

        if (canViewFullData) {
            return locationUpdate;
        }

        // Apply privacy filtering for limited access
        return {
            ...locationUpdate,
            coordinates: {
                latitude: Math.round(locationUpdate.coordinates.latitude * 100) / 100,
                longitude: Math.round(locationUpdate.coordinates.longitude * 100) / 100
            },
            accuracy: Math.round(locationUpdate.accuracy / 10) * 10,
            deviceId: '[REDACTED]'
        };
    }

    /**
     * Get current connection statistics
     */
    getStats(): any {
        return {
            connectedClients: this.clients.size,
            totalSubscriptions: Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.size, 0),
            activeUsers: this.subscriptions.size
        };
    }

    /**
     * Broadcast system message to all connected clients
     */
    broadcastSystemMessage(message: string, targetRole?: string): void {
        for (const client of this.clients.values()) {
            if (!targetRole || client.userRole === targetRole) {
                this.sendMessage(client, {
                    type: 'system_message',
                    message,
                    timestamp: new Date()
                });
            }
        }
    }

    /**
     * Close all connections and cleanup
     */
    async shutdown(): Promise<void> {
        this.wss.clients.forEach((ws) => {
            ws.close(1000, 'Server shutting down');
        });

        await this.redis.disconnect();
        logger.info('Location broadcast service shut down');
    }
}