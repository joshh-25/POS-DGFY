import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_core.business_database_registry,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710020000-create-dgfy-core-foundation.cjs's actual table definition
// exactly (D-08: source of truth for business-to-database mapping — stores
// only names/pointers/status/verification timestamps, NEVER credentials).
// tenantSessionUseCase (../../modules/businesses/usecases/
// tenantSessionUseCases.js) uses this, via
// ../../modules/businesses/repositories/businessDatabaseRegistryRepository.js,
// to resolve which dgfy_business_<stable_opaque_suffix> database a business
// maps to. Per Phase 4 Clean Architecture: this model carries NO business
// logic.
export default (sequelize) => {
    class BusinessDatabaseRegistry extends Model {
        static associate(models = {}) {
            if (models.Business && !BusinessDatabaseRegistry.associations?.business) {
                BusinessDatabaseRegistry.belongsTo(models.Business, {
                    foreignKey: 'business_id',
                    as: 'business'
                });
            }
        }
    }

    BusinessDatabaseRegistry.init({
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        business_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'businesses', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // D-02/D-03: stable opaque suffix, never derived from a display name.
        stable_opaque_suffix: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        // The actual dgfy_business_<stable_opaque_suffix> database name.
        database_name: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('provisioning', 'active', 'migrating', 'deprecated'),
            allowNull: false,
            defaultValue: 'provisioning'
        },
        verified_at: {
            type: DataTypes.DATE,
            allowNull: true,
            // Explicit null default (not just allowNull:true) so a freshly
            // created instance carries verified_at:null in-memory even
            // though MySQL has no RETURNING clause — otherwise the
            // attribute is left `undefined` after .create(), and
            // JSON.stringify silently drops undefined keys from API
            // responses (toSafeMetadata()/toPlain() would report an object
            // with no verified_at key at all instead of verified_at: null).
            defaultValue: null
        }
    }, {
        sequelize,
        modelName: 'BusinessDatabaseRegistry',
        tableName: 'business_database_registry',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['stable_opaque_suffix'],
                name: 'unique_business_database_registry_suffix'
            },
            {
                unique: true,
                fields: ['database_name'],
                name: 'unique_business_database_registry_database_name'
            },
            { fields: ['business_id'], name: 'idx_business_database_registry_business_id' }
        ]
    });

    return BusinessDatabaseRegistry;
};
