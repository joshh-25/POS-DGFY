// BusinessDatabaseRegistryRepository — Clean Architecture data access
// adapter for dgfy_core.business_database_registry (D-08), mirroring
// ./businessRepository.js's role. This is real, live dgfy_core-backed
// persistence (unlike ./locationRepository.js's/./accountStaffAssignment
// Repository.js's tenant-side bridging) because business_database_registry
// itself lives in the landlord database, which is already wired to a live
// Sequelize connection (../../../config/db.js).
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
    async findByBusinessId(businessId) {
        if (!businessId) return null;
        const record = await this.model.findOne({ where: { business_id: businessId } });
        return record ? this.toPlain(record) : null;
    }

    /**
     * Registers (or re-points) a business's tenant database — not exercised
     * by any use case in this wave (no tenant-database provisioning flow
     * exists yet, see 04-03.5-SUMMARY.md's Known Stub), but provided for
     * test seeding and forward compatibility with a future provisioning
     * use case.
     */
    async create({ businessId, stableOpaqueSuffix, databaseName, status = 'provisioning' }) {
        const record = await this.model.create({
            business_id: businessId,
            stable_opaque_suffix: stableOpaqueSuffix,
            database_name: databaseName,
            status
        });
        return this.toPlain(record);
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
