import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create ENUM types
    await knex.raw(`
    CREATE TYPE trip_status AS ENUM ('planned', 'assigned', 'in_progress', 'completed', 'cancelled');
    CREATE TYPE route_status AS ENUM ('draft', 'active', 'completed', 'cancelled');
  `);

    // Create routes table
    await knex.schema.createTable('routes', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('name', 255).notNullable();
        table.text('description');
        table.specificType('status', 'route_status').defaultTo('draft');
        table.uuid('created_by').references('id').inTable('users');
        table.jsonb('optimization_config').defaultTo('{}');
        table.jsonb('constraints').defaultTo('{}');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['status']);
        table.index(['created_by']);
        table.index(['created_at']);
    });

    // Create trips table
    await knex.schema.createTable('trips', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('route_id').references('id').inTable('routes').onDelete('CASCADE');
        table.uuid('driver_id').references('id').inTable('users');
        table.specificType('status', 'trip_status').defaultTo('planned');
        table.jsonb('planned_stops').notNullable().defaultTo('[]');
        table.jsonb('actual_stops').defaultTo('[]');
        table.jsonb('metrics').defaultTo('{}');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('scheduled_at').notNullable();
        table.timestamp('started_at');
        table.timestamp('completed_at');

        // Indexes
        table.index(['route_id']);
        table.index(['driver_id']);
        table.index(['status']);
        table.index(['scheduled_at']);
        table.index(['created_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('trips');
    await knex.schema.dropTableIfExists('routes');
    await knex.raw('DROP TYPE IF EXISTS trip_status');
    await knex.raw('DROP TYPE IF EXISTS route_status');
}