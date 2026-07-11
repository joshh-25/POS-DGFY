import { Op } from 'sequelize';
import { createBusinessEntity, createBusinessMembershipEntity } from '../entities/businessEntity.js';

// BusinessRepository — Clean Architecture data access adapter (mirrors
// ../../accounts/repositories/accountRepository.js's role). Owns ALL
// Sequelize queries for the businesses domain; every use case reaches the
// Business/BusinessMembership models exclusively through this repository.
// No business logic lives here, only data access + Model<->entity<->plain-
// object translation (API-05: Sequelize model rows are translated through
// ../entities/businessEntity.js's BusinessEntity/BusinessMembershipEntity
// helpers, preserving the exact same public response shape this repository
// has always returned).
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

    /**
     * D-10/API-03: like create(), but also creates (or finds) safe tenant
     * registry metadata for the new business inside the SAME landlord
     * transaction — the Business insert, owner BusinessMembership insert,
     * and BusinessDatabaseRegistry insert either all commit or all roll
     * back. `registryRepository` is optional (omit it to get create()'s
     * exact prior behavior) so this stays usable before a
     * BusinessDatabaseRegistryRepository is wired up.
     *
     * The API request path never creates the actual tenant database or
     * runs schema migrations — only safe `provisioning` metadata is
     * written here (registryRepository.findOrCreateForBusiness()'s own doc
     * comment covers the operator/migration-runner handoff that later
     * marks a registry row `active`/`verified`).
     *
     * @param {{payload: {business_handle, legal_name, display_name}, accountId: string, registryRepository?: Object}} args
     */
    async createWithOwnerAndRegistry({ payload, accountId, registryRepository }) {
        return this.sequelize.transaction(async (transaction) => {
            const businessInstance = await this.businessModel.create({
                business_handle: payload.business_handle,
                legal_name: payload.legal_name,
                display_name: payload.display_name,
                status: 'active'
            }, { transaction });

            const membershipInstance = await this.businessMembershipModel.create({
                account_id: accountId,
                business_id: businessInstance.id,
                role: 'owner',
                status: 'active'
            }, { transaction });

            let tenantRegistry = null;
            if (registryRepository) {
                tenantRegistry = await registryRepository.findOrCreateForBusiness({
                    businessId: businessInstance.id,
                    businessHandle: businessInstance.business_handle,
                    transaction
                });
            }

            return {
                business: this.toPlainBusiness(businessInstance),
                membership: this.toPlainMembership(membershipInstance),
                tenantRegistry
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

    // --- Model <-> plain object translation ---

    toPlainBusiness(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return createBusinessEntity(plain).toPlain();
    }

    toPlainMembership(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return createBusinessMembershipEntity(plain).toPlain();
    }
}

/**
 * @param {{businessModel, businessMembershipModel, sequelize?}} deps
 * @returns {BusinessRepository}
 */
export const buildBusinessRepository = (deps) => new BusinessRepository(deps);

export default BusinessRepository;
