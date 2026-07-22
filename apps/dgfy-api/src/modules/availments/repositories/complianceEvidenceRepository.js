// ComplianceEvidenceRepository — Clean Architecture data access adapter for
// the tenant-scoped `compliance_evidence` interim attestation store (D-23).
// Mirrors ../../compliance/repositories/complianceModeStateRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// its findOrCreate-based upsert-by-unique-index convention.
//
// A business/branch pair carries at most one compliance_evidence row
// (models/Tenant/ComplianceEvidence.js's unique index on
// (business_id, branch_scope_key) — branch_scope_key collapses every NULL
// branch_id to the same deterministic sentinel per business_id).
// getForBusinessBranch() returns null when no attestation has been
// submitted yet (correct default for a non_compliant_active business —
// assembleEvidenceBundle() in ../usecases/complianceEvidenceUseCases.js maps
// that null into empty-array/empty-object gate inputs). upsert() creates the
// row on first write or patches an existing row.

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
 * Thrown by upsert() when the DB-enforced one-row-per-(business_id,
 * branch_scope_key) unique index rejects a concurrent race-loser write.
 * Usecases duck-type on `error.name === 'DuplicateComplianceEvidenceError'`
 * and map it to a clean 409 — never surfaced as a misleading
 * TenantDatabaseUnavailableError 503 (mirrors DuplicateComplianceModeStateError).
 */
export class DuplicateComplianceEvidenceError extends Error {
    constructor(message) {
        super(message || 'A compliance-evidence row already exists for this business/branch.');
        this.name = 'DuplicateComplianceEvidenceError';
    }
}

/**
 * Duck-types a MySQL/Sequelize unique-constraint violation, tolerating both
 * Sequelize's wrapped error shape and a raw mysql2 driver error.
 * @param {Error} error
 */
const isUniqueConstraintViolation = (error) => {
    if (!error) return false;
    if (error.name === 'SequelizeUniqueConstraintError') return true;
    if (error.original && (error.original.code === 'ER_DUP_ENTRY' || error.original.errno === 1062)) return true;
    if (error.parent && (error.parent.code === 'ER_DUP_ENTRY' || error.parent.errno === 1062)) return true;
    return false;
};

export class ComplianceEvidenceRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   complianceModeStateRepository.js's doc comment) so this repository
     *   can always be constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('ComplianceEvidenceRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * complianceModeStateRepository.js / shiftRepository.js). Throws
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
     * Resolves the ComplianceEvidence model via
     * TenantConnector.getModels(databaseName) — never a direct model-factory
     * import — mirroring complianceModeStateRepository.js's resolveModel().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).ComplianceEvidence;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(ComplianceEvidence)` against it. Any error surfaced while
     * resolving the model or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one, or a DuplicateComplianceEvidenceError (never
     * double-wrapped).
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
                || error instanceof DuplicateComplianceEvidenceError
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
     * @returns {Promise<Object|null>} the compliance_evidence row, or null
     *   if this business/branch has never submitted an attestation.
     */
    async getForBusinessBranch(businessId, branchId = null) {
        if (!businessId) return null;
        return this.withModel(businessId, async (ComplianceEvidence) => {
            const record = await ComplianceEvidence.findOne({
                where: { business_id: businessId, branch_id: branchId }
            });
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * Creates the compliance_evidence row on first write or patches an
     * existing one (D-23). The first-write path is atomic via Sequelize's
     * findOrCreate() rather than a plain findOne()-then-create() (a TOCTOU
     * race) — findOrCreate() relies on the DB unique index
     * (unique_compliance_evidence_business_branch_scope) to serialize
     * concurrent first writes for the same business/branch. A race-loser
     * that still manages to violate the unique index is duck-typed via
     * isUniqueConstraintViolation() and rethrown as
     * DuplicateComplianceEvidenceError — never surfaced as a misleading
     * TenantDatabaseUnavailableError('unreachable') 503. branch_scope_key is
     * DB-generated and is NEVER written here.
     * @param {string} businessId
     * @param {number|null} branchId
     * @param {{evidenceBundle: Object, attestedByActorType?: string, attestedAt?: Date}} input
     */
    async upsert(businessId, branchId = null, { evidenceBundle, attestedByActorType, attestedAt } = {}) {
        if (!businessId) throw new Error('ComplianceEvidenceRepository.upsert requires businessId.');
        if (!evidenceBundle) throw new Error('ComplianceEvidenceRepository.upsert requires evidenceBundle.');

        return this.withModel(businessId, async (ComplianceEvidence) => {
            let record;
            try {
                const [resolvedRecord] = await ComplianceEvidence.findOrCreate({
                    where: { business_id: businessId, branch_id: branchId },
                    defaults: {
                        business_id: businessId,
                        branch_id: branchId,
                        evidence_bundle: evidenceBundle,
                        attested_by_actor_type: attestedByActorType || null,
                        attested_at: attestedAt || new Date()
                    }
                });
                record = resolvedRecord;
            } catch (findOrCreateError) {
                if (isUniqueConstraintViolation(findOrCreateError)) {
                    throw new DuplicateComplianceEvidenceError();
                }
                throw findOrCreateError;
            }

            try {
                await record.update({
                    evidence_bundle: evidenceBundle,
                    attested_by_actor_type: attestedByActorType || null,
                    attested_at: attestedAt || new Date()
                });
            } catch (updateError) {
                if (isUniqueConstraintViolation(updateError)) {
                    throw new DuplicateComplianceEvidenceError();
                }
                throw updateError;
            }
            return this.toPlain(record);
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            branch_id: plain.branch_id,
            evidence_bundle: plain.evidence_bundle,
            attested_by_actor_type: plain.attested_by_actor_type,
            attested_at: plain.attested_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?}} [deps]
 * @returns {ComplianceEvidenceRepository}
 */
export const buildComplianceEvidenceRepository = (deps) => new ComplianceEvidenceRepository(deps);

export default ComplianceEvidenceRepository;
