// InventoryMovementRepository — Clean Architecture data access adapter for
// the tenant-scoped, append-only `inventory_movements` ledger (PRD-04, ADR
// 0029 D-06). Mirrors ../../products/repositories/productRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// its "resolve the model via tenantConnector.getModels(databaseName)"
// convention (never a direct model-factory import).
//
// modules/inventory is the SOLE writer of inventory_movements rows — this
// repository deliberately exposes ONLY create/bulkCreate/findAll/findOne for
// the movement surface. There is no update()/delete()/destroy() method
// anywhere on this class; that is enforced here at the application layer
// (the InventoryMovement Tenant model itself also throws on
// beforeUpdate/beforeBulkUpdate, and the 08-01 migration's DB triggers are
// the hard backstop — see 08-RESEARCH.md Pattern C).
//
// recordMovementWithStockSync() is the one write path that touches BOTH
// tables it owns: it inserts the movement row AND (for a basic_inventory
// product only) applies a guarded stock_count delta on `products`, inside a
// single sequelize.transaction() (08-04-PLAN.md's key_link). The guard is
// two-layered: (1) an application-level check that the resulting stock_count
// would not go negative, computed BEFORE issuing the UPDATE, and (2) an
// optimistic-concurrency WHERE clause that only applies the UPDATE if
// stock_count still matches the value just read — if another transaction
// changed it in between, affectedRows will be 0 and this repository surfaces
// that as the same InsufficientStockError rather than silently overwriting a
// concurrent write.
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

/**
 * Thrown by recordMovementWithStockSync() when applying a movement would
 * drive a basic_inventory product's stock_count negative, or when the
 * optimistic-concurrency guard on the stock_count UPDATE detects a
 * concurrent modification (affectedRows !== 1). Usecases duck-type on
 * `error.name === 'InsufficientStockError'` and map it to a 409 conflict.
 */
export class InsufficientStockError extends Error {
    constructor(message) {
        super(message || 'Insufficient stock for this movement.');
        this.name = 'InsufficientStockError';
    }
}

/**
 * Thrown by recordMovementWithStockSync() when productId does not resolve to
 * an existing product in this business's tenant database. Usecases duck-type
 * on `error.name === 'InventoryProductNotFoundError'` and map it to a 404.
 */
export class InventoryProductNotFoundError extends Error {
    constructor(message) {
        super(message || 'Product not found for this movement.');
        this.name = 'InventoryProductNotFoundError';
    }
}

export class InventoryMovementRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   productRepository.js's doc comment) so this repository can always be
     *   constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('InventoryMovementRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors productRepository.js /
     * locationRepository.js). Throws TenantDatabaseUnavailableError for
     * every non-writable state.
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
     * Resolves the InventoryMovement model via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import — mirroring productRepository.js's resolveModel().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).InventoryMovement;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(InventoryMovement)` against it. Any error surfaced while resolving
     * the model or running the query is normalized to
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
     * Inserts a single inventory_movements row with NO stock_count side
     * effect (used by callers that have already applied any stock sync
     * themselves, or for reserved/effect-type rows once D-06's contracts are
     * wired). For the manual restock/loss/adjustment flow, usecases call
     * recordMovementWithStockSync() instead.
     * @param {string} businessId
     * @param {{productId, movementType, quantity, referenceType?, referenceId?, actorAccountId?, actorStaffAccountId?, beforeSnapshot?, afterSnapshot?}} input
     */
    async create(businessId, input = {}) {
        if (!businessId) throw new Error('InventoryMovementRepository.create requires businessId.');

        return this.withModel(businessId, async (InventoryMovement) => {
            const record = await InventoryMovement.create({
                business_id: businessId,
                product_id: input.productId,
                movement_type: input.movementType,
                quantity: input.quantity,
                reference_type: input.referenceType ?? null,
                reference_id: input.referenceId ?? null,
                actor_account_id: input.actorAccountId ?? null,
                actor_staff_account_id: input.actorStaffAccountId ?? null,
                before_snapshot: input.beforeSnapshot ?? null,
                after_snapshot: input.afterSnapshot ?? null
            });
            return this.toPlain(record);
        });
    }

    /**
     * Bulk-inserts multiple inventory_movements rows in one call. Reserved
     * for future batch-recording callers (e.g. a Phase 9 checkout completion
     * that must record several product lines' sale effects at once); no
     * update/delete counterpart exists.
     * @param {string} businessId
     * @param {Array<Object>} inputs
     */
    async bulkCreate(businessId, inputs = []) {
        if (!businessId) throw new Error('InventoryMovementRepository.bulkCreate requires businessId.');

        return this.withModel(businessId, async (InventoryMovement) => {
            const records = await InventoryMovement.bulkCreate(inputs.map((input) => ({
                business_id: businessId,
                product_id: input.productId,
                movement_type: input.movementType,
                quantity: input.quantity,
                reference_type: input.referenceType ?? null,
                reference_id: input.referenceId ?? null,
                actor_account_id: input.actorAccountId ?? null,
                actor_staff_account_id: input.actorStaffAccountId ?? null,
                before_snapshot: input.beforeSnapshot ?? null,
                after_snapshot: input.afterSnapshot ?? null
            })));
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * @param {string} businessId
     * @param {{productId?}} [filter]
     */
    async findAll(businessId, { productId } = {}) {
        if (!businessId) return [];
        return this.withModel(businessId, async (InventoryMovement) => {
            const where = { business_id: businessId };
            if (productId !== undefined && productId !== null) {
                where.product_id = productId;
            }
            const records = await InventoryMovement.findAll({ where, order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * @param {string} businessId
     * @param {number|string} id
     */
    async findOne(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModel(businessId, async (InventoryMovement) => {
            const record = await InventoryMovement.findOne({ where: { id: Number(id), business_id: businessId } });
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Records a restock/loss/adjustment (or, once wired, a reserved
     * sale/booking effect) movement AND, for a basic_inventory product,
     * applies the matching guarded stock_count delta — both inside one
     * sequelize.transaction() (08-04-PLAN.md's key_link).
     *
     * `quantity` here is the SIGNED delta already resolved by the caller
     * (usecases apply the sign: +N for restock, -N for loss, as-provided for
     * adjustment) — this method does not re-derive sign from movementType,
     * it applies exactly the delta it is given.
     *
     * For a non_stock product, stock_count is left untouched (there is
     * nothing to sync) but the movement row is still recorded.
     *
     * When `options.transaction` is provided (e.g., from an outer
     * finalize-transaction), the Product read + guarded stock UPDATE +
     * InventoryMovement.create use that external transaction instead of
     * opening a new one. When absent, opens its own transaction as usual
     * (preserving existing behavior). The negative-stock precheck and
     * optimistic-concurrency WHERE guard remain unchanged in both paths.
     *
     * @param {string} businessId
     * @param {{productId, movementType, quantity, referenceType?, referenceId?, actorAccountId?, actorStaffAccountId?, beforeSnapshot?, afterSnapshot?}} input
     * @param {{transaction?: Object}} [options={}]
     * @returns {Promise<{movement: Object, product: {id, inventory_mode, stock_count}}>}
     */
    async recordMovementWithStockSync(businessId, input = {}, options = {}) {
        if (!businessId) {
            throw new Error('InventoryMovementRepository.recordMovementWithStockSync requires businessId.');
        }

        const {
            productId,
            movementType,
            quantity,
            referenceType = null,
            referenceId = null,
            actorAccountId = null,
            actorStaffAccountId = null,
            beforeSnapshot = null,
            afterSnapshot = null
        } = input;

        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const { InventoryMovement, Product } = this.tenantConnector.getModels(databaseName);
            const sequelize = InventoryMovement.sequelize;

            const executeMovement = async (transaction) => {
                const product = await Product.findByPk(Number(productId), { transaction });
                if (!product) {
                    throw new InventoryProductNotFoundError('Product not found for this movement.');
                }

                const delta = Number(quantity);
                let stockCountAfter = product.stock_count;

                if (product.inventory_mode === 'basic_inventory') {
                    const currentStock = Number(product.stock_count || 0);
                    const nextStock = currentStock + delta;
                    if (nextStock < 0) {
                        throw new InsufficientStockError(
                            'This movement would drive the product\'s stock_count negative.'
                        );
                    }

                    const [affectedRows] = await Product.update(
                        { stock_count: nextStock },
                        {
                            where: { id: product.id, business_id: businessId, stock_count: product.stock_count },
                            transaction
                        }
                    );
                    if (affectedRows !== 1) {
                        throw new InsufficientStockError(
                            'The product\'s stock_count changed concurrently; please retry this movement.'
                        );
                    }
                    stockCountAfter = nextStock;
                }

                const movement = await InventoryMovement.create({
                    business_id: businessId,
                    product_id: productId,
                    movement_type: movementType,
                    quantity: delta,
                    reference_type: referenceType,
                    reference_id: referenceId,
                    actor_account_id: actorAccountId,
                    actor_staff_account_id: actorStaffAccountId,
                    before_snapshot: beforeSnapshot,
                    after_snapshot: afterSnapshot
                }, { transaction });

                return {
                    movement: this.toPlain(movement),
                    product: {
                        id: product.id,
                        inventory_mode: product.inventory_mode,
                        stock_count: stockCountAfter
                    }
                };
            };

            if (options.transaction) {
                return await executeMovement(options.transaction);
            }
            return await sequelize.transaction(executeMovement);
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            if (error instanceof InsufficientStockError) throw error;
            if (error instanceof InventoryProductNotFoundError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            product_id: plain.product_id,
            movement_type: plain.movement_type,
            quantity: plain.quantity,
            reference_type: plain.reference_type,
            reference_id: plain.reference_id,
            actor_account_id: plain.actor_account_id,
            actor_staff_account_id: plain.actor_staff_account_id,
            before_snapshot: plain.before_snapshot,
            after_snapshot: plain.after_snapshot,
            created_at: plain.created_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {InventoryMovementRepository}
 */
export const buildInventoryMovementRepository = (deps) => new InventoryMovementRepository(deps);

export default InventoryMovementRepository;
