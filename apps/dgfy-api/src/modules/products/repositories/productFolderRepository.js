// ProductFolderRepository — Clean Architecture data access adapter for the
// tenant-scoped `product_folders` domain (PRD-03, D-14: flat grouping, no
// self-referencing nesting column).
// Mirrors ../../businesses/repositories/locationRepository.js's copied
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// ./productRepository.js's TenantConnector.getModels() resolution style.
// Adds a per-tenant folder-name uniqueness lookup (findByName) that
// productFolderUseCases.js's createProductFolder use case relies on to
// return a 409 conflict rather than a raw unique-index DB error.
export class TenantDatabaseUnavailableError extends Error {
    /**
     * @param {'missing'|'provisioning'|'inactive'|'unverified'|'unreachable'|'not_configured'} reason
     * @param {string} [message]
     */
    constructor(reason, message) {
        super(message || `Tenant database unavailable for this business (${reason}).`);
        this.name = 'TenantDatabaseUnavailableError';
        this.reason = reason;
    }
}

export class ProductFolderRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('ProductFolderRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * @param {string} businessId
     * @returns {Promise<string>}
     */
    async resolveDatabaseName(businessId) {
        if (!this.businessDatabaseRegistryRepository) {
            throw new TenantDatabaseUnavailableError(
                'not_configured',
                'Tenant database registry is not configured.'
            );
        }

        const registryEntry = await this.businessDatabaseRegistryRepository.findByBusinessId(businessId);
        if (!registryEntry || !registryEntry.database_name) {
            throw new TenantDatabaseUnavailableError(
                'missing',
                'No tenant database is registered for this business.'
            );
        }
        if (registryEntry.status === 'provisioning') {
            throw new TenantDatabaseUnavailableError('provisioning', 'Tenant database is still provisioning.');
        }
        if (registryEntry.status !== 'active') {
            throw new TenantDatabaseUnavailableError('inactive', 'Tenant database is not active.');
        }
        if (!registryEntry.verified_at) {
            throw new TenantDatabaseUnavailableError('unverified', 'Tenant database has not been verified.');
        }

        return registryEntry.database_name;
    }

    /**
     * Resolves the ProductFolder model via TenantConnector.getModels()
     * (never a direct model-factory import).
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).ProductFolder;
    }

    async withModel(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const model = this.resolveModel(databaseName);
            return await fn(model);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Inserts a product folder for businessId. Flat (D-14) — no self-
     * referencing nesting field is ever accepted or written.
     * @param {{businessId, name, description?, show_in_pos_filter?}} input
     */
    async create({ businessId, name, description = null, show_in_pos_filter = true }) {
        if (!businessId) throw new Error('ProductFolderRepository.create requires businessId.');

        return this.withModel(businessId, async (ProductFolder) => {
            const record = await ProductFolder.create({
                business_id: businessId,
                name,
                description,
                show_in_pos_filter,
                is_active: true
            });
            return this.toPlain(record);
        });
    }

    async findById(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModel(businessId, async (ProductFolder) => {
            const record = await ProductFolder.findByPk(Number(id));
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Case-insensitive lookup by name, scoped to businessId (its own tenant
     * database) — backs the per-tenant-unique folder-name conflict check
     * (PRD-03).
     */
    async findByName(businessId, name) {
        if (!businessId || !name) return null;
        return this.withModel(businessId, async (ProductFolder) => {
            const record = await ProductFolder.findOne({
                where: ProductFolder.sequelize.where(
                    ProductFolder.sequelize.fn('LOWER', ProductFolder.sequelize.col('name')),
                    String(name).trim().toLowerCase()
                )
            });
            return record ? this.toPlain(record) : null;
        });
    }

    async findAll(businessId) {
        if (!businessId) return [];
        return this.withModel(businessId, async (ProductFolder) => {
            const records = await ProductFolder.findAll({ order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    async update(businessId, id, updates = {}) {
        return this.withModel(businessId, async (ProductFolder) => {
            const record = await ProductFolder.findByPk(Number(id));
            if (!record) return null;

            const patch = {};
            ['name', 'description', 'show_in_pos_filter', 'is_active'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(updates, key)) {
                    patch[key] = updates[key];
                }
            });

            await record.update(patch);
            return this.toPlain(record);
        });
    }

    async delete(businessId, id) {
        return this.update(businessId, id, { is_active: false });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            name: plain.name,
            description: plain.description,
            show_in_pos_filter: plain.show_in_pos_filter,
            is_active: plain.is_active,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {ProductFolderRepository}
 */
export const buildProductFolderRepository = (deps) => new ProductFolderRepository(deps);

export default ProductFolderRepository;
