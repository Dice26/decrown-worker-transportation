import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth';
import { auditMiddleware } from '@/middleware/auditMiddleware';
import { reportingService } from '@/services/reportingService';
import { logger } from '@/utils/logger';
import {
    ReportRequest,
    ReportSchedule,
    ReportExportOptions,
    UserRole
} from '@/types/reporting';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/**
 * Generate a report
 */
router.post('/generate', authenticateToken, auditMiddleware, async (req, res) => {
    try {
        const reportRequest: ReportRequest = {
            templateId: req.body.templateId,
            period: req.body.period,
            dateRange: {
                start: new Date(req.body.dateRange.start),
                end: new Date(req.body.dateRange.end)
            },
            filters: req.body.filters,
            format: req.body.format || 'json',
            requestedBy: {
                id: req.user.id,
                role: req.user.role as UserRole
            },
            deliveryMethod: req.body.deliveryMethod,
            scheduledDelivery: req.body.scheduledDelivery
        };

        const result = await reportingService.generateReport(reportRequest);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Failed to generate report:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get dashboard metrics
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const metrics = await reportingService.getDashboardMetrics(req.user.role as UserRole);

        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        logger.error('Failed to get dashboard metrics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Schedule a report
 */
router.post('/schedule', authenticateToken, auditMiddleware, async (req, res) => {
    try {
        // Check if user has permission to schedule reports
        if (!['dispatcher', 'finance', 'admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to schedule reports'
            });
        }

        const scheduleData = {
            templateId: req.body.templateId,
            name: req.body.name,
            description: req.body.description,
            frequency: req.body.frequency,
            schedule: req.body.schedule,
            recipients: req.body.recipients,
            format: req.body.format,
            filters: req.body.filters,
            active: req.body.active !== false,
            lastRun: req.body.lastRun ? new Date(req.body.lastRun) : undefined,
            nextRun: new Date(req.body.nextRun),
            createdBy: req.user.id
        };

        const result = await reportingService.scheduleReport(scheduleData);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Failed to schedule report:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Download a generated report
 */
router.get('/download/:reportId', authenticateToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { format = 'csv' } = req.query;

        // In a real implementation, you would:
        // 1. Verify the user has permission to download this report
        // 2. Check if the report exists and hasn't expired
        // 3. Serve the file from secure storage

        const exportDir = path.join(process.cwd(), 'exports', 'reports');
        const files = fs.readdirSync(exportDir).filter(file => file.includes(reportId));

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Report file not found or expired'
            });
        }

        const filePath = path.join(exportDir, files[0]);
        const filename = `report_${reportId}.${format}`;

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', getContentType(format as string));

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        logger.error('Failed to download report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get available report templates
 */
router.get('/templates', authenticateToken, async (req, res) => {
    try {
        // In a real implementation, this would fetch templates from database
        // and filter based on user role
        const userRole = req.user.role as UserRole;

        const templates = [
            {
                id: 'usage-summary',
                name: 'Usage Summary Report',
                type: 'usage_summary',
                description: 'Monthly usage summary per user including rides, distance, and costs',
                allowedRoles: ['dispatcher', 'finance', 'admin']
            },
            {
                id: 'cost-analysis',
                name: 'Cost Analysis Report',
                type: 'cost_analysis',
                description: 'Financial analysis including revenue, costs, and profitability',
                allowedRoles: ['finance', 'admin']
            },
            {
                id: 'efficiency-metrics',
                name: 'Efficiency Metrics Report',
                type: 'efficiency_metrics',
                description: 'Operational efficiency metrics including completion rates and delays',
                allowedRoles: ['dispatcher', 'admin']
            },
            {
                id: 'trip-analytics',
                name: 'Trip Analytics Report',
                type: 'trip_analytics',
                description: 'Detailed trip analysis with performance metrics',
                allowedRoles: ['dispatcher', 'admin']
            },
            {
                id: 'driver-performance',
                name: 'Driver Performance Report',
                type: 'driver_performance',
                description: 'Driver performance metrics and ratings',
                allowedRoles: ['dispatcher', 'admin']
            },
            {
                id: 'audit-summary',
                name: 'Audit Summary Report',
                type: 'audit_summary',
                description: 'System audit trail summary for compliance',
                allowedRoles: ['admin']
            }
        ].filter(template => template.allowedRoles.includes(userRole));

        res.json({
            success: true,
            data: templates
        });
    } catch (error) {
        logger.error('Failed to get report templates:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get scheduled reports
 */
router.get('/schedules', authenticateToken, async (req, res) => {
    try {
        // Check permissions
        if (!['dispatcher', 'finance', 'admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to view scheduled reports'
            });
        }

        // In a real implementation, this would fetch from database
        // For now, return empty array
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        logger.error('Failed to get scheduled reports:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update a scheduled report
 */
router.put('/schedules/:scheduleId', authenticateToken, auditMiddleware, async (req, res) => {
    try {
        // Check permissions
        if (!['dispatcher', 'finance', 'admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to update scheduled reports'
            });
        }

        const { scheduleId } = req.params;

        // In a real implementation, this would update the schedule in database
        res.json({
            success: true,
            message: 'Schedule updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update scheduled report:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Delete a scheduled report
 */
router.delete('/schedules/:scheduleId', authenticateToken, auditMiddleware, async (req, res) => {
    try {
        // Check permissions
        if (!['admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to delete scheduled reports'
            });
        }

        const { scheduleId } = req.params;

        // In a real implementation, this would delete the schedule from database
        res.json({
            success: true,
            message: 'Schedule deleted successfully'
        });
    } catch (error) {
        logger.error('Failed to delete scheduled report:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Export report with custom options
 */
router.post('/export/:reportId', authenticateToken, auditMiddleware, async (req, res) => {
    try {
        const { reportId } = req.params;
        const exportOptions: ReportExportOptions = {
            includeHeaders: req.body.includeHeaders !== false,
            dateFormat: req.body.dateFormat || 'YYYY-MM-DD',
            numberFormat: req.body.numberFormat || 'en-US',
            timezone: req.body.timezone || 'UTC',
            redactionLevel: req.body.redactionLevel || 'partial',
            auditLog: req.body.auditLog !== false
        };

        // In a real implementation, this would:
        // 1. Fetch the report data
        // 2. Apply export options
        // 3. Generate the export file
        // 4. Return download link

        res.json({
            success: true,
            message: 'Export initiated',
            downloadUrl: `/api/reports/download/${reportId}`
        });
    } catch (error) {
        logger.error('Failed to export report:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to get content type for file downloads
function getContentType(format: string): string {
    switch (format.toLowerCase()) {
        case 'csv':
            return 'text/csv';
        case 'pdf':
            return 'application/pdf';
        case 'json':
            return 'application/json';
        default:
            return 'application/octet-stream';
    }
}

export default router;