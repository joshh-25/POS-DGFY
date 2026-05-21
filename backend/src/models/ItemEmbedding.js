import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemEmbedding = sequelize.define('ItemEmbedding', {
    embedding_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    item_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
            model: 'items',
            key: 'item_id'
        }
    },
    // Store vector as JSON text
    // OpenAI 1536-dim vector is ~23KB, fitting in TEXT (64KB)
    vector: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'JSON stringified array of floats from OpenAI embedding model'
    }
}, {
    tableName: 'item_embeddings',
    timestamps: true,
    underscored: true
});

export default ItemEmbedding;
