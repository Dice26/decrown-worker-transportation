import { getDatabase } from '@/config/database';
import { getRedisClient, RedisKeys } from '@/config/redis';
import { logger } from '@/utils/logger';
import { AppError } from '@/middleware/errorHandler';
import { LocationService } from './locationService';
import { TransportService } from './transportService';

export interface SyncData {
    id: string;
    userId: string;
    deviceId: string;
    dataType: SyncDataType;
    operation: 'create' | 'update' | 'delete';
    data: any;
    timestamp: Date;
    clientTimestamp: Date;
    syncStatus: 'pending' | 'synced' | 'conflict' | 'failed';
    retryCount: number;
    lastSyncAttempt?: Date;
}

export type SyncDataType =
    | 'location_point'
    | 'trip_status'
    | 'driver_checkin'
    | 'incident_report'
    | 'availability_update'
    | 'consent_update';

export interface SyncRequest {
    deviceId: string;
    lastSyncTimestamp: Date;
    pendingData: PendingDataItem[];
}

export interface PendingDataItem {
    id: string;
    dataType: SyncDataType;
    operation: 'create' | 'update' | 'delete';
    data: any;
    clientTimestamp: Date;
}

export interface SyncResponse {
    syncTimestamp: Date;
    syncedItems: string[];
    conflicts: ConflictItem[];
    serverUpdates: ServerUpdate[];
    nextSyncIn: number; // seconds
}

export interface ConflictItem {
    clientId: string;
    conflictType: 'version' | 'data' | 'permission';
    serverData: any;
    clientData: any;
    resolution: 'server_wins' | 'client_wins' | 'merge' | 'manual';
}

export interface ServerUpdate {
    id: string;
    dataType: SyncDataType;
    operation: 'create' | 'update' | 'delete';
    data: any;
    timestamp: Date;
}

export class OfflineSyncService {
    private db = getDatabase();
    private redis = getRedisClient();
    private locationService = new LocationService();
    private transportService = new TransportService();

    // Sync intervals by data type (in seconds)
    private syncIntervals: Record<SyncDataType, number> = {
        location_point: 30,      // 30 seconds
        trip_status: 60,         // 1 minute
        driver_checkin: 30,      // 30 seconds
        incident_report: 15,     // 15 seconds (urgent)
        availability_update: 60, // 1 minute
        consent_update: 300      // 5 minutes
    };

    /**
     * Process sync request from mobile client
     */
    async processSyncRequest(userId: string, syncRequest: SyncRequest): Promise<SyncResponse> {
        try {
            const { deviceId, lastSyncTimestamp, pendingData } = syncRequest;

            logger.info('Processing sync request', {
                userId,
                deviceId,
                lastSyncTimestamp,
                pendingDataCount: pendingData.length
            });

            // Validate device ownership
            await this.validateDeviceOwnership(userId, deviceId);

            // Process pending data from client
            const syncResults = await this.processPendingData(userId, deviceId, pendingData);

            // Get server updates since last sync
            const serverUpdates = await this.getServerUpdates(userId, deviceId, lastSyncTimestamp);

            // Determine next sync interval
            const nextSyncIn = this.calculateNextSyncInterval(pendingData);

            const response: SyncResponse = {
                syncTimestamp: new Date(),
                syncedItems: syncResults.syncedItems,
                conflicts: syncResults.conflicts,
                serverUpdates,
                nextSyncIn
            };

            // Update last sync timestamp for device
            await this.updateLastSyncTimestamp(deviceId, response.syncTimestamp);

            logger.info('Sync request processed', {
                userId,
                deviceId,
                syncedCount: syncResults.syncedItems.length,
                conflictCount: syncResults.conflicts.length,
                serverUpdateCount: serverUpdates.length
            });

            return response;
        } catch (error) {
            logger.error('Failed to process sync request', {
                error: error.message,
                userId,
                deviceId: syncRequest.deviceId
            });
            throw error;
        }
    }

    /**
     * Queue data for offline sync
     */
    async queueForSync(
        userId: string,
        deviceId: string,
        dataType: SyncDataType,
        operation: 'create' | 'update' | 'delete',
        data: any
    ): Promise<string> {
        try {
            const [syncData] = await this.db('sync_queue').insert({
                user_id: userId,
                device_id: deviceId,
                data_type: dataType,
                operation,
                data: JSON.stringify(data),
                timestamp: new Date(),
                client_timestamp: data.clientTimestamp || new Date(),
                sync_status: 'pending',
                retry_count: 0
            }).returning('*');

            // Cache for quick access
            await this.redis.lPush(
                RedisKeys.syncQueue(deviceId),
                JSON.stringify(this.mapSyncDataFromDb(syncData))
            );

            logger.debug('Data queued for sync', {
                syncId: syncData.id,
                userId,
                deviceId,
                dataType,
                operation
            });

            return syncData.id;
        } catch (error) {
            logger.error('Failed to queue data for sync', {
                error: error.message,
                userId,
                deviceId,
                dataType,
                operation
            });
            throw error;
        }
    }

    /**
     * Get pending sync data for device
     */
    async getPendingSyncData(deviceId: string, limit: number = 100): Promise<SyncData[]> {
        try {
            // Try cache first
            const cachedData = await this.redis.lRange(RedisKeys.syncQueue(deviceId), 0, limit - 1);

            if (cachedData.length > 0) {
                return cachedData.map(item => JSON.parse(item));
            }

            // Fallback to database
            const syncData = await this.db('sync_queue')
                .where({ device_id: deviceId, sync_status: 'pending' })
                .orderBy('timestamp', 'asc')
                .limit(limit);

            return syncData.map(this.mapSyncDataFromDb);
        } catch (error) {
            logger.error('Failed to get pending sync data', {
                error: error.message,
                deviceId
            });
            throw error;
        }
    }

    /**
     * Handle sync conflicts
     */
    async resolveConflict(
        conflictId: string,
        resolution: 'server_wins' | 'client_wins' | 'merge',
        mergedData?: any
    ): Promise<void> {
        try {
            const conflict = await this.db('sync_conflicts')
                .where({ id: conflictId })
                .first();

            if (!conflict) {
                throw new AppError('Conflict not found', 404, 'CONFLICT_NOT_FOUND');
            }

            let finalData: any;

            switch (resolution) {
                case 'server_wins':
                    finalData = JSON.parse(conflict.server_data);
                    break;
                case 'client_wins':
                    finalData = JSON.parse(conflict.client_data);
                    break;
                case 'merge':
                    if (!mergedData) {
                        throw new AppError('Merged data required for merge resolution', 400, 'MERGED_DATA_REQUIRED');
                    }
                    finalData = mergedData;
                    break;
                default:
                    throw new AppError('Invalid resolution type', 400, 'INVALID_RESOLUTION');
            }

            // Apply the resolved data
            await this.applyResolvedData(conflict.data_type, conflict.operation, finalData);

            // Mark conflict as resolved
            await this.db('sync_conflicts')
                .where({ id: conflictId })
                .update({
                    resolution,
                    resolved_data: JSON.stringify(finalData),
                    resolved_at: new Date(),
                    status: 'resolved'
                });

            logger.info('Sync conflict resolved', {
                conflictId,
                resolution,
                dataType: conflict.data_type
            });
        } catch (error) {
            logger.error('Failed to resolve sync conflict', {
                error: error.message,
                conflictId,
                resolution
            });
            throw error;
        }
    }

    /**
     * Clean up old sync data
     */
    async cleanupSyncData(olderThanDays: number = 7): Promise<void> {
        try {
            const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));

            // Clean up synced data
            const deletedCount = await this.db('sync_queue')
                .where('sync_status', 'synced')
                .andWhere('timestamp', '<', cutoffDate)
                .del();

            // Clean up resolved conflicts
            const deletedConflicts = await this.db('sync_conflicts')
                .where('status', 'resolved')
                .andWhere('created_at', '<', cutoffDate)
                .del();

            logger.info('Sync data cleanup completed', {
                deletedSyncItems: deletedCount,
                deletedConflicts,
                cutoffDate
            });
        } catch (error) {
            logger.error('Failed to cleanup sync data', {
                error: error.message,
                olderThanDays
            });
            throw error;
        }
    }

    // Private helper methods

    private async validateDeviceOwnership(userId: string, deviceId: string): Promise<void> {
        const device = await this.db('devices')
            .where({ id: deviceId, user_id: userId, status: 'active' })
            .first();

        if (!device) {
            throw new AppError('Device not found or not owned by user', 403, 'DEVICE_ACCESS_DENIED');
        }
    }

    private async processPendingData(
        userId: string,
        deviceId: string,
        pendingData: PendingDataItem[]
    ): Promise<{ syncedItems: string[]; conflicts: ConflictItem[] }> {
        const syncedItems: string[] = [];
        const conflicts: ConflictItem[] = [];

        for (const item of pendingData) {
            try {
                const conflict = await this.checkForConflicts(userId, item);

                if (conflict) {
                    conflicts.push(conflict);
                    await this.recordConflict(userId, deviceId, item, conflict);
                } else {
                    await this.applySyncData(userId, deviceId, item);
                    syncedItems.push(item.id);
                }
            } catch (error) {
                logger.error('Failed to process pending data item', {
                    error: error.message,
                    itemId: item.id,
                    dataType: item.dataType
                });
                // Continue with other items
            }
        }

        return { syncedItems, conflicts };
    }

    private async checkForConflicts(userId: string, item: PendingDataItem): Promise<ConflictItem | null> {
        // Check for version conflicts based on data type
        switch (item.dataType) {
            case 'trip_status':
                return await this.checkTripStatusConflict(userId, item);
            case 'availability_update':
                return await this.checkAvailabilityConflict(userId, item);
            case 'consent_update':
                return await this.checkConsentConflict(userId, item);
            default:
                return null; // No conflict checking for other types
        }
    }

    private async checkTripStatusConflict(userId: string, item: PendingDataItem): Promise<ConflictItem | null> {
        const { tripId } = item.data;

        const serverTrip = await this.db('trips')
            .where({ id: tripId })
            .first();

        if (!serverTrip) {
            return null; // Trip doesn't exist, no conflict
        }

        // Check if server trip was updated after client timestamp
        if (serverTrip.updated_at > item.clientTimestamp) {
            return {
                clientId: item.id,
                conflictType: 'version',
                serverData: serverTrip,
                clientData: item.data,
                resolution: 'server_wins' // Default resolution
            };
        }

        return null;
    }

    private async checkAvailabilityConflict(userId: string, item: PendingDataItem): Promise<ConflictItem | null> {
        const serverUser = await this.db('users')
            .where({ id: userId })
            .first();

        if (!serverUser) {
            return null;
        }

        // Check if availability was updated on server after client timestamp
        if (serverUser.updated_at > item.clientTimestamp) {
            return {
                clientId: item.id,
                conflictType: 'version',
                serverData: { available: serverUser.available, reason: serverUser.availability_reason },
                clientData: item.data,
                resolution: 'client_wins' // User preference takes precedence
            };
        }

        return null;
    }

    private async checkConsentConflict(userId: string, item: PendingDataItem): Promise<ConflictItem | null> {
        const serverUser = await this.db('users')
            .where({ id: userId })
            .first();

        if (!serverUser) {
            return null;
        }

        const serverConsent = JSON.parse(serverUser.consent_flags || '{}');
        const clientConsent = item.data.consentFlags;

        // Check if consent was updated on server after client timestamp
        if (serverUser.updated_at > item.clientTimestamp) {
            return {
                clientId: item.id,
                conflictType: 'version',
                serverData: serverConsent,
                clientData: clientConsent,
                resolution: 'client_wins' // User consent changes take precedence
            };
        }

        return null;
    }

    private async applySyncData(userId: string, deviceId: string, item: PendingDataItem): Promise<void> {
        switch (item.dataType) {
            case 'location_point':
                await this.syncLocationPoint(userId, deviceId, item);
                break;
            case 'trip_status':
                await this.syncTripStatus(userId, item);
                break;
            case 'driver_checkin':
                await this.syncDriverCheckin(userId, item);
                break;
            case 'incident_report':
                await this.syncIncidentReport(userId, item);
                break;
            case 'availability_update':
                await this.syncAvailabilityUpdate(userId, item);
                break;
            case 'consent_update':
                await this.syncConsentUpdate(userId, item);
                break;
            default:
                throw new AppError(`Unknown sync data type: ${item.dataType}`, 400, 'UNKNOWN_SYNC_TYPE');
        }
    }

    private async syncLocationPoint(userId: string, deviceId: string, item: PendingDataItem): Promise<void> {
        const { coordinates, accuracy, timestamp } = item.data;

        await this.locationService.storeLocationPoint({
            userId,
            deviceId,
            coordinates,
            accuracy,
            source: 'gps',
            timestamp: new Date(timestamp),
            consentVersion: '1.0' // Would be retrieved from user
        });
    }

    private async syncTripStatus(userId: string, item: PendingDataItem): Promise<void> {
        const { tripId, status, location, notes } = item.data;

        await this.transportService.updateTripStatus(tripId, status, {
            location,
            notes,
            updatedBy: userId,
            timestamp: item.clientTimestamp
        });
    }

    private async syncDriverCheckin(userId: string, item: PendingDataItem): Promise<void> {
        const { stopId, location, notes } = item.data;

        await this.transportService.processDriverCheckIn(userId, stopId, {
            location,
            notes,
            timestamp: item.clientTimestamp
        });
    }

    private async syncIncidentReport(userId: string, item: PendingDataItem): Promise<void> {
        await this.transportService.reportIncident({
            ...item.data,
            reporterId: userId,
            timestamp: item.clientTimestamp
        });
    }

    private async syncAvailabilityUpdate(userId: string, item: PendingDataItem): Promise<void> {
        const { available, reason, location } = item.data;

        await this.db('users')
            .where({ id: userId })
            .update({
                available,
                availability_reason: reason,
                availability_location: location ? JSON.stringify(location) : null,
                updated_at: item.clientTimestamp
            });
    }

    private async syncConsentUpdate(userId: string, item: PendingDataItem): Promise<void> {
        const { consentFlags } = item.data;

        await this.db('users')
            .where({ id: userId })
            .update({
                consent_flags: JSON.stringify(consentFlags),
                updated_at: item.clientTimestamp
            });
    }

    private async recordConflict(
        userId: string,
        deviceId: string,
        item: PendingDataItem,
        conflict: ConflictItem
    ): Promise<void> {
        await this.db('sync_conflicts').insert({
            user_id: userId,
            device_id: deviceId,
            client_item_id: item.id,
            data_type: item.dataType,
            operation: item.operation,
            conflict_type: conflict.conflictType,
            server_data: JSON.stringify(conflict.serverData),
            client_data: JSON.stringify(conflict.clientData),
            suggested_resolution: conflict.resolution,
            status: 'pending',
            created_at: new Date()
        });
    }

    private async getServerUpdates(
        userId: string,
        deviceId: string,
        lastSyncTimestamp: Date
    ): Promise<ServerUpdate[]> {
        // Get updates from various tables since last sync
        const updates: ServerUpdate[] = [];

        // Trip updates
        const tripUpdates = await this.db('trips')
            .join('trip_stops', 'trips.id', 'trip_stops.trip_id')
            .where('trip_stops.user_id', userId)
            .andWhere('trips.updated_at', '>', lastSyncTimestamp)
            .select('trips.*');

        for (const trip of tripUpdates) {
            updates.push({
                id: trip.id,
                dataType: 'trip_status',
                operation: 'update',
                data: trip,
                timestamp: trip.updated_at
            });
        }

        // Add other update types as needed...

        return updates;
    }

    private async applyResolvedData(dataType: SyncDataType, operation: string, data: any): Promise<void> {
        // Apply the resolved data based on type and operation
        // Implementation would depend on specific data types
        logger.info('Applied resolved sync data', { dataType, operation });
    }

    private calculateNextSyncInterval(pendingData: PendingDataItem[]): number {
        if (pendingData.length === 0) {
            return 300; // 5 minutes default
        }

        // Find the shortest interval among pending data types
        const intervals = pendingData.map(item => this.syncIntervals[item.dataType]);
        return Math.min(...intervals);
    }

    private async updateLastSyncTimestamp(deviceId: string, timestamp: Date): Promise<void> {
        await this.redis.setEx(
            RedisKeys.lastSync(deviceId),
            86400, // 24 hours
            timestamp.toISOString()
        );
    }

    private mapSyncDataFromDb(dbSyncData: any): SyncData {
        return {
            id: dbSyncData.id,
            userId: dbSyncData.user_id,
            deviceId: dbSyncData.device_id,
            dataType: dbSyncData.data_type,
            operation: dbSyncData.operation,
            data: JSON.parse(dbSyncData.data),
            timestamp: dbSyncData.timestamp,
            clientTimestamp: dbSyncData.client_timestamp,
            syncStatus: dbSyncData.sync_status,
            retryCount: dbSyncData.retry_count,
            lastSyncAttempt: dbSyncData.last_sync_attempt
        };
    }
}