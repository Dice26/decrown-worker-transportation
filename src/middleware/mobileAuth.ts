import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/authService';
import { DeviceService } from '@/services/deviceService';
import { AppError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { AuthenticatedRequest } from '@/types/auth';
import crypto from 'crypto';

const authService = new AuthService();
const deviceService = new DeviceService();

export interface MobileAuthRequest extends AuthenticatedRequest {
    device?: {
        id: string;
        fingerprint: string;
        trustLevel: number;
        isSecure: boolean;
    };
    biometricAuth?: {
        verified: boolean;
        method: 'fingerprint' | 'face' | 'voice';
    };
}

/**
 * Mobile-specific authentication middleware with device binding
 */
export function mobileAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string;
    const appVersion = req.headers['x-app-version'] as string;

    if (!token) {
        throw new AppError('Access token required', 401, 'MISSING_TOKEN');
    }

    if (!deviceFingerprint) {
        throw new AppError('Device fingerprint required for mobile access', 401, 'MISSING_DEVICE_FINGERPRINT');
    }

    authService.validateAccessToken(token)
        .then(async payload => {
            // Add user info to request
            (req as MobileAuthRequest).user = {
                id: payload.userId,
                email: payload.email,
                role: payload.role,
                permissions: payload.permissions
            };

            (req as MobileAuthRequest).correlationId = req.headers['x-correlation-id'] as string;

            // Verify device binding
            const devices = await deviceService.getDevicesByUser(payload.userId);
            const boundDevice = devices.find(d => d.deviceFingerprint === deviceFingerprint && d.status === 'active');

            if (!boundDevice) {
                logger.warn('Unbound device attempting access', {
                    userId: payload.userId,
                    deviceFingerprint: deviceFingerprint.substring(0, 8) + '...',
                    correlationId: req.headers['x-correlation-id']
                });
                throw new AppError('Device not registered or inactive', 403, 'DEVICE_NOT_BOUND');
            }

            // Check device security
            const isSecure = await deviceService.enforceDeviceSecurity(boundDevice.id, payload.userId);
            if (!isSecure) {
                throw new AppError('Device security check failed', 403, 'DEVICE_SECURITY_FAILED');
            }

            // Add device info to request
            (req as MobileAuthRequest).device = {
                id: boundDevice.id,
                fingerprint: boundDevice.deviceFingerprint,
                trustLevel: boundDevice.trustLevel,
                isSecure
            };

            // Update device last seen and app version if provided
            if (appVersion && appVersion !== boundDevice.appVersion) {
                await deviceService.updateDevice(boundDevice.id, payload.userId, {
                    appVersion,
                });
            }

            next();
        })
        .catch(error => {
            logger.warn('Mobile token validation failed', {
                error: error.message,
                deviceFingerprint: deviceFingerprint?.substring(0, 8) + '...',
                correlationId: req.headers['x-correlation-id']
            });
            next(error);
        });
}

/**
 * Biometric authentication verification middleware
 */
export function biometricAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const biometricToken = req.headers['x-biometric-token'] as string;
    const biometricMethod = req.headers['x-biometric-method'] as 'fingerprint' | 'face' | 'voice';

    if (!biometricToken || !biometricMethod) {
        throw new AppError('Biometric authentication required', 401, 'BIOMETRIC_AUTH_REQUIRED');
    }

    // Verify biometric token (in real implementation, this would validate against stored biometric hash)
    const isValidBiometric = verifyBiometricToken(biometricToken, biometricMethod);

    if (!isValidBiometric) {
        logger.warn('Biometric authentication failed', {
            method: biometricMethod,
            correlationId: req.headers['x-correlation-id']
        });
        throw new AppError('Biometric authentication failed', 401, 'BIOMETRIC_AUTH_FAILED');
    }

    // Add biometric auth info to request
    (req as MobileAuthRequest).biometricAuth = {
        verified: true,
        method: biometricMethod
    };

    next();
}

/**
 * Certificate pinning validation middleware
 */
export function certificatePinningMiddleware(req: Request, res: Response, next: NextFunction): void {
    const clientCertHash = req.headers['x-cert-hash'] as string;
    const expectedCertHashes = process.env.MOBILE_CERT_PINS?.split(',') || [];

    if (!clientCertHash) {
        throw new AppError('Certificate hash required', 400, 'MISSING_CERT_HASH');
    }

    if (!expectedCertHashes.includes(clientCertHash)) {
        logger.warn('Certificate pinning validation failed', {
            providedHash: clientCertHash.substring(0, 16) + '...',
            correlationId: req.headers['x-correlation-id']
        });
        throw new AppError('Certificate validation failed', 403, 'CERT_PINNING_FAILED');
    }

    next();
}

/**
 * Mobile security headers middleware
 */
export function mobileSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
    // Set mobile-specific security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");

    // Mobile app specific headers
    res.setHeader('X-Mobile-API-Version', process.env.MOBILE_API_VERSION || '1.0');
    res.setHeader('X-App-Integrity-Check', 'required');

    next();
}

/**
 * Device trust level enforcement middleware
 */
export function requireTrustLevel(minTrustLevel: 'low' | 'medium' | 'high') {
    const trustThresholds = {
        low: 30,
        medium: 60,
        high: 85
    };

    return (req: Request, res: Response, next: NextFunction): void => {
        const mobileReq = req as MobileAuthRequest;

        if (!mobileReq.device) {
            throw new AppError('Device information required', 400, 'DEVICE_INFO_REQUIRED');
        }

        const requiredScore = trustThresholds[minTrustLevel];
        if (mobileReq.device.trustLevel < requiredScore) {
            logger.warn('Device trust level insufficient', {
                deviceId: mobileReq.device.id,
                currentTrustLevel: mobileReq.device.trustLevel,
                requiredTrustLevel: requiredScore,
                userId: mobileReq.user?.id,
                correlationId: mobileReq.correlationId
            });

            throw new AppError(
                `Device trust level insufficient. Required: ${minTrustLevel}`,
                403,
                'INSUFFICIENT_TRUST_LEVEL'
            );
        }

        next();
    };
}

/**
 * App integrity validation middleware
 */
export function appIntegrityMiddleware(req: Request, res: Response, next: NextFunction): void {
    const appSignature = req.headers['x-app-signature'] as string;
    const appVersion = req.headers['x-app-version'] as string;
    const packageName = req.headers['x-package-name'] as string;

    if (!appSignature || !appVersion || !packageName) {
        throw new AppError('App integrity headers required', 400, 'MISSING_INTEGRITY_HEADERS');
    }

    // Validate app signature (in real implementation, verify against known app signatures)
    const isValidApp = validateAppIntegrity(appSignature, appVersion, packageName);

    if (!isValidApp) {
        logger.warn('App integrity validation failed', {
            packageName,
            appVersion,
            correlationId: req.headers['x-correlation-id']
        });
        throw new AppError('App integrity validation failed', 403, 'APP_INTEGRITY_FAILED');
    }

    next();
}

// Helper functions

function verifyBiometricToken(token: string, method: string): boolean {
    // In a real implementation, this would:
    // 1. Decrypt the biometric token
    // 2. Verify it against stored biometric template hash
    // 3. Check token expiration
    // 4. Validate the biometric method matches stored preference

    // For now, we'll do basic token validation
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const tokenData = JSON.parse(decoded);

        return tokenData.method === method &&
            tokenData.timestamp &&
            (Date.now() - tokenData.timestamp) < 300000; // 5 minutes
    } catch {
        return false;
    }
}

function validateAppIntegrity(signature: string, version: string, packageName: string): boolean {
    // In a real implementation, this would:
    // 1. Verify the app signature against known certificates
    // 2. Check if the app version is supported
    // 3. Validate the package name matches expected values
    // 4. Perform additional integrity checks

    const validPackageNames = [
        'com.decrown.worker',
        'com.decrown.driver'
    ];

    const supportedVersions = process.env.SUPPORTED_APP_VERSIONS?.split(',') || ['1.0.0'];

    return validPackageNames.includes(packageName) &&
        supportedVersions.includes(version) &&
        signature.length > 0;
}

/**
 * Generate device fingerprint from request headers and client info
 */
export function generateDeviceFingerprint(req: Request): string {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const deviceModel = req.headers['x-device-model'] || '';
    const osVersion = req.headers['x-os-version'] || '';
    const screenResolution = req.headers['x-screen-resolution'] || '';
    const timezone = req.headers['x-timezone'] || '';

    const fingerprintData = [
        userAgent,
        acceptLanguage,
        deviceModel,
        osVersion,
        screenResolution,
        timezone
    ].join('|');

    return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}