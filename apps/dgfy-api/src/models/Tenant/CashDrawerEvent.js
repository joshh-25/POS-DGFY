import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.cash_drawer_events,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual
// `cash_drawer_events` table definition exactly (Phase 8, SFT-03). This is
// the append-only cash-drawer audit ledger — sole writer is
// `modules/shifts`. Insert-only shape mirrors InventoryMovement.js (ported
// from the read-only legacy StockMovement model's `updatedAt:false`
// convention).
//
// Application-layer half of the append-only guarantee (the DB-level
// BEFORE UPDATE/DELETE SIGNAL '45000' triggers from the 08-01 migration are
// the hard backstop, per research Pattern C): updatedAt:false (no
// `updated_at` column) plus throwing beforeUpdate/beforeBulkUpdate hooks.
export default (sequelize) => {
    class CashDrawerEvent extends Model {
        static associate(models = {}) {
            if (models.Shift && !CashDrawerEvent.associations?.shift) {
                CashDrawerEvent.belongsTo(models.Shift, {
                    foreignKey: 'shift_id',
                    as: 'shift'
                });
            }
            if (models.StaffAccount && !CashDrawerEvent.associations?.actorStaffAccount) {
                CashDrawerEvent.belongsTo(models.StaffAccount, {
                    foreignKey: 'actor_staff_account_id',
                    as: 'actorStaffAccount'
                });
            }
        }
    }

    CashDrawerEvent.init({
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
        shift_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'shifts', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // pay_in/pay_out are reserved, unwired event types (D-10) — only
        // open/close/no_sale_pop are written by this phase's usecases.
        event_type: {
            type: DataTypes.ENUM('open', 'close', 'no_sale_pop', 'pay_in', 'pay_out'),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        reason: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        actor_staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        }
    }, {
        sequelize,
        modelName: 'CashDrawerEvent',
        tableName: 'cash_drawer_events',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // Append-only: no updated_at column, matching the 08-01 migration.
        updatedAt: false,
        indexes: [
            { fields: ['shift_id'], name: 'idx_cash_drawer_events_shift' },
            { fields: ['event_type'], name: 'idx_cash_drawer_events_event_type' }
        ],
        hooks: {
            beforeUpdate() {
                throw new Error('cash_drawer_events is insert-only');
            },
            beforeBulkUpdate() {
                throw new Error('cash_drawer_events is insert-only');
            }
        }
    });

    return CashDrawerEvent;
};
