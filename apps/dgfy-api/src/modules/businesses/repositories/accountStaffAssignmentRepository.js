import defineAccountStaffAssignmentModel from '../../../models/Tenant/AccountStaffAssignment.js';

// AccountStaffAssignmentRepository — Clean Architecture data access adapter
// for the tenant-local `account_staff_assignments` domain (D-14/API-04),
// mirroring ./businessRepository.js's/./locationRepository.js's role.
//
// Resolves a real per-tenant Sequelize connection via the injected
// TenantConnector (../../../infra/tenantConnector.js) and lazily defines
// the AccountStaffAssignment model against that connection (cached per
// resolved database_name, mirroring ../../../models/Tenant/Location.js's
// factory-function pattern). This CLOSES the "in-memory bridging" stub
// 04-03.5-SUMMARY.md's Known Stub explicitly flagged as pending this wave:
// "Resolution: To be resolved when Wave 4 (04-04-PLAN.md) delivers
// TenantConnector and BusinessDatabaseRegistry-backed real tenant
// persistence." Unlike ./locationRepository.js, this repository queries a
// REAL per-tenant database — not an in-memory Map — because Wave 4
// (this plan) is exactly the wave tasked with delivering that
// infrastructure (Task 1: tenant models; Task 2: BusinessDatabaseRegistry).
//
// NOTE: no tenant-database *provisioning* flow exists anywhere in this
// codebase yet (no use case creates a dgfy_business_* database or inserts a
// business_database_registry row for a newly-created business — see
// 04-03.5-SUMMARY.md's Known Stub). In practice this means
// findActiveAssignment() will only ever find a row once a business has both
// (a) a real BusinessDatabaseRegistry entry and (b) a real, migrated
// dgfy_business_* database with an account_staff_assignments row seeded
// into it — both out of this wave's explicit task list. This is expected
// and handled gracefully by tenantSessionUseCases.js's NO_TENANT_DATABASE /
// NO_TENANT_ASSIGNMENT rejection paths, not a crash.
export class AccountStaffAssignmentRepository {
    /**
     * @param {{tenantConnector}} deps - the shared TenantConnector instance
     *   (injected, not imported directly, per Dependency Inversion).
     */
    constructor({ tenantConnector } = {}) {
        if (!tenantConnector) {
            throw new Error('AccountStaffAssignmentRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.modelsByDatabase = new Map(); // databaseName -> AccountStaffAssignment model
    }

    resolveModel(databaseName) {
        if (this.modelsByDatabase.has(databaseName)) {
            return this.modelsByDatabase.get(databaseName);
        }
        const connection = this.tenantConnector.getConnection(databaseName);
        const model = defineAccountStaffAssignmentModel(connection);
        this.modelsByDatabase.set(databaseName, model);
        return model;
    }

    /**
     * Finds the tenant-local staff assignment evidence for dgfyAccountId in
     * the tenant database identified by databaseName (Task 3, Step 3). The
     * real migration's unique index on dgfy_account_id means there is at
     * most one assignment row per account per tenant database.
     * @param {string} databaseName
     * @param {string} dgfyAccountId
     */
    async findActiveAssignment(databaseName, dgfyAccountId) {
        if (!databaseName || !dgfyAccountId) return null;
        const model = this.resolveModel(databaseName);
        const record = await model.findOne({
            where: { dgfy_account_id: dgfyAccountId, status: 'active' }
        });
        return record ? this.toPlain(record) : null;
    }

    /**
     * Creates a tenant-local assignment row. Originally provided for test
     * seeding/forward compatibility only; Wave 7 (04-07-PLAN.md) is the
     * staff-onboarding-to-tenant-DB write path this doc comment anticipated
     * — staffOnboardingRepository.js now calls this (via createOrActivate())
     * for both the direct-add and invitation-accept flows.
     */
    async create(databaseName, { dgfyAccountId, staffAccountId, role = 'staff', status = 'active' }) {
        const model = this.resolveModel(databaseName);
        const record = await model.create({
            dgfy_account_id: dgfyAccountId,
            staff_account_id: staffAccountId,
            role,
            status,
            invited_at: new Date(),
            accepted_at: status === 'active' ? new Date() : null
        });
        return this.toPlain(record);
    }

    /**
     * Finds a tenant-local assignment row for dgfyAccountId regardless of
     * status (unlike findActiveAssignment(), which only matches
     * status='active') — used by createOrActivate() to decide whether to
     * insert or update, since the real migration's unique index on
     * dgfy_account_id means there is at most one assignment row per account
     * per tenant database.
     * @param {string} databaseName
     * @param {string} dgfyAccountId
     */
    async findByDgfyAccountId(databaseName, dgfyAccountId) {
        if (!databaseName || !dgfyAccountId) return null;
        const model = this.resolveModel(databaseName);
        const record = await model.findOne({ where: { dgfy_account_id: dgfyAccountId } });
        return record ? this.toPlain(record) : null;
    }

    /**
     * Wave 7 (04-07-PLAN.md, D-11): idempotent "create or activate" used by
     * staffOnboardingRepository.js for both direct-add (immediately active)
     * and invitation-accept (activating a previously-invited assignment, or
     * creating a fresh one) flows. Never violates the unique
     * (dgfy_account_id) index — updates the existing row in place if one is
     * found, regardless of its prior status.
     * @param {string} databaseName
     * @param {{dgfyAccountId, staffAccountId, role?}} args
     */
    async createOrActivate(databaseName, { dgfyAccountId, staffAccountId, role = 'staff' }) {
        const model = this.resolveModel(databaseName);
        const existing = await model.findOne({ where: { dgfy_account_id: dgfyAccountId } });
        if (existing) {
            await existing.update({
                staff_account_id: staffAccountId,
                role,
                status: 'active',
                accepted_at: existing.accepted_at || new Date()
            });
            return this.toPlain(existing);
        }
        return this.create(databaseName, { dgfyAccountId, staffAccountId, role, status: 'active' });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            dgfy_account_id: plain.dgfy_account_id,
            staff_account_id: plain.staff_account_id,
            role: plain.role,
            status: plain.status,
            invited_at: plain.invited_at,
            accepted_at: plain.accepted_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector}} deps
 * @returns {AccountStaffAssignmentRepository}
 */
export const buildAccountStaffAssignmentRepository = (deps) => new AccountStaffAssignmentRepository(deps);

export default AccountStaffAssignmentRepository;
