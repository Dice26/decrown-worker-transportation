import { describe, it, expect, beforeEach, vi } from 'vitest';
import { auditService } from '@/services/auditService';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import { AuditEventInput, AuditQuery } from '@/types/audit';
import crypto from 'crypto';

describe('AuditService', () => {
    let testUser: any;
    let db: any;

    beforeEach(async () => {
        db = getDatabase();
        testUser = await TestDataFactory.createUser({
            role: 'admin',
            email: 'audit-test@example.com'
        });
    });

    describe('logEvent', () => {
        it('should log an audit event with hash chain', async () => {
            const eventInput: AuditEventInput = {
                correlationId: 'test-correlation-123',
                actor: {
                    id: testUser.id,
                    role: testUser.role,
                    ipAddress: '192.168.1.1'
                },
                action: 'user.created',
                entityType: 'user',
                entityId: testUser.id,
                metadata: {
                    testField: 'testValue'
                }
            };

            const result = await auditService.logEvent(eventInput);

            expect(result).toBeDefined();
            expect(result.eventId).toBeDefined();
            expect(result.correlationId).toBe(eventInput.correlationId);
            expect(result.actor.id).toBe(eventInput.actor.id);
            expect(result.action).toBe(eventInput.action);
            expect(result.entityType).toBe(eventInput.entityType);
            expect(result.entityId).toBe(eventInput.entityId);
            expect(result.hashChain).toBeDefined();
            expect(result.hashChain).toHaveLength(64); // SHA-256 hex length
            expect(result.metadata).toEqual(eventInput.metadata);
        });

        it('should create proper hash chain for sequential events', async () => {
            const firstEvent: AuditEventInput = {
                correlationId: 'test-1',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.created',
                entityType: 'user',
                entityId: testUser.id
            };

            const secondEvent: AuditEventInput = {
                correlationId: 'test-2',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.updated',
                entityType: 'user',
                entityId: testUser.id
            };

            const result1 = await auditService.logEvent(firstEvent);
            const result2 = await auditService.logEvent(secondEvent);

            expect(result1.hashChain).not.toBe(result2.hashChain);
            expect(result1.hashChain).toHaveLength(64);
            expect(result2.hashChain).toHaveLength(64);
        });

        it('should handle events with diff data', async () => {
            const eventInput: AuditEventInput = {
                correlationId: 'test-diff',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.updated',
                entityType: 'user',
                entityId: testUser.id,
                diff: {
                    before: { name: 'Old Name' },
                    after: { name: 'New Name' }
                }
            };

            const result = await auditService.logEvent(eventInput);

            expect(result.diff).toBeDefined();
            expect(result.diff?.before).toEqual({ name: 'Old Name' });
            expect(result.diff?.after).toEqual({ name: 'New Name' });
        });

        it('should handle events without optional fields', async () => {
            const eventInput: AuditEventInput = {
                correlationId: 'test-minimal',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.accessed',
                entityType: 'user',
                entityId: testUser.id
            };

            const result = await auditService.logEvent(eventInput);

            expect(result).toBeDefined();
            expect(result.metadata).toEqual({});
            expect(result.diff).toBeUndefined();
        });
    });

    describe('queryEvents', () => {
        beforeEach(async () => {
            // Create test events
            const events = [
                {
                    correlationId: 'query-test-1',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'user.created',
                    entityType: 'user',
                    entityId: 'user-1'
                },
                {
                    correlationId: 'query-test-2',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'user.updated',
                    entityType: 'user',
                    entityId: 'user-1'
                },
                {
                    correlationId: 'query-test-3',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'payment.processed',
                    entityType: 'payment',
                    entityId: 'payment-1'
                }
            ];

            for (const event of events) {
                await auditService.logEvent(event);
            }
        });

        it('should query events by entity type', async () => {
            const query: AuditQuery = {
                entityType: 'user',
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false
            };

            const result = await auditService.queryEvents(query);

            expect(result.events).toHaveLength(2);
            expect(result.total).toBe(2);
            expect(result.events.every(e => e.entityType === 'user')).toBe(true);
        });

        it('should query events by entity ID', async () => {
            const query: AuditQuery = {
                entityId: 'user-1',
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false
            };

            const result = await auditService.queryEvents(query);

            expect(result.events).toHaveLength(2);
            expect(result.events.every(e => e.entityId === 'user-1')).toBe(true);
        });

        it('should query events by actor ID', async () => {
            const query: AuditQuery = {
                actorId: testUser.id,
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false
            };

            const result = await auditService.queryEvents(query);

            expect(result.events.length).toBeGreaterThanOrEqual(3);
            expect(result.events.every(e => e.actor.id === testUser.id)).toBe(true);
        });

        it('should query events by actions', async () => {
            const query: AuditQuery = {
                actions: ['user.created', 'user.updated'],
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false
            };

            const result = await auditService.queryEvents(query);

            expect(result.events).toHaveLength(2);
            expect(result.events.every(e =>
                e.action === 'user.created' || e.action === 'user.updated'
            )).toBe(true);
        });

        it('should apply pagination', async () => {
            const query: AuditQuery = {
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false,
                limit: 2,
                offset: 0
            };

            const result = await auditService.queryEvents(query);

            expect(result.events).toHaveLength(2);
            expect(result.total).toBeGreaterThanOrEqual(3);
        });

        it('should filter by date range', async () => {
            const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const query: AuditQuery = {
                dateRange: {
                    start: futureDate,
                    end: new Date(futureDate.getTime() + 24 * 60 * 60 * 1000)
                },
                includeRedacted: false
            };

            const result = await auditService.queryEvents(query);

            expect(result.events).toHaveLength(0);
            expect(result.total).toBe(0);
        });
    });

    describe('getEventsByCorrelationId', () => {
        it('should retrieve events by correlation ID', async () => {
            const correlationId = 'correlation-test-123';

            await auditService.logEvent({
                correlationId,
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.created',
                entityType: 'user',
                entityId: 'user-1'
            });

            await auditService.logEvent({
                correlationId,
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.updated',
                entityType: 'user',
                entityId: 'user-1'
            });

            const events = await auditService.getEventsByCorrelationId(correlationId);

            expect(events).toHaveLength(2);
            expect(events.every(e => e.correlationId === correlationId)).toBe(true);
            expect(events[0].timestamp.getTime()).toBeLessThanOrEqual(events[1].timestamp.getTime());
        });

        it('should return empty array for non-existent correlation ID', async () => {
            const events = await auditService.getEventsByCorrelationId('non-existent');
            expect(events).toHaveLength(0);
        });
    });

    describe('verifyIntegrity', () => {
        beforeEach(async () => {
            // Create a sequence of events for integrity testing
            const events = [
                {
                    correlationId: 'integrity-1',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'user.created',
                    entityType: 'user',
                    entityId: 'integrity-user-1'
                },
                {
                    correlationId: 'integrity-2',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'user.updated',
                    entityType: 'user',
                    entityId: 'integrity-user-1'
                },
                {
                    correlationId: 'integrity-3',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'user.deleted',
                    entityType: 'user',
                    entityId: 'integrity-user-1'
                }
            ];

            for (const event of events) {
                await auditService.logEvent(event);
            }
        });

        it('should verify integrity of valid hash chain', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const result = await auditService.verifyIntegrity(dateRange);

            expect(result.isValid).toBe(true);
            expect(result.brokenChains).toHaveLength(0);
            expect(result.totalEvents).toBeGreaterThanOrEqual(3);
        });

        it('should detect broken hash chain', async () => {
            // Manually corrupt a hash chain to test detection
            const events = await db('audit_events')
                .select('*')
                .where('correlation_id', 'like', 'integrity-%')
                .orderBy('timestamp', 'asc');

            if (events.length > 0) {
                // Corrupt the hash of the middle event
                await db('audit_events')
                    .where('event_id', events[1].event_id)
                    .update({ hash_chain: 'corrupted_hash' });

                const dateRange = {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                };

                const result = await auditService.verifyIntegrity(dateRange);

                expect(result.isValid).toBe(false);
                expect(result.brokenChains.length).toBeGreaterThan(0);
            }
        });
    });

    describe('updateIntegrityCheckpoint', () => {
        it('should create integrity checkpoint for a date', async () => {
            // Create some events for today
            await auditService.logEvent({
                correlationId: 'checkpoint-test',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.created',
                entityType: 'user',
                entityId: 'checkpoint-user'
            });

            const today = new Date();
            await auditService.updateIntegrityCheckpoint(today);

            // Verify checkpoint was created
            const checkpoint = await db('audit_trail_integrity')
                .where('date', today.toISOString().split('T')[0])
                .first();

            expect(checkpoint).toBeDefined();
            expect(checkpoint.event_count).toBeGreaterThan(0);
            expect(checkpoint.last_hash).toBeDefined();
            expect(checkpoint.last_hash).toHaveLength(64);
        });

        it('should update existing checkpoint', async () => {
            const today = new Date();

            // Create initial checkpoint
            await auditService.updateIntegrityCheckpoint(today);

            // Add another event
            await auditService.logEvent({
                correlationId: 'checkpoint-update-test',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.updated',
                entityType: 'user',
                entityId: 'checkpoint-user'
            });

            // Update checkpoint
            await auditService.updateIntegrityCheckpoint(today);

            // Verify checkpoint was updated
            const checkpoints = await db('audit_trail_integrity')
                .where('date', today.toISOString().split('T')[0]);

            expect(checkpoints).toHaveLength(1);
            expect(checkpoints[0].event_count).toBeGreaterThan(1);
        });
    });

    describe('exportAuditTrail', () => {
        beforeEach(async () => {
            // Create test events for export
            const events = [
                {
                    correlationId: 'export-test-1',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'user.created',
                    entityType: 'user',
                    entityId: 'export-user-1',
                    metadata: { sensitiveData: 'secret123' }
                },
                {
                    correlationId: 'export-test-2',
                    actor: { id: testUser.id, role: testUser.role },
                    action: 'payment.processed',
                    entityType: 'payment',
                    entityId: 'export-payment-1',
                    metadata: { amount: 100, paymentToken: 'token123' }
                }
            ];

            for (const event of events) {
                await auditService.logEvent(event);
            }
        });

        it('should export audit trail as JSON', async () => {
            const exportOptions = {
                query: {
                    dateRange: {
                        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        end: new Date()
                    },
                    includeRedacted: false
                },
                format: 'json' as const,
                redactionLevel: 'partial' as const,
                requestorRole: 'admin'
            };

            const result = await auditService.exportAuditTrail(exportOptions);

            expect(result).toBeDefined();
            expect(() => JSON.parse(result)).not.toThrow();

            const parsedResult = JSON.parse(result);
            expect(Array.isArray(parsedResult)).toBe(true);
            expect(parsedResult.length).toBeGreaterThan(0);
        });

        it('should export audit trail as CSV', async () => {
            const exportOptions = {
                query: {
                    dateRange: {
                        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        end: new Date()
                    },
                    includeRedacted: false
                },
                format: 'csv' as const,
                redactionLevel: 'partial' as const,
                requestorRole: 'admin'
            };

            const result = await auditService.exportAuditTrail(exportOptions);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result).toContain('Event ID');
            expect(result).toContain('Correlation ID');
            expect(result).toContain('Action');
        });

        it('should apply redaction based on requestor role', async () => {
            const exportOptions = {
                query: {
                    entityType: 'payment',
                    dateRange: {
                        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        end: new Date()
                    },
                    includeRedacted: false
                },
                format: 'json' as const,
                redactionLevel: 'partial' as const,
                requestorRole: 'worker' // Non-admin role
            };

            const result = await auditService.exportAuditTrail(exportOptions);
            const parsedResult = JSON.parse(result);

            // Check that sensitive data is redacted for non-admin users
            const paymentEvent = parsedResult.find((e: any) => e.entityType === 'payment');
            if (paymentEvent) {
                expect(paymentEvent.actor.ipAddress).toBeUndefined();
            }
        });
    });

    describe('getAuditStatistics', () => {
        beforeEach(async () => {
            // Create diverse test events for statistics
            const events = [
                {
                    correlationId: 'stats-1',
                    actor: { id: testUser.id, role: 'admin' },
                    action: 'user.created',
                    entityType: 'user',
                    entityId: 'stats-user-1'
                },
                {
                    correlationId: 'stats-2',
                    actor: { id: testUser.id, role: 'admin' },
                    action: 'user.created',
                    entityType: 'user',
                    entityId: 'stats-user-2'
                },
                {
                    correlationId: 'stats-3',
                    actor: { id: 'worker-1', role: 'worker' },
                    action: 'location.shared',
                    entityType: 'location',
                    entityId: 'stats-location-1'
                }
            ];

            for (const event of events) {
                await auditService.logEvent(event);
            }
        });

        it('should return audit statistics', async () => {
            const dateRange = {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                end: new Date()
            };

            const stats = await auditService.getAuditStatistics(dateRange);

            expect(stats).toBeDefined();
            expect(stats.totalEvents).toBeGreaterThanOrEqual(3);
            expect(Array.isArray(stats.eventsByAction)).toBe(true);
            expect(Array.isArray(stats.eventsByActor)).toBe(true);

            // Check action breakdown
            const userCreatedActions = stats.eventsByAction.find(a => a.action === 'user.created');
            expect(userCreatedActions?.count).toBeGreaterThanOrEqual(2);

            // Check actor breakdown
            const adminActions = stats.eventsByActor.find(a => a.role === 'admin');
            expect(adminActions?.count).toBeGreaterThanOrEqual(2);
        });
    });

    describe('error handling', () => {
        it('should handle database errors gracefully', async () => {
            // Mock database error
            const originalDb = auditService['db'];
            auditService['db'] = {
                ...originalDb,
                insert: vi.fn().mockRejectedValue(new Error('Database error'))
            };

            const eventInput: AuditEventInput = {
                correlationId: 'error-test',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.created',
                entityType: 'user',
                entityId: 'error-user'
            };

            await expect(auditService.logEvent(eventInput)).rejects.toThrow('Database error');

            // Restore original db
            auditService['db'] = originalDb;
        });

        it('should handle invalid query parameters', async () => {
            const invalidQuery: AuditQuery = {
                dateRange: {
                    start: new Date('invalid-date'),
                    end: new Date()
                },
                includeRedacted: false
            };

            await expect(auditService.queryEvents(invalidQuery)).rejects.toThrow();
        });
    });

    describe('data redaction', () => {
        it('should mask sensitive fields in metadata', async () => {
            const eventInput: AuditEventInput = {
                correlationId: 'redaction-test',
                actor: { id: testUser.id, role: testUser.role },
                action: 'user.updated',
                entityType: 'user',
                entityId: 'redaction-user',
                metadata: {
                    password: 'secret123',
                    token: 'auth-token-456',
                    normalField: 'normal-value'
                }
            };

            await auditService.logEvent(eventInput);

            const query: AuditQuery = {
                correlationId: 'redaction-test',
                dateRange: {
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    end: new Date()
                },
                includeRedacted: false // This should apply redaction
            };

            const result = await auditService.queryEvents(query);
            const event = result.events[0];

            expect(event.metadata.password).toBe('***REDACTED***');
            expect(event.metadata.token).toBe('***REDACTED***');
            expect(event.metadata.normalField).toBe('normal-value');
        });
    });
});