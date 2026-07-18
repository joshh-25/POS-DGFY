import { AccountEntity } from '../entities/accountEntity.js';

// AccountRepository — Clean Architecture data access adapter. Owns ALL
// Sequelize queries for the accounts domain; every use case reaches the
// Account model exclusively through this repository. Translates between the
// persistence-only Account Sequelize model
// (apps/dgfy-api/src/models/Landlord/Account.js) and AccountEntity
// (../entities/accountEntity.js) at every boundary — no business logic
// lives here, only data access + translation.
export class AccountRepository {
    /**
     * @param {import('sequelize').ModelStatic} accountModel - the Sequelize
     *   Account model, injected by the caller (index.js) rather than
     *   imported directly, so this repository stays testable with a mock.
     */
    constructor(accountModel) {
        if (!accountModel) {
            throw new Error('AccountRepository requires a Sequelize Account model.');
        }
        this.accountModel = accountModel;
    }

    /**
     * @param {Object} accountData - entity-shaped input (email, password_hash, etc.)
     * @returns {Promise<AccountEntity>}
     */
    async create(accountData) {
        const model = await this.accountModel.create(this.entityToModel(accountData));
        return this.modelToEntity(model);
    }

    /**
     * @param {string} id
     * @returns {Promise<AccountEntity|null>}
     */
    async findById(id) {
        if (!id) return null;
        const model = await this.accountModel.findByPk(id);
        return model ? this.modelToEntity(model) : null;
    }

    /**
     * Case-insensitive lookup (the Account model's email setter lowercases
     * on write, so the WHERE clause is normalized here to match).
     * @param {string} email
     * @returns {Promise<AccountEntity|null>}
     */
    async findByEmail(email) {
        if (!email) return null;
        const model = await this.accountModel.findOne({
            where: { email: String(email).trim().toLowerCase() }
        });
        return model ? this.modelToEntity(model) : null;
    }

    /**
     * @param {string} phone
     * @returns {Promise<AccountEntity|null>}
     */
    async findByPhone(phone) {
        if (!phone) return null;
        const model = await this.accountModel.findOne({
            where: { phone: String(phone).trim() }
        });
        return model ? this.modelToEntity(model) : null;
    }

    /**
     * Partial update: only fields present on `updates` are written, so
     * omitted fields are never clobbered with null/undefined.
     * @param {string} id
     * @param {Object} updates
     * @returns {Promise<AccountEntity|null>}
     */
    async update(id, updates) {
        const model = await this.accountModel.findByPk(id);
        if (!model) return null;
        await model.update(this.entityToModel(updates, { partial: true }));
        return this.modelToEntity(model);
    }

    /**
     * Translates a Sequelize Account model instance into an AccountEntity.
     * @param {import('sequelize').Model|null} model
     * @returns {AccountEntity|null}
     */
    modelToEntity(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return new AccountEntity({
            id: plain.id,
            email: plain.email,
            first_name: plain.first_name,
            last_name: plain.last_name,
            phone: plain.phone,
            password_hash: plain.password_hash,
            status: plain.status,
            email_verified_at: plain.email_verified_at,
            phone_verified_at: plain.phone_verified_at,
            last_login_at: plain.last_login_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        });
    }

    /**
     * Translates entity-shaped data into a plain object suitable for
     * Sequelize create()/update(). In `partial` mode only keys explicitly
     * present on `entity` are included (used by update()).
     * @param {Object} entity
     * @param {{partial?: boolean}} [options]
     * @returns {Object}
     */
    entityToModel(entity, { partial = false } = {}) {
        const source = entity || {};
        const fields = {
            email: source.email,
            first_name: source.first_name,
            last_name: source.last_name,
            phone: source.phone,
            password_hash: source.password_hash,
            status: source.status,
            email_verified_at: source.email_verified_at,
            phone_verified_at: source.phone_verified_at,
            last_login_at: source.last_login_at
        };
        if (source.id) fields.id = source.id;

        if (!partial) return fields;

        return Object.fromEntries(
            Object.entries(fields).filter(
                ([key]) => Object.prototype.hasOwnProperty.call(source, key)
            )
        );
    }
}

/**
 * @param {import('sequelize').ModelStatic} accountModel
 * @returns {AccountRepository}
 */
export const buildAccountRepository = (accountModel) => new AccountRepository(accountModel);

export default AccountRepository;
