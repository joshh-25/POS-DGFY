import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Sequelize } from 'sequelize';
import { createMigratedTestDatabase } from './helpers/migratedTestDatabase.js';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};
const adminSequelize = new Sequelize('mysql', dbConfig.user, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: false
});
const suffix = `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
const localSourceDbName = `test_mig_template_${suffix}`;
const cloneDbName = `test_mig_equiv_clone_${suffix}`;
const emptyTemplateDbName = `test_mig_template_empty_${suffix}`;
const emptyCloneDbName = `test_mig_empty_clone_${suffix}`;
const originalTemplateDb = process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB;
let sourceDbName = originalTemplateDb || null;
let locallyOwnedTemplateDb = null;

const rowsForSchema = async (sql, dbName) => {
    const [rows] = await adminSequelize.query(sql, { replacements: [dbName] });
    return rows;
};

const getTableNames = async (dbName) => {
    const rows = await rowsForSchema(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
        dbName
    );
    return rows.map((row) => row.name);
};

const getSchemaSnapshot = async (dbName) => {
    const columns = await rowsForSchema(
        'SELECT table_name, column_name, column_type, is_nullable, column_default, extra FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position',
        dbName
    );
    const indexes = await rowsForSchema(
        'SELECT table_name, index_name, seq_in_index, column_name, non_unique FROM information_schema.statistics WHERE table_schema = ? ORDER BY table_name, index_name, seq_in_index',
        dbName
    );
    const foreignKeys = await rowsForSchema(
        `SELECT rc.table_name, rc.constraint_name, rc.referenced_table_name,
                rc.update_rule, rc.delete_rule, kcu.ordinal_position,
                kcu.column_name, kcu.referenced_column_name
           FROM information_schema.referential_constraints rc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_schema = rc.constraint_schema
            AND kcu.constraint_name = rc.constraint_name
            AND kcu.table_name = rc.table_name
          WHERE rc.constraint_schema = ?
          ORDER BY rc.table_name, rc.constraint_name, kcu.ordinal_position`,
        dbName
    );
    const triggers = await rowsForSchema(
        'SELECT trigger_name, event_object_table, action_timing, event_manipulation, action_statement FROM information_schema.triggers WHERE trigger_schema = ? ORDER BY trigger_name',
        dbName
    );
    const views = await rowsForSchema(
        'SELECT table_name, view_definition, check_option, is_updatable, security_type, character_set_client, collation_connection FROM information_schema.views WHERE table_schema = ? ORDER BY table_name',
        dbName
    );
    const [migrationRows] = await adminSequelize.query(
        `SELECT name FROM \`${dbName}\`.\`SequelizeMeta\` ORDER BY name`
    );
    const rowCounts = {};
    for (const tableName of await getTableNames(dbName)) {
        const escapedTableName = `\`${tableName.replace(/`/g, '``')}\``;
        const [countRows] = await adminSequelize.query(`SELECT COUNT(*) AS count FROM \`${dbName}\`.${escapedTableName}`);
        rowCounts[tableName] = Number(countRows[0].count);
    }
    return { columns, indexes, foreignKeys, triggers, views, migrationRows, rowCounts };
};

describe('migrated test template clone equivalence', () => {
    beforeAll(async () => {
        if (originalTemplateDb) {
            // The matrix has already run the full migration chain to create this source.
            // Compare the clone against that database instead of migrating a second source
            // database inside this suite on every CI run.
            sourceDbName = originalTemplateDb;
        } else {
            // Standalone invocation remains self-contained: create the migrated source, then
            // use it as the helper's template so the same clone path is exercised locally.
            sourceDbName = localSourceDbName;
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${sourceDbName}\``);
            delete process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB;
            await createMigratedTestDatabase(sourceDbName, adminSequelize);
            locallyOwnedTemplateDb = sourceDbName;
            process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB = sourceDbName;
        }
        await createMigratedTestDatabase(cloneDbName, adminSequelize);
        await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${emptyTemplateDbName}\``);
    }, 240000);

    afterAll(async () => {
        if (originalTemplateDb === undefined) delete process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB;
        else process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB = originalTemplateDb;
        await adminSequelize.query(`DROP DATABASE IF EXISTS \`${cloneDbName}\``).catch(() => null);
        await adminSequelize.query(`DROP DATABASE IF EXISTS \`${emptyCloneDbName}\``).catch(() => null);
        await adminSequelize.query(`DROP DATABASE IF EXISTS \`${emptyTemplateDbName}\``).catch(() => null);
        if (locallyOwnedTemplateDb) {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${locallyOwnedTemplateDb}\``).catch(() => null);
        }
        await adminSequelize.close();
    }, 60000);

    it('copies migrated schema, seed data, triggers, views, migration history, and row counts', async () => {
        const source = await getSchemaSnapshot(sourceDbName);
        const clone = await getSchemaSnapshot(cloneDbName);
        expect(clone).toEqual(source);
    });

    it('rejects a migrated template name outside the matrix-generated guard', async () => {
        const previousTemplateDb = process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB;
        process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB = 'production_schema';
        try {
            await expect(createMigratedTestDatabase(cloneDbName, adminSequelize))
                .rejects.toThrow(/unexpected name shape/);
        } finally {
            if (previousTemplateDb === undefined) delete process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB;
            else process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB = previousTemplateDb;
        }
    });

    it('fails closed when a validly named template has no tables', async () => {
        process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB = emptyTemplateDbName;
        await expect(createMigratedTestDatabase(emptyCloneDbName, adminSequelize))
            .rejects.toThrow(/has no base tables to clone/);
    });
});
