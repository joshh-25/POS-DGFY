// ComplianceModeStateRepository — Clean Architecture data access adapter for
// the tenant-scoped `compliance_mode_state` domain (D-01, FSC-01). Mirrors
// ../../shifts/repositories/shiftRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// its "resolve the model via tenantConnector.getModels(databaseName)"
// convention (never a direct model-factory import).
//
// A business/branch pair carries at most one compliance_mode_state row
// (models/Tenant/ComplianceModeState.js's unique index on
// (business_id, branch_id) — branch_id may be null, meaning
// business-wide/no-branch scope). getForBusinessBranch() returns null when
// no row exists yet (a business hasn't submitted any compliance evidence);
// upsertState() creates the row on first write (defaulting state to
// non_compliant_active, D-02) or patches an existing row; recordVerification()
// is a narrower patch limited to the D-04 manual review fields
// (verification_status/verified_by_actor_type/verified_at).
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
 * Thrown by recordVerification() when no compliance_mode_state row exists
 * yet for this business/branch (evidence must be submitted — creating the
 * row — before it can be reviewed). Usecases duck-type on
 * `error.name === 'ComplianceStateNotFoundError'` and map it to a 404.
 */
export class ComplianceStateNotFoundError extends Error {
    constructor(message) {
        super(message || 'No compliance-mode state exists for this business/branch yet.');
        this.name = 'ComplianceStateNotFoundError';
    }
}

/**
 * Thrown by upsertState() when the DB-enforced one-row-per-
 * (business_id, branch_scope_key) unique index (CR-01/FSC-01,
 * unique_compliance_mode_state_business_branch_scope — see 08-09-PLAN.md's
 * gap-closure migration) rejects a concurrent race-loser write. Usecases
 * duck-type on `error.name === 'DuplicateComplianceModeStateError'` and map
 * it to a clean 409, mirroring shiftRepository.js's DuplicateOpenShiftError
 * — never surfaced as a misleading TenantDatabaseUnavailableError 503.
 */
export class DuplicateComplianceModeStateError extends Error {
    constructor(message) {
        super(message || 'A compliance-mode-state row already exists for this business/branch.');
        this.name = 'DuplicateComplianceModeStateError';
    }
}

/**
 * Duck-types a MySQL/Sequelize unique-constraint violation, tolerating both
 * Sequelize's wrapped error shape and a raw mysql2 driver error — copied in
 * spirit from shiftRepository.js's isUniqueConstraintViolation().
 * @param {Error} error
 */
const isUniqueConstraintViolation = (error) => {
    if (!error) return false;
    if (error.name === 'SequelizeUniqueConstraintError') return true;
    if (error.original && (error.original.code === 'ER_DUP_ENTRY' || error.original.errno === 1062)) return true;
    if (error.parent && (error.parent.code === 'ER_DUP_ENTRY' || error.parent.errno === 1062)) return true;
    return false;
};

export class ComplianceModeStateRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   shiftRepository.js's doc comment) so this repository can always be
     *   constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('ComplianceModeStateRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors shiftRepository.js /
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
     * Resolves the ComplianceModeState model via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import — mirroring shiftRepository.js's resolveModel().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).ComplianceModeState;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(ComplianceModeState)` against it. Any error surfaced while
     * resolving the model or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one, a ComplianceStateNotFoundError, or a
     * DuplicateComplianceModeStateError (never double-wrapped — CR-01/FSC-01
     * requires the race-loser conflict to surface as a clean 409, not a
     * misleading 503).
     * @param {string} businessId
     * @param {(model: Object) => Promise<any>} fn
     */
    async withModel(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const model = this.resolveModel(databaseName);
            return await fn(model);
        } catch (error) {
            if (
                error instanceof TenantDatabaseUnavailableError
                || error instanceof ComplianceStateNotFoundError
                || error instanceof DuplicateComplianceModeStateError
            ) {
                throw error;
            }
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * @param {string} businessId
     * @param {number|null} [branchId]
     * @returns {Promise<Object|null>} the compliance_mode_state row, or null
     *   if this business/branch has never submitted evidence.
     */
    async getForBusinessBranch(businessId, branchId = null) {
        if (!businessId) return null;
        return this.withModel(businessId, async (ComplianceModeState) => {
            const record = await ComplianceModeState.findOne({
                where: { business_id: businessId, branch_id: branchId }
            });
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Creates the compliance_mode_state row on first write (state defaults
     * to non_compliant_active, D-02) or patches only the fields present on
     * `updates` on an existing row. Never touches verification_status/
     * verified_by_actor_type/verified_at — those are recordVerification()'s
     * exclusive concern (D-04's manual review path).
     *
     * CR-01/FSC-01: the first-write path is atomic via
     * Sequelize's findOrCreate() rather than a plain findOne()-then-create()
     * (a TOCTOU race) — findOrCreate() relies on the DB unique index
     * (unique_compliance_mode_state_business_branch_scope, now enforceable
     * for NULL branches per 08-09-PLAN.md's gap-closure migration) to
     * serialize concurrent first writes for the same business/branch. A
     * race-loser that still manages to violate the unique index (e.g. a
     * concurrent write racing the SELECT-then-INSERT window findOrCreate()
     * itself performs under the hood) is duck-typed via
     * isUniqueConstraintViolation() and rethrown as
     * DuplicateComplianceModeStateError — never surfaced as a misleading
     * TenantDatabaseUnavailableError('unreachable') 503. branch_scope_key is
     * DB-generated and is NEVER written here.
     * @param {string} businessId
     * @param {number|null} branchId
     * @param {{state?, compliance_profile?, active_policy_pack_version?}} [updates]
     */
    async upsertState(businessId, branchId = null, updates = {}) {
        if (!businessId) throw new Error('ComplianceModeStateRepository.upsertState requires businessId.');

        return this.withModel(businessId, async (ComplianceModeState) => {
            let record;
            try {
                const [resolvedRecord] = await ComplianceModeState.findOrCreate({
                    where: { business_id: businessId, branch_id: branchId },
                    defaults: {
                        business_id: businessId,
                        branch_id: branchId,
                        state: updates.state || 'non_compliant_active',
                        compliance_profile: Object.prototype.hasOwnProperty.call(updates, 'compliance_profile')
                            ? updates.compliance_profile
                            : null,
                        active_policy_pack_version: Object.prototype.hasOwnProperty.call(updates, 'active_policy_pack_version')
                            ? updates.active_policy_pack_version
                            : null
                    }
                });
                record = resolvedRecord;
            } catch (findOrCreateError) {
                if (isUniqueConstraintViolation(findOrCreateError)) {
                    throw new DuplicateComplianceModeStateError();
                }
                throw findOrCreateError;
            }

            const patch = {};
            ['state', 'compliance_profile', 'active_policy_pack_version'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(updates, key)) {
                    patch[key] = updates[key];
                }
            });

            try {
                await record.update(patch);
            } catch (updateError) {
                if (isUniqueConstraintViolation(updateError)) {
                    throw new DuplicateComplianceModeStateError();
                }
                throw updateError;
            }
            return this.toPlain(record);
        });
    }

    /**
     * D-04 manual review path: patches ONLY the verification fields on an
     * existing row. Throws ComplianceStateNotFoundError if no row exists yet
     * (evidence must be submitted — via upsertState() — before it can be
     * reviewed).
     *
     * CR-01/FSC-01 hardening: the read-modify-write is wrapped in a
     * sequelize.transaction() with a row lock (`lock: transaction.LOCK.UPDATE`)
     * so a concurrent recordVerification()/upsertState() call for the same
     * business/branch cannot interleave between the read and the write —
     * mirrors shiftRepository.js's openShift()/closeShift() pattern of
     * resolving `sequelize` from the resolved model.
     * @param {string} businessId
     * @param {number|null} branchId
     * @param {{verification_status, verified_by_actor_type, verified_at}} input
     */
    async recordVerification(businessId, branchId = null, { verification_status, verified_by_actor_type, verified_at }) {
        if (!businessId) throw new Error('ComplianceModeStateRepository.recordVerification requires businessId.');

        return this.withModel(businessId, async (ComplianceModeState) => {
            const sequelize = ComplianceModeState.sequelize;

            return sequelize.transaction(async (transaction) => {
                const record = await ComplianceModeState.findOne({
                    where: { business_id: businessId, branch_id: branchId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!record) throw new ComplianceStateNotFoundError();

                await record.update(
                    { verification_status, verified_by_actor_type, verified_at },
                    { transaction }
                );
                return this.toPlain(record);
            });
        });
    }

    /**
     * FSC-01/T-12-07/T-12-08 atomicity fix: writes the D-04 manual review's
     * verification triplet (verification_status/verified_by_actor_type/
     * verified_at) AND the resulting compliance_mode_state.state demotion/
     * transition in ONE `record.update()` call inside ONE
     * sequelize.transaction() with a row lock (`lock: transaction.LOCK.UPDATE`)
     * — mirrors recordVerification()'s txn+lock scaffold and
     * shiftRepository.js's closeShift() template exactly, but folds the state
     * write into the same locked read-modify-write instead of leaving it to a
     * second, independent upsertState() call. This closes the crash/race
     * window where a reviewed-but-not-yet-demoted row could leave a revoked
     * business's compliance_mode_state.state stuck at compliant_active (a
     * Fiscal POS_CHECKOUT fail-open).
     *
     * Throws ComplianceStateNotFoundError if no row exists yet — deliberately
     * does NOT findOrCreate, preserving the "evidence must be submitted (via
     * upsertState()) before it can be reviewed" contract. A unique-constraint
     * violation on the update is duck-typed via isUniqueConstraintViolation()
     * and rethrown as DuplicateComplianceModeStateError, matching
     * upsertState()'s error-mapping convention.
     * @param {string} businessId
     * @param {number|null} branchId
     * @param {{verification_status, verified_by_actor_type, verified_at, state}} input
     */
    async recordVerificationAndState(businessId, branchId = null, { verification_status, verified_by_actor_type, verified_at, state }) {
        if (!businessId) throw new Error('ComplianceModeStateRepository.recordVerificationAndState requires businessId.');

        return this.withModel(businessId, async (ComplianceModeState) => {
            const sequelize = ComplianceModeState.sequelize;

            return sequelize.transaction(async (transaction) => {
                const record = await ComplianceModeState.findOne({
                    where: { business_id: businessId, branch_id: branchId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!record) throw new ComplianceStateNotFoundError();

                try {
                    await record.update(
                        { verification_status, verified_by_actor_type, verified_at, state },
                        { transaction }
                    );
                } catch (updateError) {
                    if (isUniqueConstraintViolation(updateError)) {
                        throw new DuplicateComplianceModeStateError();
                    }
                    throw updateError;
                }
                return this.toPlain(record);
            });
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            branch_id: plain.branch_id,
            state: plain.state,
            compliance_profile: plain.compliance_profile,
            active_policy_pack_version: plain.active_policy_pack_version,
            verification_status: plain.verification_status,
            verified_by_actor_type: plain.verified_by_actor_type,
            verified_at: plain.verified_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {ComplianceModeStateRepository}
 */
export const buildComplianceModeStateRepository = (deps) => new ComplianceModeStateRepository(deps);

export default ComplianceModeStateRepository;
