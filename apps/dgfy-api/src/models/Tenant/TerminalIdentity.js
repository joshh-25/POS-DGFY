import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.terminal_identities,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710021000-create-dgfy-business-foundation.cjs's actual table
// definition exactly (D-14/T-02-03-04: terminal identity/policy lookup
// foundation — identity and location binding only, no checkout/payment
// behavior in this phase). Per Phase 4 Clean Architecture: this model
// carries NO business logic.
//
// Wave 8 gap-closure (04-08-PLAN.md, Task 1): CLOSES 04-VERIFICATION.md's
// "orphaned — only referenced by the unmounted tenantContextResolver.js
// middleware" finding. This factory function is unchanged (no schema
// fields were touched), but it is now concretely reachable from live
// composition through ../../infra/tenantConnector.js's
// TenantConnector.getModels(databaseName) — a tenant model definition
// registry that defines this model idempotently on a real per-tenant
// Sequelize connection alongside Location/StaffAccount/StaffInvitation/
// AccountStaffAssignment. No public terminal identity route, controller,
// or use case is added in Phase 04 — that remains later roadmap/POS scope
// (see 04-08-PLAN.md's Rationale).
export default (sequelize) => {
    class TerminalIdentity extends Model {
        static associate(models = {}) {
            if (models.Location && !TerminalIdentity.associations?.location) {
                TerminalIdentity.belongsTo(models.Location, {
                    foreignKey: 'location_id',
                    as: 'location'
                });
            }
        }
    }

    TerminalIdentity.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        terminal_code: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true
        },
        label: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        location_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'locations', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active'
        },
        last_seen_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'TerminalIdentity',
        tableName: 'terminal_identities',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['terminal_code'], name: 'unique_terminal_identities_terminal_code' },
            { fields: ['location_id'], name: 'idx_terminal_identities_location_id' },
            { fields: ['status'], name: 'idx_terminal_identities_status' }
        ]
    });

    return TerminalIdentity;
};
