import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.courier_assignments,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260715120000-create-availment-fulfillment.cjs's actual
// `courier_assignments` table definition (Phase 11 Plan 01, FUL-03,
// D-01/D-02/D-03/D-04).
//
// DELIBERATE DIVERGENCE from the append-only InventoryMovement/
// AvailmentStageEvent shape (Landmine 3/A5): this table's payout
// sub-lifecycle (`payout_status` owed→paid, `paid_at`) IS mutable by
// design — unlike AvailmentStageEvent, this model does NOT set
// `updatedAt: false` and does NOT add throwing beforeUpdate/beforeBulkUpdate
// hooks. The 11-01 migration correspondingly excludes `courier_assignments`
// from its `appendOnlyTables` SIGNAL '45000' trigger array, so there is no
// DB-level backstop blocking updates here either — that absence is
// intentional, not an oversight.
//
// What IS append-only about this table is assignment IDENTITY, not the row
// itself: a courier reassignment always INSERTs a new row and marks the
// prior attempt `is_active: false` + `superseded_at: <now>` (D-04) — it
// never overwrites or deletes a prior assignment attempt. That
// insert-new/mark-prior-inactive discipline is enforced in
// courierAssignmentRepository.js (Plan 02), not at this model layer.
//
// Independent of Phase 8 shift/cash-drawer pay-outs (D-03) — no association
// to Shift/CashDrawerEvent.
export default (sequelize) => {
    class CourierAssignment extends Model {
        static associate(models = {}) {
            if (models.Availment && !CourierAssignment.associations?.availment) {
                CourierAssignment.belongsTo(models.Availment, {
                    foreignKey: 'availment_id',
                    as: 'availment'
                });
            }
            if (models.StaffAccount && !CourierAssignment.associations?.assignedByStaffAccount) {
                CourierAssignment.belongsTo(models.StaffAccount, {
                    foreignKey: 'assigned_by_staff_account_id',
                    as: 'assignedByStaffAccount'
                });
            }
        }
    }

    CourierAssignment.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: {
            type: DataTypes.CHAR(36),
            allowNull: false
        },
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'availments', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // D-01: free-text courier columns, no reusable courier entity.
        // Length-bounded per V5.
        courier_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        courier_contact: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        // D-02: server-validated non-negative — enforced in usecases
        // (Plan 02), not at this model layer.
        payout_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        },
        payout_status: {
            type: DataTypes.ENUM('owed', 'paid'),
            allowNull: false,
            defaultValue: 'owed'
        },
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // D-04: reassignment inserts a NEW row and marks the prior attempt
        // inactive — never overwritten or deleted.
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        superseded_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        assigned_by_staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        }
    }, {
        sequelize,
        modelName: 'CourierAssignment',
        tableName: 'courier_assignments',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // MUTABLE (Landmine 3/A5) — unlike AvailmentStageEvent, this table
        // has a real updated_at column and no insert-only guard hooks.
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['business_id', 'availment_id'], name: 'idx_courier_assignments_business_availment' }
        ]
    });

    return CourierAssignment;
};
