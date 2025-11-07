import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Update webhook_events table with security fields
    await knex.schema.alterTable('webhook_events', (table) => {
        table.string('event_id', 64).notNullable().index();
        table.string('signature', 512).notNullable();
        table.timestamp('timestamp').nullable();
        table.index(['provider', 'event_type']);
        table.index(['received_at']);
        table.index(['processed', 'received_at']);
    });

    // Create webhook_retries table
    await knex.schema.createTable('webhook_retries', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('webhook_id').notNullable().references('id').inTable('webhook_events').onDelete('CASCADE');
        table.string('url', 2048).notNullable();
        table.text('payload').notNullable();
        table.text('headers').notNullable();
        table.integer('max_attempts').notNullable().defaultTo(3);
        table.integer('current_attempt').notNullable().defaultTo(1);
        table.timestamp('next_retry_at').notNullable();
        table.timestamp('failed_at').nullable();
        table.text('failure_reason').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.index(['next_retry_at']);
        table.index(['webhook_id']);
        table.index(['current_attempt', 'max_attempts']);
    });

    // Create webhook_security_logs table for audit trail
    await knex.schema.createTable('webhook_security_logs', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('provider', 50).notNullable();
        table.string('event_type', 100).notNullable();
        table.string('event_id', 64).notNullable();
        table.enum('validation_result', ['valid', 'invalid_signature', 'invalid_timestamp', 'duplicate', 'error']).notNullable();
        table.text('error_message').nullable();
        table.string('source_ip', 45).nullable(); // IPv6 support
        table.string('user_agent', 512).nullable();
        table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());

        table.index(['provider', 'validation_result']);
        table.index(['timestamp']);
        table.index(['event_id']);
    });

    // Create webhook_deduplication table for tracking processed events
    await knex.schema.createTable('webhook_deduplication', (table) => {
        table.string('event_id', 64).primary();
        table.string('provider', 50).notNullable();
        table.string('event_type', 100).notNullable();
        table.timestamp('first_seen').notNullable().defaultTo(knex.fn.now());
        table.timestamp('last_seen').notNullable().defaultTo(knex.fn.now());
        table.integer('occurrence_count').notNullable().defaultTo(1);
        table.timestamp('expires_at').notNullable(); // For automatic cleanup

        table.index(['provider', 'event_type']);
        table.index(['expires_at']);
    });

    // Add webhook security configuration table
    await knex.schema.createTable('webhook_security_config', (table) => {
        table.string('provider', 50).primary();
        table.string('signature_header', 100).notNullable().defaultTo('x-webhook-signature');
        table.string('timestamp_header', 100).notNullable().defaultTo('x-webhook-timestamp');
        table.integer('timestamp_tolerance').notNullable().defaultTo(300); // 5 minutes
        table.integer('max_retry_attempts').notNullable().defaultTo(3);
        table.integer('retry_delay_ms').notNullable().defaultTo(1000);
        table.integer('backoff_multiplier').notNullable().defaultTo(2);
        table.integer('max_retry_delay_ms').notNullable().defaultTo(30000);
        table.boolean('enabled').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    // Insert default configurations for supported providers
    await knex('webhook_security_config').insert([
        {
            provider: 'stripe',
            signature_header: 'stripe-signature',
            timestamp_header: 'stripe-timestamp',
            timestamp_tolerance: 300,
            max_retry_attempts: 3,
            retry_delay_ms: 1000,
            backoff_multiplier: 2,
            max_retry_delay_ms: 30000,
            enabled: true
        },
        {
            provider: 'paymongo',
            signature_header: 'paymongo-signature',
            timestamp_header: 'paymongo-timestamp',
            timestamp_tolerance: 300,
            max_retry_attempts: 3,
            retry_delay_ms: 1000,
            backoff_multiplier: 2,
            max_retry_delay_ms: 30000,
            enabled: true
        },
        {
            provider: 'mock',
            signature_header: 'x-webhook-signature',
            timestamp_header: 'x-webhook-timestamp',
            timestamp_tolerance: 300,
            max_retry_attempts: 3,
            retry_delay_ms: 1000,
            backoff_multiplier: 2,
            max_retry_delay_ms: 30000,
            enabled: true
        }
    ]);
}

export async function down(knex: Knex): Promise<void> {
    // Drop tables in reverse order
    await knex.schema.dropTableIfExists('webhook_security_config');
    await knex.schema.dropTableIfExists('webhook_deduplication');
    await knex.schema.dropTableIfExists('webhook_security_logs');
    await knex.schema.dropTableIfExists('webhook_retries');

    // Revert webhook_events table changes
    await knex.schema.alterTable('webhook_events', (table) => {
        table.dropColumn('event_id');
        table.dropColumn('signature');
        table.dropColumn('timestamp');
    });
}