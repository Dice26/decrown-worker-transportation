import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Create ENUM types
    await knex.raw(`
    CREATE TYPE user_role AS ENUM ('worker', 'driver', 'dispatcher', 'finance', 'admin');
    CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending', 'inactive');
  `);

    // Create users table
    await knex.schema.createTable('users', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('email', 255).unique().notNullable();
        table.specificType('role', 'user_role').notNullable();
        table.string('department', 100);
        table.specificType('status', 'user_status').defaultTo('pending');
        table.jsonb('consent_flags').notNullable().defaultTo('{}');
        table.string('payment_token_ref', 255);
        table.binary('encrypted_pii'); // KMS encrypted personal data
        table.string('password_hash', 255);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());

        // Indexes
        table.index(['email']);
        table.index(['role']);
        table.index(['status']);
        table.index(['department']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('users');
    await knex.raw('DROP TYPE IF EXISTS user_role');
    await knex.raw('DROP TYPE IF EXISTS user_status');
}