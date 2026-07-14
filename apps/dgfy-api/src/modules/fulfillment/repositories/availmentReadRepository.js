import { Op } from 'sequelize';

// availmentReadRepository — the concrete FUL-01 read path (Phase 11, D-08).
// Clean Architecture data access adapter for the tenant-scoped `availments`
// table, reused from the same TenantDatabaseUnavailableError/
// resolveDatabaseName/withModel scaffold as
// ../../inventory/repositories/inventoryMovementRepository.js and this
// module's stageEventRepository.js/courierAssignmentRepository.js.
//
// This is the ONLY component that queries Availment for the incoming-orders
// queue — buildListIncomingOrdersUseCase MUST NOT invent a second read path
// or reuse stageEventRepository (which is hard-bound to AvailmentStageEvent,
// a different model). findIncomingAvailments is READ-ONLY and is the sole
// FUL-01 surface.
//
// Deviation (Rule 2 — auto-add missing critical functionality): FUL-02's
// buildProgressStageUseCase needs to (a) load a SINGLE availment by id
// (findIncomingAvailments only returns the D-08-scoped in-progress subset —
// it deliberately EXCLUDES ready/out_for_delivery/completed rows, so it
// cannot serve as the "load the availment" step for a stage progression
// that is, by definition, moving INTO or OUT OF those excluded statuses)
// and (b) sync the availment's denormalized fulfillment_status/
// fulfillment_stage read-cache columns after writing the authoritative
// append-only stage-event row (11-01-SUMMARY.md's D-05/D-06/D-15 pattern:
// the event ledger is the source of truth, these columns are a cache of the
// LATEST event). 11-02-PLAN.md's own Task 2 action text names this
// dependency `availmentRepository | repository` (explicitly leaving the
// exact shape to the executor) and its files_modified list does not include
// modules/availments/repositories/availmentRepository.js — modifying that
// file is Plan 03's "finalize seam" scope, not this plan's, so
// findById/updateFulfillmentState are added HERE instead of there. This
// keeps the write narrowly scoped to the two denormalized cache columns
// (never availments.status, never line items/payments/discounts) — it is
// not a general Availment CRUD surface.
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

// D-08: the FUL-01 queue is scoped to ONLINE orders only (pickup/delivery,
// never dine_in/POS) that are still in progress (not yet ready/completed).
const ONLINE_MODES = Object.freeze(['pickup', 'delivery']);
const IN_PROGRESS_STATUSES = Object.freeze(['placed', 'confirmed', 'preparing']);

export class AvailmentReadRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('AvailmentReadRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * inventoryMovementRepository.js / stageEventRepository.js /
     * courierAssignmentRepository.js). Throws TenantDatabaseUnavailableError
     * for every non-readable state.
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
     * Resolves the Availment model via TenantConnector.getModels(databaseName)
     * — never a direct model-factory import.
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).Availment;
    }

    /**
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
     * The concrete FUL-01 read path (D-08, Open Q4). Returns only
     * in-progress ONLINE availments — fulfillment_mode IN
     * ('pickup','delivery') AND fulfillment_status IN
     * ('placed','confirmed','preparing') — narrowed to a single mode when a
     * valid `fulfillmentMode` ('pickup'|'delivery') is passed, and to a
     * single branch when `branchId` is passed. With neither filter, returns
     * all active online orders for the business.
     * @param {string} businessId
     * @param {{branchId?, fulfillmentMode?}} [filter]
     */
    async findIncomingAvailments(businessId, { branchId, fulfillmentMode } = {}) {
        if (!businessId) throw new Error('AvailmentReadRepository.findIncomingAvailments requires businessId.');

        return this.withModel(businessId, async (Availment) => {
            const where = {
                business_id: businessId,
                fulfillment_status: { [Op.in]: IN_PROGRESS_STATUSES },
                fulfillment_mode: ONLINE_MODES.includes(fulfillmentMode)
                    ? fulfillmentMode
                    : { [Op.in]: ONLINE_MODES }
            };
            if (branchId !== undefined && branchId !== null) {
                where.branch_id = branchId;
            }

            const records = await Availment.findAll({ where, order: [['created_at', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * Opens a sequelize.transaction() against businessId's tenant database
     * and runs `fn(transaction)` inside it. Added for the CR-02 fix
     * (11-REVIEW.md): buildProgressStageUseCase (FUL-02) writes an
     * append-only availment_stage_events row AND syncs the denormalized
     * fulfillment_status/fulfillment_stage cache in the SAME logical
     * operation — without a shared transaction, a failure between the two
     * writes permanently desyncs the ledger (source of truth) from the
     * cache the NEXT transition is computed from.
     *
     * Deliberately does NOT go through this.withModel() — withModel's
     * catch-all re-wraps any non-whitelisted thrown error into
     * TenantDatabaseUnavailableError('unreachable', ...), which would mask
     * a genuine business-logic rollback reason from inside `fn` (mirrors
     * AvailmentRepository.finalizeStorefrontOrder's identical, explicitly
     * documented deviation for the same reason). resolveDatabaseName()
     * below still throws a genuine TenantDatabaseUnavailableError for real
     * registry/connectivity problems (missing/provisioning/inactive/
     * unverified) — that propagates unmodified, same as every other method.
     * @param {string} businessId
     * @param {(transaction: Object) => Promise<any>} fn
     */
    async runInTransaction(businessId, fn) {
        if (!businessId) throw new Error('AvailmentReadRepository.runInTransaction requires businessId.');
        const databaseName = await this.resolveDatabaseName(businessId);
        const Availment = this.resolveModel(databaseName);
        return Availment.sequelize.transaction(fn);
    }

    /**
     * Loads a single availment by id, scoped to businessId. Used by
     * buildProgressStageUseCase (FUL-02) to read the current
     * fulfillment_mode/fulfillment_status before computing the next legal
     * stage — deliberately NOT filtered to the D-08 in-progress subset (see
     * header comment).
     * @param {string} businessId
     * @param {number|string} availmentId
     */
    async findById(businessId, availmentId) {
        if (!businessId || availmentId === undefined || availmentId === null) return null;
        return this.withModel(businessId, async (Availment) => {
            const record = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Syncs the availment's denormalized fulfillment_status/
     * fulfillment_stage read-cache columns after a stage-event row has been
     * written (D-05/D-06/D-15 — the append-only availment_stage_events
     * ledger is the source of truth; this is a narrow, targeted UPDATE of
     * ONLY these two columns, never availments.status or any other field).
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {{fulfillmentStatus, fulfillmentStage?}} input
     * @param {{transaction?: Object}} [options={}]
     */
    async updateFulfillmentState(businessId, availmentId, { fulfillmentStatus, fulfillmentStage = null } = {}, options = {}) {
        if (!businessId) throw new Error('AvailmentReadRepository.updateFulfillmentState requires businessId.');
        if (availmentId === undefined || availmentId === null) {
            throw new Error('AvailmentReadRepository.updateFulfillmentState requires availmentId.');
        }

        return this.withModel(businessId, async (Availment) => {
            const [affectedRows] = await Availment.update(
                { fulfillment_status: fulfillmentStatus, fulfillment_stage: fulfillmentStage },
                {
                    where: { id: Number(availmentId), business_id: businessId },
                    ...(options.transaction ? { transaction: options.transaction } : {})
                }
            );
            return affectedRows;
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            branch_id: plain.branch_id,
            fulfillment_mode: plain.fulfillment_mode,
            fulfillment_status: plain.fulfillment_status,
            fulfillment_stage: plain.fulfillment_stage,
            status: plain.status,
            customer_account_id: plain.customer_account_id,
            total_amount: plain.total_amount,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {AvailmentReadRepository}
 */
export const buildAvailmentReadRepository = (deps) => new AvailmentReadRepository(deps);

export default AvailmentReadRepository;
