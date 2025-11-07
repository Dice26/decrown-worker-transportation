import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create location_points table with TimescaleDB support
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS location_points (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_id VARCHAR(100) NOT NULL,
            coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
            accuracy FLOAT NOT NULL CHECK (accuracy > 0),
            source VARCHAR(20) NOT NULL CHECK (source IN ('gps', 'network', 'passive')),
            timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
            consent_version VARCHAR(50) NOT NULL,
            hash_chain VARCHAR(64) NOT NULL,
            retention_date DATE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);

    // Create TimescaleDB hypertable if TimescaleDB extension is available
    await knex.raw(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable('location_points', 'timestamp', if_not_exists => TRUE);
            END IF;
        END
        $$;
    `);

    // Create indexes for efficient querying
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_location_points_user_timestamp 
        ON location_points (user_id, timestamp DESC);
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_location_points_coordinates 
        ON location_points USING GIST (coordinates);
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_location_points_retention_date 
        ON location_points (retention_date);
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_location_points_device_timestamp 
        ON location_points (device_id, timestamp DESC);
    `);

    // Create geofence_rules table
    await knex.schema.createTable('geofence_rules', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('name', 255).notNullable();
        table.jsonb('polygon').notNullable(); // GeoJSON polygon
        table.enum('type', ['pickup_zone', 'depot', 'restricted']).notNullable();
        table.boolean('alert_on_entry').defaultTo(false);
        table.boolean('alert_on_exit').defaultTo(false);
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
    });

    // Create geofence_alerts table
    await knex.schema.createTable('geofence_alerts', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.uuid('geofence_id').notNullable().references('id').inTable('geofence_rules').onDelete('CASCADE');
        table.enum('event_type', ['entry', 'exit']).notNullable();
        table.specificType('coordinates', 'GEOGRAPHY(POINT, 4326)').notNullable();
        table.timestamp('timestamp').notNullable();
        table.boolean('processed').defaultTo(false);
        table.timestamps(true, true);
    });

    // Create location_anomalies table
    await knex.schema.createTable('location_anomalies', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.enum('anomaly_type', ['speed_violation', 'location_jump', 'accuracy_degradation', 'unusual_pattern']).notNullable();
        table.enum('severity', ['low', 'medium', 'high']).notNullable();
        table.text('description').notNullable();
        table.specificType('coordinates', 'GEOGRAPHY(POINT, 4326)').notNullable();
        table.timestamp('timestamp').notNullable();
        table.jsonb('metadata').defaultTo('{}');
        table.boolean('resolved').defaultTo(false);
        table.timestamps(true, true);
    });

    // Create indexes for geofence and anomaly tables
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_geofence_alerts_user_timestamp 
        ON geofence_alerts (user_id, timestamp DESC);
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_geofence_alerts_processed 
        ON geofence_alerts (processed, timestamp);
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_location_anomalies_user_timestamp 
        ON location_anomalies (user_id, timestamp DESC);
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_location_anomalies_severity 
        ON location_anomalies (severity, resolved, timestamp);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('location_anomalies');
    await knex.schema.dropTableIfExists('geofence_alerts');
    await knex.schema.dropTableIfExists('geofence_rules');
    await knex.raw('DROP TABLE IF EXISTS location_points CASCADE;');
}