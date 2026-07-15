// stageEventRepository — Clean Architecture data access adapter for the
// tenant-scoped, STRICTLY append-only `availment_stage_events` ledger
// (Phase 11, FUL-02, D-05/D-06/D-07/D-15). Mirrors
// ../../inventory/repositories/inventoryMovementRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// its "resolve the model via tenantConnector.getModels(databaseName)"
// convention (never a direct model-factory import).
//
// This repository deliberately exposes ONLY create/bulkCreate/findAll/
// findOne — there is no update()/delete()/destroy() method anywhere on this
// class; that is enforced here at the application layer (the
// AvailmentStageEvent Tenant model itself also throws on
// beforeUpdate/beforeBulkUpdate, and the 11-01 migration's DB-level
// SIGNAL '45000' triggers are the hard backstop).
//
// bulkCreate() is the write path the availments finalize seam (Plan 03)
// uses to auto-write the full per-mode stage sequence inside its own
// sequelize.transaction() — when an outer `{ transaction }` is passed to
// create()/bulkCreate(), it is used directly rather than opening a new one
// (mirrors inventoryMovementRepository.js's recordMovementWithStockSync
// options.transaction pattern).
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

export class StageEventRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   inventoryMovementRepository.js's doc comment) so this repository can
     *   always be constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('StageEventRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * inventoryMovementRepository.js). Throws TenantDatabaseUnavailableError
     * for every non-writable state.
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
     * Resolves the AvailmentStageEvent model via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import — mirroring inventoryMovementRepository.js's resolveModel().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).AvailmentStageEvent;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(AvailmentStageEvent)` against it. Any error surfaced while
     * resolving the model or running the query is normalized to
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
     * Inserts a single availment_stage_events row. When `options.transaction`
     * is provided (e.g. the availments finalize transaction), the write uses
     * it directly instead of opening a new one.
     * @param {string} businessId
     * @param {{availmentId, fulfillmentMode, fulfillmentStatus, fulfillmentStage?, reason?, isForced?, actorStaffAccountId?, actorAccountId?}} input
     * @param {{transaction?: Object}} [options={}]
     */
    async create(businessId, input = {}, options = {}) {
        if (!businessId) throw new Error('StageEventRepository.create requires businessId.');

        return this.withModel(businessId, async (AvailmentStageEvent) => {
            const record = await AvailmentStageEvent.create({
                business_id: businessId,
                availment_id: input.availmentId,
                fulfillment_mode: input.fulfillmentMode,
                fulfillment_status: input.fulfillmentStatus,
                fulfillment_stage: input.fulfillmentStage ?? null,
                reason: input.reason ?? null,
                is_forced: input.isForced ?? false,
                actor_staff_account_id: input.actorStaffAccountId ?? null,
                actor_account_id: input.actorAccountId ?? null
            }, options.transaction ? { transaction: options.transaction } : {});
            return this.toPlain(record);
        });
    }

    /**
     * Bulk-inserts multiple availment_stage_events rows in one call — used
     * by the dine-in/POS finalize seam to auto-write the full per-mode
     * stage sequence (D-05) and by the availments finalize seam's
     * recordStageEvents port. When `options.transaction` is provided, the
     * write uses it directly instead of opening a new one.
     * @param {string} businessId
     * @param {Array<Object>} rows
     * @param {{transaction?: Object}} [options={}]
     */
    async bulkCreate(businessId, rows = [], options = {}) {
        if (!businessId) throw new Error('StageEventRepository.bulkCreate requires businessId.');

        return this.withModel(businessId, async (AvailmentStageEvent) => {
            const records = await AvailmentStageEvent.bulkCreate(rows.map((input) => ({
                business_id: businessId,
                availment_id: input.availmentId,
                fulfillment_mode: input.fulfillmentMode,
                fulfillment_status: input.fulfillmentStatus,
                fulfillment_stage: input.fulfillmentStage ?? null,
                reason: input.reason ?? null,
                is_forced: input.isForced ?? false,
                actor_staff_account_id: input.actorStaffAccountId ?? null,
                actor_account_id: input.actorAccountId ?? null
            })), options.transaction ? { transaction: options.transaction } : {});
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * @param {string} businessId
     * @param {{availmentId?}} [filter]
     */
    async findAll(businessId, { availmentId } = {}) {
        if (!businessId) return [];
        return this.withModel(businessId, async (AvailmentStageEvent) => {
            const where = { business_id: businessId };
            if (availmentId !== undefined && availmentId !== null) {
                where.availment_id = availmentId;
            }
            const records = await AvailmentStageEvent.findAll({ where, order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * @param {string} businessId
     * @param {number|string} id
     */
    async findOne(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModel(businessId, async (AvailmentStageEvent) => {
            const record = await AvailmentStageEvent.findOne({ where: { id: Number(id), business_id: businessId } });
            return record ? this.toPlain(record) : null;
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            availment_id: plain.availment_id,
            fulfillment_mode: plain.fulfillment_mode,
            fulfillment_status: plain.fulfillment_status,
            fulfillment_stage: plain.fulfillment_stage,
            reason: plain.reason,
            is_forced: plain.is_forced,
            actor_staff_account_id: plain.actor_staff_account_id,
            actor_account_id: plain.actor_account_id,
            created_at: plain.created_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {StageEventRepository}
 */
export const buildStageEventRepository = (deps) => new StageEventRepository(deps);

export default StageEventRepository;
