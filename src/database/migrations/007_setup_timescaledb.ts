import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    try {
        // Enable TimescaleDB extension
        await knex.raw('CREATE EXTENSION IF NOT EXISTS timescaledb');

        // Convert location_points table to hypertable
        await knex.raw(`
      SELECT create_hypertable('location_points', 'timestamp', 
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      )
    `);

        // Create retention policy for location data (30 days as per requirements)
        await knex.raw(`
      SELECT add_retention_policy('location_points', INTERVAL '30 days', if_not_exists => TRUE)
    `);

        // Create compression policy for older data
        await knex.raw(`
      ALTER TABLE location_points SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'user_id',
        timescaledb.compress_orderby = 'timestamp DESC'
      )
    `);

        // Add compression policy for data older than 7 days
        await knex.raw(`
      SELECT add_compression_policy('location_points', INTERVAL '7 days', if_not_exists => TRUE)
    `);

        // Create continuous aggregate for hourly location summaries
        await knex.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS location_hourly_summary
      WITH (timescaledb.continuous) AS
      SELECT 
        user_id,
        time_bucket('1 hour', timestamp) AS hour,
        COUNT(*) as point_count,
        AVG(accuracy) as avg_accuracy,
        ST_Centroid(ST_Collect(coordinates::geometry)) as center_point
      FROM location_points
      GROUP BY user_id, hour
      WITH NO DATA
    `);

        // Add refresh policy for the continuous aggregate
        await knex.raw(`
      SELECT add_continuous_aggregate_policy('location_hourly_summary',
        start_offset => INTERVAL '2 hours',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      )
    `);

    } catch (error) {
        // If TimescaleDB is not available, log warning but don't fail
        console.warn('TimescaleDB extension not available. Location data will use regular PostgreSQL table.');
        console.warn('For production deployment, ensure TimescaleDB is installed for optimal performance.');
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        // Drop continuous aggregate
        await knex.raw('DROP MATERIALIZED VIEW IF EXISTS location_hourly_summary');

        // Note: Cannot easily convert hypertable back to regular table
        // This would require data migration in production
        console.warn('TimescaleDB hypertable cannot be easily reverted. Manual intervention may be required.');

    } catch (error) {
        console.warn('Error during TimescaleDB rollback:', error.message);
    }
}