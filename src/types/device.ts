export type DeviceStatus = 'active' | 'inactive' | 'blocked';
export type DeviceType = 'mobile' | 'tablet' | 'web';

export interface Device {
    id: string;
    userId: string;
    deviceFingerprint: string;
    deviceType: DeviceType;
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
    status: DeviceStatus;
    trustLevel: number; // 0-100 trust score
    lastSeen: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface DeviceRegistrationRequest {
    deviceFingerprint: string;
    deviceType: DeviceType;
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
}

export interface DeviceUpdateRequest {
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
    status?: DeviceStatus;
}

export interface DeviceTrustFactors {
    loginFrequency: number;
    locationConsistency: number;
    behaviorPattern: number;
    securityIncidents: number;
}

export interface DeviceSecurityEvent {
    deviceId: string;
    eventType: 'suspicious_login' | 'location_anomaly' | 'multiple_sessions' | 'security_violation';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    metadata?: Record<string, any>;
    timestamp: Date;
}