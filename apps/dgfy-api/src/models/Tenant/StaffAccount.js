import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.staff_accounts,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710021000-create-dgfy-business-foundation.cjs's actual `staff_accounts`
// table definition exactly (D-14: tenant-local staff authorization profile —
// credentials live in staff_credentials, and optional DGFY account linkage is
// represented by account_staff_assignments per ADR 0028's Phase 13.5
// amendment). Per Phase 4 Clean Architecture: this model carries NO business
// logic — that lives in ../../modules/businesses/usecases/tenantSessionUseCases.js.
//
// Staff onboarding creates profile-only rows through
// ../../modules/businesses/repositories/staffOnboardingRepository.js. Tenant-local
// credential writes are intentionally separate and belong to a future staff-auth
// phase.
export default (sequelize) => {
    class StaffAccount extends Model {
        /**
         * Wires the hasMany AccountStaffAssignment association. Optional/
         * idempotent — no current caller depends on this being registered
         * (AccountStaffAssignmentRepository resolves assignments via an
         * explicit dgfy_account_id query instead).
         */
        static associate(models = {}) {
            if (models.AccountStaffAssignment && !StaffAccount.associations?.assignments) {
                StaffAccount.hasMany(models.AccountStaffAssignment, {
                    foreignKey: 'staff_account_id',
                    as: 'assignments'
                });
            }
            if (models.StaffCredential && !StaffAccount.associations?.credential) {
                StaffAccount.hasOne(models.StaffCredential, {
                    foreignKey: 'staff_account_id',
                    as: 'credential'
                });
            }
        }
    }

    StaffAccount.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        display_name: {
            type: DataTypes.STRING(255),
            allowNull: false
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
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('active', 'suspended', 'removed'),
            allowNull: false,
            defaultValue: 'active'
        },
        // Bootstraps the first tenant admin before role/permission grants
        // exist for a freshly provisioned business database.
        is_master_admin: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'StaffAccount',
        tableName: 'staff_accounts',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['email'], name: 'unique_staff_accounts_email' },
            { fields: ['status'], name: 'idx_staff_accounts_status' }
        ]
    });

    return StaffAccount;
};
