import { DataTypes, Model } from 'sequelize';

/**
 * Phase 10 Plan 01: Landlord-scoped storefront order model.
 *
 * Persistence-only Sequelize model for dgfy_core.storefront_orders, matching
 * the migration's table definition (STF-05, STF-04, D-04, D-01).
 *
 * Durable landlord order record, created before any tenant write or payment
 * session exists. Satisfies STF-05 requirement: "A dgfy_core landlord order
 * can be durably recorded before any tenant write or payment session exists."
 *
 * Order lifecycle:
 *   pending_payment → (PayMongo QR Ph presented to customer)
 *   awaiting_payment → (webhook: customer pays)
 *   paid → (async finalization into tenant Availment)
 *   finalized | finalize_failed_manual_resolution_required (STF-05 D-01)
 *   expired (order aged out before payment)
 *   failed (validation error, stock unavailable, etc.)
 *
 * Idempotency: composite UNIQUE (tenant_id, target_type, idempotency_key)
 * enforces one canonical order per client submission; UNIQUE public_reference
 * enables opaque lookup + Availment source_reference cross-DB guard.
 *
 * Cross-database references (tenant_id, customer_account_id, availment_id):
 * These columns carry NO MySQL foreign key — MySQL cannot enforce a foreign
 * key across two separate databases. Application layer resolves these refs
 * before writes. DB-level uniqueness constraints (public_reference, idempotency
 * index) prevent collisions.
 *
 * Per Phase 4 Clean Architecture: this model carries NO business logic — that
 * lives in modules/storefront/usecases/* or similar. This model is a
 * persistence-only contract, queried exclusively through repositories.
 *
 * Validation, state transitions, and business rules are application-layer
 * concerns, not modeled here.
 */
export default (sequelize) => {
    class StorefrontOrder extends Model {
        /**
         * Wire associations to StorefrontGuestIdentity and CommercePaymentSession
         * if higher-level modules need to navigate the domain model. Currently
         * optional; safe to call but not required.
         */
        static associate(models = {}) {
            if (models.StorefrontGuestIdentity && !StorefrontOrder.associations?.guest_identity) {
                StorefrontOrder.belongsTo(models.StorefrontGuestIdentity, {
                    foreignKey: 'guest_identity_id',
                    as: 'guest_identity'
                });
            }
            if (models.CommercePaymentSession && !StorefrontOrder.associations?.payment_session) {
                StorefrontOrder.hasOne(models.CommercePaymentSession, {
                    foreignKey: 'storefront_order_id',
                    as: 'payment_session'
                });
            }
        }
    }

    StorefrontOrder.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // Opaque public-facing reference (e.g., 'SFO-...'). UNIQUE so
        // client can use it for idempotent lookup + Availment
        // source_reference cross-DB guard (D-04 pattern, must_have key_links).
        public_reference: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true
        },
        // Tenant UUID (business_database_registry.business_id). NEVER
        // integer-coerced — ADR 0027 #17. Opaque app-layer ref (no FK).
        tenant_id: {
            type: DataTypes.CHAR(36),
            allowNull: false
        },
        // Order type context (default 'storefront_checkout', allows future
        // extension, STF-05).
        target_type: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'storefront_checkout'
        },
        // Client-provided idempotency key (UUID or opaque string, D-04).
        idempotency_key: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        // Server-side hash of request content (e.g., SHA256 of canonical
        // order payload), enables dedup on re-submit with same idempotency
        // key but changed payload (detects tampering, D-04).
        request_hash: {
            type: DataTypes.CHAR(64),
            allowNull: false
        },
        // Order lifecycle status enum:
        //   pending_payment: order created, awaiting PayMongo QR Ph session
        //   awaiting_payment: QR Ph displayed to customer
        //   paid: webhook confirmed payment
        //   finalized: tenant Availment written successfully (STF-05 endpoint state)
        //   finalize_failed_manual_resolution_required: cross-DB failure (STF-05 D-01)
        //   expired: order aged out before payment (D-09)
        //   failed: validation error, stock unavailable, etc.
        status: {
            type: DataTypes.STRING(48),
            allowNull: false,
            defaultValue: 'pending_payment'
        },
        // Opaque app-layer cross-database ref to DGFY Account (if
        // logged-in checkout) or NULL (guest). Never integer-coerced.
        // Domain_02 line 473.
        customer_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        // Reference to storefront_guest_identities.id (if guest checkout).
        // SET NULL on guest identity deletion (soft-orphaning allowed for
        // audit, D-06).
        guest_identity_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        // Fulfillment mode: 'pickup' or 'delivery' (D-11).
        fulfillment_mode: {
            type: DataTypes.STRING(16),
            allowNull: false
        },
        // Timing: 'immediate' or 'scheduled' (D-11, D-12, D-13).
        fulfillment_timing: {
            type: DataTypes.STRING(16),
            allowNull: false
        },
        // Scheduled fulfillment date (nullable, NULL if immediate; DATE
        // type matches guest_identity.last_order_at, D-12).
        requested_for: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Payment method chosen at checkout: 'cash', 'gcash', 'credit_card'
        // (D-08 matches POS Payment enum, though Storefront cash is a
        // no-op, credit_card deferred).
        payment_method: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        // Server-side validated cart snapshot + contact info (JSON).
        // Immutable once set (proof of what the customer submitted).
        checkout_payload: {
            type: DataTypes.JSON,
            allowNull: false
        },
        // Final total in centavos (server-computed, matches checkout
        // payload sum, never client-provided — D-02 POS pattern).
        total_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Opaque cross-database reference to tenant Availment.id (written
        // back on finalize, STF-05). No FK (cross-database).
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // Payment session expiry (the ONE shared clock, D-08 — copied from
        // commerce_payment_sessions.expires_at at order creation). Once
        // this timestamp passes, the order moves to 'expired' status and
        // stock reservation is auto-released (D-09).
        expires_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'StorefrontOrder',
        tableName: 'storefront_orders',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['tenant_id', 'target_type', 'idempotency_key'],
                name: 'unique_storefront_orders_idempotency'
            },
            {
                unique: true,
                fields: ['public_reference'],
                name: 'unique_storefront_orders_public_reference'
            },
            {
                fields: ['status'],
                name: 'idx_storefront_orders_status'
            },
            {
                fields: ['tenant_id', 'status'],
                name: 'idx_storefront_orders_tenant_status'
            }
        ]
    });

    return StorefrontOrder;
};
