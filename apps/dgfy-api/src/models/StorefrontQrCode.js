import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const StorefrontQrCode = sequelize.define('StorefrontQrCode', {
    storefront_qr_code_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    public_token: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'tenant_locations',
            key: 'location_id'
        }
    },
    target_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'catalog'
    },
    folder_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'item_folders',
            key: 'folder_id'
        }
    },
    label: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    design: {
        type: DataTypes.JSON,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'storefront_qr_codes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { unique: true, fields: ['public_token'], name: 'uq_storefront_qr_codes_public_token' },
        { fields: ['location_id', 'is_active'], name: 'idx_storefront_qr_codes_location_active' },
        { fields: ['location_id', 'target_type', 'folder_id'], name: 'idx_storefront_qr_codes_target' }
    ]
});

export default StorefrontQrCode;
