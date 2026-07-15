// courierAssignmentRepository — Clean Architecture data access adapter for
// the tenant-scoped `courier_assignments` table (Phase 11, FUL-03,
// D-01/D-02/D-04). Reuses the same TenantDatabaseUnavailableError/
// resolveDatabaseName/withModel scaffold as
// ../../inventory/repositories/inventoryMovementRepository.js and this
// module's own stageEventRepository.js.
//
// DELIBERATE DIVERGENCE from stageEventRepository.js's append-only-only
// surface (Landmine 3/A5): this repository intentionally supports a real
// UPDATE via updatePayout() — courier_assignments' payout sub-lifecycle
// (payout_status owed->paid, paid_at) is mutable by design, matching the
// CourierAssignment Tenant model's own header-comment divergence (no
// updatedAt:false, no throwing hooks) and the 11-01 migration's exclusion of
// this table from its appendOnlyTables SIGNAL '45000' trigger array.
//
// What IS append-only about this table is assignment IDENTITY, not the row
// itself: markSuperseded() marks a prior attempt is_active=false +
// superseded_at, and a reassignment always inserts a NEW row via create() —
// never an overwrite/delete of a prior assignment attempt (D-04).
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

export class CourierAssignmentRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('CourierAssignmentRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * inventoryMovementRepository.js / stageEventRepository.js). Throws
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
     * Resolves the CourierAssignment model via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import.
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).CourierAssignment;
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
     * Inserts a new courier_assignments row (is_active=true, payout_status
     * defaults to 'owed' at the model layer). Used both for a first
     * assignment and for a reassignment (caller is responsible for calling
     * markSuperseded() on the prior active row first — D-04).
     * @param {string} businessId
     * @param {{availmentId, courierName, courierContact?, payoutAmount?, assignedByStaffAccountId?}} input
     */
    async create(businessId, input = {}) {
        if (!businessId) throw new Error('CourierAssignmentRepository.create requires businessId.');

        return this.withModel(businessId, async (CourierAssignment) => {
            const record = await CourierAssignment.create({
                business_id: businessId,
                availment_id: input.availmentId,
                courier_name: input.courierName,
                courier_contact: input.courierContact ?? null,
                payout_amount: input.payoutAmount ?? null,
                assigned_by_staff_account_id: input.assignedByStaffAccountId ?? null
            });
            return this.toPlain(record);
        });
    }

    /**
     * Performs a real UPDATE on payout_status/paid_at — this table is NOT
     * append-only for its payout sub-lifecycle (D-02, Landmine 3/A5).
     * @param {string} businessId
     * @param {number|string} assignmentId
     * @param {{payoutStatus, paidAt?}} input
     */
    async updatePayout(businessId, assignmentId, { payoutStatus, paidAt = null } = {}) {
        if (!businessId) throw new Error('CourierAssignmentRepository.updatePayout requires businessId.');
        if (assignmentId === undefined || assignmentId === null) {
            throw new Error('CourierAssignmentRepository.updatePayout requires assignmentId.');
        }

        return this.withModel(businessId, async (CourierAssignment) => {
            const [affectedRows] = await CourierAssignment.update(
                { payout_status: payoutStatus, paid_at: paidAt },
                { where: { id: Number(assignmentId), business_id: businessId } }
            );
            return affectedRows;
        });
    }

    /**
     * Marks a prior courier-assignment attempt superseded (is_active=false +
     * superseded_at) — reassignment history, never overwritten/deleted
     * (D-04).
     * @param {string} businessId
     * @param {number|string} assignmentId
     */
    async markSuperseded(businessId, assignmentId) {
        if (!businessId) throw new Error('CourierAssignmentRepository.markSuperseded requires businessId.');
        if (assignmentId === undefined || assignmentId === null) {
            throw new Error('CourierAssignmentRepository.markSuperseded requires assignmentId.');
        }

        return this.withModel(businessId, async (CourierAssignment) => {
            const [affectedRows] = await CourierAssignment.update(
                { is_active: false, superseded_at: new Date() },
                { where: { id: Number(assignmentId), business_id: businessId } }
            );
            return affectedRows;
        });
    }

    /**
     * @param {string} businessId
     * @param {{availmentId?}} [filter]
     */
    async findAll(businessId, { availmentId } = {}) {
        if (!businessId) return [];
        return this.withModel(businessId, async (CourierAssignment) => {
            const where = { business_id: businessId };
            if (availmentId !== undefined && availmentId !== null) {
                where.availment_id = availmentId;
            }
            const records = await CourierAssignment.findAll({ where, order: [['id', 'ASC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    /**
     * Finds the currently active courier assignment for an availment
     * (is_active=true) — used by assignCourier() to locate a prior attempt
     * to supersede, and by markPayout() to resolve the row to update.
     * @param {string} businessId
     * @param {number|string} availmentId
     */
    async findActiveForAvailment(businessId, availmentId) {
        if (!businessId || availmentId === undefined || availmentId === null) return null;
        return this.withModel(businessId, async (CourierAssignment) => {
            const record = await CourierAssignment.findOne({
                where: { business_id: businessId, availment_id: Number(availmentId), is_active: true }
            });
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
            courier_name: plain.courier_name,
            courier_contact: plain.courier_contact,
            payout_amount: plain.payout_amount,
            payout_status: plain.payout_status,
            paid_at: plain.paid_at,
            is_active: plain.is_active,
            superseded_at: plain.superseded_at,
            assigned_by_staff_account_id: plain.assigned_by_staff_account_id,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {CourierAssignmentRepository}
 */
export const buildCourierAssignmentRepository = (deps) => new CourierAssignmentRepository(deps);

export default CourierAssignmentRepository;
