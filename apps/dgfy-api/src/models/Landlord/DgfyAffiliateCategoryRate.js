import { DataTypes, Model } from 'sequelize';

// #448 (Phase 209): per-category affiliate commission rate. Scoped
// (tenant_id, enrollment_id, folder_id) - structurally identical to DgfyAffiliatePriceRule, one
// scope narrower (no item_id tier). See
// apps/dgfy-migration-runner/migrations/20260901000001-add-affiliate-category-rates.cjs for the
// full sentinel/no-FK rationale: enrollment_id = 0 is the tenant-wide template row, folder_id is a
// tenant-DB item_folders.folder_id held by value (no cross-database FK), and there is deliberately
// no folder_id = 0 "all categories" sentinel - "no row" already means "use the tenant default".
export default (sequelize) => {
    class DgfyAffiliateCategoryRate extends Model { }

    DgfyAffiliateCategoryRate.init({
        category_rate_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        enrollment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        folder_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateCategoryRate',
        tableName: 'dgfy_affiliate_category_rates',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['tenant_id', 'enrollment_id', 'folder_id'], name: 'unique_dgfy_affiliate_category_rates_scope' },
            { fields: ['tenant_id', 'active'], name: 'idx_dgfy_affiliate_category_rates_tenant_active' }
        ]
    });

    return DgfyAffiliateCategoryRate;
};
