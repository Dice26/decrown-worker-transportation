import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reportingService } from '@/services/reportingService';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import {
    ReportRequest,
    ReportSchedule,
    ReportExportOptions,
    UserRole
} from '@/types/reporting';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module for file operations
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
    createReadStream: vi.fn()
}));

describe('ReportingService', () => {
    let testUser: any;
    let testDriver: any;
    let testFinanceUser: any;
    let db: any;

    beforeEach(async () => {
        db = getDatabase();

        // Create test users with different roles
        testUser = await TestDataFactory.createUser({
            role: 'worker',
            email: 'worker-test@example.com',
            department: 'Engineering'
        });

        testDriver = await TestDataFactory.createUser({
            role: 'driver',
            email: 'driver-test@example.com',
            department: 'Operations'
        });

        testFinanceUser = await TestDataFactory.createUser({
            role: 'finance',
            email: 'finance-test@example.com',
            department: 'Finance'
        });

        // Create test data for reports
        await createTestReportData();
    });

    async function createTestReportData() {
        // Create usage ledger data
        await TestDataFactory.createUsageLedger(testUser.id, {
            month: '2024-01',
            rides_count: 5,
            total_distance: 25000, // 25km
            total_duration: 150, // 150 minutes
            final_amount: 500
        });

        await TestDataFactory.createUsageLedger(testDriver.id, {
            month: '2024-01',
            rides_count: 3,
            total_distance: 15000, // 15km
            total_duration: 90, // 90 minutes
            final_amount: 300
        });

        // Create invoice data
        const invoice1 = await TestDataFactory.createInvoice(testUser.id, {
            status: 'paid',
            total_amount: 500,
            billing_period_start: new Date('2024-01-01'),
            billing_period_end: new Date('2024-01-31'),
            paid_at: new Date('2024-02-05')
        });

        const invoice2 = await TestDataFactory.createInvoice(testDriver.id, {
            status: 'paid',
            total_amount: 300,
            billing_period_start: new Date('2024-01-01'),
            billing_period_end: new Date('2024-01-31'),
            paid_at: new Date('2024-02-03')
        });

        // Create trip data
        const trip1 = await TestDataFactory.createTrip(testUser.id, {
            status: 'completed',
            scheduled_at: new Date('2024-01-15'),
            completed_at: new Date('2024-01-15'),
            metrics: JSON.stringify({
                totalDistance: 5000,
                totalDuration: 30,
                pickupCount: 1,
                noShowCount: 0
            })
        });

        const trip2 = await TestDataFactory.createTrip(testDriver.id, {
            status: 'completed',
            scheduled_at: new Date('2024-01-20'),
            completed_at: new Date('2024-01-20'),
            metrics: JSON.stringify({
                totalDistance: 7000,
                totalDuration: 40,
                pickupCount: 1,
                noShowCount: 0
            })
        });

        // Create trip stops
        await TestDataFactory.createTripStop(trip1.id, testUser.id, {
            status: 'picked_up'
        });

        await TestDataFactory.createTripStop(trip2.id, testDriver.id, {
            status: 'picked_up'
        });
    }

    describe('generateReport', () => {
        it('should generate usage summary report for finance user', async () => {
            const reportRequest: ReportRequest = {
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
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result).toBeDefined();
            expect(result.id).toBeDefined();
            expect(result.templateId).toBe('usage-summary');
            expect(result.format).toBe('json');
            expect(result.generatedBy).toBe(testFinanceUser.id);
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data.length).toBeGreaterThan(0);
            expect(result.metadata).toBeDefined();
            expect(result.metadata.totalRecords).toBeGreaterThan(0);
            expect(result.metadata.executionTime).toBeGreaterThan(0);
        });

        it('should generate cost analysis report for finance user', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'cost-analysis',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-02-29')
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result).toBeDefined();
            expect(result.templateId).toBe('cost-analysis');
            expect(result.data).toBeDefined();
            expect(result.metadata.dataSource).toContain('invoices');
        });

        it('should generate efficiency metrics report for admin user', async () => {
            const adminUser = await TestDataFactory.createUser({
                role: 'admin',
                email: 'admin-test@example.com'
            });

            const reportRequest: ReportRequest = {
                templateId: 'efficiency-metrics',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: adminUser.id,
                    role: 'admin'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result).toBeDefined();
            expect(result.templateId).toBe('efficiency-metrics');
            expect(result.data).toBeDefined();
            expect(result.metadata.dataSource).toContain('trips');
        });

        it('should reject report generation for unauthorized role', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'cost-analysis', // Finance-only report
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: testUser.id,
                    role: 'worker' // Worker role not allowed for cost analysis
                }
            };

            await expect(reportingService.generateReport(reportRequest))
                .rejects.toThrow('Insufficient permissions for report type: cost_analysis');
        });

        it('should reject report generation for non-existent template', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'non-existent-template',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                }
            };

            await expect(reportingService.generateReport(reportRequest))
                .rejects.toThrow('Report template not found: non-existent-template');
        });

        it('should apply filters to usage summary report', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                filters: {
                    department: 'Engineering'
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.data).toBeDefined();
            // All returned records should be from Engineering department
            result.data.forEach(record => {
                if (record.department) {
                    expect(record.department).toBe('Engineering');
                }
            });
        });

        it('should apply role-based data filtering', async () => {
            const dispatcherUser = await TestDataFactory.createUser({
                role: 'dispatcher',
                email: 'dispatcher-test@example.com'
            });

            const reportRequest: ReportRequest = {
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: dispatcherUser.id,
                    role: 'dispatcher'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.metadata.redactionApplied).toBe(true);

            // Check that sensitive fields are redacted for non-admin/finance roles
            result.data.forEach(record => {
                if (record.userName && typeof record.userName === 'string') {
                    expect(record.userName).toBe('***REDACTED***');
                }
            });
        });
    });

    describe('getDashboardMetrics', () => {
        beforeEach(async () => {
            // Create additional test data for dashboard metrics
            const route = await db('routes').insert({
                id: 'test-route-1',
                name: 'Test Route',
                status: 'active',
                created_by: testDriver.id,
                optimization_config: JSON.stringify({}),
                constraints: JSON.stringify({}),
                created_at: new Date(),
                updated_at: new Date()
            }).returning('*');

            await db('trips').insert({
                id: 'dashboard-trip-1',
                route_id: route[0].id,
                driver_id: testDriver.id,
                status: 'in_progress',
                planned_stops: JSON.stringify([{
                    userId: testUser.id,
                    estimatedArrival: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
                    status: 'pending'
                }]),
                actual_stops: JSON.stringify([]),
                metrics: JSON.stringify({}),
                scheduled_at: new Date(),
                created_at: new Date()
            });

            // Create location points for online workers
            await db('location_points').insert({
                user_id: testUser.id,
                device_id: 'test-device-1',
                coordinates: db.raw("ST_GeomFromText('POINT(120.9842 14.5995)', 4326)"),
                accuracy: 10,
                source: 'gps',
                timestamp: new Date(),
                consent_version: '1.0',
                hash_chain: 'test-hash',
                retention_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
        });

        it('should return dashboard metrics for admin user', async () => {
            const adminUser = await TestDataFactory.createUser({
                role: 'admin',
                email: 'admin-dashboard@example.com'
            });

            const metrics = await reportingService.getDashboardMetrics('admin');

            expect(metrics).toBeDefined();
            expect(typeof metrics.activeRoutes).toBe('number');
            expect(typeof metrics.activeDrivers).toBe('number');
            expect(typeof metrics.onlineWorkers).toBe('number');
            expect(typeof metrics.tripsInProgress).toBe('number');
            expect(typeof metrics.completedTripsToday).toBe('number');
            expect(typeof metrics.averageETA).toBe('number');
            expect(metrics.systemHealth).toBeDefined();
            expect(metrics.systemHealth.locationService).toBe('healthy');
            expect(metrics.systemHealth.paymentService).toBe('healthy');
            expect(metrics.systemHealth.transportService).toBe('healthy');
            expect(Array.isArray(metrics.alerts)).toBe(true);
        });

        it('should return appropriate metrics for dispatcher user', async () => {
            const metrics = await reportingService.getDashboardMetrics('dispatcher');

            expect(metrics).toBeDefined();
            expect(metrics.activeRoutes).toBeGreaterThanOrEqual(0);
            expect(metrics.tripsInProgress).toBeGreaterThanOrEqual(0);
        });

        it('should calculate average ETA correctly', async () => {
            const metrics = await reportingService.getDashboardMetrics('admin');

            expect(metrics.averageETA).toBeGreaterThanOrEqual(0);
            // Should be around 30 minutes based on our test data
            expect(metrics.averageETA).toBeLessThan(60);
        });
    });

    describe('scheduleReport', () => {
        it('should schedule a report successfully', async () => {
            const scheduleData = {
                templateId: 'usage-summary',
                name: 'Monthly Usage Report',
                description: 'Automated monthly usage summary',
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
                nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
                createdBy: testFinanceUser.id
            };

            const result = await reportingService.scheduleReport(scheduleData);

            expect(result).toBeDefined();
            expect(result.id).toBeDefined();
            expect(result.templateId).toBe('usage-summary');
            expect(result.name).toBe('Monthly Usage Report');
            expect(result.frequency).toBe('monthly');
            expect(result.active).toBe(true);
            expect(result.createdBy).toBe(testFinanceUser.id);
            expect(result.createdAt).toBeDefined();
            expect(result.updatedAt).toBeDefined();
        });

        it('should handle scheduling with complex filters', async () => {
            const scheduleData = {
                templateId: 'usage-summary',
                name: 'Engineering Department Report',
                frequency: 'weekly' as const,
                schedule: {
                    frequency: 'weekly' as const,
                    dayOfWeek: 1, // Monday
                    time: '08:00',
                    recipients: ['manager@example.com'],
                    active: true
                },
                recipients: ['manager@example.com'],
                format: 'pdf' as const,
                filters: {
                    department: 'Engineering',
                    minRides: 1
                },
                active: true,
                nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                createdBy: testFinanceUser.id
            };

            const result = await reportingService.scheduleReport(scheduleData);

            expect(result.filters).toEqual({
                department: 'Engineering',
                minRides: 1
            });
        });
    });

    describe('exportReport', () => {
        let mockReport: any;

        beforeEach(() => {
            mockReport = {
                id: 'test-report-123',
                templateId: 'usage-summary',
                requestId: 'request-123',
                data: [
                    {
                        userId: testUser.id,
                        userName: 'Test User',
                        ridesCount: 5,
                        totalDistance: 25,
                        totalCost: 500
                    },
                    {
                        userId: testDriver.id,
                        userName: 'Test Driver',
                        ridesCount: 3,
                        totalDistance: 15,
                        totalCost: 300
                    }
                ],
                metadata: {
                    totalRecords: 2,
                    filteredRecords: 2,
                    dateRange: {
                        start: new Date('2024-01-01'),
                        end: new Date('2024-01-31')
                    },
                    executionTime: 150,
                    dataSource: ['usage_ledgers'],
                    redactionApplied: false
                },
                generatedAt: new Date(),
                generatedBy: testFinanceUser.id,
                format: 'csv' as const
            };

            // Mock fs functions
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
            vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
        });

        it('should export report to CSV format', async () => {
            const filePath = await reportingService.exportReport(mockReport, 'csv');

            expect(filePath).toBeDefined();
            expect(filePath).toContain('.csv');
            expect(fs.mkdirSync).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should export report to JSON format', async () => {
            const filePath = await reportingService.exportReport(mockReport, 'json');

            expect(filePath).toBeDefined();
            expect(filePath).toContain('.json');
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should export report to PDF format', async () => {
            const filePath = await reportingService.exportReport(mockReport, 'pdf');

            expect(filePath).toBeDefined();
            expect(filePath).toContain('.txt'); // PDF export creates txt file in our mock
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should apply export options', async () => {
            const exportOptions: ReportExportOptions = {
                includeHeaders: true,
                dateFormat: 'YYYY-MM-DD',
                numberFormat: 'en-US',
                timezone: 'UTC',
                redactionLevel: 'partial',
                auditLog: true
            };

            const filePath = await reportingService.exportReport(mockReport, 'csv', exportOptions);

            expect(filePath).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should handle unsupported export format', async () => {
            await expect(reportingService.exportReport(mockReport, 'xml' as any))
                .rejects.toThrow('Unsupported export format: xml');
        });

        it('should skip audit logging when disabled', async () => {
            const exportOptions: ReportExportOptions = {
                includeHeaders: true,
                dateFormat: 'YYYY-MM-DD',
                numberFormat: 'en-US',
                timezone: 'UTC',
                redactionLevel: 'none',
                auditLog: false
            };

            const filePath = await reportingService.exportReport(mockReport, 'json', exportOptions);

            expect(filePath).toBeDefined();
            // Audit logging should be skipped, but we can't easily test this without mocking auditService
        });
    });

    describe('data aggregation', () => {
        it('should calculate usage metrics correctly', async () => {
            const reportRequest: ReportRequest = {
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
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.data.length).toBeGreaterThan(0);

            const userRecord = result.data.find(record => record.userId === testUser.id);
            expect(userRecord).toBeDefined();
            expect(userRecord.ridesCount).toBe(5);
            expect(userRecord.totalDistance).toBe(25); // 25km (converted from 25000m)
            expect(userRecord.totalCost).toBe(500);
            expect(userRecord.averageCostPerRide).toBe(100); // 500/5
            expect(userRecord.averageDistance).toBe(5); // 25/5
        });

        it('should aggregate cost analysis data correctly', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'cost-analysis',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-02-29')
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.data.length).toBeGreaterThan(0);

            const monthlyData = result.data[0];
            expect(monthlyData.totalRevenue).toBe(800); // 500 + 300
            expect(monthlyData.totalCosts).toBe(560); // 70% of revenue
            expect(monthlyData.profit).toBe(240); // revenue - costs
            expect(monthlyData.profitMargin).toBe(30); // (profit/revenue) * 100
        });

        it('should calculate efficiency metrics correctly', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'efficiency-metrics',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.data.length).toBeGreaterThan(0);

            const monthlyData = result.data[0];
            expect(monthlyData.totalTrips).toBeGreaterThanOrEqual(2);
            expect(monthlyData.completedTrips).toBeGreaterThanOrEqual(2);
            expect(monthlyData.completionRate).toBe(100); // All trips completed
        });
    });

    describe('role-based filtering', () => {
        it('should filter sensitive data for worker role', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: testUser.id,
                    role: 'worker'
                }
            };

            // This should fail due to role restrictions
            await expect(reportingService.generateReport(reportRequest))
                .rejects.toThrow('Insufficient permissions');
        });

        it('should allow full access for admin role', async () => {
            const adminUser = await TestDataFactory.createUser({
                role: 'admin',
                email: 'admin-full-access@example.com'
            });

            const reportRequest: ReportRequest = {
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: adminUser.id,
                    role: 'admin'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.metadata.redactionApplied).toBe(false);

            // Admin should see all data without redaction
            result.data.forEach(record => {
                if (record.userName) {
                    expect(record.userName).not.toBe('***REDACTED***');
                }
            });
        });

        it('should apply partial redaction for dispatcher role', async () => {
            const dispatcherUser = await TestDataFactory.createUser({
                role: 'dispatcher',
                email: 'dispatcher-partial@example.com'
            });

            const reportRequest: ReportRequest = {
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-01-01'),
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: dispatcherUser.id,
                    role: 'dispatcher'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.metadata.redactionApplied).toBe(true);

            // Dispatcher should see redacted sensitive fields
            result.data.forEach(record => {
                if (record.userName && typeof record.userName === 'string') {
                    expect(record.userName).toBe('***REDACTED***');
                }
                // But should see operational data
                expect(record.ridesCount).toBeDefined();
                expect(record.totalDistance).toBeDefined();
            });
        });
    });

    describe('error handling', () => {
        it('should handle database connection errors', async () => {
            // Mock database error
            const originalDb = reportingService['db'];
            reportingService['db'] = {
                ...originalDb,
                select: vi.fn().mockRejectedValue(new Error('Database connection failed'))
            };

            const reportRequest: ReportRequest = {
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
                }
            };

            await expect(reportingService.generateReport(reportRequest))
                .rejects.toThrow('Database connection failed');

            // Restore original db
            reportingService['db'] = originalDb;
        });

        it('should handle invalid date ranges', async () => {
            const reportRequest: ReportRequest = {
                templateId: 'usage-summary',
                period: 'monthly',
                dateRange: {
                    start: new Date('2024-02-01'), // Start after end
                    end: new Date('2024-01-31')
                },
                format: 'json',
                requestedBy: {
                    id: testFinanceUser.id,
                    role: 'finance'
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            // Should return empty results for invalid date range
            expect(result.data).toHaveLength(0);
            expect(result.metadata.totalRecords).toBe(0);
        });

        it('should handle file system errors during export', async () => {
            vi.mocked(fs.writeFileSync).mockImplementation(() => {
                throw new Error('File system error');
            });

            const mockReport = {
                id: 'test-report-error',
                data: [{ test: 'data' }],
                generatedBy: testFinanceUser.id
            };

            await expect(reportingService.exportReport(mockReport as any, 'csv'))
                .rejects.toThrow('File system error');
        });
    });

    describe('performance', () => {
        it('should complete report generation within reasonable time', async () => {
            const startTime = Date.now();

            const reportRequest: ReportRequest = {
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
                }
            };

            const result = await reportingService.generateReport(reportRequest);
            const executionTime = Date.now() - startTime;

            expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
            expect(result.metadata.executionTime).toBeGreaterThan(0);
            expect(result.metadata.executionTime).toBeLessThan(5000);
        });

        it('should handle large datasets efficiently', async () => {
            // Create additional test data to simulate larger dataset
            const promises = [];
            for (let i = 0; i < 10; i++) {
                const user = TestDataFactory.createUser({
                    email: `bulk-user-${i}@example.com`,
                    department: 'Bulk Test'
                });
                promises.push(user);
            }

            const bulkUsers = await Promise.all(promises);

            // Create usage ledgers for all bulk users
            const ledgerPromises = bulkUsers.map(user =>
                TestDataFactory.createUsageLedger(user.id, {
                    month: '2024-01',
                    rides_count: Math.floor(Math.random() * 10) + 1,
                    total_distance: Math.floor(Math.random() * 50000) + 1000,
                    total_duration: Math.floor(Math.random() * 300) + 30,
                    final_amount: Math.floor(Math.random() * 1000) + 100
                })
            );

            await Promise.all(ledgerPromises);

            const reportRequest: ReportRequest = {
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
                }
            };

            const result = await reportingService.generateReport(reportRequest);

            expect(result.data.length).toBeGreaterThanOrEqual(10);
            expect(result.metadata.executionTime).toBeLessThan(10000); // Should complete within 10 seconds even with more data
        });
    });
});