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
            allowNull: true
        },
        tenant_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        tenant_company_token: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        entity_type: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'dgfy_native'
        },
        external_provider: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        external_reference_id: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        external_storefront_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        slug: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        affiliate_slug: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        storefront_open: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        workflow_mode: {
            type: DataTypes.STRING(80),
            allowNull: false,
            defaultValue: 'food_manufacturing'
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
        storefront_cover_image_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        storefront_profile_image_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        storefront_tagline: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        storefront_about: {
            type: DataTypes.STRING(1000),
            allowNull: true
        },
        storefront_phone: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        storefront_email: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        storefront_hours: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        storefront_why_choose_us: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_social_links: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_review_highlights: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_promo: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_promos: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // #713: fix -- this column was never declared here, so
        // syncStorefrontDiscoveryIndexForTenant's `.create(snapshot)` silently dropped
        // `storefront_vouchers` before it ever reached the DB (Sequelize only persists attributes
        // the model declares). storefrontDiscoveryIndexService.js's buildPublicStorefrontVouchers
        // computed the right value in memory the whole time; it just never survived a save. Caught
        // 2026-08-20 via live testing against a real voucher, not by the original test suite --
        // that suite asserted the builder function's return value directly and never exercised a
        // real persist-and-read round trip through this model.
        storefront_vouchers: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_ui_v2_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        storefront_categories: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_gallery_images: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_delivery_partners: {
            type: DataTypes.JSON,
            allowNull: true
        },
        storefront_follow_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        storefront_share_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        storefront_review_summary: {
            type: DataTypes.JSON,
            allowNull: true
        },
        customer_access_mode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'catalog'
        },
        effective_customer_access_mode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'transaction'
        },
        max_customer_access_mode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'catalog'
        },
        inventory_display_mode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'availability'
        },
        inventory_low_stock_display_threshold: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 5
        },
        access_capabilities: {
            type: DataTypes.JSON,
            allowNull: true
        },
        access_limitation_reason: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        customer_access_modes_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        active_location_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        },
        item_search_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        },
        search_snapshot_version: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1
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
