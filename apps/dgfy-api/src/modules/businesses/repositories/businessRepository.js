import { Op } from 'sequelize';

// BusinessRepository — Clean Architecture data access adapter (mirrors
// ../../accounts/repositories/accountRepository.js's role). Owns ALL
// Sequelize queries for the businesses domain; every use case reaches the
// Business/BusinessMembership models exclusively through this repository.
// No business logic lives here, only data access + Model<->plain-object
// translation.
export class BusinessRepository {
    /**
     * @param {{businessModel, businessMembershipModel, sequelize?}} deps -
     *   the Sequelize Business/BusinessMembership models, injected by the
     *   caller (index.js) rather than imported directly, so this repository
     *   stays testable with mocks. `sequelize` defaults to
     *   businessModel.sequelize when omitted (needed for transactions).
     */
    constructor({ businessModel, businessMembershipModel, sequelize } = {}) {
        if (!businessModel) {
            throw new Error('BusinessRepository requires a Sequelize Business model.');
        }
        if (!businessMembershipModel) {
            throw new Error('BusinessRepository requires a Sequelize BusinessMembership model.');
        }
        this.businessModel = businessModel;
        this.businessMembershipModel = businessMembershipModel;
        this.sequelize = sequelize || businessModel.sequelize;

        // Staff onboarding (D-11) in-memory stores. Real dgfy_business_*
        // tenant-scoped persistence (StaffAccount / account_staff_assignments)
        // doesn't exist yet — that's Wave 4's tenant session/context binding
        // infrastructure (04-04-PLAN.md). Per 04-03-PLAN.md Task 3's own note
        // ("in landlord DB (invitations table or temporary storage)" /
        // "tenant session aware; Wave 4 concern"), this uses the explicitly
        // sanctioned "temporary storage" option rather than adding a new,
        // out-of-scope dgfy_core table (which would be a Rule 4 architectural
        // decision). Every process restart clears these — documented as a
        // known limitation in 04-03-SUMMARY.md.
        this.invitationStore = new Map();
        this.staffAccountStore = new Map();
        this.assignmentStore = [];
    }

    /**
     * D-10: inserts a business and immediately creates an 'owner'
     * BusinessMembership for creatorAccountId, both inside one transaction
     * so a partial write (business with no owner) can never be observed.
     * @param {{business_handle, legal_name, display_name, creatorAccountId}} input
     */
    async create({ business_handle, legal_name, display_name, creatorAccountId }) {
        return this.sequelize.transaction(async (transaction) => {
            const businessInstance = await this.businessModel.create({
                business_handle,
                legal_name,
                display_name,
                status: 'active'
            }, { transaction });

            const membershipInstance = await this.businessMembershipModel.create({
                account_id: creatorAccountId,
                business_id: businessInstance.id,
                role: 'owner',
                status: 'active'
            }, { transaction });

            return {
                business: this.toPlainBusiness(businessInstance),
                membership: this.toPlainMembership(membershipInstance)
            };
        });
    }

    async findById(id) {
        if (!id) return null;
        const model = await this.businessModel.findByPk(id);
        return model ? this.toPlainBusiness(model) : null;
    }

    /**
     * Case-insensitive lookup (Business.business_handle's setter lowercases
     * on write, so the WHERE clause is normalized here to match).
     * @param {string} handle
     */
    async findByHandle(handle) {
        if (!handle) return null;
        const model = await this.businessModel.findOne({
            where: { business_handle: String(handle).trim().toLowerCase() }
        });
        return model ? this.toPlainBusiness(model) : null;
    }

    /**
     * Returns every business the account has an active membership in.
     * Resolved via an explicit id-list query rather than a Sequelize
     * association `include`, so this works regardless of whether
     * Business.associate()/BusinessMembership.associate() were ever called.
     * @param {string} accountId
     */
    async findAccountBusinesses(accountId) {
        if (!accountId) return [];
        const memberships = await this.businessMembershipModel.findAll({
            where: { account_id: accountId, status: 'active' }
        });
        if (memberships.length === 0) return [];

        const businessIds = [...new Set(memberships.map((m) => m.business_id))];
        const businesses = await this.businessModel.findAll({
            where: { id: { [Op.in]: businessIds } }
        });
        return businesses.map((b) => this.toPlainBusiness(b));
    }

    /**
     * Partial update: only fields present on `updates` are written.
     * @param {string} id
     * @param {Object} updates
     */
    async update(id, updates = {}) {
        const model = await this.businessModel.findByPk(id);
        if (!model) return null;

        const patch = {};
        ['legal_name', 'display_name', 'status', 'business_handle'].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(updates, key)) {
                patch[key] = updates[key];
            }
        });

        await model.update(patch);
        return this.toPlainBusiness(model);
    }

    async createMembership({ accountId, businessId, role = 'member' }) {
        const model = await this.businessMembershipModel.create({
            account_id: accountId,
            business_id: businessId,
            role,
            status: 'active'
        });
        return this.toPlainMembership(model);
    }

    async getMembership(accountId, businessId) {
        if (!accountId || !businessId) return null;
        const model = await this.businessMembershipModel.findOne({
            where: { account_id: accountId, business_id: businessId }
        });
        return model ? this.toPlainMembership(model) : null;
    }

    async listMembers(businessId) {
        if (!businessId) return [];
        const models = await this.businessMembershipModel.findAll({ where: { business_id: businessId } });
        return models.map((m) => this.toPlainMembership(m));
    }

    async findMemberByRole(businessId, role) {
        if (!businessId || !role) return null;
        const model = await this.businessMembershipModel.findOne({ where: { business_id: businessId, role } });
        return model ? this.toPlainMembership(model) : null;
    }

    // --- Staff onboarding (D-11) — in-memory temporary storage; see the
    // constructor's doc comment for why. ---

    async createInvitation({ businessId, email, name, token, expiresAt }) {
        const record = {
            token,
            business_id: businessId,
            email: String(email || '').trim().toLowerCase(),
            name: name || null,
            expires_at: expiresAt,
            accepted_at: null,
            created_at: new Date()
        };
        this.invitationStore.set(token, record);
        return { ...record };
    }

    async findInvitationByToken(token) {
        const record = this.invitationStore.get(token);
        return record ? { ...record } : null;
    }

    /**
     * Finds a still-pending (not yet accepted) invitation for this
     * business+email pair, used for duplicate-invite rejection.
     */
    async findInvitationByEmail(businessId, email) {
        const normalized = String(email || '').trim().toLowerCase();
        for (const record of this.invitationStore.values()) {
            if (record.business_id === businessId && record.email === normalized && !record.accepted_at) {
                return { ...record };
            }
        }
        return null;
    }

    async markInvitationAccepted(token) {
        const record = this.invitationStore.get(token);
        if (!record) return null;
        record.accepted_at = new Date();
        this.invitationStore.set(token, record);
        return { ...record };
    }

    async createStaffAccount({ businessId, email, name, initialPassword }) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const key = `${businessId}:${normalizedEmail}`;
        const record = {
            business_id: businessId,
            email: normalizedEmail,
            name: name || null,
            // CRITICAL (per 04-03-PLAN.md Task 3): initialPassword is
            // optional metadata for the owner's records only — never stored
            // as a credential here. Staff login credentials come from their
            // own DgfyAccount, created during invitation acceptance.
            has_initial_password: Boolean(initialPassword),
            created_at: new Date()
        };
        this.staffAccountStore.set(key, record);
        return { ...record };
    }

    async findStaffAccountByEmail(businessId, email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const record = this.staffAccountStore.get(`${businessId}:${normalizedEmail}`);
        return record ? { ...record } : null;
    }

    async createAssignment({ businessId, email, name, token }) {
        const record = {
            business_id: businessId,
            email: String(email || '').trim().toLowerCase(),
            name: name || null,
            token,
            created_at: new Date()
        };
        this.assignmentStore.push(record);
        return { ...record };
    }

    // --- Model <-> plain object translation ---

    toPlainBusiness(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_handle: plain.business_handle,
            legal_name: plain.legal_name,
            display_name: plain.display_name,
            status: plain.status,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }

    toPlainMembership(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            account_id: plain.account_id,
            business_id: plain.business_id,
            role: plain.role,
            status: plain.status,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{businessModel, businessMembershipModel, sequelize?}} deps
 * @returns {BusinessRepository}
 */
export const buildBusinessRepository = (deps) => new BusinessRepository(deps);

export default BusinessRepository;
