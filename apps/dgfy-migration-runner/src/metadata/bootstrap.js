import mysql from 'mysql2/promise';
import { DataTypes, Sequelize } from 'sequelize';
import { MetadataSchemaError } from '../utils/errors.js';

export const META_DB_NAME = 'dgfy_migration_meta';
export const COMMAND_EXECUTIONS_TABLE = 'command_executions';
export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

/**
 * D-06 command execution audit columns.
 */
const COMMAND_EXECUTIONS_COLUMNS = {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    command: { type: DataTypes.STRING(64), allowNull: false },
    mode: { type: DataTypes.STRING(32), allowNull: true },
    args_json: { type: DataTypes.TEXT, allowNull: true },
    actor: { type: DataTypes.STRING(120), allowNull: false },
    runtime_mode: { type: DataTypes.STRING(20), allowNull: false },
    migration_file: { type: DataTypes.STRING(255), allowNull: true },
    checksum: { type: DataTypes.STRING(64), allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    exit_status: { type: DataTypes.ENUM('running', 'success', 'failed'), allowNull: false, defaultValue: 'running' },
    report_json_path: { type: DataTypes.STRING(500), allowNull: true },
    report_summary_path: { type: DataTypes.STRING(500), allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
};

/**
 * Umzug's SCHEMA_MIGRATIONS_TABLE contract (storage.js reads/writes exactly this shape).
 */
const SCHEMA_MIGRATIONS_COLUMNS = {
    name: { type: DataTypes.STRING(255), primaryKey: true },
    checksum: { type: DataTypes.STRING(64), allowNull: true },
    executed_at: { type: DataTypes.DATE, allowNull: false }
};

const EXPECTED_TABLE_COLUMNS = {
    [COMMAND_EXECUTIONS_TABLE]: COMMAND_EXECUTIONS_COLUMNS,
    [SCHEMA_MIGRATIONS_TABLE]: SCHEMA_MIGRATIONS_COLUMNS
};

function isUnknownDatabaseError(error) {
    if (!error) {
        return false;
    }
    if (error.code === 'ER_BAD_DB_ERROR') {
        return true;
    }
    return /unknown database/i.test(String(error.message || ''));
}

/**
 * Opens a short-lived mysql2 connection without a database selected (reusing
 * the host/user/password metaSequelize was configured with) and issues a raw
 * CREATE DATABASE IF NOT EXISTS. Only called when showAllTables() fails
 * because dgfy_migration_meta doesn't exist yet.
 */
async function createMetaDatabaseIfMissing(metaSequelize) {
    const { host, port, username, password } = metaSequelize.config;
    const connection = await mysql.createConnection({ host, port, user: username, password });
    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${META_DB_NAME}\``);
    } finally {
        await connection.end();
    }
}

/**
 * Self-heal-then-validate contract (D-08): create missing tables on first
 * run; on later runs, fail fast with MetadataSchemaError on any structural
 * mismatch instead of silently altering (T-01-04).
 */
export async function ensureMetadataSchema(metaSequelize) {
    const queryInterface = metaSequelize.getQueryInterface();

    let existingTables;
    try {
        existingTables = await queryInterface.showAllTables();
    } catch (error) {
        if (!isUnknownDatabaseError(error)) {
            throw error;
        }
        await createMetaDatabaseIfMissing(metaSequelize);
        existingTables = await queryInterface.showAllTables();
    }

    const normalizedExisting = new Set(existingTables.map((table) => String(table).toLowerCase()));

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_TABLE_COLUMNS)) {
        if (!normalizedExisting.has(tableName.toLowerCase())) {
            await queryInterface.createTable(tableName, expectedColumns);
            continue;
        }

        const existingColumns = await queryInterface.describeTable(tableName);
        const missingNames = Object.keys(expectedColumns).filter((name) => !existingColumns[name]);
        if (missingNames.length > 0) {
            throw new MetadataSchemaError(
                `${META_DB_NAME}.${tableName} is missing expected column(s): ${missingNames.join(', ')}`
            );
        }
    }
}

/**
 * Records the start of a command execution. bulkInsert doesn't reliably
 * return the inserted id across dialects, so the id is fetched separately
 * via LAST_INSERT_ID().
 */
export async function recordCommandStart(metaSequelize, {
    command,
    mode,
    argsJson,
    actor,
    runtimeMode,
    migrationFile,
    checksum
}) {
    const now = new Date();
    await metaSequelize.getQueryInterface().bulkInsert(COMMAND_EXECUTIONS_TABLE, [{
        command,
        mode,
        args_json: argsJson,
        actor,
        runtime_mode: runtimeMode,
        migration_file: migrationFile,
        checksum,
        started_at: now,
        exit_status: 'running',
        created_at: now,
        updated_at: now
    }]);

    const [rows] = await metaSequelize.query('SELECT LAST_INSERT_ID() AS id');
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? Number(row.id) : null;
}

export async function recordCommandComplete(metaSequelize, executionId, {
    exitStatus,
    reportJsonPath,
    reportSummaryPath,
    errorMessage
}) {
    await metaSequelize.getQueryInterface().bulkUpdate(
        COMMAND_EXECUTIONS_TABLE,
        {
            completed_at: new Date(),
            exit_status: exitStatus,
            report_json_path: reportJsonPath || null,
            report_summary_path: reportSummaryPath || null,
            error_message: errorMessage || null,
            updated_at: new Date()
        },
        { id: executionId }
    );
}
