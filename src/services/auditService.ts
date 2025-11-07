import { Knex } from 'knex';
import { getDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import {
    AuditEvent,
    AuditEventInput,
    AuditQuery,
    AuditTrailIntegrity,
    AuditExportOptions,
    RedactionRule,
    AuditEventFilter
} from '@/types/audit';
import crypto from 'crypto';

export class AuditService {
    private db: Knex;
    private lastHash: string | null = null;

    constructor() {
        this.db = getDatabase();
    }

    /**
     * Log an audit event with hash chain verification
     */
    async logEvent(eventInput: AuditEventInput): Promise<AuditEvent> {
        try {
            // Generate hash chain
            const hashChain = await this.generateHashChain(eventInput);

            const auditEvent: Partial<AuditEvent> = {
                correlationId: eventInput.correlationId,
                actorId: eventInput.actor.id,
                actorRole: eventInput.actor.role,
                actorIp: eventInput.actor.ipAddress,
                action: eventInput.action,
                entityType: eventInput.entityType,
                entityId: eventInput.entityId,
                diff: eventInput.diff,
                metadata: eventInput.metadata || {},
                hashChain
            };

            const [insertedEvent] = await this.db('audit_events')
                .insert({
                    correlation_id: auditEvent.correlationId,
                    actor_id: auditEvent.actorId,
                    actor_role: auditEvent.actorRole,
                    actor_ip: auditEvent.actorIp,
                    action: auditEvent.action,
                    entity_type: auditEvent.entityType,
                    entity_id: auditEvent.entityId,
                    diff: auditEvent.diff ? JSON.stringify(auditEvent.diff) : null,
                    metadata: JSON.stringify(auditEvent.metadata),
                    hash_chain: auditEvent.hashChain
                })
                .returning('*');

            // Update last hash for next event
            this.lastHash = hashChain;

            const result = this.mapDbRowToAuditEvent(insertedEvent);

            logger.info('Audit event logged', {
                eventId: result.eventId,
                action: result.action,
                entityType: result.entityType,
                entityId: result.entityId,
                correlationId: result.correlationId
            });

            return result;
        } catch (error) {
            logger.error('Failed to log audit event', {
                error: error.message,
                eventInput
            });
            throw error;
        }
    }

    /**
     * Query audit events with filtering and pagination
     */
    async queryEvents(query: AuditQuery): Promise<{ events: AuditEvent[]; total: number }> {
        try {
            let baseQuery = this.db('audit_events')
                .select('*')
                .whereBetween('timestamp', [query.dateRange.start, query.dateRange.end]);

            // Apply filters
            if (query.entityType) {
                baseQuery = baseQuery.where('entity_type', query.entityType);
            }

            if (query.entityId) {
                baseQuery = baseQuery.where('entity_id', query.entityId);
            }

            if (query.actorId) {
                baseQuery = baseQuery.where('actor_id', query.actorId);
            }

            if (query.actions && query.actions.length > 0) {
                baseQuery = baseQuery.whereIn('action', query.actions);
            }

            // Get total count
            const totalResult = await baseQuery.clone().count('* as count').first();
            const total = parseInt(totalResult?.count as string) || 0;

            // Apply pagination
            if (query.limit) {
                baseQuery = baseQuery.limit(query.limit);
            }

            if (query.offset) {
                baseQuery = baseQuery.offset(query.offset);
            }

            // Order by timestamp descending
            baseQuery = baseQuery.orderBy('timestamp', 'desc');

            const rows = await baseQuery;
            const events = rows.map(row => this.mapDbRowToAuditEvent(row));

            // Apply redaction if needed
            const processedEvents = query.includeRedacted
                ? events
                : events.map(event => this.applyRedaction(event, 'partial'));

            return { events: processedEvents, total };
        } catch (error) {
            logger.error('Failed to query audit events', {
                error: error.message,
                query
            });
            throw error;
        }
    }

    /**
     * Export audit trail with role-based redaction
     */
    async exportAuditTrail(options: AuditExportOptions): Promise<string> {
        try {
            const { events } = await this.queryEvents(options.query);

            // Apply role-based redaction
            const redactedEvents = events.map(event =>
                this.applyRoleBasedRedaction(event, options.requestorRole, options.redactionLevel)
            );

            // Log the export action
            await this.logEvent({
                correlationId: `export_${Date.now()}`,
                actor: {
                    id: 'system',
                    role: 'system'
                },
                action: 'audit.exported',
                entityType: 'audit_trail',
                entityId: `export_${Date.now()}`,
                metadata: {
                    exportOptions: options,
                    eventCount: redactedEvents.length
                }
            });

            if (options.format === 'csv') {
                return this.convertToCSV(redactedEvents);
            } else {
                return JSON.stringify(redactedEvents, null, 2);
            }
        } catch (error) {
            logger.error('Failed to export audit trail', {
                error: error.message,
                options
            });
            throw error;
        }
    }

    /**
     * Verify audit trail integrity using hash chains
     */
    async verifyIntegrity(dateRange: { start: Date; end: Date }): Promise<{
        isValid: boolean;
        brokenChains: string[];
        totalEvents: number;
    }> {
        try {
            const events = await this.db('audit_events')
                .select('event_id', 'hash_chain', 'timestamp', 'correlation_id', 'action', 'entity_type', 'entity_id')
                .whereBetween('timestamp', [dateRange.start, dateRange.end])
                .orderBy('timestamp', 'asc');

            const brokenChains: string[] = [];
            let previousHash = '';

            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                const expectedHash = this.calculateEventHash(event, previousHash);

                if (event.hash_chain !== expectedHash) {
                    brokenChains.push(event.event_id);
                }

                previousHash = event.hash_chain;
            }

            const isValid = brokenChains.length === 0;

            logger.info('Audit trail integrity verification completed', {
                dateRange,
                totalEvents: events.length,
                isValid,
                brokenChainsCount: brokenChains.length
            });

            return {
                isValid,
                brokenChains,
                totalEvents: events.length
            };
        } catch (error) {
            logger.error('Failed to verify audit trail integrity', {
                error: error.message,
                dateRange
            });
            throw error;
        }
    }

    /**
     * Get audit events by correlation ID for request tracing
     */
    async getEventsByCorrelationId(correlationId: string): Promise<AuditEvent[]> {
        try {
            const rows = await this.db('audit_events')
                .select('*')
                .where('correlation_id', correlationId)
                .orderBy('timestamp', 'asc');

            return rows.map(row => this.mapDbRowToAuditEvent(row));
        } catch (error) {
            logger.error('Failed to get events by correlation ID', {
                error: error.message,
                correlationId
            });
            throw error;
        }
    }

    /**
     * Update daily integrity checkpoint
     */
    async updateIntegrityCheckpoint(date: Date): Promise<void> {
        try {
            // Get the last hash of the day
            const lastEvent = await this.db('audit_events')
                .select('hash_chain')
                .whereRaw('DATE(timestamp) = ?', [date.toISOString().split('T')[0]])
                .orderBy('timestamp', 'desc')
                .first();

            if (!lastEvent) {
                return; // No events for this date
            }

            // Count events for the day
            const countResult = await this.db('audit_events')
                .count('* as count')
                .whereRaw('DATE(timestamp) = ?', [date.toISOString().split('T')[0]])
                .first();

            const eventCount = parseInt(countResult?.count as string) || 0;

            // Insert or update integrity checkpoint
            await this.db('audit_trail_integrity')
                .insert({
                    date: date.toISOString().split('T')[0],
                    last_hash: lastEvent.hash_chain,
                    event_count: eventCount
                })
                .onConflict('date')
                .merge({
                    last_hash: lastEvent.hash_chain,
                    event_count: eventCount
                });

            logger.info('Integrity checkpoint updated', {
                date: date.toISOString().split('T')[0],
                eventCount,
                lastHash: lastEvent.hash_chain
            });
        } catch (error) {
            logger.error('Failed to update integrity checkpoint', {
                error: error.message,
                date
            });
            throw error;
        }
    }

    /**
     * Generate hash chain for audit event
     */
    private async generateHashChain(eventInput: AuditEventInput): Promise<string> {
        // Get the last hash if not cached
        if (!this.lastHash) {
            const lastEvent = await this.db('audit_events')
                .select('hash_chain')
                .orderBy('timestamp', 'desc')
                .first();

            this.lastHash = lastEvent?.hash_chain || '';
        }

        return this.calculateEventHash(eventInput, this.lastHash);
    }

    /**
     * Calculate hash for an event
     */
    private calculateEventHash(event: any, previousHash: string): string {
        const eventString = JSON.stringify({
            correlationId: event.correlation_id || event.correlationId,
            actorId: event.actor_id || event.actor?.id,
            action: event.action,
            entityType: event.entity_type || event.entityType,
            entityId: event.entity_id || event.entityId,
            timestamp: event.timestamp,
            previousHash
        });

        return crypto.createHash('sha256').update(eventString).digest('hex');
    }

    /**
     * Apply redaction based on level
     */
    private applyRedaction(event: AuditEvent, level: 'none' | 'partial' | 'full'): AuditEvent {
        if (level === 'none') {
            return event;
        }

        const redacted = { ...event };

        if (level === 'partial') {
            // Mask sensitive fields in metadata
            if (redacted.metadata) {
                redacted.metadata = this.maskSensitiveFields(redacted.metadata);
            }

            // Mask diff data
            if (redacted.diff) {
                redacted.diff = {
                    before: this.maskSensitiveFields(redacted.diff.before),
                    after: this.maskSensitiveFields(redacted.diff.after)
                };
            }
        } else if (level === 'full') {
            // Remove all sensitive data
            redacted.metadata = {};
            redacted.diff = undefined;
            redacted.actor.ipAddress = undefined;
        }

        return redacted;
    }

    /**
     * Apply role-based redaction
     */
    private applyRoleBasedRedaction(event: AuditEvent, requestorRole: string, level: string): AuditEvent {
        const redactionRules: RedactionRule[] = [
            { field: 'actor.ipAddress', roles: ['worker', 'driver'], redactionType: 'remove' },
            { field: 'metadata.password', roles: ['worker', 'driver', 'dispatcher'], redactionType: 'remove' },
            { field: 'metadata.paymentToken', roles: ['worker', 'driver', 'dispatcher'], redactionType: 'hash' },
            { field: 'diff.before.email', roles: ['worker', 'driver'], redactionType: 'mask' },
            { field: 'diff.after.email', roles: ['worker', 'driver'], redactionType: 'mask' }
        ];

        let redacted = { ...event };

        for (const rule of redactionRules) {
            if (rule.roles.includes(requestorRole)) {
                redacted = this.applyRedactionRule(redacted, rule);
            }
        }

        return redacted;
    }

    /**
     * Apply specific redaction rule
     */
    private applyRedactionRule(event: AuditEvent, rule: RedactionRule): AuditEvent {
        const fieldPath = rule.field.split('.');
        let current: any = event;

        // Navigate to the field
        for (let i = 0; i < fieldPath.length - 1; i++) {
            if (current[fieldPath[i]]) {
                current = current[fieldPath[i]];
            } else {
                return event; // Field doesn't exist
            }
        }

        const fieldName = fieldPath[fieldPath.length - 1];

        if (current[fieldName] !== undefined) {
            switch (rule.redactionType) {
                case 'remove':
                    delete current[fieldName];
                    break;
                case 'mask':
                    current[fieldName] = '***REDACTED***';
                    break;
                case 'hash':
                    current[fieldName] = crypto.createHash('sha256')
                        .update(current[fieldName].toString())
                        .digest('hex');
                    break;
            }
        }

        return event;
    }

    /**
     * Mask sensitive fields in an object
     */
    private maskSensitiveFields(obj: any): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const sensitiveFields = ['password', 'token', 'secret', 'key', 'ssn', 'creditCard'];
        const masked = { ...obj };

        for (const key in masked) {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                masked[key] = '***REDACTED***';
            } else if (typeof masked[key] === 'object') {
                masked[key] = this.maskSensitiveFields(masked[key]);
            }
        }

        return masked;
    }

    /**
     * Convert events to CSV format
     */
    private convertToCSV(events: AuditEvent[]): string {
        if (events.length === 0) {
            return 'No events found';
        }

        const headers = [
            'Event ID',
            'Correlation ID',
            'Actor ID',
            'Actor Role',
            'Action',
            'Entity Type',
            'Entity ID',
            'Timestamp',
            'Metadata',
            'Hash Chain'
        ];

        const rows = events.map(event => [
            event.eventId,
            event.correlationId,
            event.actor.id,
            event.actor.role,
            event.action,
            event.entityType,
            event.entityId,
            event.timestamp.toISOString(),
            JSON.stringify(event.metadata),
            event.hashChain
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }

    /**
     * Get audit statistics for a date range
     */
    async getAuditStatistics(dateRange: { start: Date; end: Date }): Promise<{
        totalEvents: number;
        eventsByAction: { action: string; count: number }[];
        eventsByActor: { role: string; count: number }[];
    }> {
        try {
            // Get total events
            const totalResult = await this.db('audit_events')
                .count('* as count')
                .whereBetween('timestamp', [dateRange.start, dateRange.end])
                .first();

            const totalEvents = parseInt(totalResult?.count as string) || 0;

            // Get events by action
            const actionResults = await this.db('audit_events')
                .select('action')
                .count('* as count')
                .whereBetween('timestamp', [dateRange.start, dateRange.end])
                .groupBy('action')
                .orderBy('count', 'desc');

            const eventsByAction = actionResults.map(row => ({
                action: row.action,
                count: parseInt(row.count as string)
            }));

            // Get events by actor role
            const actorResults = await this.db('audit_events')
                .select('actor_role')
                .count('* as count')
                .whereBetween('timestamp', [dateRange.start, dateRange.end])
                .groupBy('actor_role')
                .orderBy('count', 'desc');

            const eventsByActor = actorResults.map(row => ({
                role: row.actor_role,
                count: parseInt(row.count as string)
            }));

            return {
                totalEvents,
                eventsByAction,
                eventsByActor
            };
        } catch (error) {
            logger.error('Failed to get audit statistics', {
                error: error.message,
                dateRange
            });
            throw error;
        }
    }

    /**
     * Map database row to AuditEvent object
     */
    private mapDbRowToAuditEvent(row: any): AuditEvent {
        return {
            eventId: row.event_id,
            correlationId: row.correlation_id,
            actor: {
                id: row.actor_id,
                role: row.actor_role,
                ipAddress: row.actor_ip
            },
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            timestamp: new Date(row.timestamp),
            diff: row.diff ? JSON.parse(row.diff) : undefined,
            metadata: JSON.parse(row.metadata || '{}'),
            hashChain: row.hash_chain
        };
    }
}

// Export singleton instance
export const auditService = new AuditService();