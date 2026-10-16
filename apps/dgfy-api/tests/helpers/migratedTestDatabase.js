import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationRunnerRoot = path.resolve(__dirname, '../../../dgfy-migration-runner');
const sequelizeCliPath = path.join(migrationRunnerRoot, 'node_modules', 'sequelize-cli', 'lib', 'sequelize');
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const MIGRATED_TEMPLATE_DB_NAME_PATTERN = /^test_mig_template_[A-Za-z0-9._-]+$/;
const TEST_DB_NAME_PATTERN = /^test_[A-Za-z0-9._-]+$/;

const escapeIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

const queryRows = async (sequelize, sql, options = {}) => {
    const [rows] = await sequelize.query(sql, options);
    return rows;
};

const readCreateStatement = async (sequelize, objectType, dbName, objectName) => {
    const rows = await queryRows(
        sequelize,
        `SHOW CREATE ${objectType} ${escapeIdentifier(dbName)}.${escapeIdentifier(objectName)}`
    );
    const row = rows?.[0];
    const statementKey = Object.keys(row || {}).find((key) => /^(Create (Table|View|Trigger)|SQL Original Statement)$/i.test(key));
    const statement = statementKey ? row[statementKey] : null;
    if (!statement) {
        throw new Error(`Unable to read CREATE ${objectType} for ${dbName}.${objectName}`);
    }
    return statement;
};

const setCreateSessionMode = async (sequelize, { sqlMode, characterSetClient, collationConnection }, transaction) => {
    if (sqlMode !== undefined && sqlMode !== null) {
        await sequelize.query('SET SESSION sql_mode = ?', { replacements: [sqlMode], transaction });
    }
    if (characterSetClient && collationConnection
        && /^[A-Za-z0-9_]+$/.test(characterSetClient)
        && /^[A-Za-z0-9_]+$/.test(collationConnection)) {
        await sequelize.query(
            `SET NAMES ${characterSetClient} COLLATE ${collationConnection}`,
            { transaction }
        );
    }
};

/**
 * Runs the migration-runner's normal full chain against dbName. The optional `to` value preserves
 * the partial-chain behavior needed by complianceDowngradeTrigger.db.integration.test.js.
 */
export function runMigrationsForDb(dbName, { to } = {}) {
    if (!TEST_DB_NAME_PATTERN.test(String(dbName || ''))) {
        throw new Error(`Refusing to migrate a database with non-test name: ${dbName}`);
    }
    if (!fs.existsSync(sequelizeCliPath)) {
        throw new Error(`Sequelize CLI entrypoint not found at: ${sequelizeCliPath}`);
    }

    const args = [
        sequelizeCliPath,
        'db:migrate',
        '--env',
        'development',
        '--config',
        'src/config/sequelize.config.cjs',
        '--migrations-path',
        'migrations'
    ];
    if (to) args.push('--to', to);

    const migrationResult = spawnSync(process.execPath, args, {
        cwd: migrationRunnerRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            DB_NAME: dbName,
            DB_HOST: dbConfig.host,
            DB_USER: dbConfig.user,
            DB_PASSWORD: dbConfig.password,
            DB_PORT: String(dbConfig.port)
        },
        shell: false
    });

    if (migrationResult.error || migrationResult.status !== 0) {
        throw new Error(
            `Migration failed for ${dbName}\n${migrationResult.error?.message || ''}\n${migrationResult.stdout || ''}\n${migrationResult.stderr || ''}`
        );
    }
}

/**
 * Creates one isolated, fully migrated test database. The matrix-provisioned template is a full
 * migration-runner database, unlike testTenantHelper's schema-only tenant template. It therefore
 * copies table definitions, migrated/seeded rows, triggers, and views. If no valid matrix template
 * is supplied, the exact migration chain remains the fallback.
 */
export async function createMigratedTestDatabase(dbName, adminSequelize) {
    if (!TEST_DB_NAME_PATTERN.test(String(dbName || ''))) {
        throw new Error(`Refusing to create a migrated database with non-test name: ${dbName}`);
    }
    if (!adminSequelize || typeof adminSequelize.query !== 'function') {
        throw new Error('createMigratedTestDatabase requires an admin Sequelize connection');
    }

    const templateDbName = process.env.BACKEND_TEST_MATRIX_MIGRATED_TEMPLATE_DB;
    if (!templateDbName) {
        runMigrationsForDb(dbName);
        return { mode: 'migrations', database: dbName };
    }
    if (templateDbName.length > 64 || !MIGRATED_TEMPLATE_DB_NAME_PATTERN.test(templateDbName) || !/test/i.test(templateDbName)) {
        throw new Error(`Refusing migrated test template with unexpected name shape: ${templateDbName}`);
    }

    await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(dbName)}`);

    const tableRows = await queryRows(
        adminSequelize,
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
        { replacements: [templateDbName] }
    );
    const tableNames = tableRows.map((row) => row.name);
    if (tableNames.length === 0) {
        throw new Error(`Migrated test template ${templateDbName} has no base tables to clone`);
    }

    const tableDefinitions = [];
    for (const tableName of tableNames) {
        const createStatement = await readCreateStatement(adminSequelize, 'TABLE', templateDbName, tableName);
        const columnRows = await queryRows(
            adminSequelize,
            'SELECT column_name AS name, extra, generation_expression AS generationExpression FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
            { replacements: [templateDbName, tableName] }
        );
        const insertableColumns = columnRows
            .filter((column) => !column.generationExpression && !/\b(VIRTUAL|STORED) GENERATED\b/i.test(column.extra || ''))
            .map((column) => column.name);
        const autoIncrementRows = await queryRows(
            adminSequelize,
            'SELECT auto_increment AS value FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
            { replacements: [templateDbName, tableName] }
        );
        tableDefinitions.push({
            name: tableName,
            createStatement,
            insertableColumns,
            autoIncrement: autoIncrementRows[0]?.value
        });
    }

    const triggers = await queryRows(
        adminSequelize,
        'SELECT trigger_name AS name, sql_mode AS sqlMode, character_set_client AS characterSetClient, collation_connection AS collationConnection FROM information_schema.triggers WHERE trigger_schema = ? ORDER BY event_object_table, action_timing, event_manipulation, action_order',
        { replacements: [templateDbName] }
    );
    for (const trigger of triggers) {
        trigger.createStatement = await readCreateStatement(adminSequelize, 'TRIGGER', templateDbName, trigger.name);
    }

    const views = await queryRows(
        adminSequelize,
        'SELECT table_name AS name, character_set_client AS characterSetClient, collation_connection AS collationConnection, check_option AS checkOption, is_updatable AS isUpdatable, definer AS definer FROM information_schema.views WHERE table_schema = ? ORDER BY table_name',
        { replacements: [templateDbName] }
    );
    for (const view of views) {
        const modeRows = await queryRows(
            adminSequelize,
            'SELECT sql_mode AS sqlMode FROM information_schema.views WHERE table_schema = ? AND table_name = ?',
            { replacements: [templateDbName, view.name] }
        );
        view.sqlMode = modeRows[0]?.sqlMode;
        view.createStatement = await readCreateStatement(adminSequelize, 'VIEW', templateDbName, view.name);
    }

    const sessionRows = await queryRows(
        adminSequelize,
        'SELECT DATABASE() AS databaseName, @@SESSION.sql_mode AS sqlMode, @@SESSION.character_set_client AS characterSetClient, @@SESSION.collation_connection AS collationConnection, @@SESSION.foreign_key_checks AS foreignKeyChecks'
    );
    const originalSession = sessionRows[0];

    await adminSequelize.transaction(async (transaction) => {
        await adminSequelize.query('SET FOREIGN_KEY_CHECKS=0', { transaction });
        try {
            await adminSequelize.query(`USE ${escapeIdentifier(dbName)}`, { transaction });
            for (const table of tableDefinitions) {
                await adminSequelize.query(table.createStatement, { transaction });
            }
            for (const table of tableDefinitions) {
                if (table.insertableColumns.length === 0) {
                    throw new Error(`Migrated test template table ${table.name} has no insertable columns`);
                }
                const columns = table.insertableColumns.map(escapeIdentifier).join(', ');
                await adminSequelize.query(
                    `INSERT INTO ${escapeIdentifier(table.name)} (${columns}) SELECT ${columns} FROM ${escapeIdentifier(templateDbName)}.${escapeIdentifier(table.name)}`,
                    { transaction }
                );
                if (table.autoIncrement !== null && table.autoIncrement !== undefined) {
                    await adminSequelize.query(
                        `ALTER TABLE ${escapeIdentifier(table.name)} AUTO_INCREMENT = ${Number(table.autoIncrement)}`,
                        { transaction }
                    );
                }
            }
            for (const trigger of triggers) {
                await setCreateSessionMode(adminSequelize, trigger, transaction);
                await adminSequelize.query(trigger.createStatement, { transaction });
            }
            for (const view of views) {
                await setCreateSessionMode(adminSequelize, view, transaction);
                await adminSequelize.query(view.createStatement, { transaction });
            }
        } finally {
            await adminSequelize.query('SET FOREIGN_KEY_CHECKS = ?', {
                replacements: [originalSession.foreignKeyChecks],
                transaction
            });
            if (originalSession.databaseName) {
                await adminSequelize.query(`USE ${escapeIdentifier(originalSession.databaseName)}`, { transaction });
            }
            await setCreateSessionMode(adminSequelize, originalSession, transaction);
        }
    });

    return {
        mode: 'template',
        database: dbName,
        template: templateDbName,
        tables: tableNames.length,
        triggers: triggers.length,
        views: views.length
    };
}

export const MIGRATED_TEMPLATE_DB_NAME_PATTERN_SOURCE = MIGRATED_TEMPLATE_DB_NAME_PATTERN.source;
