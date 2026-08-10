import { DataTypes, Model } from 'sequelize';

// Landlord-only: one Capability Module inclusion row for a
// StoreConfigurationTemplate (issue #178 Phase 13). module_key must be a key
// in CAPABILITY_MODULES with status 'shipped' - enforced at publish time by
// validateModuleSelection(), not by a DB constraint, since the module
// vocabulary is engineering-owned and lives in shared-constants, not a table.
export default (sequelize) => {
    class StoreConfigurationTemplateModule extends Model { }

    StoreConfigurationTemplateModule.init({
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        template_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'store_configuration_templates',
                key: 'template_id'
            }
        },
        module_key: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        config: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'StoreConfigurationTemplateModule',
        tableName: 'store_configuration_template_modules',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['template_id', 'module_key'], name: 'idx_store_configuration_template_modules_unique', unique: true }
        ]
    });

    return StoreConfigurationTemplateModule;
};
