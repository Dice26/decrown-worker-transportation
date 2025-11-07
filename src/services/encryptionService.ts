import crypto from 'crypto';

export interface EncryptionResult {
    encryptedData: Buffer;
    keyId: string;
    algorithm: string;
}

export interface DecryptionResult {
    decryptedData: Buffer;
}

export class EncryptionService {
    private kmsClient: any;
    private masterKeyId: string;
    private algorithm = 'aes-256-gcm';
    private useKMS: boolean;

    constructor() {
        this.useKMS = process.env.NODE_ENV === 'production' && !!process.env.KMS_MASTER_KEY_ID;
        this.masterKeyId = process.env.KMS_MASTER_KEY_ID || 'local-dev-key';

        if (this.useKMS) {
            this.initializeKMS();
        }
    }

    private async initializeKMS() {
        try {
            const { KMSClient } = await import('@aws-sdk/client-kms');
            this.kmsClient = new KMSClient({
                region: process.env.AWS_REGION || 'us-east-1'
            });
        } catch (error) {
            console.warn('AWS KMS not available, using local encryption');
            this.useKMS = false;
        }
    }

    /**
     * Encrypt PII data using envelope encryption with KMS or local encryption
     */
    async encryptPII(data: string | Buffer): Promise<EncryptionResult> {
        try {
            if (this.useKMS && this.kmsClient) {
                return await this.encryptWithKMS(data);
            } else {
                return await this.encryptLocally(data);
            }
        } catch (error) {
            throw new Error(`Encryption failed: ${(error as Error).message}`);
        }
    }

    private async encryptWithKMS(data: string | Buffer): Promise<EncryptionResult> {
        const { GenerateDataKeyCommand } = await import('@aws-sdk/client-kms');

        // Generate data encryption key
        const generateKeyCommand = new GenerateDataKeyCommand({
            KeyId: this.masterKeyId,
            KeySpec: 'AES_256'
        });

        const keyResult = await this.kmsClient.send(generateKeyCommand);
        const dataKey = keyResult.Plaintext!;
        const encryptedDataKey = keyResult.CiphertextBlob!;

        // Encrypt data with the data key
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', dataKey);

        let encrypted = cipher.update(data, 'utf8');
        cipher.final();
        const authTag = cipher.getAuthTag();

        // Combine encrypted data key, IV, auth tag, and encrypted data
        const result = Buffer.concat([
            Buffer.from(encryptedDataKey),
            iv,
            authTag,
            encrypted
        ]);

        // Clear the plaintext data key from memory
        dataKey.fill(0);

        return {
            encryptedData: result,
            keyId: this.masterKeyId,
            algorithm: this.algorithm
        };
    }

    private async encryptLocally(data: string | Buffer): Promise<EncryptionResult> {
        // Use local encryption for development/testing
        const key = crypto.scryptSync(this.masterKeyId, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', key);

        let encrypted = cipher.update(data, 'utf8');
        cipher.final();
        const authTag = cipher.getAuthTag();

        const result = Buffer.concat([iv, authTag, encrypted]);

        return {
            encryptedData: result,
            keyId: this.masterKeyId,
            algorithm: this.algorithm
        };
    }

    /**
     * Decrypt PII data using envelope encryption with KMS or local decryption
     */
    async decryptPII(encryptedResult: EncryptionResult): Promise<DecryptionResult> {
        try {
            if (this.useKMS && this.kmsClient) {
                return await this.decryptWithKMS(encryptedResult);
            } else {
                return await this.decryptLocally(encryptedResult);
            }
        } catch (error) {
            throw new Error(`Decryption failed: ${(error as Error).message}`);
        }
    }

    private async decryptWithKMS(encryptedResult: EncryptionResult): Promise<DecryptionResult> {
        const { DecryptCommand } = await import('@aws-sdk/client-kms');
        const { encryptedData } = encryptedResult;

        // Extract components
        const encryptedDataKeyLength = 256; // Typical KMS encrypted key length
        const ivLength = 16;
        const authTagLength = 16;

        const encryptedDataKey = encryptedData.slice(0, encryptedDataKeyLength);
        const iv = encryptedData.slice(encryptedDataKeyLength, encryptedDataKeyLength + ivLength);
        const authTag = encryptedData.slice(
            encryptedDataKeyLength + ivLength,
            encryptedDataKeyLength + ivLength + authTagLength
        );
        const ciphertext = encryptedData.slice(encryptedDataKeyLength + ivLength + authTagLength);

        // Decrypt the data key using KMS
        const decryptCommand = new DecryptCommand({
            CiphertextBlob: encryptedDataKey
        });

        const keyResult = await this.kmsClient.send(decryptCommand);
        const dataKey = keyResult.Plaintext!;

        // Decrypt the data
        const decipher = crypto.createDecipher('aes-256-gcm', dataKey);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, null, 'utf8');
        decrypted += decipher.final('utf8');

        // Clear the plaintext data key from memory
        dataKey.fill(0);

        return {
            decryptedData: Buffer.from(decrypted, 'utf8')
        };
    }

    private async decryptLocally(encryptedResult: EncryptionResult): Promise<DecryptionResult> {
        const { encryptedData } = encryptedResult;
        const key = crypto.scryptSync(this.masterKeyId, 'salt', 32);

        // Extract components
        const ivLength = 16;
        const authTagLength = 16;

        const iv = encryptedData.slice(0, ivLength);
        const authTag = encryptedData.slice(ivLength, ivLength + authTagLength);
        const ciphertext = encryptedData.slice(ivLength + authTagLength);

        // Decrypt the data
        const decipher = crypto.createDecipher('aes-256-gcm', key);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, null, 'utf8');
        decrypted += decipher.final('utf8');

        return {
            decryptedData: Buffer.from(decrypted, 'utf8')
        };
    }

    /**
     * Hash sensitive data for searching while maintaining privacy
     */
    hashForSearch(data: string, salt?: string): string {
        const searchSalt = salt || process.env.SEARCH_SALT || 'default-search-salt';
        return crypto.createHmac('sha256', searchSalt)
            .update(data.toLowerCase().trim())
            .digest('hex');
    }

    /**
     * Generate secure random token
     */
    generateSecureToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Create hash chain for tamper detection
     */
    createHashChain(data: any, previousHash?: string): string {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        const input = previousHash ? `${previousHash}:${dataString}` : dataString;

        return crypto.createHash('sha256')
            .update(input)
            .digest('hex');
    }

    /**
     * Verify hash chain integrity
     */
    verifyHashChain(data: any, hash: string, previousHash?: string): boolean {
        const expectedHash = this.createHashChain(data, previousHash);
        return crypto.timingSafeEqual(
            Buffer.from(hash, 'hex'),
            Buffer.from(expectedHash, 'hex')
        );
    }

    /**
     * Redact PII from data for logging/audit purposes
     */
    redactPII(data: any, userRole: string = 'user'): any {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const redacted = { ...data };
        const piiFields = [
            'email', 'phone', 'address', 'ssn', 'creditCard', 'bankAccount',
            'firstName', 'lastName', 'fullName', 'dateOfBirth'
        ];

        const isAdmin = userRole === 'admin';

        for (const field of piiFields) {
            if (redacted[field]) {
                if (isAdmin) {
                    // Admins get partial redaction
                    redacted[field] = this.partialRedact(redacted[field], field);
                } else {
                    // Non-admins get full redaction
                    redacted[field] = this.fullRedact(redacted[field], field);
                }
            }
        }

        // Recursively redact nested objects
        for (const key in redacted) {
            if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = this.redactPII(redacted[key], userRole);
            }
        }

        return redacted;
    }

    private partialRedact(value: string, field: string): string {
        switch (field) {
            case 'email':
                const [local, domain] = value.split('@');
                return `${local.slice(0, 2)}****@${domain}`;
            case 'phone':
                return `****${value.slice(-4)}`;
            case 'address':
                const parts = value.split(' ');
                return `*** ${parts.slice(1).join(' ')}`;
            case 'creditCard':
                return `****-****-****-${value.slice(-4)}`;
            default:
                return `****${value.slice(-2)}`;
        }
    }

    private fullRedact(value: string, field: string): string {
        switch (field) {
            case 'email':
                return '****@****.***';
            case 'phone':
                return '****-****';
            case 'address':
                return '*** *** ***';
            case 'creditCard':
                return '****-****-****-****';
            default:
                return '****';
        }
    }

    /**
     * Anonymize data by replacing with consistent pseudonyms
     */
    anonymizeData(data: any, userId: string): any {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const anonymized = { ...data };
        const seed = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 8);

        // Replace PII with consistent pseudonyms based on user ID
        if (anonymized.email) {
            anonymized.email = `user${seed}@example.com`;
        }
        if (anonymized.phone) {
            anonymized.phone = `+1555${seed.slice(0, 4)}`;
        }
        if (anonymized.firstName) {
            anonymized.firstName = `User${seed.slice(0, 4)}`;
        }
        if (anonymized.lastName) {
            anonymized.lastName = `Lastname${seed.slice(4, 8)}`;
        }

        return anonymized;
    }

    /**
     * Generate data retention policy hash
     */
    generateRetentionHash(data: any, retentionPeriod: number): string {
        const retentionData = {
            data: typeof data === 'string' ? data : JSON.stringify(data),
            retentionPeriod,
            timestamp: Date.now()
        };

        return crypto.createHash('sha256')
            .update(JSON.stringify(retentionData))
            .digest('hex');
    }
}

// Singleton instance
export const encryptionService = new EncryptionService();