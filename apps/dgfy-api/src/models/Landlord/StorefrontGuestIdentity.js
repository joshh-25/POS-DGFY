import { DataTypes, Model } from 'sequelize';

/**
 * Phase 10 Plan 01: Landlord-scoped guest identity model.
 *
 * Persistence-only Sequelize model for dgfy_core.storefront_guest_identities,
 * matching the migration's table definition (D-06, STF-03).
 *
 * A lightweight persistent identity for guests who complete storefront orders
 * via email-OTP verification (D-05). Unlike a full DGFY Account, this records
 * only verified email (for repeat-guest recognition across orders) + optional
 * display name and phone (contact/coordination, unverified). One row per
 * unique verified email enables the "was this you?" upsell path.
 *
 * Per Phase 4 Clean Architecture: this model carries NO business logic — that
 * lives in modules/storefront/usecases/* or similar. The StorefrontGuestIdentity
 * model is a persistence-only contract, queried exclusively through repositories.
 *
 * Status lifecycle: Not an enum (D-06 does not track status). Email verification
 * happens at application layer (via apps/dgfy-api/src/infra/emailOtp.js) before
 * this model is written.
 */
export default (sequelize) => {
    class StorefrontGuestIdentity extends Model {
        /**
         * Optional: wire associations if higher-level modules need to navigate
         * from guest identity to orders (hasMany StorefrontOrder).
         * Currently not required; optional for future use.
         */
        static associate(models = {}) {
            if (models.StorefrontOrder && !StorefrontGuestIdentity.associations?.orders) {
                StorefrontGuestIdentity.hasMany(models.StorefrontOrder, {
                    foreignKey: 'guest_identity_id',
                    as: 'orders'
                });
            }
        }
    }

    StorefrontGuestIdentity.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // Email used for OTP verification (D-05). UNIQUE so a repeat guest
        // maps to one persistent identity (STF-03, D-06). Normalized to
        // lowercase on write (mirrors Account.js's email setter) so the
        // unique index is case-insensitive.
        verified_email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            set(value) {
                this.setDataValue('verified_email', String(value || '').trim().toLowerCase());
            }
        },
        // Optional phone for coordination/contact (unverified — D-05, no OTP).
        phone: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // Display name from guest checkout (optional, D-06).
        display_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        // Audit trail: last order timestamp (DATE not DATETIME — matches
        // storefront_orders.requested_for type). Updated whenever a new
        // order is created for this guest.
        last_order_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'StorefrontGuestIdentity',
        tableName: 'storefront_guest_identities',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['verified_email'], name: 'unique_storefront_guest_identities_email' }
        ]
    });

    return StorefrontGuestIdentity;
};
