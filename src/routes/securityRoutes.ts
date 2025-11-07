import { Router } from 'express';
import { authenticateToken, requireRole } from '@/middleware/authMiddleware';
import { protectSensitiveOperation } from '@/middleware/securityMiddleware';
import { gdprService } from '@/services/gdprService';
import { securityScannerService } from '@/services/securityScannerService';
import { encryptionService } from '@/services/encryptionService';
import { auditService } from '@/services/auditService';
import { getDatabase } from '@/config/database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const db = getDatabase();

// GDPR Compliance Routes

/**
 * Request data export (Article 15 - Right of Access)
 */
router.post('/gdpr/data-export', authenticateToken, async (req, res) => {
    try {
        const userId = req.user!.id;
        const correlationId = req.correlationId;

        const exportRequest = await gdprService.requestDataExport(userId, correlationId);

        res.json({
            exportId: exportRequest.requestId,
            status: exportRequest.status,
            requestedAt: exportRequest.requestedAt,
            message: 'Data export request submitted. You will be notified when ready.'
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'DATA_EXPORT_FAILED',
                message: 'Failed to request data export',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * Get data export status
 */
router.get('/gdpr/data-export/:exportId', authenticateToken, async (req, res) => {
    try {
        const { exportId } = req.params;
        const userId = req.user!.id;

        const exportRequest = await db('data_export_requests')
            .where('id', exportId)
            .where('user_id', userId)
            .first();

        if (!exportRequest) {
            return res.status(404).json({
                error: {
                    code: 'EXPORT_NOT_FOUND',
                    message: 'Export request not found',
                    correlationId: req.correlationId
                }
            });
        }

        res.json({
            exportId: exportRequest.id,
            status: exportRequest.status,
            requestedAt: exportRequest.requested_at,
            completedAt: exportRequest.completed_at,
            downloadUrl: exportRequest.download_url,
            expiresAt: exportRequest.expires_at
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'EXPORT_STATUS_FAILED',
                message: 'Failed to get export status',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * Request account deletion (Article 17 - Right to Erasure)
 */
router.post('/gdpr/delete-account', authenticateToken, protectSensitiveOperation, async (req, res) => {
    try {
        const { confirmation, reason } = req.body;
        const userId = req.user!.id;
        const correlationId = req.correlationId;

        if (!confirmation || confirmation !== 'DELETE_MY_ACCOUNT') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_CONFIRMATION',
                    message: 'Invalid confirmation phrase. Must be "DELETE_MY_ACCOUNT"',
                    correlationId
                }
            });
        }

        const deletionRequest = await gdprService.requestAccountDeletion(
            userId,
            confirmation,
            reason,
            correlationId
        );

        res.json({
            deletionId: deletionRequest.requestId,
            status: deletionRequest.status,
            scheduledAt: deletionRequest.scheduledAt,
            message: 'Account deletion scheduled. You have 24 hours to cancel this request.'
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'ACCOUNT_DELETION_FAILED',
                message: error.message,
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * Update consent preferences
 */
router.post('/gdpr/consent', authenticateToken, async (req, res) => {
    try {
        const { consentType, granted, reason } = req.body;
        const userId = req.user!.id;
        const correlationId = req.correlationId;
        const ipAddress = req.ip;
        const userAgent = req.headers['user-agent'];

        if (!consentType || typeof granted !== 'boolean') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_CONSENT_DATA',
                    message: 'consentType and granted (boolean) are required',
                    correlationId
                }
            });
        }

        await gdprService.updateConsent(
            userId,
            consentType,
            granted,
            '1.0', // consent version
            reason,
            ipAddress,
            userAgent,
            correlationId
        );

        res.json({
            message: 'Consent updated successfully',
            consentType,
            granted,
            updatedAt: new Date()
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'CONSENT_UPDATE_FAILED',
                message: 'Failed to update consent',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * Get consent history
 */
router.get('/gdpr/consent-history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user!.id;
        const history = await gdprService.getConsentHistory(userId);

        res.json({
            history: history.map(record => ({
                consentType: record.consentType,
                action: record.action,
                consentVersion: record.consentVersion,
                timestamp: record.timestamp,
                reason: record.reason
            }))
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'CONSENT_HISTORY_FAILED',
                message: 'Failed to get consent history',
                correlationId: req.correlationId
            }
        });
    }
});

// Security Scanning Routes (Admin only)

/**
 * Run security scan
 */
router.post('/security/scan', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { scanType = 'runtime' } = req.body;

        if (!['dependency', 'code', 'configuration', 'runtime'].includes(scanType)) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_SCAN_TYPE',
                    message: 'Invalid scan type',
                    correlationId: req.correlationId
                }
            });
        }

        const scanResult = await securityScannerService.runSecurityScan(scanType);

        res.json({
            scanId: scanResult.scanId,
            scanType: scanResult.scanType,
            status: scanResult.status,
            startedAt: scanResult.startedAt,
            summary: scanResult.summary
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'SECURITY_SCAN_FAILED',
                message: 'Failed to run security scan',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * Get security scan results
 */
router.get('/security/scan/:scanId', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { scanId } = req.params;
        const scanResult = await securityScannerService.getScanResults(scanId);

        if (!scanResult) {
            return res.status(404).json({
                error: {
                    code: 'SCAN_NOT_FOUND',
                    message: 'Security scan not found',
                    correlationId: req.correlationId
                }
            });
        }

        res.json(scanResult);
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'SCAN_RESULTS_FAILED',
                message: 'Failed to get scan results',
                correlationId: req.correlationId
            }
        });
    }
});

/**
 * Update vulnerability status
 */
router.patch('/security/vulnerability/:vulnerabilityId',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const { vulnerabilityId } = req.params;
            const { status } = req.body;
            const correlationId = req.correlationId;

            if (!['open', 'investigating', 'fixed', 'false_positive'].includes(status)) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_STATUS',
                        message: 'Invalid vulnerability status',
                        correlationId
                    }
                });
            }

            await securityScannerService.updateVulnerabilityStatus(
                vulnerabilityId,
                status,
                correlationId
            );

            res.json({
                message: 'Vulnerability status updated',
                vulnerabilityId,
                status,
                updatedAt: new Date()
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'VULNERABILITY_UPDATE_FAILED',
                    message: 'Failed to update vulnerability status',
                    correlationId: req.correlationId
                }
            });
        }
    });

// Data Integrity Routes

/**
 * Verify data integrity
 */
router.post('/security/verify-integrity',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const { entityType, userId } = req.body;
            const violations: any[] = [];

            if (entityType === 'location_points' && userId) {
                // Verify location data integrity
                const locationPoints = await db('location_points')
                    .where('user_id', userId)
                    .orderBy('timestamp')
                    .select('*');

                let previousHash = '';
                for (const point of locationPoints) {
                    const expectedHash = encryptionService.createHashChain(
                        {
                            userId: point.user_id,
                            coordinates: point.coordinates,
                            timestamp: point.timestamp
                        },
                        previousHash
                    );

                    if (point.hash_chain !== expectedHash) {
                        violations.push({
                            type: 'INVALID_HASH_CHAIN',
                            entityId: point.id,
                            expected: expectedHash,
                            actual: point.hash_chain
                        });
                    }

                    previousHash = point.hash_chain;
                }
            }

            res.json({
                entityType,
                userId,
                integrityViolations: violations,
                verifiedAt: new Date()
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'INTEGRITY_VERIFICATION_FAILED',
                    message: 'Failed to verify data integrity',
                    correlationId: req.correlationId
                }
            });
        }
    });

/**
 * Verify audit log integrity
 */
router.post('/security/verify-audit-integrity',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const tamperedEvents: any[] = [];

            // Get recent audit events
            const auditEvents = await db('audit_events')
                .orderBy('timestamp', 'desc')
                .limit(1000)
                .select('*');

            for (const event of auditEvents) {
                const expectedHash = encryptionService.createHashChain({
                    eventId: event.event_id,
                    action: event.action,
                    entityType: event.entity_type,
                    entityId: event.entity_id,
                    timestamp: event.timestamp,
                    metadata: event.metadata
                });

                if (event.hash_chain !== expectedHash) {
                    tamperedEvents.push({
                        eventId: event.event_id,
                        expected: expectedHash,
                        actual: event.hash_chain,
                        timestamp: event.timestamp
                    });
                }
            }

            res.json({
                tamperedEvents,
                totalEventsChecked: auditEvents.length,
                verifiedAt: new Date()
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'AUDIT_INTEGRITY_VERIFICATION_FAILED',
                    message: 'Failed to verify audit integrity',
                    correlationId: req.correlationId
                }
            });
        }
    });

// Data Cleanup Routes

/**
 * Clean up expired data
 */
router.post('/security/cleanup-expired-data',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            let cleanedRecords = 0;

            // Clean up expired location data
            const expiredLocations = await db('location_points')
                .where('retention_date', '<', new Date())
                .del();

            cleanedRecords += expiredLocations;

            // Clean up expired export files
            await gdprService.cleanupExpiredExports();

            // Clean up old sessions
            const expiredSessions = await db('user_sessions')
                .where('expires_at', '<', new Date())
                .orWhere('status', 'expired')
                .del();

            cleanedRecords += expiredSessions;

            await auditService.logEvent({
                correlationId: req.correlationId,
                actor: { id: req.user!.id, role: req.user!.role },
                action: 'data_cleanup_completed',
                entityType: 'system',
                entityId: 'data_cleanup',
                metadata: { cleanedRecords }
            });

            res.json({
                message: 'Data cleanup completed',
                cleanedRecords,
                cleanedAt: new Date()
            });
        } catch (error) {
            res.status(500).json({
                error: {
                    code: 'DATA_CLEANUP_FAILED',
                    message: 'Failed to clean up expired data',
                    correlationId: req.correlationId
                }
            });
        }
    });

/**
 * Get security dashboard data
 */
router.get('/security/dashboard', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Get recent security scans
        const recentScans = await db('security_scans')
            .orderBy('started_at', 'desc')
            .limit(5)
            .select('*');

        // Get open vulnerabilities by severity
        const vulnerabilities = await db('security_vulnerabilities')
            .where('status', 'open')
            .groupBy('severity')
            .count('* as count')
            .select('severity');

        const vulnSummary = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };

        vulnerabilities.forEach(v => {
            vulnSummary[v.severity as keyof typeof vulnSummary] = parseInt(v.count as string);
        });

        // Get recent high-risk events
        const highRiskEvents = await db('audit_events')
            .where('action', 'high_risk_request_detected')
            .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
            .count('* as count');

        res.json({
            recentScans: recentScans.map(scan => ({
                scanId: scan.id,
                scanType: scan.scan_type,
                status: scan.status,
                startedAt: scan.started_at,
                vulnerabilitiesFound: scan.vulnerabilities_found
            })),
            vulnerabilitySummary: vulnSummary,
            highRiskEventsLast24h: parseInt(highRiskEvents[0].count as string),
            lastUpdated: new Date()
        });
    } catch (error) {
        res.status(500).json({
            error: {
                code: 'SECURITY_DASHBOARD_FAILED',
                message: 'Failed to load security dashboard',
                correlationId: req.correlationId
            }
        });
    }
});

export default router;