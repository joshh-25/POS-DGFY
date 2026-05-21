import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StorefrontFollow = sequelize.define('StorefrontFollow', {
    storefront_follow_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    tenant_id: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    storefront_slug: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    visitor_fingerprint: {
        type: DataTypes.STRING(128),
        allowNull: false
    }
}, {
    tableName: 'storefront_follows',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            name: 'idx_storefront_follows_unique_visitor',
            unique: true,
            fields: ['tenant_id', 'storefront_slug', 'visitor_fingerprint']
        },
        {
            name: 'idx_storefront_follows_slug',
            fields: ['tenant_id', 'storefront_slug']
        }
    ]
});

export default StorefrontFollow;
