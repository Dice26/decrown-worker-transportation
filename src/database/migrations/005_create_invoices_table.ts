import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create ENUM types
    await knex.raw(`
    CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'paid', 'overdue', 'cancelled');
    CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled');
  `);

    // Create invoices table
    await knex.schema.createTable('invoices', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.string('invoice_number', 50).unique().notNullable();
        table.date('billing_period_start').notNullable();
        table.date('billing_period_end').notNullable();
        table.jsonb('line_items').notNullable().defaultTo('[]');
        table.decimal('subtotal', 10, 2).notNullable().defaultTo(0);
        table.decimal('tax_amount', 10, 2).notNullable().defaultTo(0);
        table.decimal('total_amount', 10, 2).notNullable().defaultTo(0);
        table.string('currency', 3).defaultTo('USD');
        table.date('due_date').notNullable();
        table.specificType('status', 'invoice_status').defaultTo('draft');
        table.jsonb('metadata').defaultTo('{}');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['user_id']);
        table.index(['status']);
        table.index(['due_date']);
        table.index(['billing_period_start', 'billing_period_end']);
        table.index(['invoice_number']);
    });

    // Create payment_attempts table
    await knex.schema.createTable('payment_attempts', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('invoice_id').references('id').inTable('invoices').onDelete('CASCADE');
        table.decimal('amount', 10, 2).notNullable();
        table.string('currency', 3).notNullable();
        table.specificType('status', 'payment_status').defaultTo('pending');
        table.string('payment_provider', 50); // 'stripe', 'paymongo', etc.
        table.string('provider_payment_id', 255);
        table.string('provider_customer_id', 255);
        table.string('idempotency_key', 255).unique();
        table.text('failure_reason');
        table.jsonb('provider_response').defaultTo('{}');
        table.timestamp('attempted_at').defaultTo(knex.fn.now());
        table.timestamp('completed_at');

        // Indexes
        table.index(['invoice_id']);
        table.index(['status']);
        table.index(['payment_provider']);
        table.index(['provider_payment_id']);
        table.index(['attempted_at']);
    });

    // Create usage_ledger table for billing calculations
    await knex.schema.createTable('usage_ledger', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.string('month', 7).notNullable(); // YYYY-MM format
        table.integer('rides_count').defaultTo(0);
        table.decimal('total_distance', 10, 2).defaultTo(0); // in kilometers
        table.integer('total_duration').defaultTo(0); // in minutes
        table.jsonb('cost_components').defaultTo('{}');
        table.jsonb('adjustments').defaultTo('[]');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['user_id']);
        table.index(['month']);
        table.unique(['user_id', 'month']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('usage_ledger');
    await knex.schema.dropTableIfExists('payment_attempts');
    await knex.schema.dropTableIfExists('invoices');
    await knex.raw('DROP TYPE IF EXISTS invoice_status');
    await knex.raw('DROP TYPE IF EXISTS payment_status');
}