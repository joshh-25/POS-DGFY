import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.inventory_movements,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual
// `inventory_movements` table definition exactly (Phase 8, PRD-04). This is
// the append-only Basic Inventory ledger — sole writer is `modules/inventory`
// (ADR 0029). Field shapes ported from the read-only legacy StockMovement
// model (quantity DECIMAL(24,12), updatedAt:false), but the table is
// deliberately named `inventory_movements` — NEVER `stock_movements` (that
// legacy IMS name stays rejected in dgfyBusinessContract.js, see
// 08-RESEARCH.md Pitfall 1).
//
// Application-layer half of the append-only guarantee (the DB-level
// BEFORE UPDATE/DELETE SIGNAL '45000' triggers from the 08-01 migration are
// the hard backstop, per research Pattern C): updatedAt:false (no
// `updated_at` column) plus throwing beforeUpdate/beforeBulkUpdate hooks.
export default (sequelize) => {
    class InventoryMovement extends Model {
        static associate(models = {}) {
            if (models.Product && !InventoryMovement.associations?.product) {
                InventoryMovement.belongsTo(models.Product, {
                    foreignKey: 'product_id',
                    as: 'product'
                });
            }
            if (models.StaffAccount && !InventoryMovement.associations?.actorStaffAccount) {
                InventoryMovement.belongsTo(models.StaffAccount, {
                    foreignKey: 'actor_staff_account_id',
                    as: 'actorStaffAccount'
                });
            }
        }
    }

    InventoryMovement.init({
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
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // sale/booking are reserved, unwired effect-type stubs (D-06) — only
        // restock/loss/adjustment are written by this phase's usecases.
        movement_type: {
            type: DataTypes.ENUM('restock', 'loss', 'adjustment', 'sale', 'booking'),
            allowNull: false
        },
        quantity: {
            type: DataTypes.DECIMAL(24, 12),
            allowNull: false
        },
        reference_type: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        reference_id: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        actor_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        actor_staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        before_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        },
        after_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'InventoryMovement',
        tableName: 'inventory_movements',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // Append-only: no updated_at column, matching the 08-01 migration.
        updatedAt: false,
        indexes: [
            { fields: ['business_id', 'product_id'], name: 'idx_inventory_movements_business_product' },
            { fields: ['movement_type'], name: 'idx_inventory_movements_movement_type' },
            // Phase 12 (12-02-PLAN.md, LDM-04, D-10): additive natural-key
            // unique index — makes Phase 13's migrated-row apply retries
            // idempotent. NULL reference_type/reference_id on existing
            // organic rows are distinct under MySQL's unique-index NULL
            // semantics, so no backfill/data migration is needed.
            {
                fields: ['business_id', 'reference_type', 'reference_id'],
                name: 'unique_inventory_movements_natural_key',
                unique: true
            }
        ],
        hooks: {
            beforeUpdate() {
                throw new Error('inventory_movements is insert-only');
            },
            beforeBulkUpdate() {
                throw new Error('inventory_movements is insert-only');
            }
        }
    });

    return InventoryMovement;
};
