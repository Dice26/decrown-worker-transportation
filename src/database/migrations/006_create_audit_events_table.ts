import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create audit_events table
    await knex.schema.createTable('audit_events', (table) => {
        table.uuid('event_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('correlation_id', 100).notNullable();
        table.uuid('actor_id').references('id').inTable('users');
        table.string('actor_role', 50);
        table.string('actor_ip', 45); // IPv6 compatible
        table.string('action', 100).notNullable();
        table.string('entity_type', 50).notNullable();
        table.string('entity_id', 100).notNullable();
        table.timestamp('timestamp').defaultTo(knex.fn.now());
        table.jsonb('diff'); // before/after changes
        table.jsonb('metadata').defaultTo('{}');
        table.string('hash_chain', 64).notNullable();

        // Indexes for audit queries
        table.index(['entity_type', 'entity_id']);
        table.index(['actor_id']);
        table.index(['action']);
        table.index(['timestamp']);
        table.index(['correlation_id']);
        table.index(['hash_chain']);
    });

    // Create audit_trail_integrity table for hash chain verification
    await knex.schema.createTable('audit_trail_integrity', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.date('date').notNullable();
        table.string('last_hash', 64).notNullable();
        table.integer('event_count').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.unique(['date']);
        table.index(['date']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('audit_trail_integrity');
    await knex.schema.dropTableIfExists('audit_events');
}