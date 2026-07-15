import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.availment_items,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260713120000-create-availment-checkout.cjs's actual `availment_items`
// table definition (Phase 09, D-01/D-02/D-03). Line items are updatable
// (quantity, stock_effect_type, tax_treatment) until availment is finalized;
// removal is via soft-delete (cancelled_at), not hard deletion (audit trail
// + restore capability per D-02/D-18).
export default (sequelize) => {
    class AvailmentItem extends Model {
        static associate(models = {}) {
            if (models.Availment && !AvailmentItem.associations?.availment) {
                AvailmentItem.belongsTo(models.Availment, {
                    foreignKey: 'availment_id',
                    as: 'availment'
                });
            }
            if (models.Product && !AvailmentItem.associations?.product) {
                AvailmentItem.belongsTo(models.Product, {
                    foreignKey: 'product_id',
                    as: 'product'
                });
            }
        }

        // D-02, D-18: soft-delete domain helper.
        isCancelledLine() {
            return this.cancelled_at != null;
        }
    }

    AvailmentItem.init({
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
        // Parent Availment reference (same-DB FK).
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'availments', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // Product reference (same-DB FK, D-07: prevent orphaned product
        // deletions).
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
        },
        // Snapshot of product name at line-add time (audit trail for
        // renamed products).
        product_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        // Line item quantity (DECIMAL(24,12) per Phase 8 convention for
        // quantity columns).
        quantity: {
            type: DataTypes.DECIMAL(24, 12),
            allowNull: false
        },
        // Line item unit price snapshot (D-07: prevent orphaned line
        // repricings).
        unit_price: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: false
        },
        // D-03: per-line toggle, default derived from Product.inventory_mode
        // (basic_inventory → inventory_issue; non_stock → stock_exempt).
        stock_effect_type: {
            type: DataTypes.ENUM('inventory_issue', 'stock_exempt'),
            allowNull: false
        },
        // D-13: per-item hierarchical structure; Phase 9 uniform 12% VAT.
        tax_treatment: {
            type: DataTypes.ENUM('vatable', 'vat_exempt', 'zero_rated'),
            allowNull: false,
            defaultValue: 'vatable'
        },
        // D-13: per-item rate (currently uniform 0.1200 = 12% for Phase 9).
        tax_rate: {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: false,
            defaultValue: 0.1200
        },
        // D-02, D-18: soft-delete for removed lines (audit trail, restore
        // capability, append-only principle).
        cancelled_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Phase 14 (14-01, SHM-04): line-level sales-history migration
        // provenance, mirroring availments.source_system exactly.
        // Persistence-only — populated only by the migration mapper, never
        // by any live checkout input/create surface.
        source_system: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // Phase 14 (14-01, SHM-04): namespaced legacy reference
        // (legacy_pos_line:<line_id>), following the exact
        // availments.source_reference pattern. Target-first crash recovery
        // and retry idempotency for line inserts.
        source_reference: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        // Phase 14 (14-01): line detail with no first-class target slot
        // (raw parent/item IDs, UOM, cost, stock-exempt reason, subtotal,
        // override evidence, F&B snapshots). Persistence-only.
        legacy_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'AvailmentItem',
        tableName: 'availment_items',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['business_id', 'availment_id'], name: 'idx_availment_items_business_availment' },
            { fields: ['source_reference'], name: 'unique_availment_items_source_reference', unique: true }
        ]
    });

    return AvailmentItem;
};
