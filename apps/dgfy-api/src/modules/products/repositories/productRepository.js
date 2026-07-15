// ProductRepository — Clean Architecture data access adapter for the
// tenant-scoped `products` domain (PRD-01/PRD-02/BOK-01), mirroring
// ../../businesses/repositories/locationRepository.js's role and copied
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold.
// Every product use case reaches product data exclusively through this
// repository. No business logic lives here, only data access + tenant-
// database resolution.
//
// Unlike locationRepository.js (which imports its model factory directly),
// this repository resolves the Product model via the injected
// tenantConnector.getModels(databaseName).Product registry (08-03-PLAN.md's
// key_link) — Product is one of the 8 commerce Tenant models registered in
// TenantConnector.getModels() (08-02).
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

export class ProductRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   locationRepository.js's doc comment) so this repository can always
     *   be constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('ProductRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (04-06-SUMMARY.md: "verified"
     * is status='active' + verified_at populated, not a distinct status).
     * Throws TenantDatabaseUnavailableError for every non-writable state.
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
     * Resolves the Product model via TenantConnector.getModels(databaseName)
     * — never a direct model-factory import — per 08-03-PLAN.md's key_link.
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).Product;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(Product)` against it. Any error surfaced while resolving the
     * model or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one (never double-wrapped).
     * @param {string} businessId
     * @param {(model: Object) => Promise<any>} fn
     */
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
     * Inserts a product for businessId.
     * @param {{businessId, name, category, inventory_mode, folder_id?, base_price?}} input
     */
    async create({ businessId, name, category, inventory_mode, folder_id = null, base_price = null }) {
        if (!businessId) throw new Error('ProductRepository.create requires businessId.');

        return this.withModel(businessId, async (Product) => {
            const record = await Product.create({
                business_id: businessId,
                name,
                category,
                inventory_mode,
                folder_id,
                base_price,
                is_active: true
            });
            return this.toPlain(record);
        });
    }

    async findById(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModel(businessId, async (Product) => {
            const record = await Product.findByPk(Number(id));
            return record ? this.toPlain(record) : null;
        });
    }

    async findAll(businessId) {
        if (!businessId) return [];
        return this.withModel(businessId, async (Product) => {
            const records = await Product.findAll({ order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * Partial update: only fields present on `updates` are written. Used by
     * both updateProduct (general fields) and setProductBookable (bookable
     * config fields).
     */
    async update(businessId, id, updates = {}) {
        return this.withModel(businessId, async (Product) => {
            const record = await Product.findByPk(Number(id));
            if (!record) return null;

            const patch = {};
            [
                'name',
                'category',
                'inventory_mode',
                'folder_id',
                'base_price',
                'is_active',
                'is_bookable',
                'slot_duration_minutes',
                'concurrent_capacity'
            ].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(updates, key)) {
                    patch[key] = updates[key];
                }
            });

            await record.update(patch);
            return this.toPlain(record);
        });
    }

    /**
     * Soft delete: sets is_active=false. Record remains in the tenant table.
     */
    async delete(businessId, id) {
        return this.update(businessId, id, { is_active: false });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            name: plain.name,
            category: plain.category,
            inventory_mode: plain.inventory_mode,
            folder_id: plain.folder_id,
            is_bookable: plain.is_bookable,
            slot_duration_minutes: plain.slot_duration_minutes,
            concurrent_capacity: plain.concurrent_capacity,
            base_price: plain.base_price,
            is_active: plain.is_active,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {ProductRepository}
 */
export const buildProductRepository = (deps) => new ProductRepository(deps);

export default ProductRepository;
