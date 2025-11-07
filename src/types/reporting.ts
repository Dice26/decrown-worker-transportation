export type ReportType = 'usage_summary' | 'cost_analysis' | 'efficiency_metrics' | 'trip_analytics' | 'driver_performance' | 'audit_summary';
export type ReportFormat = 'csv' | 'pdf' | 'json';
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type UserRole = 'worker' | 'driver' | 'dispatcher' | 'finance' | 'admin';

export interface ReportTemplate {
    id: string;
    name: string;
    type: ReportType;
    description: string;
    allowedRoles: UserRole[];
    dataFields: ReportDataField[];
    filters: ReportFilter[];
    aggregations: ReportAggregation[];
    createdAt: Date;
    updatedAt: Date;
}

export interface ReportDataField {
    name: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    required: boolean;
    sensitive: boolean;
    roleRestrictions?: UserRole[];
}

export interface ReportFilter {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'between' | 'in' | 'contains';
    value: any;
    required: boolean;
}

export interface ReportAggregation {
    field: string;
    function: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct_count';
    groupBy?: string[];
}

export interface ReportRequest {
    templateId: string;
    period: ReportPeriod;
    dateRange: {
        start: Date;
        end: Date;
    };
    filters?: Record<string, any>;
    format: ReportFormat;
    requestedBy: {
        id: string;
        role: UserRole;
    };
    deliveryMethod?: 'download' | 'email' | 'schedule';
    scheduledDelivery?: ScheduledDelivery;
}

export interface ScheduledDelivery {
    frequency: 'daily' | 'weekly' | 'monthly';
    dayOfWeek?: number; // 0-6, Sunday = 0
    dayOfMonth?: number; // 1-31
    time: string; // HH:MM format
    recipients: string[];
    active: boolean;
}

export interface ReportResult {
    id: string;
    templateId: string;
    requestId: string;
    data: ReportData[];
    metadata: ReportMetadata;
    generatedAt: Date;
    generatedBy: string;
    format: ReportFormat;
    filePath?: string;
    downloadUrl?: string;
    expiresAt?: Date;
}

export interface ReportData {
    [key: string]: any;
}

export interface ReportMetadata {
    totalRecords: number;
    filteredRecords: number;
    dateRange: {
        start: Date;
        end: Date;
    };
    aggregations?: Record<string, any>;
    executionTime: number;
    dataSource: string[];
    redactionApplied: boolean;
}

export interface UsageMetrics {
    userId: string;
    userName?: string;
    department?: string;
    period: string;
    ridesCount: number;
    totalDistance: number;
    totalDuration: number;
    totalCost: number;
    averageCostPerRide: number;
    averageDistance: number;
    noShowCount: number;
    onTimePercentage: number;
}

export interface CostAnalysis {
    period: string;
    totalRevenue: number;
    totalCosts: number;
    profit: number;
    profitMargin: number;
    costPerKm: number;
    costPerRide: number;
    revenuePerUser: number;
    utilizationRate: number;
    breakdown: {
        baseFares: number;
        distanceFees: number;
        timeFees: number;
        surcharges: number;
        discounts: number;
    };
}

export interface EfficiencyMetrics {
    period: string;
    totalTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    completionRate: number;
    averagePickupTime: number;
    averageDelayMinutes: number;
    onTimePerformance: number;
    fuelEfficiency?: number;
    driverUtilization: number;
    routeOptimizationSavings: number;
}

export interface TripAnalytics {
    tripId: string;
    routeId: string;
    driverId: string;
    driverName?: string;
    scheduledAt: Date;
    completedAt?: Date;
    status: string;
    plannedStops: number;
    actualStops: number;
    totalDistance: number;
    totalDuration: number;
    delayMinutes: number;
    fuelConsumption?: number;
    cost: number;
    revenue: number;
    efficiency: number;
}

export interface DriverPerformance {
    driverId: string;
    driverName?: string;
    period: string;
    totalTrips: number;
    completedTrips: number;
    completionRate: number;
    averageRating?: number;
    onTimePerformance: number;
    averageDelayMinutes: number;
    totalDistance: number;
    fuelEfficiency?: number;
    incidentCount: number;
    safetyScore?: number;
    utilizationRate: number;
}

export interface DashboardMetrics {
    activeRoutes: number;
    activeDrivers: number;
    onlineWorkers: number;
    tripsInProgress: number;
    completedTripsToday: number;
    averageETA: number;
    systemHealth: {
        locationService: 'healthy' | 'degraded' | 'down';
        paymentService: 'healthy' | 'degraded' | 'down';
        transportService: 'healthy' | 'degraded' | 'down';
    };
    alerts: DashboardAlert[];
}

export interface DashboardAlert {
    id: string;
    type: 'warning' | 'error' | 'info';
    title: string;
    message: string;
    timestamp: Date;
    acknowledged: boolean;
}

export interface ReportSchedule {
    id: string;
    templateId: string;
    name: string;
    description?: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    schedule: ScheduledDelivery;
    recipients: string[];
    format: ReportFormat;
    filters?: Record<string, any>;
    active: boolean;
    lastRun?: Date;
    nextRun: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ReportExportOptions {
    includeHeaders: boolean;
    dateFormat: string;
    numberFormat: string;
    timezone: string;
    redactionLevel: 'none' | 'partial' | 'full';
    auditLog: boolean;
}