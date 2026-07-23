import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.availment_stage_events,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260715120000-create-availment-fulfillment.cjs's actual
// `availment_stage_events` table definition (Phase 11 Plan 01, FUL-01..
// FUL-03, D-07/D-10/D-15). This is the STRICTLY append-only fulfillment
// event ledger — every progress-stage / courier / payout action writes one
// row here; `Availment.fulfillment_mode`/`fulfillment_status`/
// `fulfillment_stage` are a denormalized read cache of the LATEST row,
// never the source of truth. Field shape mirrors the same factory-function
// append-only pattern as `InventoryMovement.js` (Phase 8, D-06).
//
// Landmine 1: the coarse pipeline column is named `fulfillment_status`,
// NEVER `status` — `Availment.status` (draft/finalized/voided) is a
// separate, unrelated checkout lifecycle field.
//
// Application-layer half of the append-only guarantee (the DB-level
// BEFORE UPDATE/DELETE SIGNAL '45000' triggers from the 11-01 migration are
// the hard backstop): updatedAt:false (no `updated_at` column) plus
// throwing beforeUpdate/beforeBulkUpdate hooks.
export default (sequelize) => {
    class AvailmentStageEvent extends Model {
        static associate(models = {}) {
            if (models.Availment && !AvailmentStageEvent.associations?.availment) {
                AvailmentStageEvent.belongsTo(models.Availment, {
                    foreignKey: 'availment_id',
                    as: 'availment'
                });
            }
            if (models.StaffAccount && !AvailmentStageEvent.associations?.actorStaffAccount) {
                AvailmentStageEvent.belongsTo(models.StaffAccount, {
                    foreignKey: 'actor_staff_account_id',
                    as: 'actorStaffAccount'
                });
            }
        }
    }

    AvailmentStageEvent.init({
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
        fulfillment_mode: {
            type: DataTypes.ENUM('pickup', 'delivery', 'dine_in'),
            allowNull: false
        },
        // Landmine 1: distinct from Availment.status (draft/finalized/voided).
        fulfillment_status: {
            type: DataTypes.ENUM('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'),
            allowNull: false
        },
        // D-15: shared open-string stage label, no per-mode DB constraint.
        fulfillment_stage: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // Domain reason precedent + D-10 human note accompanying a
        // forced/override transition.
        reason: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        // D-10 (Open Q2 RESOLVED): overrides recorded distinctly and
        // queryably, not folded into `reason` alone.
        is_forced: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        actor_staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        actor_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'AvailmentStageEvent',
        tableName: 'availment_stage_events',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // Append-only: no updated_at column, matching the 11-01 migration
        // (D-07 — this table IS strictly append-only).
        updatedAt: false,
        indexes: [
            { fields: ['business_id', 'availment_id'], name: 'idx_availment_stage_events_business_availment' }
        ],
        hooks: {
            beforeUpdate() {
                throw new Error('availment_stage_events is insert-only');
            },
            beforeBulkUpdate() {
                throw new Error('availment_stage_events is insert-only');
            }
        }
    });

    return AvailmentStageEvent;
};
