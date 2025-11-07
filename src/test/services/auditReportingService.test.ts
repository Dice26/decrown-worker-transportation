import { describe, it, expect, beforeEach } from 'vitest';
import { auditReportingService } from '@/services/auditReportingService';
import { auditService } from '@/services/auditService';
import { TestDataFactory } from '@/test/helpers/testData';
import { AuditEventFilter } from '@/types/audit';

describe('AuditReportingService', () => {
    let testUser: any;
    let testUser2: any;

    beforeEach(async () => {
        testUser = await TestDataFactory.createUser({
            role: 'admin',
            email: 'audit-reporting-test@example.com'
        });

        testUser2 = await TestDataFactory.createUser({
            role: 'worker',
            email: 'audit-reporting-worker@example.com'
        });

        // Create diverse test events for reporting
        const events = [
            {
                correlationId: 'report-test-1',
                actor: { id: testUser.id, role: 'admin' },
                action: 'user.created',
                entityType: 'user',
                entityId: 'report-user-1',
                metadata: { department: 'Engineering' }
            },
            {
                correlationId: 'report-test-2',
                actor: { id: testUser.id, role: 'admin' },
                action: 'user.updated',
                entityType: 'user',
                entityId: 'report-user-1',
                diff: {
                    before: { name: 'Old Name' },
                    after: { name: 'New Name' }
                }
            },
            {
                correlationId: 'report-test-3',
                actor: { id: testUser2.id, role: 'worker' },
                action: 'location.shared',
                entityType: 'location_point',
                entityId: 'report-location-1',
                metadata: { accuracy: 10, consentVersion: '1.0' }
            },
            {
                correlationId: 'report-test-4',
                actor: { id: testUser.id, role: 'admin' },
                action: 'payment.processed',
                entityType: 'payment',
                entityId: 'report-payment-1',
                metadata: { amount: 100, currency: 'PHP' }
            },
            {
                correlationId: 'report-test-5',
                actor: { id: testUser.id, role: 'admin' },
                action: 'payment.failed',
                entityType: 'payment',
                entityId: 'report-payment-2',
                metadata: { error: 'Insufficient funds', amount: 200 }
            }
        ];

        for (const event of events) {
            await auditService.logEvent(event);
        }
    });

    describe('generateAuditReport', () => {
        it('should generate comprehensive audit report', async () => {
            const filters: AuditEventFilter = {
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            };

            const report = await auditReportingService.generateAuditReport(
                filters,
                testUser.id,
                'Test Audit Report'
            );

            expect(report).toBeDefined();
            expect(report.id).toBeDefined();
            expect(report.title).toBe('Test Audit Report');
            expect(report.generatedBy).toBe(testUser.id);
            expect(report.eventCount).toBeGreaterThanOrEqual(5);
            expect(report.events).toBeDefined();
            expect(report.summary).toBeDefined();
        });

        it('should generate report summary with analytics', async () => {
            const filters: AuditEventFilter = {
                entityTypes: ['user', 'payment'],
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            };

            const report = await auditReportingService.generateAuditReport(
                filters,
                testUser.id
            );

            const summary = report.summary;

            expect(summary.totalEvents).toBeGreaterThan(0);
            expect(summary.uniqueActors).toBeGreaterThanOrEqual(1);
            expect(summary.uniqueEntities).toBeGreaterThanOrEqual(1);
            expect(Array.isArray(summary.actionBreakdown)).toBe(true);
            expect(Array.isArray(summary.entityTypeBreakdown)).toBe(true);
            expect(Array.isArray(summary.actorRoleBreakdown)).toBe(true);
            expect(Array.isArray(summary.timelineData)).toBe(true);
            expect(Array.isArray(summary.riskEvents)).toBe(true);

            // Check action breakdown
            const userActions = summary.actionBreakdown.find(a => a.action.includes('user'));
            expect(userActions).toBeDefined();

            // Check entity type breakdown
            const userEntities = summary.entityTypeBreakdown.find(e => e.entityType === 'user');
            expect(userEntities).toBeDefined();

            // Check risk events (should include payment.failed)
            const riskEvent = summary.riskEvents.find(e => e.action === 'payment.failed');
            expect(riskEvent).toBeDefined();
        });

        it('should filter events by entity types', async () => {
            const filters: AuditEventFilter = {
                entityTypes: ['payment'],
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            };

            const report = await auditReportingService.generateAuditReport(
                filters,
                testUser.id
            );

            expect(report.events.every(e => e.entityType === 'payment')).toBe(true);
            expect(report.events.length).toBeGreaterThanOrEqual(2);
        });

        it('should filter events by actions', async () => {
            const filters: AuditEventFilter = {
                actions: ['user.created', 'user.updated'],
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            };

            const report = await auditReportingService.generateAuditReport(
                filters,
                testUser.id
            );

            expect(report.events.every(e =>
                e.action === 'user.created' || e.action === 'user.updated'
            )).toBe(true);
            expect(report.events.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('buildDataLineage', () => {
        it('should build data lineage for an entity', async () => {
            const lineage = await auditReportingService.buildDataLineage(
                'user',
                'report-user-1',
                2
            );

            expect(lineage).toBeDefined();
            expect(lineage.entityType).toBe('user');
            expect(lineage.entityId).toBe('report-user-1');
            expect(Array.isArray(lineage.events)).toBe(true);
            expect(Array.isArray(lineage.relationships)).toBe(true);
            expect(lineage.events.length).toBeGreaterThanOrEqual(2);
        });

        it('should identify creation relationships', async () => {
            const lineage = await auditReportingService.buildDataLineage(
                'user',
                'report-user-1',
                2
            );

            const creationEvent = lineage.events.find(e => e.action === 'user.created');
            expect(creationEvent).toBeDefined();

            const creationRelationship = lineage.relationships.find(r => r.type === 'created_by');
            expect(creationRelationship).toBeDefined();
        });

        it('should identify modification relationships', async () => {
            const lineage = await auditReportingService.buildDataLineage(
                'user',
                'report-user-1',
                2
            );

            const modificationEvent = lineage.events.find(e => e.action === 'user.updated');
            expect(modificationEvent).toBeDefined();

            const modificationRelationship = lineage.relationships.find(r => r.type === 'modified_by');
            expect(modificationRelationship).toBeDefined();
        });

        it('should handle non-existent entities', async () => {
            const lineage = await auditReportingService.buildDataLineage(
                'user',
                'non-existent-user',
                2
            );

            expect(lineage.events).toHaveLength(0);
            expect(lineage.relationships).toHaveLength(0);
        });
    });

    describe('generateComplianceReport', () => {
        beforeEach(async () => {
            // Create events that might trigger compliance findings
            const complianceEvents = [
                {
                    correlationId: 'compliance-1',
                    actor: { id: testUser2.id, role: 'worker' },
                    action: 'location.shared',
                    entityType: 'location_point',
                    entityId: 'compliance-location-1',
                    metadata: {} // Missing consentVersion
                },
                {
                    correlationId: 'compliance-2',
                    actor: { id: testUser.id, role: 'admin' },
                    action: 'user.created',
                    entityType: 'user',
                    entityId: 'compliance-user-1',
                    metadata: { consentVersion: '1.0' }
                }
            ];

            for (const event of complianceEvents) {
                await auditService.logEvent(event);
            }
        });

        it('should generate GDPR compliance report', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const report = await auditReportingService.generateComplianceReport(
                'GDPR',
                dateRange
            );

            expect(report).toBeDefined();
            expect(report.reportId).toBeDefined();
            expect(report.complianceFramework).toBe('GDPR');
            expect(report.dateRange).toEqual(dateRange);
            expect(Array.isArray(report.findings)).toBe(true);
            expect(typeof report.riskScore).toBe('number');
            expect(Array.isArray(report.recommendations)).toBe(true);
            expect(report.generatedAt).toBeDefined();
        });

        it('should identify data processing without consent', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const report = await auditReportingService.generateComplianceReport(
                'GDPR',
                dateRange
            );

            const consentFinding = report.findings.find(f =>
                f.category === 'Data Processing Without Consent'
            );

            expect(consentFinding).toBeDefined();
            expect(consentFinding?.severity).toBe('high');
            expect(consentFinding?.affectedEntities).toContain('compliance-location-1');
        });

        it('should calculate risk score based on findings', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const report = await auditReportingService.generateComplianceReport(
                'GDPR',
                dateRange
            );

            expect(report.riskScore).toBeGreaterThanOrEqual(0);
            expect(report.riskScore).toBeLessThanOrEqual(100);
        });

        it('should provide recommendations', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const report = await auditReportingService.generateComplianceReport(
                'GDPR',
                dateRange
            );

            expect(report.recommendations.length).toBeGreaterThan(0);
            expect(report.recommendations.some(r =>
                r.includes('consent') || r.includes('privacy')
            )).toBe(true);
        });
    });

    describe('getVisualizationData', () => {
        it('should return visualization data for dashboards', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const data = await auditReportingService.getVisualizationData(dateRange);

            expect(data).toBeDefined();
            expect(Array.isArray(data.eventTimeline)).toBe(true);
            expect(Array.isArray(data.actionDistribution)).toBe(true);
            expect(Array.isArray(data.actorActivity)).toBe(true);
            expect(Array.isArray(data.entityHeatmap)).toBe(true);
        });

        it('should provide event timeline data', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const data = await auditReportingService.getVisualizationData(dateRange);

            expect(data.eventTimeline.length).toBeGreaterThan(0);

            const timelineEntry = data.eventTimeline[0];
            expect(timelineEntry).toHaveProperty('date');
            expect(timelineEntry).toHaveProperty('count');
            expect(typeof timelineEntry.count).toBe('number');
        });

        it('should provide action distribution data', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const data = await auditReportingService.getVisualizationData(dateRange);

            expect(data.actionDistribution.length).toBeGreaterThan(0);
            expect(data.actionDistribution.length).toBeLessThanOrEqual(10); // Top 10 limit

            const actionEntry = data.actionDistribution[0];
            expect(actionEntry).toHaveProperty('action');
            expect(actionEntry).toHaveProperty('count');
            expect(typeof actionEntry.count).toBe('number');

            // Should be sorted by count descending
            if (data.actionDistribution.length > 1) {
                expect(data.actionDistribution[0].count).toBeGreaterThanOrEqual(
                    data.actionDistribution[1].count
                );
            }
        });

        it('should provide actor activity data', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const data = await auditReportingService.getVisualizationData(dateRange);

            expect(data.actorActivity.length).toBeGreaterThan(0);
            expect(data.actorActivity.length).toBeLessThanOrEqual(20); // Top 20 limit

            const actorEntry = data.actorActivity[0];
            expect(actorEntry).toHaveProperty('actor');
            expect(actorEntry).toHaveProperty('count');
            expect(typeof actorEntry.count).toBe('number');
        });

        it('should provide entity heatmap data', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const data = await auditReportingService.getVisualizationData(dateRange);

            expect(data.entityHeatmap.length).toBeGreaterThan(0);
            expect(data.entityHeatmap.length).toBeLessThanOrEqual(50); // Top 50 limit

            const entityEntry = data.entityHeatmap[0];
            expect(entityEntry).toHaveProperty('entityType');
            expect(entityEntry).toHaveProperty('entityId');
            expect(entityEntry).toHaveProperty('eventCount');
            expect(typeof entityEntry.eventCount).toBe('number');
        });
    });

    describe('error handling', () => {
        it('should handle errors in report generation', async () => {
            const invalidFilters: AuditEventFilter = {
                dateRange: {
                    start: new Date('invalid-date'),
                    end: new Date()
                }
            };

            await expect(
                auditReportingService.generateAuditReport(invalidFilters, testUser.id)
            ).rejects.toThrow();
        });

        it('should handle errors in lineage building', async () => {
            await expect(
                auditReportingService.buildDataLineage('', '', -1)
            ).rejects.toThrow();
        });

        it('should handle errors in compliance reporting', async () => {
            const invalidDateRange = {
                start: new Date('invalid-date'),
                end: new Date()
            };

            await expect(
                auditReportingService.generateComplianceReport('GDPR', invalidDateRange)
            ).rejects.toThrow();
        });
    });
});