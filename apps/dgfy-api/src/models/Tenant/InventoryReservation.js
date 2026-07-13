import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.inventory_reservations,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260714102000-create-inventory-reservations.cjs's actual
// `inventory_reservations` table definition exactly (Phase 10, D-07/D-09/D-10).
// Stock-reservation ledger — sole writer is `modules/inventory` (ADR 0029).
// D-07: orders place temporary holds; D-09: expired holds excluded from
// availability on-read; D-10: reservations fail fast on tenant DB unreachable.
export default (sequelize) => {
    class InventoryReservation extends Model {
        static associate(models = {}) {
            if (models.Product && !InventoryReservation.associations?.product) {
                InventoryReservation.belongsTo(models.Product, {
                    foreignKey: 'product_id',
                    as: 'product'
                });
            }
        }
    }

    InventoryReservation.init({
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
        // Positive held amount (quantity reserved, not delta).
        quantity: {
            type: DataTypes.DECIMAL(24, 12),
            allowNull: false
        },
        // reference_type defaults to 'storefront_order' (D-07: order public_reference).
        reference_type: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'storefront_order'
        },
        // reference_id is the storefront order's public_reference (opaque string).
        reference_id: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        // Status: active (held), committed (converted to sale), released (returned).
        status: {
            type: DataTypes.ENUM('active', 'committed', 'released'),
            allowNull: false,
            defaultValue: 'active'
        },
        // D-09: expires_at from the session (NULL if no session expiry).
        // On-read availability logic excludes expired-active rows from the held sum.
        expires_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'InventoryReservation',
        tableName: 'inventory_reservations',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['product_id', 'status'], name: 'idx_inventory_reservations_product_status' },
            { fields: ['reference_type', 'reference_id'], name: 'idx_inventory_reservations_reference' },
            { fields: ['status', 'expires_at'], name: 'idx_inventory_reservations_expiry' }
        ]
    });

    return InventoryReservation;
};
