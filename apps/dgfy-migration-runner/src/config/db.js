import { Sequelize } from 'sequelize';
import { TargetGuardError } from '../utils/errors.js';

// Plan 03 (D-01): mirrors config/env.js's TARGET_DB_NAME_PATTERN shape —
// used here only to reject a legacy tenant database name that is itself a
// dgfy_*-named database, never to validate a real target name.
const DGFY_PREFIXED_NAME_PATTERN = /^dgfy_/i;

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

function poolForRuntimeMode(runtimeMode) {
    return runtimeMode === 'production'
        ? { max: 5, min: 0, acquire: 30000, idle: 10000 }
        : { max: 10, min: 0, acquire: 10000, idle: 10000 };
}

/**
 * Lazy factories over the validated config object validateEnv() produces
 * (apps/dgfy-migration-runner/src/config/env.js). Per RUN-03's "validate
 * before connecting" ordering, none of these may be invoked at module import
 * time — command handlers call them only after validateEnv() succeeds. Each
 * factory constructs its own Sequelize instance inline (no shared top-level
 * construction) so all three `new Sequelize(` calls live inside their own
 * factory function body.
 */
export function createSourceConnection(config) {
    const { host, port, user, password, name } = config.sourceDb;
    return new Sequelize(name, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}

export function createTargetConnection(config) {
    const { host, port, user, password, name } = config.targetDb;
    return new Sequelize(name, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}

export function createMetaConnection(config) {
    // Meta schema lives on the same MySQL server as target, per D-05/D-07.
    const { host, port, user, password } = config.targetDb;
    const { name } = config.metaDb;
    return new Sequelize(name, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}

/**
 * Plan 03 (D-02/D-08, Task 2): per-database connection factory for the
 * explicit dgfy_business_* target list. Reuses the same target host/user/
 * password credentials as createTargetConnection() — only the database name
 * differs per selected business target — so the schema command can migrate
 * one or more dgfy_business_* databases deterministically without a second
 * credential source.
 *
 * @param {object} config validated config from validateEnv()
 * @param {string} databaseName a dgfy_business_* database name
 */
export function createBusinessTargetConnection(config, databaseName) {
    const { host, port, user, password } = config.targetDb;
    return new Sequelize(databaseName, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}

/**
 * Plan 03 (D-01, T-03-01-03): per-database connection factory for reading a
 * single legacy tenant database named in the validated migration target
 * manifest (src/data/targetManifest.js). Reuses the runner's own
 * SOURCE_DB_HOST/SOURCE_DB_USER/SOURCE_DB_PASSWORD credentials — never the
 * backend's `backend/src/utils/TenantConnector.js` — and never reads
 * `process.env` directly (only the validated `config.sourceDb` object).
 * Rejects a blank or dgfy_*-named `databaseName` before constructing the
 * Sequelize instance, so a malformed/tampered manifest entry can never
 * redirect a legacy source read onto a DGFY-owned database (threat model:
 * "Target-list tampering migrates unintended tenant").
 *
 * @param {object} config validated config from validateEnv()
 * @param {string} databaseName a legacy_tenant_db_name from the validated manifest
 */
export function createLegacyTenantSourceConnection(config, databaseName) {
    if (isBlank(databaseName)) {
        throw new TargetGuardError('createLegacyTenantSourceConnection requires a non-blank legacy tenant database name');
    }

    const trimmedName = String(databaseName).trim();
    if (DGFY_PREFIXED_NAME_PATTERN.test(trimmedName)) {
        throw new TargetGuardError(
            `createLegacyTenantSourceConnection refuses dgfy_*-named database "${trimmedName}" as a legacy tenant source`
        );
    }

    const { host, port, user, password } = config.sourceDb;
    return new Sequelize(trimmedName, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}
