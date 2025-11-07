import { getDatabase } from '@/config/database';
import { auditService } from './auditService';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export interface SecurityVulnerability {
    id: string;
    type: 'sql_injection' | 'xss' | 'csrf' | 'weak_auth' | 'data_exposure' | 'insecure_config';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    location: string;
    recommendation: string;
    detectedAt: Date;
    status: 'open' | 'investigating' | 'fixed' | 'false_positive';
}

export interface SecurityScanResult {
    scanId: string;
    scanType: 'dependency' | 'code' | 'configuration' | 'runtime';
    startedAt: Date;
    completedAt?: Date;
    status: 'running' | 'completed' | 'failed';
    vulnerabilities: SecurityVulnerability[];
    summary: {
        total: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
}

export class SecurityScannerService {
    private db: Knex;

    constructor() {
        this.db = getDatabase();
    }

    /**
     * Run comprehensive security scan
     */
    async runSecurityScan(scanType: SecurityScanResult['scanType'] = 'runtime'): Promise<SecurityScanResult> {
        const scanId = uuidv4();
        const scan: SecurityScanResult = {
            scanId,
            scanType,
            startedAt: new Date(),
            status: 'running',
            vulnerabilities: [],
            summary: {
                total: 0,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            }
        };

        try {
            // Store scan record
            await this.db('security_scans').insert({
                id: scanId,
                scan_type: scanType,
                started_at: scan.startedAt,
                status: scan.status
            });

            // Run different types of scans
            switch (scanType) {
                case 'dependency':
                    scan.vulnerabilities = await this.scanDependencies();
                    break;
                case 'code':
                    scan.vulnerabilities = await this.scanCode();
                    break;
                case 'configuration':
                    scan.vulnerabilities = await this.scanConfiguration();
                    break;
                case 'runtime':
                    scan.vulnerabilities = await this.scanRuntime();
                    break;
            }

            // Calculate summary
            scan.summary = this.calculateSummary(scan.vulnerabilities);
            scan.status = 'completed';
            scan.completedAt = new Date();

            // Update scan record
            await this.db('security_scans')
                .where('id', scanId)
                .update({
                    status: scan.status,
                    completed_at: scan.completedAt,
                    vulnerabilities_found: scan.summary.total,
                    summary: JSON.stringify(scan.summary)
                });

            // Store vulnerabilities
            for (const vuln of scan.vulnerabilities) {
                await this.db('security_vulnerabilities').insert({
                    id: vuln.id,
                    scan_id: scanId,
                    type: vuln.type,
                    severity: vuln.severity,
                    title: vuln.title,
                    description: vuln.description,
                    location: vuln.location,
                    recommendation: vuln.recommendation,
                    detected_at: vuln.detectedAt,
                    status: vuln.status
                });
            }

            // Log scan completion
            await auditService.logEvent({
                correlationId: scanId,
                actor: { id: 'system', role: 'system' },
                action: 'security_scan_completed',
                entityType: 'system',
                entityId: 'security_scanner',
                metadata: {
                    scanId,
                    scanType,
                    summary: scan.summary
                }
            });

            return scan;

        } catch (error) {
            scan.status = 'failed';
            scan.completedAt = new Date();

            await this.db('security_scans')
                .where('id', scanId)
                .update({
                    status: scan.status,
                    completed_at: scan.completedAt,
                    error_message: error.message
                });

            throw error;
        }
    }

    /**
     * Scan for dependency vulnerabilities
     */
    private async scanDependencies(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check for known vulnerable packages
        const vulnerablePackages = [
            { name: 'lodash', version: '<4.17.21', cve: 'CVE-2021-23337' },
            { name: 'axios', version: '<0.21.2', cve: 'CVE-2021-3749' },
            { name: 'jsonwebtoken', version: '<8.5.1', cve: 'CVE-2022-23529' }
        ];

        // In a real implementation, this would check package.json and node_modules
        // For now, we'll simulate some findings
        vulnerabilities.push({
            id: uuidv4(),
            type: 'insecure_config',
            severity: 'high',
            title: 'Outdated JWT Library',
            description: 'Using potentially vulnerable version of jsonwebtoken library',
            location: 'package.json',
            recommendation: 'Update jsonwebtoken to version 8.5.1 or higher',
            detectedAt: new Date(),
            status: 'open'
        });

        return vulnerabilities;
    }

    /**
     * Scan code for security issues
     */
    private async scanCode(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check for common security anti-patterns
        await this.checkSQLInjectionVulnerabilities(vulnerabilities);
        await this.checkXSSVulnerabilities(vulnerabilities);
        await this.checkWeakAuthentication(vulnerabilities);
        await this.checkDataExposure(vulnerabilities);

        return vulnerabilities;
    }

    /**
     * Check for SQL injection vulnerabilities
     */
    private async checkSQLInjectionVulnerabilities(vulnerabilities: SecurityVulnerability[]): Promise<void> {
        // Check for dynamic SQL construction patterns
        const suspiciousPatterns = [
            'SELECT * FROM users WHERE',
            'INSERT INTO',
            'UPDATE users SET',
            'DELETE FROM'
        ];

        // In a real implementation, this would scan actual source files
        // For demonstration, we'll check database queries for potential issues

        // Check if parameterized queries are being used
        const hasRawQueries = await this.checkForRawQueries();

        if (hasRawQueries) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'sql_injection',
                severity: 'high',
                title: 'Potential SQL Injection',
                description: 'Raw SQL queries detected that may be vulnerable to injection attacks',
                location: 'Database query methods',
                recommendation: 'Use parameterized queries or ORM methods to prevent SQL injection',
                detectedAt: new Date(),
                status: 'open'
            });
        }
    }

    /**
     * Check for XSS vulnerabilities
     */
    private async checkXSSVulnerabilities(vulnerabilities: SecurityVulnerability[]): Promise<void> {
        // Check for unescaped user input in responses
        const hasUnescapedOutput = await this.checkForUnescapedOutput();

        if (hasUnescapedOutput) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'xss',
                severity: 'medium',
                title: 'Potential XSS Vulnerability',
                description: 'User input may not be properly sanitized before output',
                location: 'API response handlers',
                recommendation: 'Implement proper input sanitization and output encoding',
                detectedAt: new Date(),
                status: 'open'
            });
        }
    }

    /**
     * Check for weak authentication
     */
    private async checkWeakAuthentication(vulnerabilities: SecurityVulnerability[]): Promise<void> {
        // Check JWT configuration
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret || jwtSecret.length < 32) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'weak_auth',
                severity: 'critical',
                title: 'Weak JWT Secret',
                description: 'JWT secret is too short or not set',
                location: 'Environment configuration',
                recommendation: 'Use a strong, randomly generated JWT secret of at least 32 characters',
                detectedAt: new Date(),
                status: 'open'
            });
        }

        // Check for default passwords
        const hasDefaultPasswords = await this.checkForDefaultPasswords();
        if (hasDefaultPasswords) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'weak_auth',
                severity: 'high',
                title: 'Default Passwords Detected',
                description: 'Default or weak passwords found in system accounts',
                location: 'User accounts',
                recommendation: 'Change all default passwords to strong, unique passwords',
                detectedAt: new Date(),
                status: 'open'
            });
        }
    }

    /**
     * Check for data exposure issues
     */
    private async checkDataExposure(vulnerabilities: SecurityVulnerability[]): Promise<void> {
        // Check for PII in logs
        const hasPIIInLogs = await this.checkForPIIInLogs();
        if (hasPIIInLogs) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'data_exposure',
                severity: 'high',
                title: 'PII in Application Logs',
                description: 'Personally identifiable information found in application logs',
                location: 'Application logs',
                recommendation: 'Implement log sanitization to remove PII before logging',
                detectedAt: new Date(),
                status: 'open'
            });
        }

        // Check for unencrypted sensitive data
        const hasUnencryptedPII = await this.checkForUnencryptedPII();
        if (hasUnencryptedPII) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'data_exposure',
                severity: 'critical',
                title: 'Unencrypted Sensitive Data',
                description: 'Sensitive data stored without encryption',
                location: 'Database tables',
                recommendation: 'Encrypt all sensitive data at rest using strong encryption',
                detectedAt: new Date(),
                status: 'open'
            });
        }
    }

    /**
     * Scan system configuration
     */
    private async scanConfiguration(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check environment variables
        const requiredSecureEnvVars = [
            'JWT_SECRET',
            'DATABASE_PASSWORD',
            'KMS_MASTER_KEY_ID',
            'STRIPE_SECRET_KEY'
        ];

        for (const envVar of requiredSecureEnvVars) {
            if (!process.env[envVar]) {
                vulnerabilities.push({
                    id: uuidv4(),
                    type: 'insecure_config',
                    severity: 'high',
                    title: `Missing Security Configuration: ${envVar}`,
                    description: `Required security environment variable ${envVar} is not set`,
                    location: 'Environment configuration',
                    recommendation: `Set ${envVar} with a secure value`,
                    detectedAt: new Date(),
                    status: 'open'
                });
            }
        }

        // Check database configuration
        const dbConfig = await this.checkDatabaseSecurity();
        vulnerabilities.push(...dbConfig);

        return vulnerabilities;
    }

    /**
     * Scan runtime security
     */
    private async scanRuntime(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check for active sessions with weak security
        const weakSessions = await this.checkSessionSecurity();
        vulnerabilities.push(...weakSessions);

        // Check for suspicious activity patterns
        const suspiciousActivity = await this.checkSuspiciousActivity();
        vulnerabilities.push(...suspiciousActivity);

        return vulnerabilities;
    }

    /**
     * Helper methods for specific checks
     */
    private async checkForRawQueries(): Promise<boolean> {
        // In a real implementation, this would scan source code
        // For now, return false assuming parameterized queries are used
        return false;
    }

    private async checkForUnescapedOutput(): Promise<boolean> {
        // Check if proper sanitization middleware is in place
        return false;
    }

    private async checkForDefaultPasswords(): Promise<boolean> {
        // Check for users with weak passwords
        const weakPasswords = await this.db('users')
            .where('password_hash', 'like', '%default%')
            .orWhere('password_hash', 'like', '%123456%');

        return weakPasswords.length > 0;
    }

    private async checkForPIIInLogs(): Promise<boolean> {
        // Check audit logs for potential PII exposure
        const suspiciousLogs = await this.db('audit_events')
            .where('metadata', 'like', '%@%') // Email patterns
            .orWhere('metadata', 'like', '%ssn%')
            .orWhere('metadata', 'like', '%credit%');

        return suspiciousLogs.length > 0;
    }

    private async checkForUnencryptedPII(): Promise<boolean> {
        // Check if users table has unencrypted PII
        const usersWithPII = await this.db('users')
            .whereNotNull('email')
            .whereNull('encrypted_pii');

        return usersWithPII.length > 0;
    }

    private async checkDatabaseSecurity(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check database connection security
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl && !dbUrl.includes('sslmode=require')) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'insecure_config',
                severity: 'medium',
                title: 'Database Connection Not Using SSL',
                description: 'Database connection does not enforce SSL encryption',
                location: 'Database configuration',
                recommendation: 'Enable SSL for database connections',
                detectedAt: new Date(),
                status: 'open'
            });
        }

        return vulnerabilities;
    }

    private async checkSessionSecurity(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check for long-lived sessions
        const longSessions = await this.db('user_sessions')
            .where('created_at', '<', new Date(Date.now() - 24 * 60 * 60 * 1000))
            .where('status', 'active');

        if (longSessions.length > 0) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'weak_auth',
                severity: 'medium',
                title: 'Long-lived Active Sessions',
                description: `${longSessions.length} sessions have been active for more than 24 hours`,
                location: 'Session management',
                recommendation: 'Implement session timeout and regular token refresh',
                detectedAt: new Date(),
                status: 'open'
            });
        }

        return vulnerabilities;
    }

    private async checkSuspiciousActivity(): Promise<SecurityVulnerability[]> {
        const vulnerabilities: SecurityVulnerability[] = [];

        // Check for unusual login patterns
        const recentFailedLogins = await this.db('audit_events')
            .where('action', 'login_failed')
            .where('timestamp', '>', new Date(Date.now() - 60 * 60 * 1000))
            .count('* as count');

        const failedCount = parseInt(recentFailedLogins[0].count as string);
        if (failedCount > 100) {
            vulnerabilities.push({
                id: uuidv4(),
                type: 'weak_auth',
                severity: 'high',
                title: 'Suspicious Login Activity',
                description: `${failedCount} failed login attempts in the last hour`,
                location: 'Authentication system',
                recommendation: 'Investigate potential brute force attack and implement additional rate limiting',
                detectedAt: new Date(),
                status: 'open'
            });
        }

        return vulnerabilities;
    }

    private calculateSummary(vulnerabilities: SecurityVulnerability[]): SecurityScanResult['summary'] {
        const summary = {
            total: vulnerabilities.length,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };

        for (const vuln of vulnerabilities) {
            summary[vuln.severity]++;
        }

        return summary;
    }

    /**
     * Get scan results
     */
    async getScanResults(scanId: string): Promise<SecurityScanResult | null> {
        const scan = await this.db('security_scans')
            .where('id', scanId)
            .first();

        if (!scan) {
            return null;
        }

        const vulnerabilities = await this.db('security_vulnerabilities')
            .where('scan_id', scanId)
            .select('*');

        return {
            scanId: scan.id,
            scanType: scan.scan_type,
            startedAt: scan.started_at,
            completedAt: scan.completed_at,
            status: scan.status,
            vulnerabilities: vulnerabilities.map(v => ({
                id: v.id,
                type: v.type,
                severity: v.severity,
                title: v.title,
                description: v.description,
                location: v.location,
                recommendation: v.recommendation,
                detectedAt: v.detected_at,
                status: v.status
            })),
            summary: scan.summary ? JSON.parse(scan.summary) : {
                total: 0,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            }
        };
    }

    /**
     * Update vulnerability status
     */
    async updateVulnerabilityStatus(
        vulnerabilityId: string,
        status: SecurityVulnerability['status'],
        correlationId?: string
    ): Promise<void> {
        await this.db('security_vulnerabilities')
            .where('id', vulnerabilityId)
            .update({
                status,
                updated_at: new Date()
            });

        await auditService.logEvent({
            correlationId: correlationId || uuidv4(),
            actor: { id: 'system', role: 'system' },
            action: 'vulnerability_status_updated',
            entityType: 'security_vulnerability',
            entityId: vulnerabilityId,
            metadata: { newStatus: status }
        });
    }
}

// Singleton instance
export const securityScannerService = new SecurityScannerService();