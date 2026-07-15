import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.product_embeddings,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260716100000-extend-schema-for-legacy-migration.cjs's actual
// `product_embeddings` table definition exactly (Phase 12, LDM-03, D-09).
//
// Strict 1:1 per product — `product_id` carries a UNIQUE index
// (`unique_product_embeddings_product`), matching legacy `ItemEmbedding.js`'s
// existing 1:1 shape (legacy has never had more than one embedding per
// item). `vector` is TEXT, storing the same JSON-stringified-float-array
// shape legacy uses — no re-embedding, no format change. `legacy_embedding_id`
// is an optional traceability pointer back to the legacy
// `item_embeddings.embedding_id` row (A2), populated by Phase 13's mapper.
//
// No API feature reads/writes this table yet — added now for read-path
// parity with the migration (RESEARCH A3 / Open Question 2, same conscious
// decision recorded on Product.js/InventoryMovement.js). Per Phase 4/8
// Clean Architecture: this model carries NO business logic.
export default (sequelize) => {
    class ProductEmbedding extends Model {
        static associate(models = {}) {
            if (models.Product && !ProductEmbedding.associations?.product) {
                ProductEmbedding.belongsTo(models.Product, {
                    foreignKey: 'product_id',
                    as: 'product'
                });
            }
        }
    }

    ProductEmbedding.init({
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
        // Legacy JSON-stringified float array shape (matches ItemEmbedding.js).
        vector: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        // Traceability pointer back to legacy item_embeddings.embedding_id (A2).
        legacy_embedding_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'ProductEmbedding',
        tableName: 'product_embeddings',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            // D-09: strict 1:1 — unique product_id.
            { fields: ['product_id'], name: 'unique_product_embeddings_product', unique: true }
        ]
    });

    return ProductEmbedding;
};
