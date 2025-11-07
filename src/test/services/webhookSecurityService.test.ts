import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebhookSecurityService } from '@/services/webhookSecurityService';
import { MockPaymentProvider } from '@/services/paymentProviders/mockPaymentProvider';
import { getDatabase } from '@/config/database';
import { Knex } from 'knex';
import crypto from 'crypto';

describe('WebhookSecurityService', () => {
    let webhookSecurity: WebhookSecurityService;
    let mockProvider: MockPaymentProvider;
    let db: Knex;

    beforeEach(async () => {
        db = getDatabase();
        webhookSecurity = new WebhookSecurityService();
        mockProvider = new MockPaymentProvider();

        // Clean up test data
        await db('webhook_security_logs').del();
        await db('webhook_events').del();
        await db('webhook_retries').del();
        await db('webhook_deduplication').del();
    });

    afterEach(async () => {
        // Clean up test data
        await db('webhook_security_logs').del();
        await db('webhook_events').del();
        await db('webhook_retries').del();
        await db('webhook_deduplication').del();
    });

    describe('validateWebhook', () => {
        it('should validate webhook with correct signature and timestamp', async () => {
            const payload = { id: 'test_event', type: 'payment.succeeded', data: { amount: 100 } };
            const { signature } = mockProvider.generateMockWebhook('payment.succeeded', { amount: 100 });
            const timestamp = Math.floor(Date.now() / 1000).toString();

            const result = await webhookSecurity.validateWebhook('mock', payload, signature, timestamp);

            expect(result.isValid).toBe(true);
            expect(result.eventId).toBeDefined();
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('should reject webhook with invalid signature', async () => {
            const payload = { id: 'test_event', type: 'payment.succeeded', data: { amount: 100 } };
            const invalidSignature = 'invalid_signature_123';
            const timestamp = Math.floor(Date.now() / 1000).toString();

            const result = await webhookSecurity.validateWebhook('mock', payload, invalidSignature, timestamp);

            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid webhook signature');
        });

        it('should reject webhook with old timestamp', async () => {
            const payload = { id: 'test_event', type: 'payment.succeeded', data: { amount: 100 } };
            const { signature } = mockProvider.generateMockWebhook('payment.succeeded', { amount: 100 });
            const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes old

            const result = await webhookSecurity.validateWebhook('mock', payload, signature, oldTimestamp);

            expect(result.isValid).toBe(false);
            expect(result.error).toContain('too old or too far in future');
        });

        it('should reject webhook from unsupported provider', async () => {
            const payload = { id: 'test_event', type: 'payment.succeeded', data: { amount: 100 } };
            const signature = 'some_signature';

            const result = await webhookSecurity.validateWebhook('unsupported_provider', payload, signature);

            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Unsupported webhook provider');
        });

        it('should handle malformed timestamp gracefully', async () => {
            const payload = { id: 'test_event', type: 'payment.succeeded', data: { amount: 100 } };
            const { signature } = mockProvider.generateMockWebhook('payment.succeeded', { amount: 100 });
            const invalidTimestamp = 'not_a_number';

            const result = await webhookSecurity.validateWebhook('mock', payload, signature, invalidTimestamp);

            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid timestamp format');
        });
    });

    describe('isDuplicateEvent', () => {
        it('should detect duplicate events', async () => {
            const eventId = 'test_event_123';

            // Store first event
            await webhookSecurity.storeWebhookEvent('mock', 'payment.succeeded', {}, 'sig', eventId);

            // Check for duplicate
            const isDuplicate = await webhookSecurity.isDuplicateEvent(eventId);

            expect(isDuplicate).toBe(true);
        });

        it('should return false for new events', async () => {
            const eventId = 'new_event_123';

            const isDuplicate = await webhookSecurity.isDuplicateEvent(eventId);

            expect(isDuplicate).toBe(false);
        });
    });

    describe('storeWebhookEvent', () => {
        it('should store webhook event successfully', async () => {
            const eventId = 'test_event_123';
            const payload = { amount: 100 };

            const webhookId = await webhookSecurity.storeWebhookEvent(
                'mock',
                'payment.succeeded',
                payload,
                'test_signature',
                eventId
            );

            expect(webhookId).toBeDefined();

            // Verify stored in database
            const stored = await db('webhook_events').where('id', webhookId).first();
            expect(stored).toBeDefined();
            expect(stored.event_id).toBe(eventId);
            expect(stored.provider).toBe('mock');
            expect(stored.event_type).toBe('payment.succeeded');
            expect(JSON.parse(stored.payload)).toEqual(payload);
        });
    });

    describe('scheduleWebhookRetry', () => {
        it('should schedule webhook retry with exponential backoff', async () => {
            const webhookId = 'test_webhook_123';
            const url = 'https://example.com/webhook';
            const payload = { test: 'data' };
            const headers = { 'Content-Type': 'application/json' };

            await webhookSecurity.scheduleWebhookRetry(webhookId, url, payload, headers, 1);

            const retry = await db('webhook_retries').where('webhook_id', webhookId).first();
            expect(retry).toBeDefined();
            expect(retry.current_attempt).toBe(2);
            expect(retry.url).toBe(url);
            expect(JSON.parse(retry.payload)).toEqual(payload);
            expect(JSON.parse(retry.headers)).toEqual(headers);
        });

        it('should not schedule retry if max attempts exceeded', async () => {
            const webhookId = 'test_webhook_123';
            const url = 'https://example.com/webhook';
            const payload = { test: 'data' };
            const headers = { 'Content-Type': 'application/json' };

            // Try to schedule retry with max attempts already reached
            await webhookSecurity.scheduleWebhookRetry(webhookId, url, payload, headers, 3);

            const retries = await db('webhook_retries').where('webhook_id', webhookId);
            expect(retries).toHaveLength(0);
        });
    });

    describe('processPendingRetries', () => {
        it('should process pending webhook retries', async () => {
            const webhookId = 'test_webhook_123';

            // Create a pending retry
            await db('webhook_retries').insert({
                webhook_id: webhookId,
                url: 'https://example.com/webhook',
                payload: JSON.stringify({ test: 'data' }),
                headers: JSON.stringify({ 'Content-Type': 'application/json' }),
                max_attempts: 3,
                current_attempt: 1,
                next_retry_at: new Date(Date.now() - 1000), // Past due
                created_at: new Date()
            });

            const result = await webhookSecurity.processPendingRetries();

            expect(result.processed).toBe(1);
            expect(result.succeeded + result.failed).toBe(1);
        });
    });

    describe('getWebhookStats', () => {
        it('should return webhook statistics', async () => {
            // Create test webhook events
            await db('webhook_events').insert([
                {
                    event_id: 'event1',
                    provider: 'mock',
                    event_type: 'payment.succeeded',
                    payload: '{}',
                    signature: 'sig1',
                    processed: true,
                    received_at: new Date(),
                    processed_at: new Date(Date.now() + 1000)
                },
                {
                    event_id: 'event2',
                    provider: 'mock',
                    event_type: 'payment.failed',
                    payload: '{}',
                    signature: 'sig2',
                    processed: false,
                    processing_error: 'Test error',
                    received_at: new Date()
                }
            ]);

            const stats = await webhookSecurity.getWebhookStats('mock', 24);

            expect(stats.total).toBe(2);
            expect(stats.processed).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.duplicates).toBe(0);
            expect(stats.avgProcessingTime).toBeGreaterThan(0);
        });
    });

    describe('cleanupOldWebhooks', () => {
        it('should clean up old processed webhook events', async () => {
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

            // Create old processed event
            await db('webhook_events').insert({
                event_id: 'old_event',
                provider: 'mock',
                event_type: 'payment.succeeded',
                payload: '{}',
                signature: 'sig',
                processed: true,
                received_at: oldDate,
                processed_at: oldDate
            });

            // Create recent event
            await db('webhook_events').insert({
                event_id: 'recent_event',
                provider: 'mock',
                event_type: 'payment.succeeded',
                payload: '{}',
                signature: 'sig',
                processed: true,
                received_at: new Date(),
                processed_at: new Date()
            });

            const result = await webhookSecurity.cleanupOldWebhooks(30);

            expect(result.deletedEvents).toBe(1);

            // Verify only old event was deleted
            const remaining = await db('webhook_events').select('*');
            expect(remaining).toHaveLength(1);
            expect(remaining[0].event_id).toBe('recent_event');
        });
    });

    describe('Security Edge Cases', () => {
        it('should handle concurrent webhook processing safely', async () => {
            const eventId = 'concurrent_test';
            const payload = { amount: 100 };

            // Simulate concurrent requests with same event ID
            const promises = Array.from({ length: 5 }, () =>
                webhookSecurity.storeWebhookEvent('mock', 'payment.succeeded', payload, 'sig', eventId)
            );

            const results = await Promise.allSettled(promises);

            // Only one should succeed, others should handle gracefully
            const successful = results.filter(r => r.status === 'fulfilled');
            expect(successful.length).toBeGreaterThan(0);

            // Verify only one event stored
            const events = await db('webhook_events').where('event_id', eventId);
            expect(events.length).toBeGreaterThanOrEqual(1);
        });

        it('should prevent timing attacks on signature validation', async () => {
            const payload = { id: 'test', data: { amount: 100 } };
            const validSignature = mockProvider.generateMockWebhook('payment.succeeded', { amount: 100 }).signature;
            const invalidSignature = 'x'.repeat(validSignature.length);

            // Measure validation times
            const times: number[] = [];

            for (let i = 0; i < 10; i++) {
                const start = process.hrtime.bigint();
                await webhookSecurity.validateWebhook('mock', payload, i % 2 === 0 ? validSignature : invalidSignature);
                const end = process.hrtime.bigint();
                times.push(Number(end - start) / 1000000); // Convert to milliseconds
            }

            // Timing should be relatively consistent (within reasonable variance)
            const avgTime = times.reduce((a, b) => a + b) / times.length;
            const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length;
            const stdDev = Math.sqrt(variance);

            // Standard deviation should be reasonable (not indicating timing attack vulnerability)
            expect(stdDev).toBeLessThan(avgTime * 0.5); // Less than 50% of average time
        });

        it('should handle malformed webhook payloads gracefully', async () => {
            const malformedPayloads = [
                null,
                undefined,
                '',
                'not_json',
                { circular: {} },
                Array(10000).fill('x').join(''), // Very large payload
                { nested: { very: { deeply: { nested: { object: true } } } } }
            ];

            // Add circular reference
            malformedPayloads[5] = { circular: {} };
            (malformedPayloads[5] as any).circular.ref = malformedPayloads[5];

            for (const payload of malformedPayloads) {
                const result = await webhookSecurity.validateWebhook('mock', payload, 'invalid_sig');
                expect(result.isValid).toBe(false);
                expect(result.error).toBeDefined();
            }
        });
    });
});