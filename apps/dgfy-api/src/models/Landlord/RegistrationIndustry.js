import { DataTypes, Model } from 'sequelize';

// Landlord-only: the registration Industry catalog (issue #316) - the list
// a merchant picks from at signup, formerly the hardcoded
// REGISTRATION_INDUSTRIES constant (now the seed baseline + fail-open
// fallback, see ADR 0058). Every offered industry has a row; `hidden`
// removes it from merchant surfaces without deleting it. `is_system` marks
// the seeded baseline rows: undeletable (no delete endpoint exists at all)
// and mode-immutable - only the platform seed sets it, the curation
// surface never does, mirroring StoreConfigurationTemplate.is_preset.
// `workflow_mode` is a plain string validated at the application layer
// against the engineering-owned mode enum (ADR 0056 clause 3);
// `template_key` is a cross-aggregate string reference to
// store_configuration_templates (no FK), null iff the mode's engine is
// external.
export default (sequelize) => {
    class RegistrationIndustry extends Model { }

    RegistrationIndustry.init({
        industry_key: {
            type: DataTypes.STRING(80),
            primaryKey: true
        },
        label: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        summary: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        niches: {
            type: DataTypes.JSON,
            allowNull: false
        },
        workflow_mode: {
            type: DataTypes.STRING(40),
            allowNull: false
        },
        template_key: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        display_order: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        hidden: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        hidden_reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        is_system: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        created_by: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        updated_by: {
            type: DataTypes.STRING(120),
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'RegistrationIndustry',
        tableName: 'registration_industries',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['hidden'], name: 'idx_registration_industries_hidden' },
            { fields: ['display_order'], name: 'idx_registration_industries_display_order' }
        ]
    });

    return RegistrationIndustry;
};
