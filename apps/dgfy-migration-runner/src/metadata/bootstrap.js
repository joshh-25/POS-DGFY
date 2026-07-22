import mysql from 'mysql2/promise';
import { DataTypes, Sequelize } from 'sequelize';
import { MetadataSchemaError } from '../utils/errors.js';

export const META_DB_NAME = 'dgfy_migration_meta';
export const COMMAND_EXECUTIONS_TABLE = 'command_executions';
export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';
// Plan 03 (D-02/D-03/D-04): durable data-run contract tables.
export const LEGACY_ID_MAP_TABLE = 'legacy_id_map';
export const DATA_CHECKPOINTS_TABLE = 'data_checkpoints';
export const DATA_QUALITY_FINDINGS_TABLE = 'data_quality_findings';

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
 *
 * Plan 03 (D-21/T-02-03-02): `target_database` joins `name` in a composite
 * primary key so the same migration filename can be recorded independently
 * for `dgfy_core` and every selected `dgfy_business_*` database — a core
 * migration record can never satisfy (or hide) a business database's own
 * pending-migration state, and vice versa.
 */
const SCHEMA_MIGRATIONS_COLUMNS = {
    name: { type: DataTypes.STRING(255), primaryKey: true },
    target_database: { type: DataTypes.STRING(128), primaryKey: true },
    checksum: { type: DataTypes.STRING(64), allowNull: true },
    executed_at: { type: DataTypes.DATE, allowNull: false }
};

/**
 * Plan 03 (D-02, T-03-01-02): durable legacy-to-DGFY ID map. Scoped by
 * run_scope so retries can look up existing mappings instead of recomputing
 * or risking a second row (D-04, Pitfall 3 — retry duplicates). No foreign
 * keys to dgfy_core/dgfy_business_* tables: those live in separate MySQL
 * databases and cannot be referenced across databases.
 */
const LEGACY_ID_MAP_COLUMNS = {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    run_scope: { type: DataTypes.STRING(120), allowNull: false },
    legacy_source: { type: DataTypes.STRING(120), allowNull: false },
    legacy_table: { type: DataTypes.STRING(120), allowNull: false },
    legacy_id: { type: DataTypes.STRING(120), allowNull: false },
    dgfy_database: { type: DataTypes.STRING(128), allowNull: false },
    dgfy_table: { type: DataTypes.STRING(120), allowNull: false },
    dgfy_id: { type: DataTypes.STRING(120), allowNull: false },
    mapped_at: { type: DataTypes.DATE, allowNull: false }
};

/**
 * Plan 03 (D-03, T-03-01-02): per (run_scope, legacy_tenant_id, entity_type)
 * checkpoint row — lets an interrupted migration resume at the exact entity
 * type for a tenant rather than restarting the whole tenant (MIG-04).
 */
const DATA_CHECKPOINTS_COLUMNS = {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    run_scope: { type: DataTypes.STRING(120), allowNull: false },
    legacy_tenant_id: { type: DataTypes.STRING(120), allowNull: false },
    entity_type: { type: DataTypes.STRING(80), allowNull: false },
    dgfy_database: { type: DataTypes.STRING(128), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed'), allowNull: false, defaultValue: 'pending' },
    last_processed_legacy_id: { type: DataTypes.STRING(120), allowNull: true },
    records_processed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
};

/**
 * Plan 03 (D-04, T-03-01-02): every skipped/conflicting/orphaned record
 * becomes a durable finding row here — never silently dropped from the
 * migration report (MIG-02/MIG-03/MIG-05).
 */
const DATA_QUALITY_FINDINGS_COLUMNS = {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    run_scope: { type: DataTypes.STRING(120), allowNull: false },
    legacy_tenant_id: { type: DataTypes.STRING(120), allowNull: true },
    entity_type: { type: DataTypes.STRING(80), allowNull: false },
    legacy_table: { type: DataTypes.STRING(120), allowNull: true },
    legacy_id: { type: DataTypes.STRING(120), allowNull: true },
    severity: { type: DataTypes.ENUM('skip', 'conflict', 'orphan'), allowNull: false },
    reason_code: { type: DataTypes.STRING(80), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    remediation: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('open', 'resolved'), allowNull: false, defaultValue: 'open' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
};

const EXPECTED_TABLE_COLUMNS = {
    [COMMAND_EXECUTIONS_TABLE]: COMMAND_EXECUTIONS_COLUMNS,
    [SCHEMA_MIGRATIONS_TABLE]: SCHEMA_MIGRATIONS_COLUMNS,
    [LEGACY_ID_MAP_TABLE]: LEGACY_ID_MAP_COLUMNS,
    [DATA_CHECKPOINTS_TABLE]: DATA_CHECKPOINTS_COLUMNS,
    [DATA_QUALITY_FINDINGS_TABLE]: DATA_QUALITY_FINDINGS_COLUMNS
};

/**
 * Plan 03 (D-02/D-03, T-03-01-02): composite unique indexes added only at
 * first-run createTable time (never re-added against an existing table —
 * ensureMetadataSchema only reaches the create branch for a table that was
 * missing). These are what actually prevent a retried apply from inserting
 * a second legacy_id_map or data_checkpoints row for the same scope
 * (D-04/Pitfall 3), not just the lookup-before-insert helpers in
 * metadata/dataState.js.
 */
const FIRST_RUN_UNIQUE_INDEXES = {
    [LEGACY_ID_MAP_TABLE]: {
        name: 'uniq_legacy_id_map_scope_source_table_id',
        fields: ['run_scope', 'legacy_source', 'legacy_table', 'legacy_id']
    },
    [DATA_CHECKPOINTS_TABLE]: {
        name: 'uniq_data_checkpoints_scope_tenant_entity',
        fields: ['run_scope', 'legacy_tenant_id', 'entity_type']
    }
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

            const uniqueIndex = FIRST_RUN_UNIQUE_INDEXES[tableName];
            if (uniqueIndex) {
                await queryInterface.addIndex(tableName, uniqueIndex.fields, {
                    unique: true,
                    name: uniqueIndex.name
                });
            }
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
 * via LAST_INSERT_ID(). LAST_INSERT_ID() is per-connection/session, so the
 * insert and the follow-up SELECT are wrapped in the same transaction —
 * Sequelize pins every query issued against a transaction to the single
 * pooled connection that transaction was opened on, guaranteeing the SELECT
 * observes the INSERT that just happened (rather than racing a different
 * pooled connection's own last-insert value).
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
    return metaSequelize.transaction(async (transaction) => {
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
        }], { transaction });

        const [rows] = await metaSequelize.query('SELECT LAST_INSERT_ID() AS id', { transaction });
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row ? Number(row.id) : null;
    });
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
