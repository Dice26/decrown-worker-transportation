import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticateToken, requirePermission, requireRole } from '@/middleware/auth';
import { AuthService } from '@/services/authService';
import { TestDataFactory } from '@/test/helpers/testData';
import { AppError } from '@/middleware/errorHandler';

// Mock AuthService
vi.mock('@/services/authService');

describe('Auth Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let mockAuthService: any;

    beforeEach(() => {
        mockReq = {
            headers: {
                'x-correlation-id': 'test-correlation-id'
            }
        };
        mockRes = {};
        mockNext = vi.fn();

        // Reset mocks
        vi.clearAllMocks();

        // Create mock AuthService instance
        mockAuthService = {
            validateAccessToken: vi.fn(),
            hasPermission: vi.fn()
        };

        // Mock the AuthService constructor
        vi.mocked(AuthService).mockImplementation(() => mockAuthService);
    });

    describe('authenticateToken', () => {
        it('should authenticate valid token successfully', async () => {
            const mockPayload = {
                userId: 'test-user-id',
                email: 'test@example.com',
                role: 'worker',
                permissions: ['location:share']
            };

            mockReq.headers!.authorization = 'Bearer valid-token';
            mockAuthService.validateAccessToken.mockResolvedValue(mockPayload);

            await new Promise<void>((resolve) => {
                mockNext.mockImplementation(() => resolve());
                authenticateToken(mockReq as Request, mockRes as Response, mockNext);
            });

            expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('valid-token');
            expect((mockReq as any).user).toEqual({
                id: mockPayload.userId,
                email: mockPayload.email,
                role: mockPayload.role,
                permissions: mockPayload.permissions
            });
            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should throw error when no authorization header', () => {
            expect(() => {
                authenticateToken(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });

        it('should throw error when no token in authorization header', () => {
            mockReq.headers!.authorization = 'Bearer';

            expect(() => {
                authenticateToken(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });

        it('should handle token validation error', async () => {
            mockReq.headers!.authorization = 'Bearer invalid-token';
            mockAuthService.validateAccessToken.mockRejectedValue(new AppError('Invalid token', 401));

            await new Promise<void>((resolve) => {
                mockNext.mockImplementation((error) => {
                    expect(error).toBeInstanceOf(AppError);
                    resolve();
                });
                authenticateToken(mockReq as Request, mockRes as Response, mockNext);
            });

            expect(mockAuthService.validateAccessToken).toHaveBeenCalledWith('invalid-token');
        });
    });

    describe('requirePermission', () => {
        it('should allow access with required permission', () => {
            (mockReq as any).user = {
                id: 'test-user-id',
                permissions: ['trips:read', 'trips:update']
            };

            mockAuthService.hasPermission.mockReturnValue(true);

            const middleware = requirePermission('trips:read');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockAuthService.hasPermission).toHaveBeenCalledWith(['trips:read', 'trips:update'], 'trips:read');
            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should deny access without required permission', () => {
            (mockReq as any).user = {
                id: 'test-user-id',
                permissions: ['trips:read']
            };

            mockAuthService.hasPermission.mockReturnValue(false);

            const middleware = requirePermission('users:read');

            expect(() => {
                middleware(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });

        it('should throw error when user not authenticated', () => {
            const middleware = requirePermission('trips:read');

            expect(() => {
                middleware(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });
    });

    describe('requireRole', () => {
        it('should allow access with required role', () => {
            (mockReq as any).user = {
                id: 'test-user-id',
                role: 'admin'
            };

            const middleware = requireRole('admin');
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should allow access with one of multiple required roles', () => {
            (mockReq as any).user = {
                id: 'test-user-id',
                role: 'dispatcher'
            };

            const middleware = requireRole(['admin', 'dispatcher']);
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should deny access without required role', () => {
            (mockReq as any).user = {
                id: 'test-user-id',
                role: 'worker'
            };

            const middleware = requireRole('admin');

            expect(() => {
                middleware(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });

        it('should throw error when user not authenticated', () => {
            const middleware = requireRole('admin');

            expect(() => {
                middleware(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });
    });
});