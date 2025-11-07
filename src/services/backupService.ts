import { exec } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, createReadStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream';
import { Redis } from 'ioredis';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';
import { environmentManager } from '@/config/environments';

const execAsync = promisify(exec);
const pipelineAsync = promisify(pipeline);

export interface BackupMetadata {
    id: string;
    type: 'full' | 'incremental' | 'redis' | 'files';
    timestamp: Date;
    size: number;
    checksum: string;
    environment: string;
    status: 'in_progress' | 'completed' | 'failed';
    location: string;
    retention: Date;
    metadata: Record<string, any>;
}

export interface RestoreOptions {
    backupId: string;
    targetEnvironment?: string;
    skipTables?: string[];
    dryRun?: boolean;
}

class BackupService {
    private redis: Redis;
    private backupDir: string;
    private config = environmentManager.getConfig();

    constructor() {
        this.redis = redisClient;
        this.backupDir = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
        this.ensureBackupDirectory();
    }

    /**
     * Ensure backup directory exists
     */
    private ensureBackupDirectory(): void {
        if (!existsSync(this.backupDir)) {
            mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Create a full database backup
     */
    async createDatabaseBackup(options: {
        includeData?: boolean;
        compress?: boolean;
        excludeTables?: string[];
    } = {}): Promise<BackupMetadata> {
        const backupId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date();

        const metadata: BackupMetadata = {
            id: backupId,
            type: 'full',
            timestamp,
            size: 0,
            checksum: '',
            environment: this.config.environment,
            status: 'in_progress',
            location: '',
            retention: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            metadata: {
                includeData: options.includeData ?? true,
                compress: options.compress ?? true,
                excludeTables: options.excludeTables || []
            }
        };

        try {
            logger.info('Starting database backup', { backupId });

            // Build pg_dump command
            const dumpFile = join(this.backupDir, `${backupId}.sql`);
            const finalFile = options.compress ? `${dumpFile}.gz` : dumpFile;

            let pgDumpCmd = [
                'pg_dump',
                `--host=${this.config.database.host}`,
                `--port=${this.config.database.port}`,
                `--username=${this.config.database.user}`,
                `--dbname=${this.config.database.name}`,
                '--verbose',
                '--no-password',
                '--format=custom',
                '--compress=9'
            ];

            if (!options.includeData) {
                pgDumpCmd.push('--schema-only');
            }

            // Exclude tables if specified
            if (options.excludeTables && options.excludeTables.length > 0) {
                options.excludeTables.forEach(table => {
                    pgDumpCmd.push(`--exclude-table=${table}`);
                });
            }

            pgDumpCmd.push(`--file=${dumpFile}`);

            // Set password via environment variable
            const env = {
                ...process.env,
                PGPASSWORD: this.config.database.password
            };

            // Execute backup
            const { stdout, stderr } = await execAsync(pgDumpCmd.join(' '), { env });

            if (stderr && !stderr.includes('NOTICE')) {
                throw new Error(`pg_dump error: ${stderr}`);
            }

            // Compress if requested
            if (options.compress) {
                await pipelineAsync(
                    createReadStream(dumpFile),
                    createGzip({ level: 9 }),
                    createWriteStream(finalFile)
                );

                // Remove uncompressed file
                await execAsync(`rm "${dumpFile}"`);
            }

            // Calculate file size and checksum
            const { stdout: sizeOutput } = await execAsync(`stat -f%z "${finalFile}" 2>/dev/null || stat -c%s "${finalFile}"`);
            const size = parseInt(sizeOutput.trim());

            const { stdout: checksumOutput } = await execAsync(`sha256sum "${finalFile}" | cut -d' ' -f1`);
            const checksum = checksumOutput.trim();

            // Update metadata
            metadata.size = size;
            metadata.checksum = checksum;
            metadata.location = finalFile;
            metadata.status = 'completed';

            // Store metadata
            await this.storeBackupMetadata(metadata);

            logger.info('Database backup completed', {
                backupId,
                size: this.formatBytes(size),
                location: finalFile
            });

            return metadata;

        } catch (error) {
            metadata.status = 'failed';
            metadata.metadata.error = error instanceof Error ? error.message : 'Unknown error';
            await this.storeBackupMetadata(metadata);

            logger.error('Database backup failed', { backupId, error });
            throw error;
        }
    }

    /**
     * Create a Redis backup
     */
    async createRedisBackup(options: {
        compress?: boolean;
    } = {}): Promise<BackupMetadata> {
        const backupId = `redis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date();

        const metadata: BackupMetadata = {
            id: backupId,
            type: 'redis',
            timestamp,
            size: 0,
            checksum: '',
            environment: this.config.environment,
            status: 'in_progress',
            location: '',
            retention: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            metadata: {
                compress: options.compress ?? true
            }
        };

        try {
            logger.info('Starting Redis backup', { backupId });

            // Trigger Redis BGSAVE
            await this.redis.bgsave();

            // Wait for background save to complete
            let saveInProgress = true;
            while (saveInProgress) {
                const lastSave = await this.redis.lastsave();
                await new Promise(resolve => setTimeout(resolve, 1000));
                const newLastSave = await this.redis.lastsave();
                saveInProgress = lastSave === newLastSave;
            }

            // Get Redis data directory (this would need to be configured)
            const redisDataDir = process.env.REDIS_DATA_DIR || '/data';
            const rdbFile = join(redisDataDir, 'dump.rdb');

            const backupFile = join(this.backupDir, `${backupId}.rdb`);
            const finalFile = options.compress ? `${backupFile}.gz` : backupFile;

            // Copy RDB file
            await execAsync(`cp "${rdbFile}" "${backupFile}"`);

            // Compress if requested
            if (options.compress) {
                await pipelineAsync(
                    createReadStream(backupFile),
                    createGzip({ level: 9 }),
                    createWriteStream(finalFile)
                );

                await execAsync(`rm "${backupFile}"`);
            }

            // Calculate file size and checksum
            const { stdout: sizeOutput } = await execAsync(`stat -f%z "${finalFile}" 2>/dev/null || stat -c%s "${finalFile}"`);
            const size = parseInt(sizeOutput.trim());

            const { stdout: checksumOutput } = await execAsync(`sha256sum "${finalFile}" | cut -d' ' -f1`);
            const checksum = checksumOutput.trim();

            // Update metadata
            metadata.size = size;
            metadata.checksum = checksum;
            metadata.location = finalFile;
            metadata.status = 'completed';

            await this.storeBackupMetadata(metadata);

            logger.info('Redis backup completed', {
                backupId,
                size: this.formatBytes(size),
                location: finalFile
            });

            return metadata;

        } catch (error) {
            metadata.status = 'failed';
            metadata.metadata.error = error instanceof Error ? error.message : 'Unknown error';
            await this.storeBackupMetadata(metadata);

            logger.error('Redis backup failed', { backupId, error });
            throw error;
        }
    }

    /**
     * Restore database from backup
     */
    async restoreDatabase(options: RestoreOptions): Promise<void> {
        const { backupId, targetEnvironment, skipTables = [], dryRun = false } = options;

        try {
            logger.info('Starting database restore', { backupId, targetEnvironment, dryRun });

            // Get backup metadata
            const metadata = await this.getBackupMetadata(backupId);
            if (!metadata) {
                throw new Error(`Backup ${backupId} not found`);
            }

            if (metadata.type !== 'full') {
                throw new Error(`Cannot restore from backup type: ${metadata.type}`);
            }

            // Verify backup file exists
            if (!existsSync(metadata.location)) {
                throw new Error(`Backup file not found: ${metadata.location}`);
            }

            // Verify checksum
            const { stdout: checksumOutput } = await execAsync(`sha256sum "${metadata.location}" | cut -d' ' -f1`);
            const currentChecksum = checksumOutput.trim();

            if (currentChecksum !== metadata.checksum) {
                throw new Error('Backup file checksum mismatch - file may be corrupted');
            }

            if (dryRun) {
                logger.info('Dry run - would restore database', {
                    backupId,
                    file: metadata.location,
                    size: this.formatBytes(metadata.size)
                });
                return;
            }

            // Determine target database
            const targetConfig = targetEnvironment ?
                this.getEnvironmentConfig(targetEnvironment) :
                this.config;

            // Create restore command
            let restoreCmd = [
                'pg_restore',
                `--host=${targetConfig.database.host}`,
                `--port=${targetConfig.database.port}`,
                `--username=${targetConfig.database.user}`,
                `--dbname=${targetConfig.database.name}`,
                '--verbose',
                '--no-password',
                '--clean',
                '--if-exists'
            ];

            // Skip tables if specified
            if (skipTables.length > 0) {
                skipTables.forEach(table => {
                    restoreCmd.push(`--exclude-table=${table}`);
                });
            }

            restoreCmd.push(metadata.location);

            // Set password via environment variable
            const env = {
                ...process.env,
                PGPASSWORD: targetConfig.database.password
            };

            // Execute restore
            const { stdout, stderr } = await execAsync(restoreCmd.join(' '), { env });

            if (stderr && !stderr.includes('NOTICE') && !stderr.includes('WARNING')) {
                throw new Error(`pg_restore error: ${stderr}`);
            }

            logger.info('Database restore completed', { backupId, targetEnvironment });

        } catch (error) {
            logger.error('Database restore failed', { backupId, error });
            throw error;
        }
    }

    /**
     * Restore Redis from backup
     */
    async restoreRedis(backupId: string, dryRun: boolean = false): Promise<void> {
        try {
            logger.info('Starting Redis restore', { backupId, dryRun });

            const metadata = await this.getBackupMetadata(backupId);
            if (!metadata) {
                throw new Error(`Backup ${backupId} not found`);
            }

            if (metadata.type !== 'redis') {
                throw new Error(`Cannot restore from backup type: ${metadata.type}`);
            }

            if (!existsSync(metadata.location)) {
                throw new Error(`Backup file not found: ${metadata.location}`);
            }

            // Verify checksum
            const { stdout: checksumOutput } = await execAsync(`sha256sum "${metadata.location}" | cut -d' ' -f1`);
            const currentChecksum = checksumOutput.trim();

            if (currentChecksum !== metadata.checksum) {
                throw new Error('Backup file checksum mismatch - file may be corrupted');
            }

            if (dryRun) {
                logger.info('Dry run - would restore Redis', {
                    backupId,
                    file: metadata.location,
                    size: this.formatBytes(metadata.size)
                });
                return;
            }

            // Stop Redis (this would depend on your deployment)
            logger.warn('Manual intervention required: Stop Redis service before restore');

            // Decompress if needed
            const redisDataDir = process.env.REDIS_DATA_DIR || '/data';
            const targetFile = join(redisDataDir, 'dump.rdb');

            if (metadata.location.endsWith('.gz')) {
                await pipelineAsync(
                    createReadStream(metadata.location),
                    createGunzip(),
                    createWriteStream(targetFile)
                );
            } else {
                await execAsync(`cp "${metadata.location}" "${targetFile}"`);
            }

            logger.info('Redis restore completed - restart Redis service', { backupId });

        } catch (error) {
            logger.error('Redis restore failed', { backupId, error });
            throw error;
        }
    }

    /**
     * List available backups
     */
    async listBackups(type?: string): Promise<BackupMetadata[]> {
        try {
            const keys = await this.redis.keys('backup:*');
            const backups: BackupMetadata[] = [];

            for (const key of keys) {
                const data = await this.redis.get(key);
                if (data) {
                    const metadata: BackupMetadata = JSON.parse(data);
                    metadata.timestamp = new Date(metadata.timestamp);
                    metadata.retention = new Date(metadata.retention);

                    if (!type || metadata.type === type) {
                        backups.push(metadata);
                    }
                }
            }

            return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        } catch (error) {
            logger.error('Error listing backups', { error });
            return [];
        }
    }

    /**
     * Delete old backups based on retention policy
     */
    async cleanupOldBackups(): Promise<void> {
        try {
            const backups = await this.listBackups();
            const now = new Date();

            for (const backup of backups) {
                if (now > backup.retention) {
                    logger.info('Deleting expired backup', { backupId: backup.id });

                    // Delete backup file
                    if (existsSync(backup.location)) {
                        await execAsync(`rm "${backup.location}"`);
                    }

                    // Delete metadata
                    await this.redis.del(`backup:${backup.id}`);
                }
            }
        } catch (error) {
            logger.error('Error cleaning up old backups', { error });
        }
    }

    /**
     * Schedule automatic backups
     */
    scheduleBackups(): void {
        const cron = require('node-cron');

        // Daily database backup at 2 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                logger.info('Starting scheduled database backup');
                await this.createDatabaseBackup({ compress: true });
            } catch (error) {
                logger.error('Scheduled database backup failed', { error });
            }
        });

        // Redis backup every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            try {
                logger.info('Starting scheduled Redis backup');
                await this.createRedisBackup({ compress: true });
            } catch (error) {
                logger.error('Scheduled Redis backup failed', { error });
            }
        });

        // Cleanup old backups daily at 3 AM
        cron.schedule('0 3 * * *', async () => {
            try {
                logger.info('Starting backup cleanup');
                await this.cleanupOldBackups();
            } catch (error) {
                logger.error('Backup cleanup failed', { error });
            }
        });

        logger.info('Backup schedules initialized');
    }

    /**
     * Store backup metadata
     */
    private async storeBackupMetadata(metadata: BackupMetadata): Promise<void> {
        await this.redis.set(`backup:${metadata.id}`, JSON.stringify(metadata));
    }

    /**
     * Get backup metadata
     */
    private async getBackupMetadata(backupId: string): Promise<BackupMetadata | null> {
        const data = await this.redis.get(`backup:${backupId}`);
        if (!data) return null;

        const metadata: BackupMetadata = JSON.parse(data);
        metadata.timestamp = new Date(metadata.timestamp);
        metadata.retention = new Date(metadata.retention);

        return metadata;
    }

    /**
     * Get environment configuration
     */
    private getEnvironmentConfig(environment: string) {
        // This would load configuration for different environments
        // For now, return current config
        return this.config;
    }

    /**
     * Format bytes to human readable string
     */
    private formatBytes(bytes: number): string {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}

export const backupService = new BackupService();
export default backupService;