import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_core.businesses, matching
// apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-
// dgfy-core-foundation.cjs's actual `businesses` table definition (column
// types, enum values, and named indexes) — NOT the simplified prose in
// 04-03-PLAN.md's Task 1 (which listed status as enum('active'|'suspended')
// with no 'pending'/'archived' values). The real migration/DB uses
// enum('pending','active','suspended','archived') default 'pending'; this
// model mirrors that exactly per the plan's own done-criteria ("all columns
// match contract"). Per Phase 4 Clean Architecture: this model carries NO
// business logic — that lives in
// ../../modules/businesses/usecases/businessUseCases.js. The
// BusinessRepository (../../modules/businesses/repositories/
// businessRepository.js) is the only place that queries this model.
export default (sequelize) => {
    class Business extends Model {
        /**
         * Wires the hasMany BusinessMembership association, mirroring
         * Account.js's associate() pattern. BusinessRepository does not
         * currently depend on this association being registered (it
         * resolves memberships via explicit id-list queries instead), so
         * calling this is optional but safe/idempotent.
         */
        static associate(models = {}) {
            if (models.BusinessMembership && !Business.associations?.memberships) {
                Business.hasMany(models.BusinessMembership, {
                    foreignKey: 'business_id',
                    as: 'memberships'
                });
            }
        }
    }

    Business.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // D-03: business_handle is a stable opaque public identifier, never
        // re-derived from a sanitized display name. Normalized to lowercase
        // on write (mirrors Account.js's email setter) so findByHandle()
        // lookups and the unique index are both case-insensitive.
        business_handle: {
            type: DataTypes.STRING(120),
            allowNull: false,
            unique: true,
            set(value) {
                this.setDataValue('business_handle', String(value || '').trim().toLowerCase());
            }
        },
        legal_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        display_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'active', 'suspended', 'archived'),
            allowNull: false,
            defaultValue: 'pending'
        }
    }, {
        sequelize,
        modelName: 'Business',
        tableName: 'businesses',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['business_handle'], name: 'unique_businesses_business_handle' },
            { fields: ['status'], name: 'idx_businesses_status' }
        ]
    });

    return Business;
};
