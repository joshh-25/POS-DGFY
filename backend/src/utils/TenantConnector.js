
import { Sequelize } from 'sequelize';
import logger from '../config/logger.js';

// Configuration
const MAX_CACHED_CONNECTIONS = 20;
const IDLE_TIMEOUT_MS = 1000 * 60 * 10; // 10 minutes
const CLEANUP_INTERVAL_MS = 60000; // Check for idle connections every 60s
const CONNECTION_WAIT_TIMEOUT_MS = 5000; // Max wait for a pending connection

class TenantConnector {
    constructor() {
        this.connections = new Map(); // tenantId -> { sequelize, lastUsed, tenantName }
        this.pendingConnections = new Set(); // tenantIds currently being created
        this.cleanupInterval = null;
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
                        // 10 tenants × 7 = 70 tenant connections + 30 landlord = 100 total,
                        // safely under MySQL's default max_connections of 151.
                        max: 7,
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
     * Evict multiple oldest connections by LRU order
     * @param {number} count - Number of connections to evict
     */
    async evictConnections(count) {
        if (count <= 0 || this.connections.size === 0) return;

        // Sort by lastUsed ascending (oldest first)
        const sorted = Array.from(this.connections.entries())
            .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

        const toEvict = sorted.slice(0, Math.min(count, sorted.length));

        logger.info(`Evicting ${toEvict.length} oldest connections (pool: ${this.connections.size}/${MAX_CACHED_CONNECTIONS})`);

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
     * Close a specific connection
     */
    async closeConnection(tenantId) {
        if (this.connections.has(tenantId)) {
            const { sequelize } = this.connections.get(tenantId);
            try {
                await sequelize.close();
                this.connections.delete(tenantId);
                logger.info(`Closed DB connection for tenant ID: ${tenantId}`);
            } catch (err) {
                logger.error(`Error closing tenant connection ${tenantId}:`, err);
            }
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
