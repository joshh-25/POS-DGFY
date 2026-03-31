import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class StorefrontDiscoveryIndex extends Model {}

    StorefrontDiscoveryIndex.init({
        storefront_discovery_index_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        tenant_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        tenant_company_token: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        slug: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        storefront_open: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        is_visible: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        location_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true
        },
        location_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        address_line: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        latitude: {
            type: DataTypes.DECIMAL(10, 7),
            allowNull: true
        },
        longitude: {
            type: DataTypes.DECIMAL(10, 7),
            allowNull: true
        },
        delivery_radius_km: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0
        },
        estimated_wait_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 15
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
        store_delivery_fee: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0
        },
        catalog_count: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        },
        source_updated_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        last_synced_at: {
            type: DataTypes.DATE,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'StorefrontDiscoveryIndex',
        tableName: 'storefront_discovery_index',
        underscored: true,
        timestamps: true
    });

    return StorefrontDiscoveryIndex;
};

