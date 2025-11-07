import { getDatabase } from '@/config/database';
import { encryptionService } from './encryptionService';
import { auditService } from './auditService';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export interface DataExportRequest {
    userId: string;
    requestId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    requestedAt: Date;
    completedAt?: Date;
    downloadUrl?: string;
    expiresAt?: Date;
}

export interface DataDeletionRequest {
    userId: string;
    requestId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    requestedAt: Date;
    scheduledAt: Date;
    completedAt?: Date;
    reason?: string;
    confirmation: string;
}

export interface ConsentRecord {
    userId: string;
    consentType: string;
    action: 'granted' | 'withdrawn' | 'updated';
    consentVersion: string;
    timestamp: Date;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
}

export class GDPRService {
    private db: Knex;

    constructor() {
        this.db = getDatabase();
    }

    /**
     * Request data export for a user (Article 15 - Right of Access)
     */
    async requestDataExport(userId: string, correlationId: string): Promise<DataExportRequest> {
        const requestId = uuidv4();
        const request: DataExportRequest = {
            userId,
            requestId,
            status: 'pending',
            requestedAt: new Date()
        };

        // Store export request
        await this.db('data_export_requests').insert({
            id: requestId,
            user_id: userId,
            status: request.status,
            requested_at: request.requestedAt
        });

        // Log the request
        await auditService.logEvent({
            correlationId,
            actor: { id: userId, role: 'user' },
            action: 'data_export_requested',
            entityType: 'user',
            entityId: userId,
            metadata: { requestId }
        });

        // Start async export process
        this.processDataExport(requestId).catch(error => {
            console.error(`Data export failed for request ${requestId}:`, error);
        });

        return request;
    }

    /**
     * Process data export asynchronously
     */
    private async processDataExport(requestId: string): Promise<void> {
        try {
            // Update status to processing
            await this.db('data_export_requests')
                .where('id', requestId)
                .update({ status: 'processing' });

            const request = await this.db('data_export_requests')
                .where('id', requestId)
                .first();

            if (!request) {
                throw new Error('Export request not found');
            }

            // Collect all user data
            const userData = await this.collectUserData(request.user_id);

            // Encrypt the export data
            const encryptedData = await encryptionService.encryptPII(JSON.stringify(userData));

            // Store in secure location (S3 or similar)
            const downloadUrl = await this.storeExportData(requestId, encryptedData);

            // Update request with completion details
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            await this.db('data_export_requests')
                .where('id', requestId)
                .update({
                    status: 'completed',
                    completed_at: new Date(),
                    download_url: downloadUrl,
                    expires_at: expiresAt
                });

            // Log completion
            await auditService.logEvent({
                correlationId: requestId,
                actor: { id: 'system', role: 'system' },
                action: 'data_export_completed',
                entityType: 'user',
                entityId: request.user_id,
                metadata: { requestId, expiresAt }
            });

        } catch (error) {
            // Update status to failed
            await this.db('data_export_requests')
                .where('id', requestId)
                .update({ status: 'failed' });

            throw error;
        }
    }

    /**
     * Collect all data associated with a user
     */
    private async collectUserData(userId: string): Promise<any> {
        const userData: any = {
            exportedAt: new Date().toISOString(),
            userId: userId
        };

        // User profile data
        const user = await this.db('users')
            .where('id', userId)
            .first();

        if (user) {
            userData.profile = {
                id: user.id,
                email: user.email,
                role: user.role,
                department: user.department,
                status: user.status,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            };

            // Decrypt PII if present
            if (user.encrypted_pii) {
                try {
                    const decrypted = await encryptionService.decryptPII({
                        encryptedData: user.encrypted_pii,
                        keyId: process.env.KMS_MASTER_KEY_ID!,
                        algorithm: 'aes-256-gcm'
                    });
                    userData.profile.personalInfo = JSON.parse(decrypted.decryptedData.toString());
                } catch (error) {
                    console.error('Failed to decrypt PII for export:', error);
                }
            }
        }

        // Location data
        const locations = await this.db('location_points')
            .where('user_id', userId)
            .orderBy('timestamp', 'desc')
            .limit(10000); // Limit to prevent huge exports

        userData.locationHistory = locations.map(loc => ({
            timestamp: loc.timestamp,
            coordinates: {
                latitude: loc.coordinates.coordinates[1],
                longitude: loc.coordinates.coordinates[0]
            },
            accuracy: loc.accuracy,
            source: loc.source
        }));

        // Trip data
        const trips = await this.db('trips')
            .join('trip_stops', 'trips.id', 'trip_stops.trip_id')
            .where('trip_stops.user_id', userId)
            .select('trips.*');

        userData.trips = trips;

        // Invoice data
        const invoices = await this.db('invoices')
            .where('user_id', userId)
            .select('*');

        userData.invoices = invoices;

        // Usage data
        const usage = await this.db('usage_ledger')
            .where('user_id', userId)
            .select('*');

        userData.usage = usage;

        // Consent history
        const consentHistory = await this.db('consent_logs')
            .where('user_id', userId)
            .orderBy('timestamp', 'desc')
            .select('*');

        userData.consentHistory = consentHistory;

        // Audit events (user's own actions only)
        const auditEvents = await this.db('audit_events')
            .where('actor_id', userId)
            .orderBy('timestamp', 'desc')
            .limit(1000)
            .select('*');

        userData.auditTrail = auditEvents.map(event => ({
            eventId: event.event_id,
            action: event.action,
            entityType: event.entity_type,
            timestamp: event.timestamp,
            metadata: encryptionService.redactPII(event.metadata, 'user')
        }));

        return userData;
    }

    /**
     * Store export data securely
     */
    private async storeExportData(requestId: string, encryptedData: any): Promise<string> {
        // In a real implementation, this would upload to S3 or similar
        // For now, we'll simulate with a local secure storage
        const filename = `export_${requestId}.enc`;
        const downloadUrl = `https://secure-exports.example.com/${filename}`;

        // Store metadata about the export
        await this.db('export_files').insert({
            request_id: requestId,
            filename: filename,
            download_url: downloadUrl,
            file_size: encryptedData.encryptedData.length,
            created_at: new Date()
        });

        return downloadUrl;
    }

    /**
     * Request account deletion (Article 17 - Right to Erasure)
     */
    async requestAccountDeletion(
        userId: string,
        confirmation: string,
        reason?: string,
        correlationId?: string
    ): Promise<DataDeletionRequest> {
        if (confirmation !== 'DELETE_MY_ACCOUNT') {
            throw new Error('Invalid confirmation phrase');
        }

        const requestId = uuidv4();
        const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours grace period

        const request: DataDeletionRequest = {
            userId,
            requestId,
            status: 'pending',
            requestedAt: new Date(),
            scheduledAt,
            reason,
            confirmation
        };

        // Store deletion request
        await this.db('data_deletion_requests').insert({
            id: requestId,
            user_id: userId,
            status: request.status,
            requested_at: request.requestedAt,
            scheduled_at: scheduledAt,
            reason: reason,
            confirmation: confirmation
        });

        // Log the request
        await auditService.logEvent({
            correlationId: correlationId || requestId,
            actor: { id: userId, role: 'user' },
            action: 'account_deletion_requested',
            entityType: 'user',
            entityId: userId,
            metadata: { requestId, scheduledAt, reason }
        });

        return request;
    }

    /**
     * Process scheduled account deletions
     */
    async processScheduledDeletions(): Promise<void> {
        const pendingDeletions = await this.db('data_deletion_requests')
            .where('status', 'pending')
            .where('scheduled_at', '<=', new Date())
            .select('*');

        for (const deletion of pendingDeletions) {
            try {
                await this.executeAccountDeletion(deletion.id);
            } catch (error) {
                console.error(`Failed to delete account for request ${deletion.id}:`, error);

                await this.db('data_deletion_requests')
                    .where('id', deletion.id)
                    .update({ status: 'failed' });
            }
        }
    }

    /**
     * Execute account deletion
     */
    private async executeAccountDeletion(requestId: string): Promise<void> {
        const request = await this.db('data_deletion_requests')
            .where('id', requestId)
            .first();

        if (!request) {
            throw new Error('Deletion request not found');
        }

        const userId = request.user_id;

        // Update status to processing
        await this.db('data_deletion_requests')
            .where('id', requestId)
            .update({ status: 'processing' });

        // Delete user data in correct order (respecting foreign keys)
        await this.db.transaction(async (trx) => {
            // Delete location data
            await trx('location_points').where('user_id', userId).del();

            // Delete trip participation
            await trx('trip_stops').where('user_id', userId).del();

            // Delete invoices and payment attempts
            const invoiceIds = await trx('invoices')
                .where('user_id', userId)
                .pluck('id');

            if (invoiceIds.length > 0) {
                await trx('payment_attempts')
                    .whereIn('invoice_id', invoiceIds)
                    .del();

                await trx('invoices').where('user_id', userId).del();
            }

            // Delete usage data
            await trx('usage_ledger').where('user_id', userId).del();

            // Delete devices
            await trx('devices').where('user_id', userId).del();

            // Delete consent logs
            await trx('consent_logs').where('user_id', userId).del();

            // Anonymize audit events (don't delete for compliance)
            await trx('audit_events')
                .where('actor_id', userId)
                .update({
                    actor_id: 'deleted_user',
                    metadata: JSON.stringify({ anonymized: true })
                });

            // Finally delete user record
            await trx('users').where('id', userId).del();
        });

        // Update deletion request
        await this.db('data_deletion_requests')
            .where('id', requestId)
            .update({
                status: 'completed',
                completed_at: new Date()
            });

        // Log completion
        await auditService.logEvent({
            correlationId: requestId,
            actor: { id: 'system', role: 'system' },
            action: 'account_deletion_completed',
            entityType: 'user',
            entityId: userId,
            metadata: { requestId }
        });
    }

    /**
     * Update user consent (Article 7 - Consent)
     */
    async updateConsent(
        userId: string,
        consentType: string,
        granted: boolean,
        consentVersion: string,
        reason?: string,
        ipAddress?: string,
        userAgent?: string,
        correlationId?: string
    ): Promise<void> {
        const action = granted ? 'granted' : 'withdrawn';

        // Update user consent flags
        const user = await this.db('users').where('id', userId).first();
        if (!user) {
            throw new Error('User not found');
        }

        const consentFlags = JSON.parse(user.consent_flags || '{}');
        consentFlags[consentType] = granted;
        consentFlags.consentVersion = consentVersion;
        consentFlags.consentDate = new Date();

        await this.db('users')
            .where('id', userId)
            .update({
                consent_flags: JSON.stringify(consentFlags),
                updated_at: new Date()
            });

        // Log consent change
        await this.db('consent_logs').insert({
            id: uuidv4(),
            user_id: userId,
            consent_type: consentType,
            action: action,
            consent_version: consentVersion,
            timestamp: new Date(),
            reason: reason,
            ip_address: ipAddress,
            user_agent: userAgent
        });

        // Audit log
        await auditService.logEvent({
            correlationId: correlationId || uuidv4(),
            actor: { id: userId, role: 'user', ipAddress },
            action: `consent_${action}`,
            entityType: 'user',
            entityId: userId,
            metadata: { consentType, consentVersion, reason }
        });

        // If location consent withdrawn, stop collecting location data
        if (consentType === 'locationTracking' && !granted) {
            await this.stopLocationCollection(userId);
        }
    }

    /**
     * Get consent history for a user
     */
    async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
        const history = await this.db('consent_logs')
            .where('user_id', userId)
            .orderBy('timestamp', 'desc')
            .select('*');

        return history.map(record => ({
            userId: record.user_id,
            consentType: record.consent_type,
            action: record.action,
            consentVersion: record.consent_version,
            timestamp: record.timestamp,
            reason: record.reason,
            ipAddress: record.ip_address,
            userAgent: record.user_agent
        }));
    }

    /**
     * Stop location data collection for user
     */
    private async stopLocationCollection(userId: string): Promise<void> {
        // Mark user's location data for immediate retention processing
        await this.db('location_points')
            .where('user_id', userId)
            .update({
                retention_date: new Date() // Immediate deletion
            });

        // Notify location service to stop collecting
        // In a real implementation, this would send a message to the location service
        console.log(`Location collection stopped for user ${userId}`);
    }

    /**
     * Clean up expired export files
     */
    async cleanupExpiredExports(): Promise<void> {
        const expiredExports = await this.db('data_export_requests')
            .where('status', 'completed')
            .where('expires_at', '<', new Date())
            .select('*');

        for (const exportRequest of expiredExports) {
            try {
                // Delete the export file
                await this.db('export_files')
                    .where('request_id', exportRequest.id)
                    .del();

                // Update request status
                await this.db('data_export_requests')
                    .where('id', exportRequest.id)
                    .update({ status: 'expired' });

                console.log(`Cleaned up expired export ${exportRequest.id}`);
            } catch (error) {
                console.error(`Failed to cleanup export ${exportRequest.id}:`, error);
            }
        }
    }
}

// Singleton instance
export const gdprService = new GDPRService();