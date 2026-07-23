import { DataTypes, Model } from 'sequelize';

/**
 * Phase 10 Plan 01: Landlord-scoped commerce payment session model.
 *
 * Persistence-only Sequelize model for dgfy_core.commerce_payment_sessions,
 * matching the migration's table definition (STF-04, D-01, ADR 0027 pattern).
 *
 * Landlord-owned PayMongo payment sessions, following the established codebase
 * pattern (`.planning/codebase/ARCHITECTURE.md` line 201: "Landlord-owned
 * payment session records ... resolve tenant context before tenant order
 * finalization"). One session per storefront order; resolves tenant context
 * before async webhook-driven order finalization into the correct tenant's
 * Availment (STF-05).
 *
 * Payment session lifecycle (D-01 PayMongo pattern):
 *   awaiting_payment: PayMongo QR Ph generated and displayed to customer
 *   paid: webhook confirmed payment (customer scanned and paid)
 *   finalized: tenant Availment written successfully (STF-05 endpoint state)
 *   finalize_failed_manual_resolution_required: cross-DB failure (STF-05 D-01)
 *   expired: session aged out before payment (D-09, stock auto-released)
 *   failed: validation error, API error, etc.
 *
 * Async, webhook-driven order finalization (D-04): Unlike Phase 9's
 * synchronous POS finalize, PayMongo QR Ph confirmation is asynchronous
 * (customer scans, pays, webhook arrives later) — order finalization into
 * the tenant Availment happens on webhook receipt, not on order-submit.
 *
 * Cross-database references (tenant_id): Stored for denormalization (faster
 * queries, ADR 0027 pattern). Opaque cross-database ref, no MySQL FK.
 *
 * D-02 "keep adjustable": split_payload + platform_fee_centavos are nullable
 * and unpopulated in Phase 10. They exist ONLY so a future phase can add
 * per-tenant split without a migration. Nothing in Phase 10 requires or writes
 * them — their presence is forward-compatibility only.
 *
 * Per Phase 4 Clean Architecture: this model carries NO business logic — that
 * lives in modules/storefront/usecases/* or similar. This model is a
 * persistence-only contract, queried exclusively through repositories.
 *
 * Validation, state transitions, webhook handling, and finalization logic are
 * application-layer concerns, not modeled here.
 */
export default (sequelize) => {
    class CommercePaymentSession extends Model {
        /**
         * Wire associations to StorefrontOrder if higher-level modules need
         * to navigate the domain model. Currently optional; safe to call but
         * not required.
         */
        static associate(models = {}) {
            if (models.StorefrontOrder && !CommercePaymentSession.associations?.order) {
                CommercePaymentSession.belongsTo(models.StorefrontOrder, {
                    foreignKey: 'storefront_order_id',
                    as: 'order'
                });
            }
        }
    }

    CommercePaymentSession.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        // Opaque public reference (e.g., 'CPS-...'). UNIQUE for session
        // lookup by client or webhook handler.
        public_reference: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true
        },
        // Reference to storefront_orders.id (FK, D-01). One-to-one mapping.
        storefront_order_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        // Tenant UUID (business_database_registry.business_id). Repeated
        // from storefront_orders for denormalization (faster queries,
        // ADR 0027 pattern). NEVER integer-coerced. Opaque cross-database
        // ref, no FK.
        tenant_id: {
            type: DataTypes.CHAR(36),
            allowNull: false
        },
        // Payment session lifecycle status enum (D-01 PayMongo pattern):
        //   awaiting_payment: PayMongo QR Ph generated and displayed
        //   paid: webhook confirmed payment (customer scanned and paid)
        //   finalized: tenant Availment written successfully (STF-05 endpoint)
        //   finalize_failed_manual_resolution_required: cross-DB failure (STF-05 D-01)
        //   expired: session aged out before payment (D-09)
        //   failed: validation error, API error, etc.
        status: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'awaiting_payment'
        },
        // Payment provider (default 'paymongo' — allows future extensions).
        provider: {
            type: DataTypes.STRING(24),
            allowNull: false,
            defaultValue: 'paymongo'
        },
        // PayMongo Payment Intent ID (returned by API, used for status checks).
        provider_payment_intent_id: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        // PayMongo Payment ID (returned by API after successful payment,
        // used for settlement/reconciliation).
        provider_payment_id: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        // PayMongo QR Ph URL (the actual QR code image served to customer).
        qr_code_image_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Amount in centavos (copied from storefront_orders.total_centavos).
        amount_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Payment session expiry (the ONE shared clock, D-08). Drives stock
        // reservation release on timeout (D-09).
        expires_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // When payment was confirmed by webhook (awaiting_payment → paid).
        paid_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // When Availment finalization completed (paid → finalized).
        finalized_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Manual resolution reason (if status is
        // 'finalize_failed_manual_resolution_required', D-01 STF-05).
        // Explanation of why finalization failed and what manual action
        // is required.
        manual_resolution_reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // CR-04 fix (10-REVIEW.md): the PayMongo webhook event id
        // (`data.id`), stamped on `payment.paid` for replay/audit/dedup
        // tracking. Added via 20260714104000-add-commerce-payment-session-
        // audit-fields.cjs — previously written by finalizePaidOrder
        // UseCases.js but silently dropped by Sequelize (unknown column).
        provider_event_id: {
            type: DataTypes.STRING(191),
            allowNull: true
        },
        // CR-04 fix (10-REVIEW.md): human-readable reason recorded on
        // `payment.failed`/`qrph.expired` (distinct from
        // manual_resolution_reason, which covers the
        // finalize_failed_manual_resolution_required terminal state only).
        // Added via 20260714104000-add-commerce-payment-session-audit-
        // fields.cjs — previously written by handleWebhookUseCases.js but
        // silently dropped by Sequelize (unknown column).
        failure_reason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // D-02: Future per-tenant split configuration (JSON, nullable,
        // never populated in Phase 10). Allows phase-10-compatible split
        // addition without schema migration (D-02 "keep adjustable").
        // Example structure (phase 11+): { "splits": [{ "recipient_id": "...", "percent": 0.98 }, ...] }
        split_payload: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // D-02: Future DGFY platform-fee amount in centavos (nullable,
        // never populated in Phase 10, adjustable for future split without
        // re-architecture). Example (phase 11+): 100 (for a 10,000-centavo
        // order at 1% fee).
        platform_fee_centavos: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'CommercePaymentSession',
        tableName: 'commerce_payment_sessions',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['public_reference'],
                name: 'unique_commerce_payment_sessions_reference'
            },
            {
                fields: ['provider_payment_intent_id'],
                name: 'idx_commerce_payment_sessions_intent_id'
            },
            {
                fields: ['provider_payment_id'],
                name: 'idx_commerce_payment_sessions_payment_id'
            },
            {
                fields: ['tenant_id', 'status'],
                name: 'idx_commerce_payment_sessions_tenant_status'
            }
        ]
    });

    return CommercePaymentSession;
};
