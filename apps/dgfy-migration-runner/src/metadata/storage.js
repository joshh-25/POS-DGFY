import { SCHEMA_MIGRATIONS_TABLE } from './bootstrap.js';

/**
 * Umzug custom storage backed by dgfy_migration_meta.schema_migrations
 * instead of the default `SequelizeMeta` table (D-05/D-07: the runner owns
 * its own permanent metadata schema). Implements Umzug's UpdatedStorage
 * interface — a class with logMigration/unlogMigration/executed methods,
 * passed as the `storage` option to `new Umzug({ ... })`.
 */
export class MetaSequelizeStorage {
    constructor({ sequelize, tableName = SCHEMA_MIGRATIONS_TABLE }) {
        this.sequelize = sequelize;
        this.tableName = tableName;
    }

    async logMigration({ name }) {
        await this.sequelize.getQueryInterface().bulkInsert(this.tableName, [{
            name,
            executed_at: new Date()
        }]);
    }

    async unlogMigration({ name }) {
        await this.sequelize.getQueryInterface().bulkDelete(this.tableName, { name });
    }

    async executed() {
        const [rows] = await this.sequelize.query(`SELECT name FROM ${this.tableName} ORDER BY executed_at ASC`);
        return rows.map((row) => row.name);
    }
}
