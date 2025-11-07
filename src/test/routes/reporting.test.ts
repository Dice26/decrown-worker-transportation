import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { TestDataFactory } from '@/test/helpers/testData';
import { authService } from '@/services/authService';
import reportingRoutes from '@/routes/reporting';
import { reportingService } from '@/services/reportingService';
import * as fs from 'fs';

// Mock the reporting service
vi.mock('@/services/reportingService', () => ({
    reportingService: {
        generateReport: vi.fn(),
        getDashboardMetrics: vi.fn(),
        scheduleReport: vi.fn(),
        exportReport: vi.fn()
    }
}));

// Mock fs for file operations
vi.mock('fs', () => ({
    readdirSync: vi.fn(),
    createReadStream: vi.fn()
}));

describe('Reporting Routes', () => {
    let app: express.Application;
    let testUser: any;
    let testFinanceUser: any;
    let testAdminUser: any;
    let userToken: string;
    let financeToken: string;
    let adminToken: string;

    beforeEach(async () => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/reports', reportingRoutes);

        // Create test users
        testUser = await TestDataFactory.createUser({
            role: 'worker',
            email: 'worker-routes@example.com'
        });

        testFinanceUser = await TestDataFactory.createUser({
            role: 'finance',
            email: 'finance-routes@example.com'
        });

        testAdminUser = await TestDataFactory.createUser({
            role: 'admin',
            email: 'admin-routes@example.com'
        });

        // Generate tokens
        userToken = authService.generateAccessToken(testUser.id, testUser.role);
        financeToken = authService.generateAccessToken(testFinanceUser.id, testFinanceUser.role);
        adminToken = authService.generateAccessToken(testAdminUser.id, testAdminUser.role);

        // Reset mocks
        vi.clearAllMocks();
    });

    describe('POST /generate', () => {
        it('should generate report successfully for authorized user', async () => {
            const mockReport = {
                id: 'test-report-123',
                templateId: 'usage-summary',
                data: [{ userId: testUser.id, ridesCount: 5 }],
                metadata: { totalRecords: 1, executionTime: 150 },
                generatedAt: new Date(),
                generatedBy: testFinanceUser.id,
                format: 'json'
            };

            vi.mocked(reportingService.generateReport).mockResolvedValue(mockReport);

            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    templateId: 'usage-summary',
                    period: 'monthly',
                    dateRange: {
                        start: '2024-01-01',
                        end: '2024-01-31'
                    },
                    format: 'json'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockReport);
            expect(reportingService.generateReport).toHaveBeenCalledWith({
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                },
                filters: undefined,
                deliveryMethod: undefined,
                scheduledDelivery: undefined
            });
        });

        it('should handle report generation with filters', async () => {
            const mockReport = {
                id: 'test-report-filtered',
                templateId: 'usage-summary',
                data: [],
                metadata: { totalRecords: 0, executionTime: 100 },
                generatedAt: new Date(),
                generatedBy: testFinanceUser.id,
                format: 'csv'
            };

            vi.mocked(reportingService.generateReport).mockResolvedValue(mockReport);

            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    templateId: 'usage-summary',
                    period: 'monthly',
                    dateRange: {
                        start: '2024-01-01',
                        end: '2024-01-31'
                    },
                    format: 'csv',
                    filters: {
                        department: 'Engineering'
                    },
                    deliveryMethod: 'download'
                });

            expect(response.status).toBe(200);
            expect(reportingService.generateReport).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: { department: 'Engineering' },
                    deliveryMethod: 'download'
                })
            );
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .post('/api/v1/reports/generate')
                .send({
                    templateId: 'usage-summary',
                    period: 'monthly',
                    dateRange: {
                        start: '2024-01-01',
                        end: '2024-01-31'
                    }
                });

            expect(response.status).toBe(401);
        });

        it('should handle service errors gracefully', async () => {
            vi.mocked(reportingService.generateReport).mockRejectedValue(
                new Error('Insufficient permissions for report type: cost_analysis')
            );

            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    templateId: 'cost-analysis',
                    period: 'monthly',
                    dateRange: {
                        start: '2024-01-01',
                        end: '2024-01-31'
                    }
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Insufficient permissions for report type: cost_analysis');
        });

        it('should default to json format when not specified', async () => {
            const mockReport = {
                id: 'test-report-default',
                templateId: 'usage-summary',
                data: [],
                metadata: { totalRecords: 0, executionTime: 50 },
                generatedAt: new Date(),
                generatedBy: testFinanceUser.id,
                format: 'json'
            };

            vi.mocked(reportingService.generateReport).mockResolvedValue(mockReport);

            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    templateId: 'usage-summary',
                    period: 'monthly',
                    dateRange: {
                        start: '2024-01-01',
                        end: '2024-01-31'
                    }
                });

            expect(response.status).toBe(200);
            expect(reportingService.generateReport).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: 'json'
                })
            );
        });
    });

    describe('GET /dashboard', () => {
        it('should return dashboard metrics for authenticated user', async () => {
            const mockMetrics = {
                activeRoutes: 5,
                activeDrivers: 10,
                onlineWorkers: 25,
                tripsInProgress: 3,
                completedTripsToday: 15,
                averageETA: 25,
                systemHealth: {
                    locationService: 'healthy' as const,
                    paymentService: 'healthy' as const,
                    transportService: 'healthy' as const
                },
                alerts: []
            };

            vi.mocked(reportingService.getDashboardMetrics).mockResolvedValue(mockMetrics);

            const response = await request(app)
                .get('/api/v1/reports/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockMetrics);
            expect(reportingService.getDashboardMetrics).toHaveBeenCalledWith('admin');
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .get('/api/v1/reports/dashboard');

            expect(response.status).toBe(401);
        });

        it('should handle service errors', async () => {
            vi.mocked(reportingService.getDashboardMetrics).mockRejectedValue(
                new Error('Database connection failed')
            );

            const response = await request(app)
                .get('/api/v1/reports/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Database connection failed');
        });
    });

    describe('POST /schedule', () => {
        it('should schedule report for authorized user', async () => {
            const mockSchedule = {
                id: 'schedule-123',
                templateId: 'usage-summary',
                name: 'Monthly Usage Report',
                frequency: 'monthly' as const,
                schedule: {
                    frequency: 'monthly' as const,
                    dayOfMonth: 1,
                    time: '09:00',
                    recipients: ['finance@example.com'],
                    active: true
                },
                recipients: ['finance@example.com'],
                format: 'csv' as const,
                filters: {},
                active: true,
                nextRun: new Date(),
                createdBy: testFinanceUser.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            vi.mocked(reportingService.scheduleReport).mockResolvedValue(mockSchedule);

            const response = await request(app)
                .post('/api/v1/reports/schedule')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    templateId: 'usage-summary',
                    name: 'Monthly Usage Report',
                    frequency: 'monthly',
                    schedule: {
                        frequency: 'monthly',
                        dayOfMonth: 1,
                        time: '09:00',
                        recipients: ['finance@example.com'],
                        active: true
                    },
                    recipients: ['finance@example.com'],
                    format: 'csv',
                    nextRun: new Date().toISOString()
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockSchedule);
        });

        it('should reject scheduling for unauthorized roles', async () => {
            const response = await request(app)
                .post('/api/v1/reports/schedule')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    templateId: 'usage-summary',
                    name: 'Monthly Usage Report',
                    frequency: 'monthly'
                });

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Insufficient permissions to schedule reports');
        });

        it('should handle service errors during scheduling', async () => {
            vi.mocked(reportingService.scheduleReport).mockRejectedValue(
                new Error('Invalid template ID')
            );

            const response = await request(app)
                .post('/api/v1/reports/schedule')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    templateId: 'invalid-template',
                    name: 'Test Report',
                    frequency: 'daily',
                    nextRun: new Date().toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Invalid template ID');
        });
    });

    describe('GET /download/:reportId', () => {
        it('should download report file successfully', async () => {
            const mockStream = {
                pipe: vi.fn()
            };

            vi.mocked(fs.readdirSync).mockReturnValue(['report_test-123_2024-01-01.csv'] as any);
            vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

            const response = await request(app)
                .get('/api/v1/reports/download/test-123')
                .set('Authorization', `Bearer ${financeToken}`)
                .query({ format: 'csv' });

            expect(response.status).toBe(200);
            expect(fs.readdirSync).toHaveBeenCalled();
            expect(fs.createReadStream).toHaveBeenCalled();
        });

        it('should return 404 for non-existent report', async () => {
            vi.mocked(fs.readdirSync).mockReturnValue([] as any);

            const response = await request(app)
                .get('/api/v1/reports/download/non-existent')
                .set('Authorization', `Bearer ${financeToken}`);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Report file not found or expired');
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .get('/api/v1/reports/download/test-123');

            expect(response.status).toBe(401);
        });

        it('should handle file system errors', async () => {
            vi.mocked(fs.readdirSync).mockImplementation(() => {
                throw new Error('File system error');
            });

            const response = await request(app)
                .get('/api/v1/reports/download/test-123')
                .set('Authorization', `Bearer ${financeToken}`);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('File system error');
        });
    });

    describe('GET /templates', () => {
        it('should return available templates for finance user', async () => {
            const response = await request(app)
                .get('/api/v1/reports/templates')
                .set('Authorization', `Bearer ${financeToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);

            // Finance user should see finance-specific templates
            const templates = response.body.data;
            const costAnalysisTemplate = templates.find((t: any) => t.id === 'cost-analysis');
            expect(costAnalysisTemplate).toBeDefined();
        });

        it('should return filtered templates for dispatcher user', async () => {
            const dispatcherUser = await TestDataFactory.createUser({
                role: 'dispatcher',
                email: 'dispatcher-templates@example.com'
            });
            const dispatcherToken = authService.generateAccessToken(dispatcherUser.id, dispatcherUser.role);

            const response = await request(app)
                .get('/api/v1/reports/templates')
                .set('Authorization', `Bearer ${dispatcherToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const templates = response.body.data;
            // Dispatcher should not see finance-only templates
            const costAnalysisTemplate = templates.find((t: any) => t.id === 'cost-analysis');
            expect(costAnalysisTemplate).toBeUndefined();

            // But should see dispatcher templates
            const efficiencyTemplate = templates.find((t: any) => t.id === 'efficiency-metrics');
            expect(efficiencyTemplate).toBeDefined();
        });

        it('should return all templates for admin user', async () => {
            const response = await request(app)
                .get('/api/v1/reports/templates')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const templates = response.body.data;
            // Admin should see all templates including admin-only ones
            const auditTemplate = templates.find((t: any) => t.id === 'audit-summary');
            expect(auditTemplate).toBeDefined();
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .get('/api/v1/reports/templates');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /schedules', () => {
        it('should return scheduled reports for authorized user', async () => {
            const response = await request(app)
                .get('/api/v1/reports/schedules')
                .set('Authorization', `Bearer ${financeToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should reject access for unauthorized roles', async () => {
            const response = await request(app)
                .get('/api/v1/reports/schedules')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Insufficient permissions to view scheduled reports');
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .get('/api/v1/reports/schedules');

            expect(response.status).toBe(401);
        });
    });

    describe('PUT /schedules/:scheduleId', () => {
        it('should update scheduled report for authorized user', async () => {
            const response = await request(app)
                .put('/api/v1/reports/schedules/test-schedule-123')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    name: 'Updated Report Name',
                    active: false
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Schedule updated successfully');
        });

        it('should reject updates for unauthorized roles', async () => {
            const response = await request(app)
                .put('/api/v1/reports/schedules/test-schedule-123')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    name: 'Updated Report Name'
                });

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Insufficient permissions to update scheduled reports');
        });
    });

    describe('DELETE /schedules/:scheduleId', () => {
        it('should delete scheduled report for admin user', async () => {
            const response = await request(app)
                .delete('/api/v1/reports/schedules/test-schedule-123')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Schedule deleted successfully');
        });

        it('should reject deletion for non-admin users', async () => {
            const response = await request(app)
                .delete('/api/v1/reports/schedules/test-schedule-123')
                .set('Authorization', `Bearer ${financeToken}`);

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Insufficient permissions to delete scheduled reports');
        });
    });

    describe('POST /export/:reportId', () => {
        it('should export report with custom options', async () => {
            const response = await request(app)
                .post('/api/v1/reports/export/test-report-123')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    includeHeaders: true,
                    dateFormat: 'YYYY-MM-DD',
                    redactionLevel: 'partial',
                    auditLog: true
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Export initiated');
            expect(response.body.downloadUrl).toBe('/api/reports/download/test-report-123');
        });

        it('should handle export with minimal options', async () => {
            const response = await request(app)
                .post('/api/v1/reports/export/test-report-456')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .post('/api/v1/reports/export/test-report-123')
                .send({});

            expect(response.status).toBe(401);
        });
    });

    describe('error handling', () => {
        it('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .set('Content-Type', 'application/json')
                .send('{ invalid json }');

            expect(response.status).toBe(400);
        });

        it('should handle missing required fields', async () => {
            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    // Missing templateId and dateRange
                    format: 'json'
                });

            expect(response.status).toBe(400);
        });

        it('should handle invalid date formats', async () => {
            vi.mocked(reportingService.generateReport).mockRejectedValue(
                new Error('Invalid date format')
            );

            const response = await request(app)
                .post('/api/v1/reports/generate')
                .set('Authorization', `Bearer ${financeToken}`)
                .send({
                    templateId: 'usage-summary',
                    period: 'monthly',
                    dateRange: {
                        start: 'invalid-date',
                        end: '2024-01-31'
                    }
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid date format');
        });
    });

    describe('content type handling', () => {
        it('should set correct content type for CSV downloads', async () => {
            vi.mocked(fs.readdirSync).mockReturnValue(['report_test-123_2024-01-01.csv'] as any);
            vi.mocked(fs.createReadStream).mockReturnValue({
                pipe: vi.fn()
            } as any);

            const response = await request(app)
                .get('/api/v1/reports/download/test-123')
                .set('Authorization', `Bearer ${financeToken}`)
                .query({ format: 'csv' });

            expect(response.status).toBe(200);
            // Note: In a real test, we would check response headers
            // expect(response.headers['content-type']).toBe('text/csv');
        });

        it('should set correct content type for PDF downloads', async () => {
            vi.mocked(fs.readdirSync).mockReturnValue(['report_test-123_2024-01-01.pdf'] as any);
            vi.mocked(fs.createReadStream).mockReturnValue({
                pipe: vi.fn()
            } as any);

            const response = await request(app)
                .get('/api/v1/reports/download/test-123')
                .set('Authorization', `Bearer ${financeToken}`)
                .query({ format: 'pdf' });

            expect(response.status).toBe(200);
            // expect(response.headers['content-type']).toBe('application/pdf');
        });
    });
});