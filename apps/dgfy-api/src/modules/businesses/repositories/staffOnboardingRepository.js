import crypto from 'crypto';
import defineStaffAccountModel from '../../../models/Tenant/StaffAccount.js';
import defineStaffInvitationModel from '../../../models/Tenant/StaffInvitation.js';

// StaffOnboardingRepository — Clean Architecture data access adapter for the
// tenant-scoped staff onboarding domain (D-11/D-14, Wave 7 gap-closure,
// 04-07-PLAN.md Task 2). Mirrors ./locationRepository.js's TenantConnector
// resolution pattern. CLOSES the process-local invitation/staff-account
// bridging stores 04-03-SUMMARY.md sanctioned as a temporary Wave 3 measure
// ("pending Wave 4 tenant DB infrastructure") — invitations and
// staff_accounts now persist through a real per-tenant Sequelize connection,
// and tenant-local assignment evidence is delegated to the already-existing
// ./accountStaffAssignmentRepository.js (its own createOrActivate()/
// findByDgfyAccountId() additions in this same wave).
//
// SECURITY (T-04-07-02): only a SHA-256 token_hash is ever persisted for an
// invitation — the raw token is never written to any tenant/landlord row.
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

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export class StaffOnboardingRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?, accountStaffAssignmentRepository}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   ./locationRepository.js/../index.js's buildBusinessesModule() doc
     *   comment) so this repository can always be constructed; every
     *   operation fails closed with TenantDatabaseUnavailableError
     *   ('not_configured', ...) when it is omitted.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository, accountStaffAssignmentRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('StaffOnboardingRepository requires a tenantConnector.');
        }
        if (!accountStaffAssignmentRepository) {
            throw new Error('StaffOnboardingRepository requires an accountStaffAssignmentRepository.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
        this.accountStaffAssignmentRepository = accountStaffAssignmentRepository;
        this.modelsByDatabase = new Map(); // databaseName -> { StaffAccount, StaffInvitation }
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (04-06-SUMMARY.md: "verified"
     * is status='active' + verified_at populated, not a distinct status).
     * Throws TenantDatabaseUnavailableError for every non-writable state —
     * mirrors ./locationRepository.js's resolveDatabaseName() exactly.
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

    resolveModels(databaseName) {
        if (this.modelsByDatabase.has(databaseName)) {
            return this.modelsByDatabase.get(databaseName);
        }
        const connection = this.tenantConnector.getConnection(databaseName);
        const models = {
            StaffAccount: defineStaffAccountModel(connection),
            StaffInvitation: defineStaffInvitationModel(connection)
        };
        this.modelsByDatabase.set(databaseName, models);
        return models;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn({ StaffAccount, StaffInvitation, databaseName })` against it. Any
     * error surfaced while resolving the models or running the query (e.g.
     * an unreachable tenant MySQL server) is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one (never double-wrapped).
     * @param {string} businessId
     * @param {(ctx: {StaffAccount, StaffInvitation, databaseName}) => Promise<any>} fn
     */
    async withModels(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const models = this.resolveModels(databaseName);
            return await fn({ ...models, databaseName });
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Creates a durable invitation row. Only a SHA-256 token_hash is
     * persisted — `token` is used solely to compute the hash and is never
     * written to the tenant database (T-04-07-02).
     * @param {{businessId, email, token, expiresAt}} input
     */
    async createInvitation({ businessId, email, token, expiresAt }) {
        return this.withModels(businessId, async ({ StaffInvitation }) => {
            const record = await StaffInvitation.create({
                email: String(email || '').trim().toLowerCase(),
                token_hash: hashToken(token),
                status: 'pending',
                expires_at: expiresAt
            });
            return this.toPlainInvitation(record);
        });
    }

    /**
     * @param {string} businessId
     * @param {string} token - raw invitation token (hashed before lookup)
     */
    async findInvitationByToken(businessId, token) {
        return this.withModels(businessId, async ({ StaffInvitation }) => {
            const record = await StaffInvitation.findOne({ where: { token_hash: hashToken(token) } });
            return record ? this.toPlainInvitation(record) : null;
        });
    }

    /**
     * Finds a still-pending (not yet accepted) invitation for this
     * business's tenant database + email, used for duplicate-invite
     * rejection.
     */
    async findInvitationByEmail(businessId, email) {
        return this.withModels(businessId, async ({ StaffInvitation }) => {
            const record = await StaffInvitation.findOne({
                where: { email: String(email || '').trim().toLowerCase(), status: 'pending' }
            });
            return record ? this.toPlainInvitation(record) : null;
        });
    }

    /**
     * Marks the invitation identified by `token` accepted. Replay
     * protection (rejecting a second accept) is enforced by the use case
     * (businessUseCases.js's buildAcceptInvitationUseCase), which checks
     * `invitation.status` before calling this — mirrors the pre-existing
     * in-memory bridge's convention.
     */
    async markInvitationAccepted(businessId, token) {
        return this.withModels(businessId, async ({ StaffInvitation }) => {
            const record = await StaffInvitation.findOne({ where: { token_hash: hashToken(token) } });
            if (!record) return null;
            await record.update({ status: 'accepted', accepted_at: new Date() });
            return this.toPlainInvitation(record);
        });
    }

    /**
     * Creates a tenant-local staff account. `initialPassword` is
     * intentionally NOT accepted here (unlike the pre-Wave-7 in-memory
     * bridge) — the real staff_accounts schema has no password/credential
     * column, and staff login credentials always come from their own
     * DgfyAccount (see ../../models/Tenant/StaffAccount.js's doc comment).
     */
    async createStaffAccount({ businessId, email, name }) {
        return this.withModels(businessId, async ({ StaffAccount }) => {
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const record = await StaffAccount.create({
                display_name: name || normalizedEmail,
                email: normalizedEmail
            });
            return this.toPlainStaffAccount(record);
        });
    }

    async findStaffAccountByEmail(businessId, email) {
        return this.withModels(businessId, async ({ StaffAccount }) => {
            const record = await StaffAccount.findOne({
                where: { email: String(email || '').trim().toLowerCase() }
            });
            return record ? this.toPlainStaffAccount(record) : null;
        });
    }

    /**
     * Delegates to ./accountStaffAssignmentRepository.js's
     * createOrActivate() (D-11/D-14: direct-add and invitation-accept both
     * "create an active tenant assignment when a target DGFY account id is
     * supplied" — deferred staff-to-DGFY-account linking otherwise, see
     * 04-07-PLAN.md's Source Audit / Deferred section).
     * @param {{businessId, dgfyAccountId, staffAccountId, role?}} input
     */
    async createOrActivateAssignment({ businessId, dgfyAccountId, staffAccountId, role = 'staff' }) {
        return this.withModels(businessId, async ({ databaseName }) => this.accountStaffAssignmentRepository.createOrActivate(
            databaseName,
            { dgfyAccountId, staffAccountId, role }
        ));
    }

    toPlainInvitation(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            staff_account_id: plain.staff_account_id,
            email: plain.email,
            status: plain.status,
            expires_at: plain.expires_at,
            accepted_at: plain.accepted_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }

    toPlainStaffAccount(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            display_name: plain.display_name,
            email: plain.email,
            phone: plain.phone,
            status: plain.status,
            is_master_admin: plain.is_master_admin,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, accountStaffAssignmentRepository}} [deps]
 * @returns {StaffOnboardingRepository}
 */
export const buildStaffOnboardingRepository = (deps) => new StaffOnboardingRepository(deps);

export default StaffOnboardingRepository;
