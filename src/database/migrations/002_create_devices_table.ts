import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create ENUM types
    await knex.raw(`
    CREATE TYPE device_status AS ENUM ('active', 'inactive', 'blocked');
    CREATE TYPE device_type AS ENUM ('mobile', 'tablet', 'web');
  `);

    // Create devices table
    await knex.schema.createTable('devices', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.string('device_fingerprint', 255).notNullable();
        table.specificType('device_type', 'device_type').notNullable();
        table.string('device_name', 100);
        table.string('os_version', 50);
        table.string('app_version', 20);
        table.specificType('status', 'device_status').defaultTo('active');
        table.integer('trust_level').defaultTo(0); // 0-100 trust score
        table.timestamp('last_seen').defaultTo(knex.fn.now());
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['user_id']);
        table.index(['device_fingerprint']);
        table.index(['status']);
        table.index(['trust_level']);
        table.unique(['user_id', 'device_fingerprint']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('devices');
    await knex.raw('DROP TYPE IF EXISTS device_status');
    await knex.raw('DROP TYPE IF EXISTS device_type');
}