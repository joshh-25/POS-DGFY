// CashDrawerEventRepository — Clean Architecture data access adapter for the
// tenant-scoped, append-only `cash_drawer_events` ledger (SFT-03), mirroring
// ../../inventory/repositories/inventoryMovementRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// its "resolve the model via tenantConnector.getModels(databaseName)"
// convention (never a direct model-factory import).
//
// This repository is the append-only surface for cash_drawer_events — it
// deliberately exposes ONLY create/findAll/findOne. There is no
// update()/delete()/destroy() method anywhere on this class (T-08-05-03);
// the CashDrawerEvent Tenant model itself also throws on
// beforeUpdate/beforeBulkUpdate (08-02's model), and the 08-01 migration's
// DB triggers are the hard backstop (08-RESEARCH.md Pattern C).
//
// create() accepts an OPTIONAL { transaction } so shiftRepository.js can
// join its own sequelize.transaction() when writing the 'open'/'close'
// event alongside the shift row write (08-05-PLAN.md's key_link) — this is
// the only way a caller-supplied transaction participates in a write here;
// there is still no way to update or delete an already-written row.
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

export class CashDrawerEventRepository {
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
            throw new Error('CashDrawerEventRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * inventoryMovementRepository.js / locationRepository.js). Throws
     * TenantDatabaseUnavailableError for every non-writable state.
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
     * Resolves the CashDrawerEvent model via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import — mirroring inventoryMovementRepository.js's resolveModel().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).CashDrawerEvent;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(CashDrawerEvent)` against it. Any error surfaced while resolving
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
     * Inserts a single append-only cash_drawer_events row (open/close/
     * no_sale_pop this phase; pay_in/pay_out are reserved ENUM values only,
     * D-10 — never written by any Phase 8 usecase).
     * @param {string} businessId
     * @param {{shiftId, eventType, amount?, reason?, actorStaffAccountId?}} input
     * @param {{transaction?}} [options] - optional Sequelize transaction to
     *   join (see file header) — shiftRepository.js's open/close writes pass
     *   this through so the shift row + its event insert commit/rollback
     *   atomically together.
     */
    async create(businessId, input = {}, { transaction } = {}) {
        if (!businessId) throw new Error('CashDrawerEventRepository.create requires businessId.');

        return this.withModel(businessId, async (CashDrawerEvent) => {
            const record = await CashDrawerEvent.create({
                business_id: businessId,
                shift_id: input.shiftId,
                event_type: input.eventType,
                amount: input.amount ?? null,
                reason: input.reason ?? null,
                actor_staff_account_id: input.actorStaffAccountId ?? null
            }, transaction ? { transaction } : undefined);
            return this.toPlain(record);
        });
    }

    /**
     * @param {string} businessId
     * @param {{shiftId?}} [filter]
     */
    async findAll(businessId, { shiftId } = {}) {
        if (!businessId) return [];
        return this.withModel(businessId, async (CashDrawerEvent) => {
            const where = { business_id: businessId };
            if (shiftId !== undefined && shiftId !== null) {
                where.shift_id = shiftId;
            }
            const records = await CashDrawerEvent.findAll({ where, order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * @param {string} businessId
     * @param {number|string} id
     */
    async findOne(businessId, id) {
        if (!businessId || id === undefined || id === null) return null;
        return this.withModel(businessId, async (CashDrawerEvent) => {
            const record = await CashDrawerEvent.findOne({ where: { id: Number(id), business_id: businessId } });
            return record ? this.toPlain(record) : null;
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            shift_id: plain.shift_id,
            event_type: plain.event_type,
            amount: plain.amount,
            reason: plain.reason,
            actor_staff_account_id: plain.actor_staff_account_id,
            created_at: plain.created_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {CashDrawerEventRepository}
 */
export const buildCashDrawerEventRepository = (deps) => new CashDrawerEventRepository(deps);

export default CashDrawerEventRepository;
