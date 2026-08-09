import { DataTypes, Model } from 'sequelize';

// Landlord-only: whether a registration Industry
// (packages/shared-constants/src/registrationIndustries.js) is offered on
// merchant-facing signup surfaces (issue #178 Phase 39). Row absence means
// visible - only a deliberate admin hide creates a row. Keyed by the
// industry's natural string key rather than a template_id, since four
// industries (healthcare, ticketing_transport, logistics_distribution,
// education_institutions) have no store_configuration_templates row at
// all - the reason the existing (dead) `visibility` ENUM on that table
// can't cover this feature.
export default (sequelize) => {
    class RegistrationIndustryVisibility extends Model { }

    RegistrationIndustryVisibility.init({
        industry_key: {
            type: DataTypes.STRING(80),
            primaryKey: true
        },
        hidden: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        updated_by: {
            type: DataTypes.STRING(120),
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'RegistrationIndustryVisibility',
        tableName: 'registration_industry_visibility',
        underscored: true,
        timestamps: true
    });

    return RegistrationIndustryVisibility;
};
