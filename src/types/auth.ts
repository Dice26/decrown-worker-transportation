export type UserRole = 'worker' | 'driver' | 'dispatcher' | 'finance' | 'admin';

export interface User {
    id: string;
    email: string;
    role: UserRole;
    department: string;
    status: 'active' | 'suspended' | 'pending' | 'inactive';
    consentFlags: ConsentFlags;
    paymentTokenRef?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ConsentFlags {
    locationTracking: boolean;
    dataProcessing: boolean;
    marketingCommunications: boolean;
    consentVersion: string;
    consentDate: Date;
}

export interface JWTPayload {
    userId: string;
    email: string;
    role: UserRole;
    permissions: string[];
    iat: number;
    exp: number;
}

export interface RefreshTokenPayload {
    userId: string;
    tokenId: string;
    iat: number;
    exp: number;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface LoginRequest {
    email: string;
    password: string;
    deviceFingerprint?: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    role: UserRole;
    department: string;
    deviceFingerprint?: string;
}

export interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        email: string;
        role: UserRole;
        permissions: string[];
    };
    correlationId: string;
}