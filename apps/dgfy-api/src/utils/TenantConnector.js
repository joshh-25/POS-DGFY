
import { Sequelize } from 'sequelize';
import logger from '../config/logger.js';
import { getTenantMaxCachedConnections, getTenantPoolMax } from '../config/connectionBudget.js';

// Configuration
// How many tenant Sequelize instances stay alive at once. Each one holds its own
// pool of up to getTenantPoolMax() MySQL connections, so this number multiplies —
// see src/config/connectionBudget.js for the full budget and the startup check.
const MAX_CACHED_CONNECTIONS = getTenantMaxCachedConnections();
const IDLE_TIMEOUT_MS = 1000 * 60 * 10; // 10 minutes
const CLEANUP_INTERVAL_MS = 60000; // Check for idle connections every 60s
const CONNECTION_WAIT_TIMEOUT_MS = 5000; // Max wait for a pending connection

// How long closeConnection() will wait for an in-flight query to finish before
// force-closing a still-busy connection anyway (see isBusy()/closeConnection()
// below — this is the fix for the eviction-closes-a-live-handle bug that
// produced "ConnectionManager.getConnection was called after the connection
// manager was closed!" under normal LRU/idle eviction, not just at shutdown).
const CONNECTION_CLOSE_GRACE_MS = 3000;
const CONNECTION_CLOSE_POLL_MS = 100;

class TenantConnector {
    constructor() {
        this.connections = new Map(); // tenantId -> { sequelize, lastUsed, tenantName }
        this.pendingConnections = new Set(); // tenantIds currently being created
        this.cleanupInterval = null;
    }

    /**
     * Build and authenticate a brand-new Sequelize instance for a tenant.
     * Shared by getConnection() (which caches the result) and
     * openEphemeralConnection() (which deliberately does not) -- one place
     * owns host/dialect/pool defaults and the destructive-sync guardrail
     * instead of two copies drifting apart.
     *
     * Caller owns lifecycle: does not touch this.connections/pendingConnections.
     * @param {Object} tenant - Tenant object (must have db_name)
     * @param {{ poolMax?: number }} [options] - override the pool's max size;
     *   defaults to getTenantPoolMax() (the cached-connection budget). Pass a
     *   smaller value for a connection that will only ever run one query at a
     *   time (see openEphemeralConnection()) so it doesn't reserve pool slots
     *   it can't use.
     * @returns {Promise<Sequelize>} an authenticated, guardrail-wrapped Sequelize instance
     */
    async _createSequelizeInstance(tenant, { poolMax = getTenantPoolMax() } = {}) {
        const sequelize = new Sequelize(
            tenant.db_name,
            process.env.DB_USER || 'root',
            process.env.DB_PASSWORD || '',
            {
                host: process.env.DB_HOST || 'localhost',
                dialect: 'mysql',
                logging: (msg) => logger.debug(`[Tenant: ${tenant.name}] ${msg}`),
                pool: {
                    // 5 users per tenant + 2 buffer for concurrent requests from same user.
                    // Worst case across all cached tenants is MAX_CACHED_CONNECTIONS × this
                    // value, plus the landlord pool — src/config/connectionBudget.js owns
                    // that arithmetic and warns at boot when it exceeds max_connections.
                    // (Ephemeral connections, below, aren't part of that arithmetic -- they
                    // pass a tight poolMax instead, see openEphemeralConnection().)
                    max: poolMax,
                    min: 0,
                    // Fail fast (10s) instead of making users wait 30s for a connection slot
                    acquire: 10000,
                    idle: 5000,  // Reduced from 10s to 5s for multi-tenant efficiency
                    evict: 1000  // Check for idle connections every 1s
                },
                define: {
                    underscored: true,
                    timestamps: true,
                    createdAt: 'created_at',
                    updatedAt: 'updated_at'
                }
            }
        );

        // Test connection
        await sequelize.authenticate();

        // CRITICAL PRODUCTION GUARDRAIL
        // Intercept sync calls to prevent drop-table sweeps on individual tenant databases
        const originalSync = sequelize.sync.bind(sequelize);
        sequelize.sync = async (options = {}) => {
            if (options.force && !tenant.db_name.includes('test')) {
                throw new Error(`CRITICAL GUARDRAIL: Destructive sync (force: true) is FORBIDDEN on non-test tenant database: ${tenant.db_name}. Production DB wipes are permanently blocked.`);
            }
            return originalSync(options);
        };

        return sequelize;
    }

    /**
     * Get or create a database connection for a specific tenant
     * @param {Object} tenant - Tenant object (must have db_name)
     * @returns {Promise<Sequelize>} Sequelize instance
     */
    async getConnection(tenant) {
        if (!tenant || !tenant.db_name) {
            throw new Error('Invalid tenant configuration: missing db_name');
        }

        const tenantId = tenant.id;

        // 1. Check cache
        if (this.connections.has(tenantId)) {
            const cached = this.connections.get(tenantId);
            cached.lastUsed = Date.now();
            return cached.sequelize;
        }

        // 2. If another request is already creating this connection, wait for it
        if (this.pendingConnections.has(tenantId)) {
            logger.debug(`Connection for tenant ${tenant.name} is being created, waiting...`);
            const startTime = Date.now();
            while (this.pendingConnections.has(tenantId)) {
                if (Date.now() - startTime > CONNECTION_WAIT_TIMEOUT_MS) {
                    throw new Error(`Timeout waiting for tenant connection: ${tenant.name}`);
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            // Connection should now be in cache
            if (this.connections.has(tenantId)) {
                const cached = this.connections.get(tenantId);
                cached.lastUsed = Date.now();
                return cached.sequelize;
            }
        }

        // 3. Mark as pending BEFORE size check to prevent race conditions
        this.pendingConnections.add(tenantId);

        try {
            // 4. Enforce limits (count both active + in-flight connections)
            const totalCount = this.connections.size + this.pendingConnections.size;
            if (totalCount > MAX_CACHED_CONNECTIONS) {
                const toEvict = totalCount - MAX_CACHED_CONNECTIONS;
                await this.evictConnections(toEvict);
            }

            // 5. Create new connection
            logger.info(`Creating new DB connection for tenant: ${tenant.name} (${tenant.db_name})`);

            const sequelize = await this._createSequelizeInstance(tenant);

            // Cache it
            this.connections.set(tenantId, {
                sequelize,
                lastUsed: Date.now(),
                tenantName: tenant.name
            });

            logger.info(`Tenant connection pool: ${this.connections.size}/${MAX_CACHED_CONNECTIONS}`);

            return sequelize;

        } catch (error) {
            logger.error(`Failed to connect to tenant DB ${tenant.db_name}:`, error);
            throw error;
        } finally {
            // Always remove from pending, even on error
            this.pendingConnections.delete(tenantId);
        }
    }

    /**
     * Open a one-off, uncached Sequelize connection for a tenant -- for batch
     * jobs that touch every tenant in a short window (e.g. the storefront
     * discovery reconciliation sweep, #524/#527) and would otherwise thrash
     * the shared MAX_CACHED_CONNECTIONS-slot LRU cache that live POS/storefront
     * request traffic depends on.
     *
     * Unlike getConnection(), this never touches this.connections or
     * this.pendingConnections and is never subject to eviction -- the caller
     * owns the full lifecycle and MUST call `.close()` on the returned
     * instance when done (a try/finally at the call site, not here, since
     * this method doesn't know how long the caller needs it for).
     *
     * Pool size is capped at 1: a batch sweep processes one tenant's queries
     * sequentially (no reason to reserve more than one slot), and staying
     * small keeps this genuinely outside connectionBudget.js's worst-case
     * arithmetic instead of adding a second multiplier to reason about. At
     * the default sweep concurrency (4 tenants at once,
     * STOREFRONT_DISCOVERY_INDEX_SYNC_CONCURRENCY), that's at most 4 extra
     * connections momentarily on top of the documented budget.
     * @param {Object} tenant - Tenant object (must have db_name)
     * @returns {Promise<Sequelize>} an authenticated Sequelize instance, uncached
     */
    async openEphemeralConnection(tenant) {
        if (!tenant || !tenant.db_name) {
            throw new Error('Invalid tenant configuration: missing db_name');
        }
        logger.debug(`Opening ephemeral (uncached) DB connection for tenant: ${tenant.name} (${tenant.db_name})`);
        return this._createSequelizeInstance(tenant, { poolMax: 1 });
    }

    /**
     * True if a cached Sequelize instance has any connection currently checked
     * out of its pool — i.e. a query is in flight on it right now. Backed by
     * sequelize-pool's own counters (sequelize.connectionManager.pool.using),
     * so this needs zero changes at any getConnection() call site.
     *
     * If the pool can't be introspected for some reason, this defaults to
     * "busy" rather than "free" -- an unnecessary deferred close is harmless;
     * closing a connection a request still holds is not.
     * @param {Sequelize} sequelize
     * @returns {boolean}
     */
    isBusy(sequelize) {
        const pool = sequelize?.connectionManager?.pool;
        if (!pool || typeof pool.using !== 'number') return true;
        return pool.using > 0;
    }

    /**
     * Evict multiple oldest connections by LRU order.
     *
     * Only ever selects entries that are currently idle (see isBusy()) — a
     * busy entry is never chosen for eviction, so this can evict fewer than
     * `count`, or none, when every cached connection happens to be in use.
     * That means the cache can briefly exceed MAX_CACHED_CONNECTIONS; that is
     * intentional and preferred over closing a connection a live request is
     * still holding.
     * @param {number} count - Number of connections to evict
     */
    async evictConnections(count) {
        if (count <= 0 || this.connections.size === 0) return;

        // Sort by lastUsed ascending (oldest first), then keep only entries
        // that are actually idle right now.
        const sorted = Array.from(this.connections.entries())
            .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
        const eligible = sorted.filter(([, data]) => !this.isBusy(data.sequelize));
        const busySkipped = sorted.length - eligible.length;

        const toEvict = eligible.slice(0, Math.min(count, eligible.length));

        if (toEvict.length === 0) {
            logger.warn(`Evict requested ${count} connection(s) but all ${sorted.length} cached entries are busy -- evicting none this pass (pool: ${this.connections.size}/${MAX_CACHED_CONNECTIONS})`);
            return;
        }

        logger.info(`Evicting ${toEvict.length} oldest idle connections (pool: ${this.connections.size}/${MAX_CACHED_CONNECTIONS}${busySkipped > 0 ? `, ${busySkipped} busy skipped` : ''})`);

        const results = await Promise.allSettled(
            toEvict.map(([id, data]) => {
                logger.debug(`  Evicting: ${data.tenantName} (ID: ${id}, idle: ${Date.now() - data.lastUsed}ms)`);
                return this.closeConnection(id);
            })
        );

        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
            logger.warn(`${failed}/${toEvict.length} evictions failed`);
        }

        logger.info(`Pool size after eviction: ${this.connections.size}/${MAX_CACHED_CONNECTIONS}`);
    }

    /**
     * Remove oldest idle connection (backward-compatible wrapper)
     */
    async evictOldestConnection() {
        await this.evictConnections(1);
    }

    /**
     * Close connections that have been idle longer than IDLE_TIMEOUT_MS
     */
    async cleanupIdleConnections() {
        const now = Date.now();
        const idleIds = [];

        for (const [id, data] of this.connections.entries()) {
            if (now - data.lastUsed > IDLE_TIMEOUT_MS) {
                idleIds.push({ id, tenantName: data.tenantName, idleMs: now - data.lastUsed });
            }
        }

        if (idleIds.length === 0) return;

        logger.info(`Periodic cleanup: closing ${idleIds.length} idle connections (>${Math.round(IDLE_TIMEOUT_MS / 1000)}s)`);

        for (const { id, tenantName, idleMs } of idleIds) {
            logger.debug(`  Closing idle: ${tenantName} (idle: ${Math.round(idleMs / 1000)}s)`);
            await this.closeConnection(id);
        }

        logger.info(`Pool size after cleanup: ${this.connections.size}/${MAX_CACHED_CONNECTIONS}`);
    }

    /**
     * Start periodic cleanup of idle connections
     */
    startPeriodicCleanup() {
        if (this.cleanupInterval) return;

        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections().catch(err => {
                logger.error('Periodic connection cleanup error:', err);
            });
        }, CLEANUP_INTERVAL_MS);

        // Don't let the interval keep the process alive during shutdown
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }

        logger.info(`Started periodic connection cleanup (interval: ${CLEANUP_INTERVAL_MS / 1000}s, idle timeout: ${IDLE_TIMEOUT_MS / 1000}s)`);
    }

    /**
     * Stop periodic cleanup
     */
    stopPeriodicCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger.info('Stopped periodic connection cleanup');
        }
    }

    /**
     * Get current pool statistics
     * @returns {Object} Pool stats
     */
    getPoolStats() {
        return {
            total: this.connections.size,
            pending: this.pendingConnections.size,
            capacity: MAX_CACHED_CONNECTIONS,
            utilizationPercent: Math.round((this.connections.size / MAX_CACHED_CONNECTIONS) * 100)
        };
    }

    /**
     * Close a specific connection.
     *
     * Removes the entry from the cache immediately, so no new caller can be
     * handed a connection that's in the process of closing. If the
     * connection is still busy (isBusy()) at that moment, this waits up to
     * CONNECTION_CLOSE_GRACE_MS for the in-flight query to finish before
     * closing anyway -- closing out from under an active request is exactly
     * the "ConnectionManager.getConnection was called after the connection
     * manager was closed!" failure this exists to prevent.
     */
    async closeConnection(tenantId) {
        if (!this.connections.has(tenantId)) return;

        const { sequelize, tenantName } = this.connections.get(tenantId);
        // Remove from cache up front: whether or not the close below succeeds
        // or has to wait out the grace period, no new getConnection() call
        // should be able to hand this instance out again.
        this.connections.delete(tenantId);

        if (this.isBusy(sequelize)) {
            logger.debug(`Deferring close for tenant ${tenantName} (ID: ${tenantId}) -- connection busy`);
            const deadline = Date.now() + CONNECTION_CLOSE_GRACE_MS;
            while (this.isBusy(sequelize) && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, CONNECTION_CLOSE_POLL_MS));
            }
            if (this.isBusy(sequelize)) {
                logger.warn(`Closing tenant connection for ${tenantName} (ID: ${tenantId}) still busy after ${CONNECTION_CLOSE_GRACE_MS}ms grace period -- closing anyway`);
            }
        }

        try {
            await sequelize.close();
            logger.info(`Closed DB connection for tenant ID: ${tenantId}`);
        } catch (err) {
            logger.error(`Error closing tenant connection ${tenantId}:`, err);
        }
    }

    /**
     * Close all connections (app shutdown)
     */
    async closeAll() {
        this.stopPeriodicCleanup();

        logger.info(`Closing all tenant connections (${this.connections.size} active)...`);

        const closePromises = Array.from(this.connections.keys()).map(id =>
            this.closeConnection(id)
        );
        await Promise.allSettled(closePromises);

        this.pendingConnections.clear();
        logger.info('All tenant connections closed');
    }
}

// Singleton instance
const tenantConnector = new TenantConnector();
export default tenantConnector;
