import { Router } from 'express';
import { auditService } from '@/services/auditService';
import { auditReportingService } from '@/services/auditReportingService';
import { authenticateToken } from '@/middleware/auth';
import { AuthenticatedRequest } from '@/types/auth';
import { AuditQuery, AuditExportOptions, AuditEventFilter } from '@/types/audit';
import { logger } from '@/utils/logger';
import { auditMiddleware, logAuditEvent } from '@/middleware/auditMiddleware';

const router = Router();

/**
 * GET /audit/events - Query audit events with filtering
 */
router.get('/events',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions - only admin and finance roles can query audit events
            if (!['admin', 'finance'].includes(req.user.role)) {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin or Finance role required.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const query: AuditQuery = {
                entityType: req.query.entityType as string,
                entityId: req.query.entityId as string,
                actorId: req.query.actorId as string,
                actions: req.query.actions ? (req.query.actions as string).split(',') : undefined,
                dateRange: {
                    start: new Date(req.query.startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
                    end: new Date(req.query.endDate as string || new Date())
                },
                includeRedacted: req.user.role === 'admin' && req.query.includeRedacted === 'true',
                limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
                offset: req.query.offset ? parseInt(req.query.offset as string) : 0
            };

            const result = await auditService.queryEvents(query);

            // Log the audit query
            await logAuditEvent(
                req,
                'audit.queried',
                'audit_events',
                'query',
                {
                    query,
                    resultCount: result.events.length,
                    totalCount: result.total
                }
            );

            res.json({
                events: result.events,
                total: result.total,
                query,
                pagination: {
                    limit: query.limit,
                    offset: query.offset,
                    hasMore: (query.offset || 0) + result.events.length < result.total
                }
            });
        } catch (error) {
            logger.error('Failed to query audit events', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'AUDIT_QUERY_FAILED',
                    message: 'Failed to query audit events',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * GET /audit/events/:correlationId - Get events by correlation ID
 */
router.get('/events/:correlationId',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions
            if (!['admin', 'finance', 'dispatcher'].includes(req.user.role)) {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin, Finance, or Dispatcher role required.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const correlationId = req.params.correlationId;
            const events = await auditService.getEventsByCorrelationId(correlationId);

            // Apply role-based filtering for non-admin users
            const filteredEvents = req.user.role === 'admin'
                ? events
                : events.filter(event =>
                    event.actor.id === req.user.id ||
                    !event.action.includes('payment') // Hide payment events from non-admin
                );

            res.json({
                correlationId,
                events: filteredEvents,
                count: filteredEvents.length
            });
        } catch (error) {
            logger.error('Failed to get events by correlation ID', {
                error: error.message,
                correlationId: req.correlationId,
                requestedCorrelationId: req.params.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'AUDIT_CORRELATION_QUERY_FAILED',
                    message: 'Failed to get events by correlation ID',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * POST /audit/export - Export audit trail
 */
router.post('/export',
    authenticateToken,
    auditMiddleware('audit.exported', 'audit_trail'),
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions - only admin can export audit trails
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin role required for audit export.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const exportOptions: AuditExportOptions = {
                query: {
                    entityType: req.body.entityType,
                    entityId: req.body.entityId,
                    actorId: req.body.actorId,
                    actions: req.body.actions,
                    dateRange: {
                        start: new Date(req.body.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
                        end: new Date(req.body.endDate || new Date())
                    },
                    includeRedacted: req.body.includeRedacted || false
                },
                format: req.body.format || 'json',
                redactionLevel: req.body.redactionLevel || 'partial',
                requestorRole: req.user.role
            };

            const exportData = await auditService.exportAuditTrail(exportOptions);

            // Set appropriate headers for download
            const filename = `audit_export_${new Date().toISOString().split('T')[0]}.${exportOptions.format}`;
            const contentType = exportOptions.format === 'csv' ? 'text/csv' : 'application/json';

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', contentType);

            res.send(exportData);
        } catch (error) {
            logger.error('Failed to export audit trail', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'AUDIT_EXPORT_FAILED',
                    message: 'Failed to export audit trail',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * POST /audit/verify - Verify audit trail integrity
 */
router.post('/verify',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions - only admin can verify integrity
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin role required for integrity verification.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const dateRange = {
                start: new Date(req.body.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
                end: new Date(req.body.endDate || new Date())
            };

            const verificationResult = await auditService.verifyIntegrity(dateRange);

            // Log the verification
            await logAuditEvent(
                req,
                'audit.integrity_verified',
                'audit_trail',
                'verification',
                {
                    dateRange,
                    verificationResult
                }
            );

            res.json({
                dateRange,
                integrity: verificationResult,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to verify audit trail integrity', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'AUDIT_VERIFICATION_FAILED',
                    message: 'Failed to verify audit trail integrity',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * GET /audit/stats - Get audit statistics
 */
router.get('/stats',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions
            if (!['admin', 'finance'].includes(req.user.role)) {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin or Finance role required.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const dateRange = {
                start: new Date(req.query.startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
                end: new Date(req.query.endDate as string || new Date())
            };

            const statistics = await auditService.getAuditStatistics(dateRange);

            res.json({
                dateRange,
                statistics,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to get audit statistics', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'AUDIT_STATS_FAILED',
                    message: 'Failed to get audit statistics',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * POST /audit/reports - Generate audit report
 */
router.post('/reports',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions
            if (!['admin', 'finance'].includes(req.user.role)) {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin or Finance role required.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const filters: AuditEventFilter = {
                entityTypes: req.body.entityTypes,
                actions: req.body.actions,
                actorIds: req.body.actorIds,
                dateRange: {
                    start: new Date(req.body.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
                    end: new Date(req.body.endDate || new Date())
                },
                correlationIds: req.body.correlationIds
            };

            const report = await auditReportingService.generateAuditReport(
                filters,
                req.user.id,
                req.body.title
            );

            res.json(report);
        } catch (error) {
            logger.error('Failed to generate audit report', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'AUDIT_REPORT_FAILED',
                    message: 'Failed to generate audit report',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * GET /audit/lineage/:entityType/:entityId - Get data lineage
 */
router.get('/lineage/:entityType/:entityId',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions
            if (!['admin', 'finance', 'dispatcher'].includes(req.user.role)) {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin, Finance, or Dispatcher role required.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const { entityType, entityId } = req.params;
            const maxDepth = parseInt(req.query.maxDepth as string) || 3;

            const lineage = await auditReportingService.buildDataLineage(
                entityType,
                entityId,
                maxDepth
            );

            res.json({
                entityType,
                entityId,
                maxDepth,
                lineage,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to build data lineage', {
                error: error.message,
                correlationId: req.correlationId,
                entityType: req.params.entityType,
                entityId: req.params.entityId
            });

            res.status(500).json({
                error: {
                    code: 'DATA_LINEAGE_FAILED',
                    message: 'Failed to build data lineage',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * POST /audit/compliance - Generate compliance report
 */
router.post('/compliance',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions - only admin can generate compliance reports
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin role required for compliance reports.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const framework = req.body.framework || 'GDPR';
            const dateRange = {
                start: new Date(req.body.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
                end: new Date(req.body.endDate || new Date())
            };

            const complianceReport = await auditReportingService.generateComplianceReport(
                framework,
                dateRange
            );

            // Log compliance report generation
            await logAuditEvent(
                req,
                'audit.compliance_report_generated',
                'compliance_report',
                complianceReport.reportId,
                {
                    framework,
                    dateRange,
                    findingsCount: complianceReport.findings.length,
                    riskScore: complianceReport.riskScore
                }
            );

            res.json(complianceReport);
        } catch (error) {
            logger.error('Failed to generate compliance report', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'COMPLIANCE_REPORT_FAILED',
                    message: 'Failed to generate compliance report',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

/**
 * GET /audit/visualization - Get visualization data for dashboards
 */
router.get('/visualization',
    authenticateToken,
    async (req: AuthenticatedRequest, res) => {
        try {
            // Check permissions
            if (!['admin', 'finance', 'dispatcher'].includes(req.user.role)) {
                return res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Access denied. Admin, Finance, or Dispatcher role required.',
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString(),
                        retryable: false
                    }
                });
            }

            const dateRange = {
                start: new Date(req.query.startDate as string || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
                end: new Date(req.query.endDate as string || new Date())
            };

            const visualizationData = await auditReportingService.getVisualizationData(dateRange);

            res.json({
                dateRange,
                data: visualizationData,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to get visualization data', {
                error: error.message,
                correlationId: req.correlationId
            });

            res.status(500).json({
                error: {
                    code: 'VISUALIZATION_DATA_FAILED',
                    message: 'Failed to get visualization data',
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString(),
                    retryable: true
                }
            });
        }
    }
);

export default router;