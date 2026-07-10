import { SCHEMA_MIGRATIONS_TABLE } from './bootstrap.js';

/**
 * Default target-scope key used when a caller does not pass an explicit
 * `targetDatabase` (keeps existing single-target callers/tests working
 * unchanged — see Plan 03 D-21/T-02-03-02).
 */
const DEFAULT_TARGET_DATABASE = 'default';

/**
 * Umzug custom storage backed by dgfy_migration_meta.schema_migrations
 * instead of the default `SequelizeMeta` table (D-05/D-07: the runner owns
 * its own permanent metadata schema). Implements Umzug's UpdatedStorage
 * interface — a class with logMigration/unlogMigration/executed methods,
 * passed as the `storage` option to `new Umzug({ ... })`.
 *
 * Plan 03 (D-21, T-02-03-02): every read/write is scoped by `targetDatabase`
 * so the same migration filename can be tracked independently per target —
 * a `dgfy_core` migration record can never be mistaken for (or hide pending
 * work belonging to) a `dgfy_business_*` database, and vice versa. Each
 * Umzug instance the schema command constructs is given its own
 * `MetaSequelizeStorage` bound to exactly one `targetDatabase`.
 */
export class MetaSequelizeStorage {
    constructor({ sequelize, tableName = SCHEMA_MIGRATIONS_TABLE, targetDatabase = DEFAULT_TARGET_DATABASE }) {
        this.sequelize = sequelize;
        this.tableName = tableName;
        this.targetDatabase = targetDatabase;
    }

    async logMigration({ name }) {
        await this.sequelize.getQueryInterface().bulkInsert(this.tableName, [{
            name,
            target_database: this.targetDatabase,
            executed_at: new Date()
        }]);
    }

    async unlogMigration({ name }) {
        await this.sequelize.getQueryInterface().bulkDelete(this.tableName, {
            name,
            target_database: this.targetDatabase
        });
    }

    async executed() {
        const [rows] = await this.sequelize.query(
            `SELECT name FROM ${this.tableName} WHERE target_database = ? ORDER BY executed_at ASC`,
            { replacements: [this.targetDatabase] }
        );
        return rows.map((row) => row.name);
    }
}
