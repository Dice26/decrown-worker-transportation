import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Enable PostGIS extension
    await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');

    // Create ENUM types
    await knex.raw(`
    CREATE TYPE location_source AS ENUM ('gps', 'network', 'passive');
  `);

    // Create location_points table (will be converted to TimescaleDB hypertable)
    await knex.schema.createTable('location_points', (table) => {
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id', 100).notNullable();
        table.specificType('coordinates', 'GEOGRAPHY(POINT, 4326)').notNullable();
        table.float('accuracy').notNullable();
        table.specificType('source', 'location_source').notNullable();
        table.timestamp('timestamp').notNullable();
        table.string('consent_version', 50).notNullable();
        table.string('hash_chain', 64).notNullable();
        table.date('retention_date').notNullable();

        // Primary key will be set after TimescaleDB hypertable creation
        table.index(['user_id', 'timestamp']);
        table.index(['timestamp']);
        table.index(['retention_date']);
    });

    // Create spatial index on coordinates
    await knex.raw('CREATE INDEX location_points_coordinates_idx ON location_points USING GIST (coordinates)');

    // Note: TimescaleDB hypertable creation will be done in a separate migration
    // or during application startup, as it requires TimescaleDB extension
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('location_points');
    await knex.raw('DROP TYPE IF EXISTS location_source');
}