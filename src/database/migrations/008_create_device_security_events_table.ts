import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create ENUM types
    await knex.raw(`
    CREATE TYPE security_event_type AS ENUM ('suspicious_login', 'location_anomaly', 'multiple_sessions', 'security_violation');
    CREATE TYPE security_severity AS ENUM ('low', 'medium', 'high', 'critical');
  `);

    // Create device_security_events table
    await knex.schema.createTable('device_security_events', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('device_id').references('id').inTable('devices').onDelete('CASCADE');
        table.specificType('event_type', 'security_event_type').notNullable();
        table.specificType('severity', 'security_severity').notNullable();
        table.text('description').notNullable();
        table.jsonb('metadata').defaultTo('{}');
        table.timestamp('timestamp').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['device_id']);
        table.index(['event_type']);
        table.index(['severity']);
        table.index(['timestamp']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('device_security_events');
    await knex.raw('DROP TYPE IF EXISTS security_event_type');
    await knex.raw('DROP TYPE IF EXISTS security_severity');
}