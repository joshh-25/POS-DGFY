import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.staff_credentials,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260717000000-add-dgfy-business-staff-credentials.cjs's actual table
// definition exactly. Per Phase 4 Clean Architecture and Phase 13.5's
// minimal API convergence: this model carries NO business logic and does not
// introduce a credential write/read path.
//
// SECURITY (D-13.5-02): this table stores only bcrypt hashes copied from
// legacy. Raw passwords, POS approval PINs, invitation tokens, and reset
// tokens must never be persisted here.
export default (sequelize) => {
    class StaffCredential extends Model {
        static associate(models = {}) {
            if (models.StaffAccount && !StaffCredential.associations?.staffAccount) {
                StaffCredential.belongsTo(models.StaffAccount, {
                    foreignKey: 'staff_account_id',
                    as: 'staffAccount'
                });
            }
        }
    }

    StaffCredential.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        password_hash: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        pos_approval_pin_hash: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        credential_status: {
            type: DataTypes.ENUM('active', 'reset_required', 'disabled'),
            allowNull: false,
            defaultValue: 'active'
        },
        password_updated_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'StaffCredential',
        tableName: 'staff_credentials',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['staff_account_id'], name: 'unique_staff_credentials_staff_account' },
            { fields: ['credential_status'], name: 'idx_staff_credentials_status' }
        ]
    });

    return StaffCredential;
};
