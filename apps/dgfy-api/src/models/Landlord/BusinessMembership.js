import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_core.business_memberships,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710020000-create-dgfy-core-foundation.cjs's actual table definition.
// NOTE: `id` is an auto-incrementing INTEGER (not UUID), and the `role`/
// `status` enum values differ from 04-03-PLAN.md's Task 1 prose
// (owner|manager|staff / active|suspended) — the real migration uses
// role: enum('owner','manager','member') default 'owner' and
// status: enum('active','invited','removed') default 'active'. This model
// mirrors the real migration/DB exactly per the plan's own done-criteria
// ("all columns match contract"). "staff" is a distinct, tenant-scoped
// concept (dgfy_business_*.account_staff_assignments, Wave 4) — not a
// business_memberships role. Per Phase 4 Clean Architecture: no business
// logic lives here — see
// ../../modules/businesses/usecases/businessUseCases.js and
// ../../modules/businesses/repositories/businessRepository.js.
export default (sequelize) => {
    class BusinessMembership extends Model {
        static associate(models = {}) {
            if (models.Account && !BusinessMembership.associations?.account) {
                BusinessMembership.belongsTo(models.Account, { foreignKey: 'account_id', as: 'account' });
            }
            if (models.Business && !BusinessMembership.associations?.business) {
                BusinessMembership.belongsTo(models.Business, { foreignKey: 'business_id', as: 'business' });
            }
        }
    }

    BusinessMembership.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        account_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'accounts', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        business_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'businesses', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // Minimal now (single-owner enforced at application level, D-10);
        // 'member' already covers non-owner participants so no future
        // schema rewrite is needed (D-07).
        role: {
            type: DataTypes.ENUM('owner', 'manager', 'member'),
            allowNull: false,
            defaultValue: 'owner'
        },
        status: {
            type: DataTypes.ENUM('active', 'invited', 'removed'),
            allowNull: false,
            defaultValue: 'active'
        }
    }, {
        sequelize,
        modelName: 'BusinessMembership',
        tableName: 'business_memberships',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['business_id', 'account_id'],
                name: 'unique_business_memberships_business_account'
            },
            { fields: ['business_id', 'role'], name: 'idx_business_memberships_business_role' }
        ]
    });

    return BusinessMembership;
};
