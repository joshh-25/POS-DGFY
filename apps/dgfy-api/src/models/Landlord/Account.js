import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_core.accounts, matching
// apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js's
// `accounts` table exactly (columns, unique indexes/constraints). Per Phase 4
// Clean Architecture: this model carries NO business logic, password
// hashing, or validation — those rules live in
// ../../modules/accounts/entities/accountEntity.js. The AccountRepository
// (../../modules/accounts/repositories/accountRepository.js) is the only
// place that translates between this model and AccountEntity.
export default (sequelize) => {
    class Account extends Model {
        /**
         * Wires the hasMany BusinessMembership association once the
         * BusinessMembership model exists (Wave 3 of Phase 4). Idempotent
         * and safe to call with a partial models map — a no-op until
         * BusinessMembership is registered on the same Sequelize instance.
         */
        static associate(models = {}) {
            if (models.BusinessMembership && !Account.associations?.businessMemberships) {
                Account.hasMany(models.BusinessMembership, {
                    foreignKey: 'account_id',
                    as: 'businessMemberships'
                });
            }
        }
    }

    Account.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        first_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        last_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            set(value) {
                this.setDataValue('email', String(value || '').trim().toLowerCase());
            }
        },
        phone: {
            type: DataTypes.STRING(40),
            allowNull: true,
            unique: true
        },
        password_hash: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('active', 'suspended', 'archived'),
            allowNull: false,
            defaultValue: 'active'
        },
        email_verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        phone_verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        last_login_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Account',
        tableName: 'accounts',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['email'], name: 'unique_accounts_email' },
            { unique: true, fields: ['phone'], name: 'unique_accounts_phone' }
        ]
    });

    return Account;
};
