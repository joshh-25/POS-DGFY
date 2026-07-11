import { Sequelize } from 'sequelize';

// Minimal per-tenant-database connection cache for apps/dgfy-api (Wave 4,
// 04-04-PLAN.md's key_links: "TenantConnector -> resolves per-tenant
// database; Phase 4 uses for tenant model access"; 04-PLAN.md's "Pattern
// Reuse & Adaptation" section names this exact target file/adaptation:
// backend/src/utils/TenantConnector.js -> apps/dgfy-api/src/infra/
// tenantConnector.js). Adapted from the legacy TenantConnector's
// connection-caching approach but intentionally minimal:
//   - No periodic idle-eviction timers (legacy's `startPeriodicCleanup`) —
//     those would leak `setInterval` handles across Jest test runs and
//     apps/dgfy-api has no eviction-pressure use case yet (no business
//     tenant-database *provisioning* flow exists anywhere in this codebase
//     yet, so the realistic number of concurrently-open tenant connections
//     in this phase is small; see 04-03.5-SUMMARY.md's Known Stub).
//   - No pending-connection race/wait handling — apps/dgfy-api resolves a
//     tenant connection once per request via BusinessDatabaseRegistry
//     (Task 2), and Sequelize's own connection pool already serializes
//     concurrent callers against the same cached instance safely.
// Reuses this service's own DB_HOST/DB_USER/DB_PASSWORD/DB_PORT connection
// credentials (config/env.js's dotenv-loaded env vars) and only swaps the
// `database` argument to the resolved dgfy_business_<suffix> name — same
// MySQL server/user, different database — mirroring the legacy connector's
// approach exactly.
export class TenantConnector {
    /**
     * @param {{host?, port?, user?, password?, dialect?}} [config] - defaults
     *   to this service's own landlord DB connection env vars (same host,
     *   different `database` per getConnection() call).
     */
    constructor({ host, port, user, password, dialect = 'mysql' } = {}) {
        this.host = host || process.env.DB_HOST || 'localhost';
        this.port = Number(port || process.env.DB_PORT || 3306);
        this.user = user || process.env.DB_USER;
        this.password = password || process.env.DB_PASSWORD;
        this.dialect = dialect;
        this.connections = new Map(); // databaseName -> Sequelize instance
    }

    /**
     * Returns a cached (or newly created + cached) Sequelize connection for
     * databaseName. Lazy-connect (mirrors Sequelize's own default) — does
     * not call .authenticate() eagerly; callers that need to fail fast on
     * an unreachable tenant database should do so themselves.
     * @param {string} databaseName
     * @returns {Sequelize}
     */
    getConnection(databaseName) {
        if (!databaseName) {
            throw new Error('TenantConnector.getConnection requires a databaseName.');
        }
        if (this.connections.has(databaseName)) {
            return this.connections.get(databaseName);
        }

        const sequelize = new Sequelize(databaseName, this.user, this.password, {
            host: this.host,
            port: this.port,
            dialect: this.dialect,
            logging: false,
            pool: {
                max: 5,
                min: 0,
                acquire: 10000,
                idle: 10000
            },
            define: {
                underscored: true,
                timestamps: true,
                createdAt: 'created_at',
                updatedAt: 'updated_at'
            }
        });

        this.connections.set(databaseName, sequelize);
        return sequelize;
    }

    /**
     * Closes and evicts a single cached connection (test cleanup / graceful
     * shutdown helper).
     */
    async closeConnection(databaseName) {
        const sequelize = this.connections.get(databaseName);
        if (!sequelize) return;
        await sequelize.close();
        this.connections.delete(databaseName);
    }

    /**
     * Closes every cached connection (app shutdown / test teardown).
     */
    async closeAll() {
        await Promise.all(
            Array.from(this.connections.keys()).map((databaseName) => this.closeConnection(databaseName))
        );
    }

    getPoolStats() {
        return { total: this.connections.size, databases: Array.from(this.connections.keys()) };
    }
}

/**
 * @param {{host?, port?, user?, password?, dialect?}} [deps]
 * @returns {TenantConnector}
 */
export const buildTenantConnector = (deps) => new TenantConnector(deps);

export default TenantConnector;
