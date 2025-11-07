export type TripStatus = 'planned' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type RouteStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type TripStopStatus = 'pending' | 'arrived' | 'picked_up' | 'no_show';
export type IncidentType = 'delay' | 'breakdown' | 'accident' | 'weather' | 'traffic' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TripStop {
    userId: string;
    location: {
        latitude: number;
        longitude: number;
        address?: string;
    };
    estimatedArrival: Date;
    actualArrival?: Date;
    status: TripStopStatus;
    notes?: string;
}

export interface TripMetrics {
    totalDistance?: number;
    totalDuration?: number;
    averageSpeed?: number;
    fuelConsumption?: number;
    delayMinutes?: number;
    pickupCount?: number;
    noShowCount?: number;
    onTimePercentage?: number;
}

export interface Trip {
    id: string;
    routeId: string;
    driverId?: string;
    status: TripStatus;
    plannedStops: TripStop[];
    actualStops: TripStop[];
    metrics: TripMetrics;
    createdAt: Date;
    scheduledAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    notes?: string;
}

export interface Route {
    id: string;
    name: string;
    description?: string;
    status: RouteStatus;
    createdBy: string;
    optimizationConfig: RouteOptimizationConfig;
    constraints: RouteConstraints;
    createdAt: Date;
    updatedAt: Date;
}

export interface RouteOptimizationConfig {
    algorithm: 'nearest_neighbor' | 'genetic' | 'simulated_annealing';
    maxIterations?: number;
    timeLimit?: number;
    prioritizePickupTime?: boolean;
    minimizeDistance?: boolean;
    balanceLoad?: boolean;
}

export interface RouteConstraints {
    maxStops: number;
    maxDuration: number; // in minutes
    vehicleCapacity: number;
    startLocation?: {
        latitude: number;
        longitude: number;
    };
    endLocation?: {
        latitude: number;
        longitude: number;
    };
    timeWindows?: {
        start: string; // HH:MM format
        end: string;
    };
}

export interface TripCreationRequest {
    routeId?: string;
    scheduledAt: Date;
    workerIds: string[];
    driverId?: string;
    notes?: string;
    optimizationConfig?: RouteOptimizationConfig;
}

export interface TripUpdateRequest {
    status?: TripStatus;
    driverId?: string;
    actualStops?: TripStop[];
    notes?: string;
    metrics?: Partial<TripMetrics>;
}

export interface IncidentReport {
    id: string;
    tripId: string;
    reportedBy: string;
    incidentType: IncidentType;
    severity: IncidentSeverity;
    description: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    estimatedDelay?: number; // in minutes
    resolved: boolean;
    reportedAt: Date;
    resolvedAt?: Date;
    resolution?: string;
}

export interface IncidentReportRequest {
    tripId: string;
    incidentType: IncidentType;
    severity: IncidentSeverity;
    description: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    estimatedDelay?: number;
}

export interface TripNotification {
    id: string;
    tripId: string;
    recipientId: string;
    type: 'assignment' | 'status_update' | 'delay' | 'completion' | 'cancellation';
    title: string;
    message: string;
    data?: Record<string, any>;
    sentAt: Date;
    readAt?: Date;
}

export interface ETACalculation {
    tripId: string;
    stopId: string;
    estimatedArrival: Date;
    confidence: number; // 0-1 scale
    factors: {
        distance: number;
        traffic: number;
        weather?: number;
        historical?: number;
    };
    calculatedAt: Date;
}

export interface DriverCapacity {
    driverId: string;
    maxPassengers: number;
    currentLoad: number;
    availableSlots: number;
    vehicleType: string;
    isAvailable: boolean;
    currentLocation?: {
        latitude: number;
        longitude: number;
    };
    lastUpdated: Date;
}