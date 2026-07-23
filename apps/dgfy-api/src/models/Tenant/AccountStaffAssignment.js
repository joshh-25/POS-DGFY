import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.account_staff_
// assignments, matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710021000-create-dgfy-business-foundation.cjs's actual table
// definition exactly — NOT 04-04-PLAN.md's Task 1 prose (which described a
// composite unique constraint on (dgfy_account_id, staff_account_id); the
// real, already-applied migration instead has a single-column UNIQUE index
// on dgfy_account_id alone: `unique_account_staff_assignments_dgfy_account`,
// meaning one DGFY account has at most one tenant-local staff assignment in
// a given tenant database). Mirrors the precedent set repeatedly across this
// phase (Business.js/BusinessMembership.js/Location.js) of matching the
// real applied migration over plan prose when the two disagree.
//
// dgfy_account_id is an opaque UUID pointing at dgfy_core.accounts.id —
// NEVER a real foreign key (MySQL cannot enforce FKs across separate
// databases), and this is the tenant-local evidence
// ../../modules/businesses/usecases/tenantSessionUseCases.js checks for
// API-04 enforcement (landlord membership + tenant-local assignment).
export default (sequelize) => {
    class AccountStaffAssignment extends Model {
        static associate(models = {}) {
            if (models.StaffAccount && !AccountStaffAssignment.associations?.staffAccount) {
                AccountStaffAssignment.belongsTo(models.StaffAccount, {
                    foreignKey: 'staff_account_id',
                    as: 'staffAccount'
                });
            }
        }
    }

    AccountStaffAssignment.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database) and never a place to cache credentials (D-14).
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        role: {
            type: DataTypes.ENUM('owner', 'manager', 'staff'),
            allowNull: false,
            defaultValue: 'staff'
        },
        status: {
            type: DataTypes.ENUM('invited', 'active', 'removed'),
            allowNull: false,
            defaultValue: 'invited'
        },
        invited_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'AccountStaffAssignment',
        tableName: 'account_staff_assignments',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['dgfy_account_id'],
                name: 'unique_account_staff_assignments_dgfy_account'
            },
            { fields: ['staff_account_id'], name: 'idx_account_staff_assignments_staff_account' },
            { fields: ['status'], name: 'idx_account_staff_assignments_status' }
        ]
    });

    return AccountStaffAssignment;
};
