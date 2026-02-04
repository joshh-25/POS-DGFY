
import { Sequelize } from 'sequelize';
import logger from '../config/logger.js';
import db from '../models/index.js'; // Main DB connection (Landlord)

// Configuration
const MAX_CACHED_CONNECTIONS = 5;
const IDLE_TIMEOUT_MS = 1000 * 60 * 10; // 10 minutes

class TenantConnector {
    constructor() {
        this.connections = new Map(); // tenantId -> { sequelize, lastUsed }
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

        // 2. Enforce limits (LRU-like cleanup)
        if (this.connections.size >= MAX_CACHED_CONNECTIONS) {
            await this.evictOldestConnection();
        }

        // 3. Create new connection
        logger.info(`Creating new DB connection for tenant: ${tenant.name} (${tenant.db_name})`);

        try {
            const sequelize = new Sequelize(
                tenant.db_name,
                process.env.DB_USER || 'root',      // Using same DB user for now, can be tenant-specific later
                process.env.DB_PASSWORD || '',
                {
                    host: process.env.DB_HOST || 'localhost',
                    dialect: 'mysql',
                    logging: (msg) => logger.debug(`[Tenant: ${tenant.name}] ${msg}`),
                    pool: {
                        max: 5,
                        min: 0,
                        acquire: 30000,
                        idle: 10000
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

            // Cache it
            this.connections.set(tenantId, {
                sequelize,
                lastUsed: Date.now()
            });

            return sequelize;

        } catch (error) {
            logger.error(`Failed to connect to tenant DB ${tenant.db_name}:`, error);
            throw error;
        }
    }

    /**
     * Remove oldest idle connection
     */
    async evictOldestConnection() {
        let oldestId = null;
        let oldestTime = Infinity;

        for (const [id, data] of this.connections.entries()) {
            if (data.lastUsed < oldestTime) {
                oldestTime = data.lastUsed;
                oldestId = id;
            }
        }

        if (oldestId) {
            await this.closeConnection(oldestId);
        }
    }

    /**
     * Close a specific connection
     */
    async closeConnection(tenantId) {
        if (this.connections.has(tenantId)) {
            const { sequelize, tenantName } = this.connections.get(tenantId);
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
        for (const id of this.connections.keys()) {
            await this.closeConnection(id);
        }
    }
}

// Singleton instance
const tenantConnector = new TenantConnector();
export default tenantConnector;
