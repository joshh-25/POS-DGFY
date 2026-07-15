import crypto from 'crypto';

// BusinessDatabaseRegistryRepository — Clean Architecture data access
// adapter for dgfy_core.business_database_registry (D-08), mirroring
// ./businessRepository.js's role. This is real, live dgfy_core-backed
// persistence (unlike ./locationRepository.js's/./accountStaffAssignment
// Repository.js's tenant-side bridging) because business_database_registry
// itself lives in the landlord database, which is already wired to a live
// Sequelize connection (../../../config/db.js).

const DATABASE_NAME_PREFIX = 'dgfy_business_';
// 20 hex characters keeps stable_opaque_suffix well under STRING(64) and
// database_name (prefix + suffix) well under STRING(128).
const STABLE_SUFFIX_LENGTH = 20;

/**
 * Deterministic, opaque database-name suffix derived from the business id
 * (plus handle, purely for human-debuggability) — never derived from
 * legal_name/display_name (D-02/D-03, T-04-06-03: tenant database names are
 * always generated server-side and never accept a public caller-supplied
 * value).
 * @param {string} businessId
 * @param {string} [businessHandle]
 * @returns {string}
 */
export const generateStableOpaqueSuffix = (businessId, businessHandle = '') => crypto
    .createHash('sha256')
    .update(`${businessId}:${businessHandle}`)
    .digest('hex')
    .slice(0, STABLE_SUFFIX_LENGTH);

/**
 * @param {string} stableOpaqueSuffix
 * @returns {string}
 */
export const generateDatabaseName = (stableOpaqueSuffix) => `${DATABASE_NAME_PREFIX}${stableOpaqueSuffix}`;

export class BusinessDatabaseRegistryRepository {
    /**
     * @param {{businessDatabaseRegistryModel}} deps - the Sequelize
     *   BusinessDatabaseRegistry model, injected by the caller (index.js)
     *   rather than imported directly, so this repository stays testable
     *   with mocks.
     */
    constructor({ businessDatabaseRegistryModel } = {}) {
        if (!businessDatabaseRegistryModel) {
            throw new Error(
                'BusinessDatabaseRegistryRepository requires a Sequelize BusinessDatabaseRegistry model.'
            );
        }
        this.model = businessDatabaseRegistryModel;
    }

    /**
     * Resolves the tenant database pointer for businessId (Task 3, Step 2:
     * "Resolve tenant database"). Returns null when no registry row exists
     * yet for this business (drives the NO_TENANT_DATABASE rejection path).
     * @param {string} businessId
     */
    async findByBusinessId(businessId, { transaction } = {}) {
        if (!businessId) return null;
        const record = await this.model.findOne({ where: { business_id: businessId }, transaction });
        return record ? this.toPlain(record) : null;
    }

    /**
     * Registers (or re-points) a business's tenant database — not exercised
     * by any use case in this wave (no tenant-database provisioning flow
     * exists yet, see 04-03.5-SUMMARY.md's Known Stub), but provided for
     * test seeding and forward compatibility with a future provisioning
     * use case.
     */
    async create({ businessId, stableOpaqueSuffix, databaseName, status = 'provisioning', transaction }) {
        const record = await this.model.create({
            business_id: businessId,
            stable_opaque_suffix: stableOpaqueSuffix,
            database_name: databaseName,
            status
        }, { transaction });
        return this.toPlain(record);
    }

    /**
     * Idempotent tenant registry metadata creation for a newly created
     * business (API-03, D-10): returns the existing registry row for
     * businessId when one already exists (safe to re-run), otherwise
     * creates a new `provisioning` row with a deterministic, opaque
     * database name derived from businessId + businessHandle — never raw
     * legal_name/display_name (T-04-06-03).
     *
     * The API request path never creates the actual tenant database or
     * runs schema migrations here. A separate operator/migration-runner
     * handoff applies the tenant schema for `database_name`, verifies the
     * schema contract, then calls updateStatus() to mark the registry
     * `active`/`verified`.
     *
     * @param {{businessId: string, businessHandle?: string, transaction?: Object}} args
     */
    async findOrCreateForBusiness({ businessId, businessHandle = '', transaction }) {
        if (!businessId) {
            throw new Error('findOrCreateForBusiness requires a businessId.');
        }

        const existing = await this.model.findOne({ where: { business_id: businessId }, transaction });
        if (existing) return this.toPlain(existing);

        const stableOpaqueSuffix = generateStableOpaqueSuffix(businessId, businessHandle);
        const databaseName = generateDatabaseName(stableOpaqueSuffix);

        const record = await this.model.create({
            business_id: businessId,
            stable_opaque_suffix: stableOpaqueSuffix,
            database_name: databaseName,
            status: 'provisioning'
        }, { transaction });

        return this.toPlain(record);
    }

    /**
     * Operator/migration-runner status transition (API-03): moves a
     * registry row from `provisioning` to `active` (optionally stamping
     * `verified_at`) once the tenant schema has been applied and verified.
     * Never called from the business-creation request path.
     * @param {{businessId: string, status: string, verifiedAt?: Date|null, transaction?: Object}} args
     */
    async updateStatus({ businessId, status, verifiedAt, transaction }) {
        if (!businessId) {
            throw new Error('updateStatus requires a businessId.');
        }
        const record = await this.model.findOne({ where: { business_id: businessId }, transaction });
        if (!record) return null;

        const patch = { status };
        if (verifiedAt !== undefined) patch.verified_at = verifiedAt;
        await record.update(patch, { transaction });
        return this.toPlain(record);
    }

    /**
     * Public-safe projection (T-04-06-02): exposes only business_id,
     * database_name, stable_opaque_suffix, status, verified_at, created_at,
     * and updated_at — never DB host, DB user, password, DSN, connector
     * config, or any raw tenant credential.
     * @param {Object} record - a plain object or a Sequelize model instance
     */
    toSafeMetadata(record) {
        if (!record) return null;
        const plain = typeof record.get === 'function' ? record.get({ plain: true }) : record;
        return {
            business_id: plain.business_id,
            database_name: plain.database_name,
            stable_opaque_suffix: plain.stable_opaque_suffix,
            status: plain.status,
            verified_at: plain.verified_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            stable_opaque_suffix: plain.stable_opaque_suffix,
            database_name: plain.database_name,
            status: plain.status,
            verified_at: plain.verified_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{businessDatabaseRegistryModel}} deps
 * @returns {BusinessDatabaseRegistryRepository}
 */
export const buildBusinessDatabaseRegistryRepository = (deps) => new BusinessDatabaseRegistryRepository(deps);

export default BusinessDatabaseRegistryRepository;
