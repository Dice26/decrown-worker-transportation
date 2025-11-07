import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Push tokens table
    await knex.schema.createTable('push_tokens', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
        table.text('token').notNullable();
        table.enum('platform', ['ios', 'android']).notNullable();
        table.string('app_version').notNullable();
        table.boolean('is_active').defaultTo(true);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        table.index(['user_id', 'is_active']);
        table.index(['device_id', 'is_active']);
        table.unique(['device_id', 'token']);
    });

    // Push notifications table
    await knex.schema.createTable('push_notifications', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id').nullable().references('id').inTable('devices').onDelete('SET NULL');
        table.string('title').notNullable();
        table.text('body').notNullable();
        table.jsonb('data').nullable();
        table.enum('type', [
            'trip_assigned',
            'trip_updated',
            'trip_cancelled',
            'driver_arrived',
            'pickup_reminder',
            'route_optimized',
            'incident_reported',
            'payment_due',
            'system_alert'
        ]).notNullable();
        table.enum('priority', ['low', 'normal', 'high', 'critical']).defaultTo('normal');
        table.enum('status', ['pending', 'sent', 'delivered', 'failed', 'cancelled']).defaultTo('pending');
        table.timestamp('scheduled_at').nullable();
        table.timestamp('expires_at').nullable();
        table.timestamp('sent_at').nullable();
        table.timestamp('read_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        table.index(['user_id', 'created_at']);
        table.index(['status', 'scheduled_at']);
        table.index(['type', 'created_at']);
    });

    // Sync queue table for offline synchronization
    await knex.schema.createTable('sync_queue', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
        table.enum('data_type', [
            'location_point',
            'trip_status',
            'driver_checkin',
            'incident_report',
            'availability_update',
            'consent_update'
        ]).notNullable();
        table.enum('operation', ['create', 'update', 'delete']).notNullable();
        table.jsonb('data').notNullable();
        table.timestamp('timestamp').defaultTo(knex.fn.now());
        table.timestamp('client_timestamp').notNullable();
        table.enum('sync_status', ['pending', 'synced', 'conflict', 'failed']).defaultTo('pending');
        table.integer('retry_count').defaultTo(0);
        table.timestamp('last_sync_attempt').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['device_id', 'sync_status']);
        table.index(['user_id', 'data_type']);
        table.index(['sync_status', 'timestamp']);
    });

    // Sync conflicts table
    await knex.schema.createTable('sync_conflicts', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
        table.string('client_item_id').notNullable();
        table.enum('data_type', [
            'location_point',
            'trip_status',
            'driver_checkin',
            'incident_report',
            'availability_update',
            'consent_update'
        ]).notNullable();
        table.enum('operation', ['create', 'update', 'delete']).notNullable();
        table.enum('conflict_type', ['version', 'data', 'permission']).notNullable();
        table.jsonb('server_data').notNullable();
        table.jsonb('client_data').notNullable();
        table.enum('suggested_resolution', ['server_wins', 'client_wins', 'merge', 'manual']).notNullable();
        table.enum('resolution', ['server_wins', 'client_wins', 'merge', 'manual']).nullable();
        table.jsonb('resolved_data').nullable();
        table.enum('status', ['pending', 'resolved']).defaultTo('pending');
        table.timestamp('resolved_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['user_id', 'status']);
        table.index(['device_id', 'status']);
        table.index(['data_type', 'status']);
    });

    // Mobile app sessions table for tracking active sessions
    await knex.schema.createTable('mobile_sessions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
        table.string('session_token').notNullable().unique();
        table.enum('app_type', ['worker', 'driver']).notNullable();
        table.string('app_version').notNullable();
        table.jsonb('device_info').nullable();
        table.timestamp('last_activity').defaultTo(knex.fn.now());
        table.timestamp('expires_at').notNullable();
        table.boolean('is_active').defaultTo(true);
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['user_id', 'is_active']);
        table.index(['device_id', 'is_active']);
        table.index(['session_token']);
        table.index(['expires_at']);
    });

    // Add mobile-specific columns to existing tables
    await knex.schema.alterTable('users', (table) => {
        table.boolean('available').defaultTo(true);
        table.string('availability_reason').nullable();
        table.jsonb('availability_location').nullable();
        table.timestamp('last_location_update').nullable();
    });

    // Add driver-specific location tracking
    await knex.schema.createTable('driver_locations', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('driver_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
        table.specificType('coordinates', 'geography(POINT, 4326)').notNullable();
        table.float('accuracy').notNullable();
        table.float('heading').nullable();
        table.float('speed').nullable(); // km/h
        table.timestamp('timestamp').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['driver_id', 'timestamp']);
        table.index(knex.raw('coordinates USING GIST'));
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('driver_locations');
    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('available');
        table.dropColumn('availability_reason');
        table.dropColumn('availability_location');
        table.dropColumn('last_location_update');
    });
    await knex.schema.dropTableIfExists('mobile_sessions');
    await knex.schema.dropTableIfExists('sync_conflicts');
    await knex.schema.dropTableIfExists('sync_queue');
    await knex.schema.dropTableIfExists('push_notifications');
    await knex.schema.dropTableIfExists('push_tokens');
}