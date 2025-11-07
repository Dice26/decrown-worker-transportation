import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create additional ENUM types for payment service
    await knex.raw(`
        CREATE TYPE payment_method AS ENUM ('card', 'bank_transfer', 'digital_wallet');
        CREATE TYPE dunning_status AS ENUM ('none', 'notice_1', 'notice_2', 'notice_3', 'suspended');
        CREATE TYPE adjustment_type AS ENUM ('credit', 'debit');
    `);

    // Update invoices table to add missing columns
    await knex.schema.alterTable('invoices', (table) => {
        table.timestamp('paid_at');
        table.text('notes');
    });

    // Update payment_attempts table to add missing columns
    await knex.schema.alterTable('payment_attempts', (table) => {
        table.specificType('payment_method', 'payment_method').defaultTo('card');
        table.integer('retry_count').defaultTo(0);
        table.timestamp('next_retry_at');
    });

    // Update usage_ledger table name and structure
    await knex.schema.renameTable('usage_ledger', 'usage_ledgers');
    await knex.schema.alterTable('usage_ledgers', (table) => {
        table.decimal('final_amount', 10, 2).defaultTo(0);
    });

    // Create ledger_adjustments table
    await knex.schema.createTable('ledger_adjustments', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('ledger_id').references('id').inTable('usage_ledgers').onDelete('CASCADE');
        table.specificType('type', 'adjustment_type').notNullable();
        table.decimal('amount', 10, 2).notNullable();
        table.string('reason', 255).notNullable();
        table.uuid('applied_by').references('id').inTable('users');
        table.timestamp('applied_at').defaultTo(knex.fn.now());
        table.jsonb('metadata').defaultTo('{}');

        // Indexes
        table.index(['ledger_id']);
        table.index(['type']);
        table.index(['applied_by']);
        table.index(['applied_at']);
    });

    // Create dunning_notices table
    await knex.schema.createTable('dunning_notices', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('invoice_id').references('id').inTable('invoices').onDelete('CASCADE');
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.specificType('status', 'dunning_status').notNullable();
        table.integer('notice_level').notNullable();
        table.timestamp('sent_at').defaultTo(knex.fn.now());
        table.date('due_date').notNullable();
        table.decimal('amount', 10, 2).notNullable();
        table.text('message').notNullable();
        table.string('delivery_method', 20).defaultTo('email');
        table.boolean('delivered').defaultTo(false);
        table.timestamp('delivered_at');

        // Indexes
        table.index(['invoice_id']);
        table.index(['user_id']);
        table.index(['status']);
        table.index(['notice_level']);
        table.index(['sent_at']);
    });

    // Create trip_stops table for payment calculations
    await knex.schema.createTable('trip_stops', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('trip_id').references('id').inTable('trips').onDelete('CASCADE');
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.jsonb('location').notNullable();
        table.timestamp('estimated_arrival');
        table.timestamp('actual_arrival');
        table.string('status', 20).defaultTo('pending'); // pending, arrived, picked_up, no_show
        table.text('notes');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['trip_id']);
        table.index(['user_id']);
        table.index(['status']);
        table.index(['actual_arrival']);
    });

    // Add payment_customer_id to users table
    await knex.schema.alterTable('users', (table) => {
        table.string('payment_customer_id', 255);
        table.index(['payment_customer_id']);
    });

    // Create webhook_events table for payment provider webhooks
    await knex.schema.createTable('webhook_events', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('provider', 50).notNullable();
        table.string('event_type', 100).notNullable();
        table.string('provider_event_id', 255).notNullable();
        table.jsonb('payload').notNullable();
        table.boolean('processed').defaultTo(false);
        table.timestamp('processed_at');
        table.text('processing_error');
        table.timestamp('received_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['provider']);
        table.index(['event_type']);
        table.index(['provider_event_id']);
        table.index(['processed']);
        table.index(['received_at']);
        table.unique(['provider', 'provider_event_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    // Drop new tables
    await knex.schema.dropTableIfExists('webhook_events');
    await knex.schema.dropTableIfExists('trip_stops');
    await knex.schema.dropTableIfExists('dunning_notices');
    await knex.schema.dropTableIfExists('ledger_adjustments');

    // Revert table changes
    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('payment_customer_id');
    });

    await knex.schema.renameTable('usage_ledgers', 'usage_ledger');
    await knex.schema.alterTable('usage_ledger', (table) => {
        table.dropColumn('final_amount');
    });

    await knex.schema.alterTable('payment_attempts', (table) => {
        table.dropColumn('payment_method');
        table.dropColumn('retry_count');
        table.dropColumn('next_retry_at');
    });

    await knex.schema.alterTable('invoices', (table) => {
        table.dropColumn('paid_at');
        table.dropColumn('notes');
    });

    // Drop ENUM types
    await knex.raw('DROP TYPE IF EXISTS adjustment_type');
    await knex.raw('DROP TYPE IF EXISTS dunning_status');
    await knex.raw('DROP TYPE IF EXISTS payment_method');
}