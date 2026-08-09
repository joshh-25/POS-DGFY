import { DataTypes, Model } from 'sequelize';

// Landlord-only: the curated Store Template catalog (issue #178 Phase 13,
// ADR 0056). A template is a versioned, curated bundle of Capability Module
// keys (packages/shared-constants/src/capabilityModules.js) that materializes
// into a tenant's own Store Profile at provisioning time. Templates are never
// dereferenced at request-serving time (ADR 0056 clause 2) - only read at
// provisioning and by the future curation surface (Phase 14).
export default (sequelize) => {
    class StoreConfigurationTemplate extends Model { }

    StoreConfigurationTemplate.init({
        template_id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        template_key: {
            type: DataTypes.STRING(80),
            allowNull: false,
            unique: true
        },
        label: {
            type: DataTypes.STRING(150),
            allowNull: false
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        status: {
            type: DataTypes.ENUM('draft', 'published', 'deprecated'),
            allowNull: false,
            defaultValue: 'draft'
        },
        base_mode: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        is_preset: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        visibility: {
            type: DataTypes.ENUM('visible', 'hidden'),
            allowNull: false,
            defaultValue: 'visible'
        },
        owner: {
            type: DataTypes.STRING(150),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'StoreConfigurationTemplate',
        tableName: 'store_configuration_templates',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['template_key'], name: 'idx_store_configuration_templates_key', unique: true },
            { fields: ['base_mode', 'status'], name: 'idx_store_configuration_templates_mode_status' }
        ]
    });

    return StoreConfigurationTemplate;
};
