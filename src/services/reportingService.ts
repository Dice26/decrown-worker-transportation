import { Knex } from 'knex';
import { getDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import { auditService } from '@/services/auditService';
import {
    ReportTemplate,
    ReportRequest,
    ReportResult,
    ReportData,
    ReportMetadata,
    UsageMetrics,
    CostAnalysis,
    EfficiencyMetrics,
    TripAnalytics,
    DriverPerformance,
    DashboardMetrics,
    ReportSchedule,
    ReportExportOptions,
    UserRole,
    ReportType,
    ReportFormat
} from '@/types/reporting';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export class ReportingService {
    private db: Knex;
    private reportTemplates: Map<string, ReportTemplate> = new Map();

    constructor() {
        this.db = getDatabase();
        this.initializeDefaultTemplates();
    }

    /**
     * Generate a report based on template and request parameters
     */
    async generateReport(request: ReportRequest): Promise<ReportResult> {
        const startTime = Date.now();
        const reportId = uuidv4();

        try {
            // Get and validate template
            const template = this.reportTemplates.get(request.templateId);
            if (!template) {
                throw new Error(`Report template not found: ${request.templateId}`);
            }

            // Check role permissions
            if (!template.allowedRoles.includes(request.requestedBy.role)) {
                throw new Error(`Insufficient permissions for report type: ${template.type}`);
            }

            // Generate report data based on template type
            let reportData: ReportData[];
            let metadata: ReportMetadata;

            switch (template.type) {
                case 'usage_summary':
                    ({ data: reportData, metadata } = await this.generateUsageSummary(request));
                    break;
                case 'cost_analysis':
                    ({ data: reportData, metadata } = await this.generateCostAnalysis(request));
                    break;
                case 'efficiency_metrics':
                    ({ data: reportData, metadata } = await this.generateEfficiencyMetrics(request));
                    break;
                case 'trip_analytics':
                    ({ data: reportData, metadata } = await this.generateTripAnalytics(request));
                    break;
                case 'driver_performance':
                    ({ data: reportData, metadata } = await this.generateDriverPerformance(request));
                    break;
                case 'audit_summary':
                    ({ data: reportData, metadata } = await this.generateAuditSummary(request));
                    break;
                default:
                    throw new Error(`Unsupported report type: ${template.type}`);
            }

            // Apply role-based data filtering
            const filteredData = this.applyRoleBasedFiltering(reportData, template, request.requestedBy.role);

            // Calculate execution time
            const executionTime = Date.now() - startTime;
            metadata.executionTime = executionTime;
            metadata.redactionApplied = filteredData.length !== reportData.length ||
                JSON.stringify(filteredData) !== JSON.stringify(reportData);

            const result: ReportResult = {
                id: reportId,
                templateId: request.templateId,
                requestId: uuidv4(),
                data: filteredData,
                metadata,
                generatedAt: new Date(),
                generatedBy: request.requestedBy.id,
                format: request.format
            };

            // Export to file if requested
            if (request.format !== 'json') {
                const filePath = await this.exportReport(result, request.format);
                result.filePath = filePath;
                result.downloadUrl = `/api/reports/download/${reportId}`;
                result.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            }

            // Log report generation
            await auditService.logEvent({
                correlationId: `report_${reportId}`,
                actor: request.requestedBy,
                action: 'report.generated',
                entityType: 'report',
                entityId: reportId,
                metadata: {
                    templateId: request.templateId,
                    templateType: template.type,
                    recordCount: filteredData.length,
                    format: request.format,
                    executionTime
                }
            });

            logger.info('Report generated successfully', {
                reportId,
                templateId: request.templateId,
                templateType: template.type,
                recordCount: filteredData.length,
                executionTime,
                requestedBy: request.requestedBy.id
            });

            return result;
        } catch (error) {
            logger.error('Failed to generate report', {
                error: error.message,
                templateId: request.templateId,
                requestedBy: request.requestedBy.id
            });
            throw error;
        }
    }

    /**
     * Get real-time dashboard metrics
     */
    async getDashboardMetrics(userRole: UserRole): Promise<DashboardMetrics> {
        try {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Get active routes count
            const activeRoutesResult = await this.db('routes')
                .count('* as count')
                .where('status', 'active')
                .first();
            const activeRoutes = parseInt(activeRoutesResult?.count as string) || 0;

            // Get active drivers count
            const activeDriversResult = await this.db('users')
                .count('* as count')
                .where('role', 'driver')
                .where('status', 'active')
                .first();
            const activeDrivers = parseInt(activeDriversResult?.count as string) || 0;

            // Get online workers count (workers with location updates in last 5 minutes)
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            const onlineWorkersResult = await this.db('location_points')
                .countDistinct('user_id as count')
                .where('timestamp', '>=', fiveMinutesAgo)
                .first();
            const onlineWorkers = parseInt(onlineWorkersResult?.count as string) || 0;

            // Get trips in progress
            const tripsInProgressResult = await this.db('trips')
                .count('* as count')
                .where('status', 'in_progress')
                .first();
            const tripsInProgress = parseInt(tripsInProgressResult?.count as string) || 0;

            // Get completed trips today
            const completedTodayResult = await this.db('trips')
                .count('* as count')
                .where('status', 'completed')
                .where('completed_at', '>=', todayStart)
                .first();
            const completedTripsToday = parseInt(completedTodayResult?.count as string) || 0;

            // Calculate average ETA for active trips
            const activeTripsWithETA = await this.db('trips')
                .select('planned_stops')
                .where('status', 'in_progress');

            let totalETA = 0;
            let etaCount = 0;

            for (const trip of activeTripsWithETA) {
                const stops = JSON.parse(trip.planned_stops || '[]');
                for (const stop of stops) {
                    if (stop.estimatedArrival && stop.status === 'pending') {
                        const eta = new Date(stop.estimatedArrival).getTime() - now.getTime();
                        if (eta > 0) {
                            totalETA += eta;
                            etaCount++;
                        }
                    }
                }
            }

            const averageETA = etaCount > 0 ? Math.round(totalETA / etaCount / 60000) : 0; // Convert to minutes

            // System health checks (simplified)
            const systemHealth = {
                locationService: 'healthy' as const,
                paymentService: 'healthy' as const,
                transportService: 'healthy' as const
            };

            // Get recent alerts (last 24 hours)
            const alerts = await this.getRecentAlerts(userRole);

            return {
                activeRoutes,
                activeDrivers,
                onlineWorkers,
                tripsInProgress,
                completedTripsToday,
                averageETA,
                systemHealth,
                alerts
            };
        } catch (error) {
            logger.error('Failed to get dashboard metrics', { error: error.message });
            throw error;
        }
    }

    /**
     * Schedule a report for automatic generation and delivery
     */
    async scheduleReport(schedule: Omit<ReportSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ReportSchedule> {
        try {
            const scheduleId = uuidv4();
            const now = new Date();

            const reportSchedule: ReportSchedule = {
                id: scheduleId,
                ...schedule,
                createdAt: now,
                updatedAt: now
            };

            // Save to database
            await this.db('report_schedules').insert({
                id: scheduleId,
                template_id: schedule.templateId,
                name: schedule.name,
                description: schedule.description,
                frequency: schedule.frequency,
                schedule_config: JSON.stringify(schedule.schedule),
                recipients: JSON.stringify(schedule.recipients),
                format: schedule.format,
                filters: JSON.stringify(schedule.filters || {}),
                active: schedule.active,
                last_run: schedule.lastRun,
                next_run: schedule.nextRun,
                created_by: schedule.createdBy,
                created_at: now,
                updated_at: now
            });

            logger.info('Report scheduled successfully', {
                scheduleId,
                templateId: schedule.templateId,
                frequency: schedule.frequency,
                nextRun: schedule.nextRun
            });

            return reportSchedule;
        } catch (error) {
            logger.error('Failed to schedule report', { error: error.message });
            throw error;
        }
    }

    /**
     * Export report data to specified format
     */
    async exportReport(report: ReportResult, format: ReportFormat, options?: ReportExportOptions): Promise<string> {
        try {
            const exportDir = path.join(process.cwd(), 'exports', 'reports');
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `report_${report.id}_${timestamp}.${format}`;
            const filePath = path.join(exportDir, filename);

            switch (format) {
                case 'csv':
                    await this.exportToCSV(report, filePath, options);
                    break;
                case 'pdf':
                    await this.exportToPDF(report, filePath, options);
                    break;
                case 'json':
                    await this.exportToJSON(report, filePath, options);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            // Log export action
            if (options?.auditLog !== false) {
                await auditService.logEvent({
                    correlationId: `export_${report.id}`,
                    actor: { id: report.generatedBy, role: 'system' },
                    action: 'report.exported',
                    entityType: 'report',
                    entityId: report.id,
                    metadata: {
                        format,
                        filePath,
                        recordCount: report.data.length,
                        options
                    }
                });
            }

            return filePath;
        } catch (error) {
            logger.error('Failed to export report', { error: error.message, reportId: report.id });
            throw error;
        }
    }

    // Private helper methods

    private initializeDefaultTemplates(): void {
        const templates: ReportTemplate[] = [
            {
                id: 'usage-summary',
                name: 'Usage Summary Report',
                type: 'usage_summary',
                description: 'Monthly usage summary per user including rides, distance, and costs',
                allowedRoles: ['dispatcher', 'finance', 'admin'],
                dataFields: [
                    { name: 'userId', label: 'User ID', type: 'string', required: true, sensitive: false },
                    { name: 'userName', label: 'User Name', type: 'string', required: false, sensitive: true, roleRestrictions: ['worker'] },
                    { name: 'department', label: 'Department', type: 'string', required: false, sensitive: false },
                    { name: 'ridesCount', label: 'Rides Count', type: 'number', required: true, sensitive: false },
                    { name: 'totalDistance', label: 'Total Distance (km)', type: 'number', required: true, sensitive: false },
                    { name: 'totalCost', label: 'Total Cost', type: 'number', required: true, sensitive: false }
                ],
                filters: [],
                aggregations: [
                    { field: 'ridesCount', function: 'sum' },
                    { field: 'totalDistance', function: 'sum' },
                    { field: 'totalCost', function: 'sum' }
                ],
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 'cost-analysis',
                name: 'Cost Analysis Report',
                type: 'cost_analysis',
                description: 'Financial analysis including revenue, costs, and profitability',
                allowedRoles: ['finance', 'admin'],
                dataFields: [
                    { name: 'period', label: 'Period', type: 'string', required: true, sensitive: false },
                    { name: 'totalRevenue', label: 'Total Revenue', type: 'number', required: true, sensitive: false },
                    { name: 'totalCosts', label: 'Total Costs', type: 'number', required: true, sensitive: false },
                    { name: 'profit', label: 'Profit', type: 'number', required: true, sensitive: false },
                    { name: 'profitMargin', label: 'Profit Margin (%)', type: 'number', required: true, sensitive: false }
                ],
                filters: [],
                aggregations: [],
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 'efficiency-metrics',
                name: 'Efficiency Metrics Report',
                type: 'efficiency_metrics',
                description: 'Operational efficiency metrics including completion rates and delays',
                allowedRoles: ['dispatcher', 'admin'],
                dataFields: [
                    { name: 'period', label: 'Period', type: 'string', required: true, sensitive: false },
                    { name: 'totalTrips', label: 'Total Trips', type: 'number', required: true, sensitive: false },
                    { name: 'completionRate', label: 'Completion Rate (%)', type: 'number', required: true, sensitive: false },
                    { name: 'onTimePerformance', label: 'On-Time Performance (%)', type: 'number', required: true, sensitive: false },
                    { name: 'averageDelayMinutes', label: 'Average Delay (minutes)', type: 'number', required: true, sensitive: false }
                ],
                filters: [],
                aggregations: [],
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        templates.forEach(template => {
            this.reportTemplates.set(template.id, template);
        });
    }

    private async generateUsageSummary(request: ReportRequest): Promise<{ data: ReportData[]; metadata: ReportMetadata }> {
        const { dateRange } = request;

        const query = this.db('usage_ledgers as ul')
            .select([
                'ul.user_id as userId',
                'u.email as userName',
                'u.department',
                'ul.month as period',
                'ul.rides_count as ridesCount',
                'ul.total_distance as totalDistance',
                'ul.total_duration as totalDuration',
                'ul.final_amount as totalCost'
            ])
            .join('users as u', 'ul.user_id', 'u.id')
            .whereBetween('ul.created_at', [dateRange.start, dateRange.end]);

        // Apply additional filters
        if (request.filters?.department) {
            query.where('u.department', request.filters.department);
        }
        if (request.filters?.userId) {
            query.where('ul.user_id', request.filters.userId);
        }

        const results = await query;

        const data = results.map(row => ({
            userId: row.userId,
            userName: row.userName,
            department: row.department,
            period: row.period,
            ridesCount: parseInt(row.ridesCount),
            totalDistance: Math.round(parseFloat(row.totalDistance) / 1000 * 100) / 100, // Convert to km
            totalDuration: parseFloat(row.totalDuration),
            totalCost: parseFloat(row.totalCost),
            averageCostPerRide: row.ridesCount > 0 ? Math.round(parseFloat(row.totalCost) / parseInt(row.ridesCount) * 100) / 100 : 0,
            averageDistance: row.ridesCount > 0 ? Math.round(parseFloat(row.totalDistance) / 1000 / parseInt(row.ridesCount) * 100) / 100 : 0
        }));

        const metadata: ReportMetadata = {
            totalRecords: data.length,
            filteredRecords: data.length,
            dateRange,
            aggregations: {
                totalRides: data.reduce((sum, item) => sum + item.ridesCount, 0),
                totalDistance: data.reduce((sum, item) => sum + item.totalDistance, 0),
                totalCost: data.reduce((sum, item) => sum + item.totalCost, 0)
            },
            executionTime: 0,
            dataSource: ['usage_ledgers', 'users'],
            redactionApplied: false
        };

        return { data, metadata };
    }

    private async generateCostAnalysis(request: ReportRequest): Promise<{ data: ReportData[]; metadata: ReportMetadata }> {
        const { dateRange } = request;

        // Get revenue data
        const revenueQuery = await this.db('invoices')
            .select([
                this.db.raw("DATE_TRUNC('month', created_at) as period"),
                this.db.raw('SUM(total_amount) as total_revenue')
            ])
            .where('status', 'paid')
            .whereBetween('created_at', [dateRange.start, dateRange.end])
            .groupBy(this.db.raw("DATE_TRUNC('month', created_at)"))
            .orderBy('period');

        // Calculate costs (simplified - would include operational costs in real implementation)
        const data = revenueQuery.map(row => {
            const totalRevenue = parseFloat(row.total_revenue);
            const estimatedCosts = totalRevenue * 0.7; // Assume 70% cost ratio
            const profit = totalRevenue - estimatedCosts;
            const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

            return {
                period: row.period.toISOString().substring(0, 7), // YYYY-MM format
                totalRevenue,
                totalCosts: estimatedCosts,
                profit,
                profitMargin: Math.round(profitMargin * 100) / 100,
                costPerKm: 0, // Would calculate from actual data
                costPerRide: 0, // Would calculate from actual data
                revenuePerUser: 0, // Would calculate from actual data
                utilizationRate: 0 // Would calculate from actual data
            };
        });

        const metadata: ReportMetadata = {
            totalRecords: data.length,
            filteredRecords: data.length,
            dateRange,
            executionTime: 0,
            dataSource: ['invoices'],
            redactionApplied: false
        };

        return { data, metadata };
    }

    private async generateEfficiencyMetrics(request: ReportRequest): Promise<{ data: ReportData[]; metadata: ReportMetadata }> {
        const { dateRange } = request;

        const query = await this.db('trips')
            .select([
                this.db.raw("DATE_TRUNC('month', created_at) as period"),
                this.db.raw('COUNT(*) as total_trips'),
                this.db.raw("COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_trips"),
                this.db.raw("COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_trips"),
                this.db.raw("AVG(CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - scheduled_at))/60 END) as avg_duration_minutes")
            ])
            .whereBetween('created_at', [dateRange.start, dateRange.end])
            .groupBy(this.db.raw("DATE_TRUNC('month', created_at)"))
            .orderBy('period');

        const data = query.map(row => {
            const totalTrips = parseInt(row.total_trips);
            const completedTrips = parseInt(row.completed_trips);
            const cancelledTrips = parseInt(row.cancelled_trips);
            const completionRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;

            return {
                period: row.period.toISOString().substring(0, 7),
                totalTrips,
                completedTrips,
                cancelledTrips,
                completionRate: Math.round(completionRate * 100) / 100,
                averagePickupTime: 0, // Would calculate from actual pickup data
                averageDelayMinutes: 0, // Would calculate from actual delay data
                onTimePerformance: 85, // Placeholder - would calculate from actual data
                fuelEfficiency: 0, // Would calculate if fuel data available
                driverUtilization: 0, // Would calculate from driver activity data
                routeOptimizationSavings: 0 // Would calculate from route optimization data
            };
        });

        const metadata: ReportMetadata = {
            totalRecords: data.length,
            filteredRecords: data.length,
            dateRange,
            executionTime: 0,
            dataSource: ['trips'],
            redactionApplied: false
        };

        return { data, metadata };
    }

    private async generateTripAnalytics(request: ReportRequest): Promise<{ data: ReportData[]; metadata: ReportMetadata }> {
        // Implementation would fetch detailed trip data
        return { data: [], metadata: { totalRecords: 0, filteredRecords: 0, dateRange: request.dateRange, executionTime: 0, dataSource: ['trips'], redactionApplied: false } };
    }

    private async generateDriverPerformance(request: ReportRequest): Promise<{ data: ReportData[]; metadata: ReportMetadata }> {
        // Implementation would fetch driver performance data
        return { data: [], metadata: { totalRecords: 0, filteredRecords: 0, dateRange: request.dateRange, executionTime: 0, dataSource: ['trips', 'users'], redactionApplied: false } };
    }

    private async generateAuditSummary(request: ReportRequest): Promise<{ data: ReportData[]; metadata: ReportMetadata }> {
        // Implementation would fetch audit summary data
        return { data: [], metadata: { totalRecords: 0, filteredRecords: 0, dateRange: request.dateRange, executionTime: 0, dataSource: ['audit_events'], redactionApplied: false } };
    }

    private applyRoleBasedFiltering(data: ReportData[], template: ReportTemplate, userRole: UserRole): ReportData[] {
        return data.map(record => {
            const filteredRecord: ReportData = {};

            for (const field of template.dataFields) {
                // Check if field has role restrictions
                if (field.roleRestrictions && field.roleRestrictions.includes(userRole)) {
                    // Skip sensitive fields for restricted roles
                    continue;
                }

                // Apply data masking for sensitive fields
                if (field.sensitive && !['admin', 'finance'].includes(userRole)) {
                    if (field.type === 'string') {
                        filteredRecord[field.name] = '***REDACTED***';
                    } else {
                        filteredRecord[field.name] = record[field.name];
                    }
                } else {
                    filteredRecord[field.name] = record[field.name];
                }
            }

            return filteredRecord;
        });
    }

    private async getRecentAlerts(userRole: UserRole): Promise<any[]> {
        // Implementation would fetch recent system alerts
        return [];
    }

    private async exportToCSV(report: ReportResult, filePath: string, options?: ReportExportOptions): Promise<void> {
        const headers = Object.keys(report.data[0] || {});
        const rows = report.data.map(record =>
            headers.map(header => {
                const value = record[header];
                return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
            }).join(',')
        );

        const csv = [headers.join(','), ...rows].join('\n');
        fs.writeFileSync(filePath, csv, 'utf8');
    }

    private async exportToPDF(report: ReportResult, filePath: string, options?: ReportExportOptions): Promise<void> {
        // PDF export would require a PDF library like puppeteer or pdfkit
        // For now, create a simple text file
        const content = JSON.stringify(report, null, 2);
        fs.writeFileSync(filePath.replace('.pdf', '.txt'), content, 'utf8');
    }

    private async exportToJSON(report: ReportResult, filePath: string, options?: ReportExportOptions): Promise<void> {
        const content = JSON.stringify(report, null, 2);
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

// Export singleton instance
export const reportingService = new ReportingService();