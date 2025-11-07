import { Knex } from 'knex';
import { getDatabase } from '@/config/database';
import { logger } from '@/utils/logger';
import { auditService } from '@/services/auditService';
import { AuditEvent, AuditEventFilter } from '@/types/audit';

export interface AuditReport {
    id: string;
    title: string;
    description: string;
    dateRange: {
        start: Date;
        end: Date;
    };
    filters: AuditEventFilter;
    generatedAt: Date;
    generatedBy: string;
    eventCount: number;
    summary: AuditReportSummary;
    events: AuditEvent[];
}

export interface AuditReportSummary {
    totalEvents: number;
    uniqueActors: number;
    uniqueEntities: number;
    actionBreakdown: { action: string; count: number }[];
    entityTypeBreakdown: { entityType: string; count: number }[];
    actorRoleBreakdown: { role: string; count: number }[];
    timelineData: { date: string; count: number }[];
    riskEvents: AuditEvent[];
}

export interface DataLineageNode {
    entityType: string;
    entityId: string;
    events: AuditEvent[];
    relationships: DataLineageRelationship[];
}

export interface DataLineageRelationship {
    type: 'created_by' | 'modified_by' | 'accessed_by' | 'derived_from' | 'triggers';
    sourceEntity: { type: string; id: string };
    targetEntity: { type: string; id: string };
    event: AuditEvent;
}

export interface ComplianceReport {
    reportId: string;
    complianceFramework: 'GDPR' | 'SOX' | 'HIPAA' | 'PCI_DSS';
    dateRange: { start: Date; end: Date };
    findings: ComplianceFinding[];
    riskScore: number;
    recommendations: string[];
    generatedAt: Date;
}

export interface ComplianceFinding {
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    description: string;
    affectedEntities: string[];
    evidence: AuditEvent[];
    remediation: string;
}

export class AuditReportingService {
    private db: Knex;

    constructor() {
        this.db = getDatabase();
    }

    /**
     * Generate comprehensive audit report
     */
    async generateAuditReport(
        filters: AuditEventFilter,
        generatedBy: string,
        title?: string
    ): Promise<AuditReport> {
        try {
            const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Query events based on filters
            const query = {
                entityType: filters.entityTypes?.[0],
                actorId: filters.actorIds?.[0],
                actions: filters.actions,
                dateRange: filters.dateRange || {
                    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false
            };

            const { events, total } = await auditService.queryEvents(query);

            // Generate summary
            const summary = await this.generateReportSummary(events, query.dateRange);

            const report: AuditReport = {
                id: reportId,
                title: title || `Audit Report - ${new Date().toISOString().split('T')[0]}`,
                description: `Comprehensive audit report covering ${events.length} events`,
                dateRange: query.dateRange,
                filters,
                generatedAt: new Date(),
                generatedBy,
                eventCount: total,
                summary,
                events
            };

            logger.info('Audit report generated', {
                reportId,
                eventCount: events.length,
                dateRange: query.dateRange,
                generatedBy
            });

            return report;
        } catch (error) {
            logger.error('Failed to generate audit report', {
                error: error.message,
                filters,
                generatedBy
            });
            throw error;
        }
    }

    /**
     * Generate report summary with analytics
     */
    private async generateReportSummary(
        events: AuditEvent[],
        dateRange: { start: Date; end: Date }
    ): Promise<AuditReportSummary> {
        const uniqueActors = new Set(events.map(e => e.actor.id)).size;
        const uniqueEntities = new Set(events.map(e => `${e.entityType}:${e.entityId}`)).size;

        // Action breakdown
        const actionCounts = events.reduce((acc, event) => {
            acc[event.action] = (acc[event.action] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const actionBreakdown = Object.entries(actionCounts)
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count);

        // Entity type breakdown
        const entityTypeCounts = events.reduce((acc, event) => {
            acc[event.entityType] = (acc[event.entityType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const entityTypeBreakdown = Object.entries(entityTypeCounts)
            .map(([entityType, count]) => ({ entityType, count }))
            .sort((a, b) => b.count - a.count);

        // Actor role breakdown
        const roleCounts = events.reduce((acc, event) => {
            acc[event.actor.role] = (acc[event.actor.role] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const actorRoleBreakdown = Object.entries(roleCounts)
            .map(([role, count]) => ({ role, count }))
            .sort((a, b) => b.count - a.count);

        // Timeline data (daily counts)
        const timelineCounts = events.reduce((acc, event) => {
            const date = event.timestamp.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const timelineData = Object.entries(timelineCounts)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Identify risk events
        const riskActions = [
            'user.deleted',
            'payment.failed',
            'device.deactivated',
            'system.backup',
            'audit.exported'
        ];

        const riskEvents = events.filter(event =>
            riskActions.some(riskAction => event.action.includes(riskAction)) ||
            event.metadata.error ||
            event.metadata.success === false
        );

        return {
            totalEvents: events.length,
            uniqueActors,
            uniqueEntities,
            actionBreakdown,
            entityTypeBreakdown,
            actorRoleBreakdown,
            timelineData,
            riskEvents
        };
    }

    /**
     * Build data lineage for an entity
     */
    async buildDataLineage(
        entityType: string,
        entityId: string,
        maxDepth: number = 3
    ): Promise<DataLineageNode> {
        try {
            const visited = new Set<string>();
            const lineageNode = await this.buildLineageNode(entityType, entityId, maxDepth, visited);

            logger.info('Data lineage built', {
                entityType,
                entityId,
                maxDepth,
                totalEvents: lineageNode.events.length,
                relationships: lineageNode.relationships.length
            });

            return lineageNode;
        } catch (error) {
            logger.error('Failed to build data lineage', {
                error: error.message,
                entityType,
                entityId
            });
            throw error;
        }
    }

    /**
     * Recursively build lineage node
     */
    private async buildLineageNode(
        entityType: string,
        entityId: string,
        depth: number,
        visited: Set<string>
    ): Promise<DataLineageNode> {
        const nodeKey = `${entityType}:${entityId}`;

        if (visited.has(nodeKey) || depth <= 0) {
            return {
                entityType,
                entityId,
                events: [],
                relationships: []
            };
        }

        visited.add(nodeKey);

        // Get all events for this entity
        const { events } = await auditService.queryEvents({
            entityType,
            entityId,
            dateRange: {
                start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
                end: new Date()
            },
            includeRedacted: false
        });

        const relationships: DataLineageRelationship[] = [];

        // Analyze events to find relationships
        for (const event of events) {
            // Check for creation relationships
            if (event.action.includes('created') && event.diff?.after) {
                const relatedEntities = this.extractRelatedEntities(event.diff.after);
                for (const related of relatedEntities) {
                    relationships.push({
                        type: 'created_by',
                        sourceEntity: { type: event.actor.role, id: event.actor.id },
                        targetEntity: { type: entityType, id: entityId },
                        event
                    });
                }
            }

            // Check for modification relationships
            if (event.action.includes('updated') && event.diff) {
                relationships.push({
                    type: 'modified_by',
                    sourceEntity: { type: event.actor.role, id: event.actor.id },
                    targetEntity: { type: entityType, id: entityId },
                    event
                });
            }

            // Check for access relationships
            if (event.action.includes('accessed') || event.action.includes('queried')) {
                relationships.push({
                    type: 'accessed_by',
                    sourceEntity: { type: event.actor.role, id: event.actor.id },
                    targetEntity: { type: entityType, id: entityId },
                    event
                });
            }
        }

        return {
            entityType,
            entityId,
            events,
            relationships
        };
    }

    /**
     * Extract related entities from event data
     */
    private extractRelatedEntities(data: any): Array<{ type: string; id: string }> {
        const entities: Array<{ type: string; id: string }> = [];

        if (!data || typeof data !== 'object') {
            return entities;
        }

        // Look for common ID patterns
        const idFields = ['userId', 'deviceId', 'tripId', 'routeId', 'invoiceId', 'paymentId'];

        for (const field of idFields) {
            if (data[field]) {
                const entityType = field.replace('Id', '').toLowerCase();
                entities.push({ type: entityType, id: data[field] });
            }
        }

        return entities;
    }

    /**
     * Generate compliance report
     */
    async generateComplianceReport(
        framework: 'GDPR' | 'SOX' | 'HIPAA' | 'PCI_DSS',
        dateRange: { start: Date; end: Date }
    ): Promise<ComplianceReport> {
        try {
            const reportId = `compliance_${framework}_${Date.now()}`;

            // Get all events in date range
            const { events } = await auditService.queryEvents({
                dateRange,
                includeRedacted: false
            });

            const findings = await this.analyzeComplianceFindings(framework, events);
            const riskScore = this.calculateRiskScore(findings);
            const recommendations = this.generateRecommendations(framework, findings);

            const report: ComplianceReport = {
                reportId,
                complianceFramework: framework,
                dateRange,
                findings,
                riskScore,
                recommendations,
                generatedAt: new Date()
            };

            logger.info('Compliance report generated', {
                reportId,
                framework,
                findingsCount: findings.length,
                riskScore
            });

            return report;
        } catch (error) {
            logger.error('Failed to generate compliance report', {
                error: error.message,
                framework,
                dateRange
            });
            throw error;
        }
    }

    /**
     * Analyze events for compliance findings
     */
    private async analyzeComplianceFindings(
        framework: string,
        events: AuditEvent[]
    ): Promise<ComplianceFinding[]> {
        const findings: ComplianceFinding[] = [];

        if (framework === 'GDPR') {
            // Check for data processing without consent
            const dataProcessingEvents = events.filter(e =>
                e.action.includes('location.shared') ||
                e.action.includes('user.created')
            );

            for (const event of dataProcessingEvents) {
                if (!event.metadata.consentVersion) {
                    findings.push({
                        severity: 'high',
                        category: 'Data Processing Without Consent',
                        description: 'Personal data processed without explicit consent',
                        affectedEntities: [event.entityId],
                        evidence: [event],
                        remediation: 'Ensure consent is obtained before processing personal data'
                    });
                }
            }

            // Check for data retention violations
            const locationEvents = events.filter(e => e.entityType === 'location_point');
            const oldEvents = locationEvents.filter(e =>
                Date.now() - e.timestamp.getTime() > 30 * 24 * 60 * 60 * 1000
            );

            if (oldEvents.length > 0) {
                findings.push({
                    severity: 'medium',
                    category: 'Data Retention Violation',
                    description: 'Location data retained beyond 30-day policy',
                    affectedEntities: oldEvents.map(e => e.entityId),
                    evidence: oldEvents,
                    remediation: 'Implement automated data cleanup for expired location data'
                });
            }
        }

        // Add more framework-specific checks...

        return findings;
    }

    /**
     * Calculate risk score based on findings
     */
    private calculateRiskScore(findings: ComplianceFinding[]): number {
        const severityWeights = {
            low: 1,
            medium: 3,
            high: 7,
            critical: 10
        };

        const totalScore = findings.reduce((sum, finding) =>
            sum + severityWeights[finding.severity], 0
        );

        // Normalize to 0-100 scale
        return Math.min(100, Math.round((totalScore / findings.length) * 10));
    }

    /**
     * Generate recommendations based on findings
     */
    private generateRecommendations(
        framework: string,
        findings: ComplianceFinding[]
    ): string[] {
        const recommendations: string[] = [];

        const criticalFindings = findings.filter(f => f.severity === 'critical');
        const highFindings = findings.filter(f => f.severity === 'high');

        if (criticalFindings.length > 0) {
            recommendations.push('Address critical compliance issues immediately');
        }

        if (highFindings.length > 0) {
            recommendations.push('Prioritize high-severity findings for remediation');
        }

        if (framework === 'GDPR') {
            recommendations.push('Review and update consent management processes');
            recommendations.push('Implement automated data retention policies');
            recommendations.push('Conduct regular privacy impact assessments');
        }

        return recommendations;
    }

    /**
     * Get audit visualization data for dashboards
     */
    async getVisualizationData(dateRange: { start: Date; end: Date }): Promise<{
        eventTimeline: { date: string; count: number }[];
        actionDistribution: { action: string; count: number }[];
        actorActivity: { actor: string; count: number }[];
        entityHeatmap: { entityType: string; entityId: string; eventCount: number }[];
    }> {
        try {
            const { events } = await auditService.queryEvents({
                dateRange,
                includeRedacted: false
            });

            // Event timeline (daily)
            const timelineCounts = events.reduce((acc, event) => {
                const date = event.timestamp.toISOString().split('T')[0];
                acc[date] = (acc[date] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const eventTimeline = Object.entries(timelineCounts)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));

            // Action distribution
            const actionCounts = events.reduce((acc, event) => {
                acc[event.action] = (acc[event.action] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const actionDistribution = Object.entries(actionCounts)
                .map(([action, count]) => ({ action, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10); // Top 10 actions

            // Actor activity
            const actorCounts = events.reduce((acc, event) => {
                const actorKey = `${event.actor.role}:${event.actor.id}`;
                acc[actorKey] = (acc[actorKey] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const actorActivity = Object.entries(actorCounts)
                .map(([actor, count]) => ({ actor, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 20); // Top 20 actors

            // Entity heatmap
            const entityCounts = events.reduce((acc, event) => {
                const entityKey = `${event.entityType}:${event.entityId}`;
                acc[entityKey] = (acc[entityKey] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const entityHeatmap = Object.entries(entityCounts)
                .map(([key, eventCount]) => {
                    const [entityType, entityId] = key.split(':');
                    return { entityType, entityId, eventCount };
                })
                .sort((a, b) => b.eventCount - a.eventCount)
                .slice(0, 50); // Top 50 entities

            return {
                eventTimeline,
                actionDistribution,
                actorActivity,
                entityHeatmap
            };
        } catch (error) {
            logger.error('Failed to get visualization data', {
                error: error.message,
                dateRange
            });
            throw error;
        }
    }
}

// Export singleton instance
export const auditReportingService = new AuditReportingService();