export type LocationSource = 'gps' | 'network' | 'passive';
export type GeofenceType = 'pickup_zone' | 'depot' | 'restricted';

export interface LocationPoint {
    userId: string;
    deviceId: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    accuracy: number;
    source: LocationSource;
    timestamp: Date;
    consentVersion: string;
    hashChain: string;
    retentionDate: Date;
}

export interface LocationIngestionRequest {
    coordinates: {
        latitude: number;
        longitude: number;
    };
    accuracy: number;
    source: LocationSource;
    timestamp: string;
    deviceId: string;
}

export interface GeofenceRule {
    id: string;
    name: string;
    polygon: GeoJSON.Polygon;
    type: GeofenceType;
    alertOnEntry: boolean;
    alertOnExit: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface LocationExportRequest {
    userId?: string;
    startDate: Date;
    endDate: Date;
    includeRedacted: boolean;
    format: 'json' | 'csv';
}

export interface LocationExportData {
    userId: string;
    coordinates: {
        latitude: number | string; // string for redacted data
        longitude: number | string;
    };
    accuracy: number | string;
    timestamp: Date;
    source: LocationSource;
    isRedacted: boolean;
}

export interface GeofenceAlert {
    id: string;
    userId: string;
    geofenceId: string;
    eventType: 'entry' | 'exit';
    coordinates: {
        latitude: number;
        longitude: number;
    };
    timestamp: Date;
    processed: boolean;
}

export interface LocationAnomalyDetection {
    userId: string;
    anomalyType: 'speed_violation' | 'location_jump' | 'accuracy_degradation' | 'unusual_pattern';
    severity: 'low' | 'medium' | 'high';
    description: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    timestamp: Date;
    metadata: Record<string, any>;
}

export interface LocationRetentionPolicy {
    retentionDays: number;
    cleanupIntervalHours: number;
    batchSize: number;
    preserveAggregates: boolean;
}

export interface HashChainVerification {
    isValid: boolean;
    brokenAt?: Date;
    totalPoints: number;
    verifiedPoints: number;
}