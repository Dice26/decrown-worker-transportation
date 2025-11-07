import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Data export requests table
    await knex.schema.createTable('data_export_requests', (table) => {
        table.uuid('id').primary();
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.enum('status', ['pending', 'processing', 'completed', 'failed', 'expired']).notNullable();
        table.timestamp('requested_at').notNullable();
        table.timestamp('completed_at').nullable();
        table.text('download_url').nullable();
        table.timestamp('expires_at').nullable();
        table.text('error_message').nullable();
        table.timestamps(true, true);

        table.index(['user_id', 'status']);
        table.index('expires_at');
    });

    // Data deletion requests table
    await knex.schema.createTable('data_deletion_requests', (table) => {
        table.uuid('id').primary();
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.enum('status', ['pending', 'processing', 'completed', 'failed']).notNullable();
        table.timestamp('requested_at').notNullable();
        table.timestamp('scheduled_at').notNullable();
        table.timestamp('completed_at').nullable();
        table.text('reason').nullable();
        table.string('confirmation').notNullable();
        table.text('error_message').nullable();
        table.timestamps(true, true);

        table.index(['status', 'scheduled_at']);
        table.index('user_id');
    });

    // Export files table
    await knex.schema.createTable('export_files', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('request_id').notNullable().references('id').inTable('data_export_requests').onDelete('CASCADE');
        table.string('filename').notNullable();
        table.text('download_url').notNullable();
        table.bigInteger('file_size').notNullable();
        table.timestamp('created_at').notNullable();

        table.index('request_id');
    });

    // Consent logs table
    await knex.schema.createTable('consent_logs', (table) => {
        table.uuid('id').primary();
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('consent_type').notNullable();
        table.enum('action', ['granted', 'withdrawn', 'updated']).notNullable();
        table.string('consent_version').notNullable();
        table.timestamp('timestamp').notNullable();
        table.text('reason').nullable();
        table.string('ip_address').nullable();
        table.text('user_agent').nullable();
        table.timestamps(true, true);

        table.index(['user_id', 'consent_type']);
        table.index('timestamp');
    });

    // Security scans table
    await knex.schema.createTable('security_scans', (table) => {
        table.uuid('id').primary();
        table.enum('scan_type', ['dependency', 'code', 'configuration', 'runtime']).notNullable();
        table.timestamp('started_at').notNullable();
        table.timestamp('completed_at').nullable();
        table.enum('status', ['running', 'completed', 'failed']).notNullable();
        table.integer('vulnerabilities_found').defaultTo(0);
        table.jsonb('summary').nullable();
        table.text('error_message').nullable();
        table.timestamps(true, true);

        table.index(['scan_type', 'status']);
        table.index('started_at');
    });

    // Security vulnerabilities table
    await knex.schema.createTable('security_vulnerabilities', (table) => {
        table.uuid('id').primary();
        table.uuid('scan_id').notNullable().references('id').inTable('security_scans').onDelete('CASCADE');
        table.enum('type', [
            'sql_injection',
            'xss',
            'csrf',
            'weak_auth',
            'data_exposure',
            'insecure_config'
        ]).notNullable();
        table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
        table.string('title').notNullable();
        table.text('description').notNullable();
        table.string('location').notNullable();
        table.text('recommendation').notNullable();
        table.timestamp('detected_at').notNullable();
        table.enum('status', ['open', 'investigating', 'fixed', 'false_positive']).notNullable();
        table.timestamps(true, true);

        table.index(['scan_id', 'severity']);
        table.index(['type', 'status']);
        table.index('detected_at');
    });

    // User sessions table (for session security monitoring)
    await knex.schema.createTable('user_sessions', (table) => {
        table.uuid('id').primary();
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('session_token').notNullable().unique();
        table.string('device_fingerprint').nullable();
        table.string('ip_address').nullable();
        table.text('user_agent').nullable();
        table.timestamp('created_at').notNullable();
        table.timestamp('last_activity').notNullable();
        table.timestamp('expires_at').notNullable();
        table.enum('status', ['active', 'expired', 'revoked']).notNullable();
        table.timestamps(true, true);

        table.index(['user_id', 'status']);
        table.index('session_token');
        table.index('expires_at');
        table.index('last_activity');
    });

    // Data retention policies table
    await knex.schema.createTable('data_retention_policies', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('data_type').notNullable();
        table.string('table_name').notNullable();
        table.integer('retention_days').notNullable();
        table.string('date_column').notNullable();
        table.jsonb('conditions').nullable();
        table.boolean('active').defaultTo(true);
        table.timestamp('last_cleanup').nullable();
        table.timestamps(true, true);

        table.index(['data_type', 'active']);
        table.index('last_cleanup');
    });

    // Security configuration table
    await knex.schema.createTable('security_config', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('config_key').notNullable().unique();
        table.text('config_value').notNullable();
        table.text('description').nullable();
        table.enum('category', [
            'authentication',
            'encryption',
            'rate_limiting',
            'session_management',
            'data_protection'
        ]).notNullable();
        table.boolean('is_sensitive').defaultTo(false);
        table.timestamp('last_updated').notNullable();
        table.string('updated_by').notNullable();
        table.timestamps(true, true);

        table.index('category');
        table.index('config_key');
    });

    // Insert default security configurations
    await knex('security_config').insert([
        {
            config_key: 'jwt_expiration_minutes',
            config_value: '15',
            description: 'JWT token expiration time in minutes',
            category: 'authentication',
            is_sensitive: false,
            last_updated: new Date(),
            updated_by: 'system'
        },
        {
            config_key: 'max_login_attempts',
            config_value: '5',
            description: 'Maximum failed login attempts before lockout',
            category: 'authentication',
            is_sensitive: false,
            last_updated: new Date(),
            updated_by: 'system'
        },
        {
            config_key: 'session_timeout_hours',
            config_value: '24',
            description: 'Session timeout in hours',
            category: 'session_management',
            is_sensitive: false,
            last_updated: new Date(),
            updated_by: 'system'
        },
        {
            config_key: 'location_data_retention_days',
            config_value: '30',
            description: 'Location data retention period in days',
            category: 'data_protection',
            is_sensitive: false,
            last_updated: new Date(),
            updated_by: 'system'
        },
        {
            config_key: 'api_rate_limit_per_minute',
            config_value: '100',
            description: 'API requests per minute per user',
            category: 'rate_limiting',
            is_sensitive: false,
            last_updated: new Date(),
            updated_by: 'system'
        }
    ]);

    // Insert default data retention policies
    await knex('data_retention_policies').insert([
        {
            data_type: 'location_data',
            table_name: 'location_points',
            retention_days: 30,
            date_column: 'retention_date',
            conditions: JSON.stringify({ consent_withdrawn: false }),
            active: true
        },
        {
            data_type: 'audit_logs',
            table_name: 'audit_events',
            retention_days: 2555, // 7 years for compliance
            date_column: 'timestamp',
            conditions: null,
            active: true
        },
        {
            data_type: 'export_files',
            table_name: 'export_files',
            retention_days: 7,
            date_column: 'created_at',
            conditions: null,
            active: true
        },
        {
            data_type: 'session_data',
            table_name: 'user_sessions',
            retention_days: 90,
            date_column: 'last_activity',
            conditions: JSON.stringify({ status: ['expired', 'revoked'] }),
            active: true
        }
    ]);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('data_retention_policies');
    await knex.schema.dropTableIfExists('security_config');
    await knex.schema.dropTableIfExists('user_sessions');
    await knex.schema.dropTableIfExists('security_vulnerabilities');
    await knex.schema.dropTableIfExists('security_scans');
    await knex.schema.dropTableIfExists('consent_logs');
    await knex.schema.dropTableIfExists('export_files');
    await knex.schema.dropTableIfExists('data_deletion_requests');
    await knex.schema.dropTableIfExists('data_export_requests');
}