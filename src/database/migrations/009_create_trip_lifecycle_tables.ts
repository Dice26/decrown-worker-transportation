import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create ENUM types for incidents
    await knex.raw(`
        CREATE TYPE incident_type AS ENUM ('delay', 'breakdown', 'accident', 'weather', 'traffic', 'other');
        CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
        CREATE TYPE notification_type AS ENUM ('assignment', 'status_update', 'delay', 'completion', 'cancellation');
    `);

    // Create trip_incidents table
    await knex.schema.createTable('trip_incidents', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('trip_id').references('id').inTable('trips').onDelete('CASCADE');
        table.uuid('reported_by').references('id').inTable('users');
        table.specificType('incident_type', 'incident_type').notNullable();
        table.specificType('severity', 'incident_severity').notNullable();
        table.text('description').notNullable();
        table.jsonb('location'); // {latitude, longitude}
        table.integer('estimated_delay'); // in minutes
        table.boolean('resolved').defaultTo(false);
        table.timestamp('reported_at').defaultTo(knex.fn.now());
        table.timestamp('resolved_at');
        table.text('resolution');

        // Indexes
        table.index(['trip_id']);
        table.index(['reported_by']);
        table.index(['incident_type']);
        table.index(['severity']);
        table.index(['resolved']);
        table.index(['reported_at']);
    });

    // Create trip_notifications table
    await knex.schema.createTable('trip_notifications', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('trip_id').references('id').inTable('trips').onDelete('CASCADE');
        table.uuid('recipient_id').references('id').inTable('users');
        table.specificType('type', 'notification_type').notNullable();
        table.string('title', 255).notNullable();
        table.text('message').notNullable();
        table.jsonb('data').defaultTo('{}');
        table.timestamp('sent_at').defaultTo(knex.fn.now());
        table.timestamp('read_at');

        // Indexes
        table.index(['trip_id']);
        table.index(['recipient_id']);
        table.index(['type']);
        table.index(['sent_at']);
        table.index(['read_at']);
    });

    // Create trip_cancellations table
    await knex.schema.createTable('trip_cancellations', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('trip_id').references('id').inTable('trips').onDelete('CASCADE');
        table.uuid('cancelled_by').references('id').inTable('users');
        table.timestamp('cancelled_at').defaultTo(knex.fn.now());
        table.text('reason');
        table.jsonb('metadata').defaultTo('{}');

        // Indexes
        table.index(['trip_id']);
        table.index(['cancelled_by']);
        table.index(['cancelled_at']);
    });

    // Create trip_metrics_history table for tracking metrics over time
    await knex.schema.createTable('trip_metrics_history', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('trip_id').references('id').inTable('trips').onDelete('CASCADE');
        table.jsonb('metrics').notNullable();
        table.timestamp('recorded_at').defaultTo(knex.fn.now());
        table.string('recorded_by', 100); // system, driver, dispatcher

        // Indexes
        table.index(['trip_id']);
        table.index(['recorded_at']);
    });

    // Add indexes to existing trips table for better performance
    await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_scheduled_at ON trips (scheduled_at)');
    await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_status_scheduled ON trips (status, scheduled_at)');
    await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_driver_status ON trips (driver_id, status) WHERE driver_id IS NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
    // Drop indexes
    await knex.raw('DROP INDEX IF EXISTS idx_trips_scheduled_at');
    await knex.raw('DROP INDEX IF EXISTS idx_trips_status_scheduled');
    await knex.raw('DROP INDEX IF EXISTS idx_trips_driver_status');

    // Drop tables
    await knex.schema.dropTableIfExists('trip_metrics_history');
    await knex.schema.dropTableIfExists('trip_cancellations');
    await knex.schema.dropTableIfExists('trip_notifications');
    await knex.schema.dropTableIfExists('trip_incidents');

    // Drop ENUM types
    await knex.raw('DROP TYPE IF EXISTS notification_type');
    await knex.raw('DROP TYPE IF EXISTS incident_severity');
    await knex.raw('DROP TYPE IF EXISTS incident_type');
}