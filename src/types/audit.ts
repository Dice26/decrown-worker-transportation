export interface AuditEvent {
    eventId: string;
    correlationId: string;
    actor: {
        id: string;
        role: string;
        ipAddress?: string;
    };
    action: string;
    entityType: string;
    entityId: string;
    timestamp: Date;
    diff?: {
        before: any;
        after: any;
    };
    metadata: Record<string, any>;
    hashChain: string;
}

export interface AuditQuery {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    actions?: string[];
    dateRange: {
        start: Date;
        end: Date;
    };
    includeRedacted: boolean;
    limit?: number;
    offset?: number;
}

export interface AuditTrailIntegrity {
    id: string;
    date: Date;
    lastHash: string;
    eventCount: number;
    createdAt: Date;
}

export interface AuditEventInput {
    correlationId: string;
    actor: {
        id: string;
        role: string;
        ipAddress?: string;
    };
    action: string;
    entityType: string;
    entityId: string;
    diff?: {
        before: any;
        after: any;
    };
    metadata?: Record<string, any>;
}

export interface AuditExportOptions {
    query: AuditQuery;
    format: 'json' | 'csv';
    redactionLevel: 'none' | 'partial' | 'full';
    requestorRole: string;
}

export interface RedactionRule {
    field: string;
    roles: string[];
    redactionType: 'mask' | 'remove' | 'hash';
}

export type AuditAction =
    | 'user.created'
    | 'user.updated'
    | 'user.deleted'
    | 'user.login'
    | 'user.logout'
    | 'location.shared'
    | 'location.consent_changed'
    | 'trip.created'
    | 'trip.updated'
    | 'trip.completed'
    | 'payment.processed'
    | 'payment.failed'
    | 'invoice.generated'
    | 'device.registered'
    | 'device.deactivated'
    | 'route.optimized'
    | 'audit.exported'
    | 'system.backup'
    | 'system.restore';

export interface AuditEventFilter {
    entityTypes?: string[];
    actions?: AuditAction[];
    actorIds?: string[];
    dateRange?: {
        start: Date;
        end: Date;
    };
    correlationIds?: string[];
}