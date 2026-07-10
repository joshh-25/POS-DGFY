import { Sequelize } from 'sequelize';

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
