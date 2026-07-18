import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.product_folders,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual `product_folders`
// table definition exactly (Phase 8, PRD-03). Field list ported from the
// read-only legacy ItemFolder model
// (name/description/show_in_pos_filter/is_active), but per D-14 this table
// is business-scoped and FLAT — no `parent_id` self-nesting FK is added,
// even though legacy's ItemFolder.js carries one. Per Phase 4/8 Clean
// Architecture: this model carries NO business logic.
export default (sequelize) => {
    class ProductFolder extends Model {
        static associate(models = {}) {
            if (models.Product && !ProductFolder.associations?.products) {
                ProductFolder.hasMany(models.Product, {
                    foreignKey: 'folder_id',
                    as: 'products'
                });
            }
        }
    }

    ProductFolder.init({
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
        name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        show_in_pos_filter: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        modelName: 'ProductFolder',
        tableName: 'product_folders',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['business_id', 'name'], name: 'unique_product_folders_business_name' }
        ]
    });

    return ProductFolder;
};
