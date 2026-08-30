import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TenantLocation = sequelize.define('TenantLocation', {
    location_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    address_line: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false
    },
    delivery_radius_km: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5
    },
    is_open: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    is_primary_storefront: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    operating_hours: {
        type: DataTypes.JSON,
        allowNull: true
    },
    current_wait_time_minutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15
    },
    allow_out_of_stock_sales: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    supports_delivery: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    supports_pickup: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    supports_dine_in: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    scheduling_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    immediate_fulfillment_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    fulfillment_lead_time_min_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    fulfillment_lead_time_max_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    }
}, {
    tableName: 'tenant_locations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['name'] },
        { fields: ['is_active'] },
        { fields: ['is_open'] },
        { fields: ['is_primary_storefront', 'is_active'] },
        { fields: ['latitude', 'longitude'] }
    ]
});

export default TenantLocation;
