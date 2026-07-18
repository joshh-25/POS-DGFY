import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.locations (D-10:
// canonical branch/location truth lives in the tenant database, not
// dgfy_core), matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710021000-create-dgfy-business-foundation.cjs's actual `locations`
// table definition exactly — NOT 04-03.5-PLAN.md's Task 1 simplified prose
// (which listed `id` as UUID, `address_line` as nullable, and an extra
// `metadata` JSON column that the real, already-applied migration never
// creates). Mirrors ../Landlord/Business.js's precedent of matching the
// real migration/DB over plan prose when the two disagree (see
// 04-03-SUMMARY.md's Deviations #1). Per Phase 4 Clean Architecture: this
// model carries NO business logic — that lives in
// ../../modules/businesses/usecases/locationUseCases.js.
//
// IMPORTANT (Wave 3.5 known limitation): this model is defined and ready,
// but is NOT yet registered against a live per-tenant Sequelize connection
// anywhere in the app. TenantConnector and BusinessDatabaseRegistry-driven
// tenant database resolution are explicitly Wave 4 scope
// (04-04-PLAN.md's key_links: "TenantConnector -> resolves per-tenant
// database"), and no business tenant-database provisioning flow exists yet
// in this codebase (apps/dgfy-migration-runner only migrates *known*
// DGFY_BUSINESS_DB_NAMES, it never dynamically provisions a new database
// for a business created via POST /businesses). See
// ../../modules/businesses/repositories/locationRepository.js's doc
// comment for the bridging strategy this plan uses instead (in-memory,
// businessId-scoped storage) and 04-03.5-SUMMARY.md for full rationale.
export default (sequelize) => {
    class Location extends Model {
        /**
         * Wires the hasMany TerminalIdentity association (Wave 4,
         * apps/dgfy-api/src/models/Tenant/TerminalIdentity.js). Optional/
         * idempotent — no current caller depends on this being registered.
         */
        static associate(models = {}) {
            if (models.TerminalIdentity && !Location.associations?.terminalIdentities) {
                Location.hasMany(models.TerminalIdentity, {
                    foreignKey: 'location_id',
                    as: 'terminalIdentities'
                });
            }
        }
    }

    Location.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        // Matches the real migration: TEXT, NOT NULL (04-03.5-PLAN.md's Task
        // 1 prose said "nullable" — corrected to the real, applied schema).
        address_line: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        latitude: {
            type: DataTypes.DECIMAL(10, 8),
            allowNull: true
        },
        longitude: {
            type: DataTypes.DECIMAL(11, 8),
            allowNull: true
        },
        // Soft-delete flag (don't hard-delete; mark inactive).
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // Tracks which location is the default/headquarters; application
        // layer (locationUseCases.js) enforces only one primary per business.
        is_primary: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'Location',
        tableName: 'locations',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['is_active'], name: 'idx_locations_active' },
            { fields: ['is_primary'], name: 'idx_locations_primary' }
        ]
    });

    return Location;
};
