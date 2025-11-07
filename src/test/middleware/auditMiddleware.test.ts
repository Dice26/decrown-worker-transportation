import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { auditMiddleware, logAuditEvent } from '@/middleware/auditMiddleware';
import { auditService } from '@/services/auditService';
import { TestDataFactory } from '@/test/helpers/testData';
import { AuthenticatedRequest } from '@/types/auth';

// Mock the audit service
vi.mock('@/services/auditService', () => ({
    auditService: {
        logEvent: vi.fn()
    }
}));

describe('AuditMiddleware', () => {
    let testUser: any;
    let mockRequest: Partial<AuthenticatedRequest>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let mockJson: any;

    beforeEach(async () => {
        testUser = await TestDataFactory.createUser({
            role: 'admin',
            email: 'audit-middleware-test@example.com'
        });

        mockJson = vi.fn();

        mockRequest = {
            user: {
                id: testUser.id,
                email: testUser.email,
                role: testUser.role,
                permissions: ['read', 'write']
            },
            correlationId: 'test-correlation-123',
            method: 'POST',
            path: '/api/v1/users',
            params: { id: 'user-123' },
            body: { name: 'Test User', email: 'test@example.com' },
            ip: '192.168.1.1',
            get: vi.fn((header: string) => {
                if (header === 'User-Agent') return 'Test User Agent';
                return undefined;
            })
        };

        mockResponse = {
            statusCode: 200,
            json: mockJson
        };

        mockNext = vi.fn();

        // Clear mock calls
        vi.clearAllMocks();
    });

    describe('auditMiddleware', () => {
        it('should set up audit information on request', () => {
            const middleware = auditMiddleware(
                'user.created',
                'user',
                (req) => req.params.id
            );

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            expect(mockRequest.auditAction).toBe('user.created');
            expect(mockRequest.auditEntityType).toBe('user');
            expect(mockRequest.auditEntityId).toBe('user-123');
            expect(mockRequest.auditMetadata).toEqual({
                method: 'POST',
                path: '/api/v1/users',
                userAgent: 'Test User Agent',
                ip: '192.168.1.1'
            });
            expect(mockRequest.originalBody).toEqual({
                name: 'Test User',
                email: 'test@example.com'
            });
            expect(mockNext).toHaveBeenCalled();
        });

        it('should override response.json to log audit events', async () => {
            const middleware = auditMiddleware('user.created', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123', name: 'Test User' };

            // Call the overridden json method
            mockResponse.json!(responseData);

            // Wait for async audit logging
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockJson).toHaveBeenCalledWith(responseData);
            expect(auditService.logEvent).toHaveBeenCalledWith({
                correlationId: 'test-correlation-123',
                actor: {
                    id: testUser.id,
                    role: testUser.role,
                    ipAddress: '192.168.1.1'
                },
                action: 'user.created',
                entityType: 'user',
                entityId: 'unknown', // No getEntityId function provided
                diff: {
                    before: null,
                    after: responseData
                },
                metadata: expect.objectContaining({
                    method: 'POST',
                    path: '/api/v1/users',
                    userAgent: 'Test User Agent',
                    requestSize: expect.any(Number),
                    responseSize: expect.any(Number),
                    processingTime: expect.any(Number)
                })
            });
        });

        it('should not log audit events for error responses', async () => {
            const middleware = auditMiddleware('user.created', 'user');

            mockResponse.statusCode = 400; // Error status

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { error: 'Bad Request' };
            mockResponse.json!(responseData);

            // Wait for potential async audit logging
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(auditService.logEvent).not.toHaveBeenCalled();
        });

        it('should create appropriate diff for POST requests', async () => {
            const middleware = auditMiddleware('user.created', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123', name: 'Test User' };
            mockResponse.json!(responseData);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(auditService.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    diff: {
                        before: null,
                        after: responseData
                    }
                })
            );
        });

        it('should create appropriate diff for PUT requests', async () => {
            mockRequest.method = 'PUT';

            const middleware = auditMiddleware('user.updated', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123', name: 'Updated User' };
            mockResponse.json!(responseData);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(auditService.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    diff: {
                        before: mockRequest.originalBody,
                        after: responseData
                    }
                })
            );
        });

        it('should create appropriate diff for DELETE requests', async () => {
            mockRequest.method = 'DELETE';

            const middleware = auditMiddleware('user.deleted', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123', deleted: true };
            mockResponse.json!(responseData);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(auditService.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    diff: {
                        before: responseData,
                        after: null
                    }
                })
            );
        });

        it('should not create diff for GET requests', async () => {
            mockRequest.method = 'GET';

            const middleware = auditMiddleware('user.accessed', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123', name: 'Test User' };
            mockResponse.json!(responseData);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(auditService.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    diff: undefined
                })
            );
        });

        it('should use custom entity ID function', async () => {
            const getEntityId = (req: AuthenticatedRequest) => `custom-${req.params.id}`;
            const middleware = auditMiddleware('user.created', 'user', getEntityId);

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123' };
            mockResponse.json!(responseData);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(auditService.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    entityId: 'custom-user-123'
                })
            );
        });

        it('should handle requests without user context', () => {
            mockRequest.user = undefined;

            const middleware = auditMiddleware('user.created', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123' };
            mockResponse.json!(responseData);

            expect(mockNext).toHaveBeenCalled();
            // Should not attempt to log audit event without user
        });

        it('should handle audit logging errors gracefully', async () => {
            // Mock audit service to throw error
            (auditService.logEvent as any).mockRejectedValue(new Error('Audit logging failed'));

            const middleware = auditMiddleware('user.created', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            const responseData = { id: 'user-123' };
            mockResponse.json!(responseData);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should not throw error, just log it
            expect(mockJson).toHaveBeenCalledWith(responseData);
        });
    });

    describe('logAuditEvent', () => {
        it('should log manual audit event', async () => {
            await logAuditEvent(
                mockRequest as AuthenticatedRequest,
                'user.accessed',
                'user',
                'user-123',
                { customField: 'customValue' },
                { before: { name: 'Old' }, after: { name: 'New' } }
            );

            expect(auditService.logEvent).toHaveBeenCalledWith({
                correlationId: 'test-correlation-123',
                actor: {
                    id: testUser.id,
                    role: testUser.role,
                    ipAddress: '192.168.1.1'
                },
                action: 'user.accessed',
                entityType: 'user',
                entityId: 'user-123',
                diff: {
                    before: { name: 'Old' },
                    after: { name: 'New' }
                },
                metadata: {
                    method: 'POST',
                    path: '/api/v1/users',
                    userAgent: 'Test User Agent',
                    customField: 'customValue'
                }
            });
        });

        it('should handle manual audit logging without optional parameters', async () => {
            await logAuditEvent(
                mockRequest as AuthenticatedRequest,
                'user.accessed',
                'user',
                'user-123'
            );

            expect(auditService.logEvent).toHaveBeenCalledWith({
                correlationId: 'test-correlation-123',
                actor: {
                    id: testUser.id,
                    role: testUser.role,
                    ipAddress: '192.168.1.1'
                },
                action: 'user.accessed',
                entityType: 'user',
                entityId: 'user-123',
                diff: undefined,
                metadata: {
                    method: 'POST',
                    path: '/api/v1/users',
                    userAgent: 'Test User Agent'
                }
            });
        });

        it('should throw error when audit logging fails', async () => {
            (auditService.logEvent as any).mockRejectedValue(new Error('Audit logging failed'));

            await expect(
                logAuditEvent(
                    mockRequest as AuthenticatedRequest,
                    'user.accessed',
                    'user',
                    'user-123'
                )
            ).rejects.toThrow('Audit logging failed');
        });
    });

    describe('edge cases', () => {
        it('should handle requests without body', () => {
            mockRequest.body = undefined;

            const middleware = auditMiddleware('user.accessed', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            expect(mockRequest.originalBody).toBeUndefined();
            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle requests without params', () => {
            mockRequest.params = {};

            const middleware = auditMiddleware('user.created', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            expect(mockRequest.auditEntityId).toBeUndefined();
            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle missing User-Agent header', () => {
            (mockRequest.get as any).mockReturnValue(undefined);

            const middleware = auditMiddleware('user.created', 'user');

            middleware(
                mockRequest as AuthenticatedRequest,
                mockResponse as Response,
                mockNext
            );

            expect(mockRequest.auditMetadata?.userAgent).toBeUndefined();
            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle circular JSON in request body', () => {
            const circularObj: any = { name: 'Test' };
            circularObj.self = circularObj;
            mockRequest.body = circularObj;

            const middleware = auditMiddleware('user.created', 'user');

            // Should not throw error
            expect(() => {
                middleware(
                    mockRequest as AuthenticatedRequest,
                    mockResponse as Response,
                    mockNext
                );
            }).not.toThrow();

            expect(mockNext).toHaveBeenCalled();
        });
    });
});