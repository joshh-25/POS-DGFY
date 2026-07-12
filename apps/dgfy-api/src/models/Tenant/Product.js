import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.products, matching
// apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual `products` table
// definition exactly (Phase 8, PRD-01/PRD-02). Carries the BOK-01 booking
// config directly on the Product (is_bookable/slot_duration_minutes/
// concurrent_capacity) and `inventory_mode` (basic_inventory vs. non_stock,
// PRD-02). Deliberately does NOT add `stock_effect_type` (D-07 — that field
// lives on Phase 9's AvailmentItem, decided per sale line, not fixed on the
// Product). Per Phase 4/8 Clean Architecture: this model carries NO
// business logic.
export default (sequelize) => {
    class Product extends Model {
        static associate(models = {}) {
            if (models.ProductFolder && !Product.associations?.folder) {
                Product.belongsTo(models.ProductFolder, {
                    foreignKey: 'folder_id',
                    as: 'folder'
                });
            }
            if (models.InventoryMovement && !Product.associations?.inventoryMovements) {
                Product.hasMany(models.InventoryMovement, {
                    foreignKey: 'product_id',
                    as: 'inventoryMovements'
                });
            }
            if (models.Booking && !Product.associations?.bookings) {
                Product.hasMany(models.Booking, {
                    foreignKey: 'product_id',
                    as: 'bookings'
                });
            }
            if (models.BookingCapacity && !Product.associations?.bookingCapacities) {
                Product.hasMany(models.BookingCapacity, {
                    foreignKey: 'product_id',
                    as: 'bookingCapacities'
                });
            }
        }
    }

    Product.init({
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
        folder_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'product_folders', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        category: {
            type: DataTypes.ENUM('food', 'service', 'retail'),
            allowNull: false
        },
        inventory_mode: {
            type: DataTypes.ENUM('basic_inventory', 'non_stock'),
            allowNull: false,
            defaultValue: 'non_stock'
        },
        stock_count: {
            type: DataTypes.DECIMAL(24, 12),
            allowNull: true
        },
        base_price: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        is_bookable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        slot_duration_minutes: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        concurrent_capacity: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        modelName: 'Product',
        tableName: 'products',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['business_id'], name: 'idx_products_business' },
            { fields: ['folder_id'], name: 'idx_products_folder' },
            { fields: ['category'], name: 'idx_products_category' }
        ]
    });

    return Product;
};
