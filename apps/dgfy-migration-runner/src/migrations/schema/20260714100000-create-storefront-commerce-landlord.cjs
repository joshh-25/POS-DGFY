'use strict';

/**
 * Phase 10 Plan 01: Landlord-side Storefront Commerce Foundation
 * (`dgfy_core` schema — storefront_guest_identities, storefront_orders,
 * commerce_payment_sessions).
 *
 * `meta.targetKind: 'core'` — this migration only applies to `dgfy_core`
 * landlord database, never to tenant `dgfy_business_*` databases.
 *
 * Creates 3 new landlord-scoped tables:
 *   storefront_guest_identities (D-06, STF-03): lightweight persistent
 *     guest identity keyed by verified email
 *   storefront_orders (STF-05): durable landlord order record, created
 *     before any tenant write or payment session exists
 *   commerce_payment_sessions (STF-04, D-01): landlord-owned PayMongo
 *     payment sessions, resolves tenant context before tenant Availment
 *     finalization
 *
 * DB-level integrity guarantees:
 *   - storefront_guest_identities: UNIQUE verified_email enables repeat
 *     guest recognition (persistent identity across orders, D-06)
 *   - storefront_orders: composite UNIQUE (tenant_id, target_type,
 *     idempotency_key) prevents duplicate-order collisions (client idempotency)
 *   - storefront_orders: UNIQUE public_reference allows opaque lookup +
 *     cross-DB guard for Availment source_reference
 *   - storefront_orders: indexes on status + tenant_id for query efficiency
 *   - commerce_payment_sessions: UNIQUE public_reference for session lookup
 *   - commerce_payment_sessions: indexes on provider_payment_intent_id +
 *     provider_payment_id for PayMongo session resolution
 *   - commerce_payment_sessions: split_payload + platform_fee_centavos
 *     nullable, never populated in Phase 10 (D-02 "keep adjustable" for
 *     future per-tenant split, no schema re-architecture needed)
 *
 * Cross-database references (tenant_id, customer_account_id, availment_id):
 * These columns carry NO MySQL foreign key — MySQL cannot enforce a foreign
 * key across two separate databases. Application layer resolves these refs
 * before writes, and DB-level uniqueness constraints (public_reference,
 * idempotency index) prevent collisions. ADR 0027 #17, Domain_02 line 473/499.
 *
 * Idempotency (DBF-04): All CREATE TABLE wrapped in tableExists() guard;
 * re-running against an already-migrated `dgfy_core` is a safe no-op.
 *
 * Zero backend/ writes: All 3 tables live in `apps/dgfy-migration-runner`;
 * corresponding Sequelize models live in `apps/dgfy-api` (read-only pattern
 * porting from legacy `backend/src/models/Landlord/CommercePaymentSession.js`).
 * No new table declares a foreign key into legacy `backend/` schemas.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'core',
    rollbackDescription:
      'Drops the Landlord Storefront Commerce tables (storefront_guest_identities, ' +
      'storefront_orders, commerce_payment_sessions) — additive Phase 10 plan 01 ' +
      'foundation only; no legacy sku_* schema and no other dgfy_* tables are ' +
      'touched.',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
    const tableExists = async (tableName) => {
      const tables = await queryInterface.showAllTables();
      return (tables || []).some((entry) => {
        const value = typeof entry === 'string' ? entry : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
      });
    };

    const hasIndex = async (tableName, indexName) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
      } catch {
        return false;
      }
    };

    const addIndexIfMissing = async (tableName, columns, options = {}) => {
      if (options.name && await hasIndex(tableName, options.name)) return;
      await queryInterface.addIndex(tableName, columns, options);
    };

    const timestampColumns = () => ({
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // --- storefront_guest_identities (D-06, STF-03: persistent guest
    // identity, keyed by verified email) ---------------------------------
    if (!await tableExists('storefront_guest_identities')) {
      await queryInterface.createTable('storefront_guest_identities', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        // Email used for OTP verification (D-05). UNIQUE so a repeat guest
        // maps to one persistent identity (STF-03, D-06).
        verified_email: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        // Optional phone for coordination/contact (unverified — D-05).
        phone: {
          type: Sequelize.STRING(32),
          allowNull: true
        },
        // Display name from guest checkout (optional, D-06).
        display_name: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        // Audit trail: last order timestamp (DATE not DATETIME — matches
        // storefront_orders.requested_for type).
        last_order_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        ...timestampColumns()
      });
    }
    // Unique index on verified_email (D-06: repeat guest recognition).
    await addIndexIfMissing('storefront_guest_identities', ['verified_email'], {
      name: 'unique_storefront_guest_identities_email',
      unique: true
    });

    // --- storefront_orders (STF-05, STF-04: durable landlord order
    // record, created before any tenant write or payment session) -------
    if (!await tableExists('storefront_orders')) {
      await queryInterface.createTable('storefront_orders', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        // Opaque public-facing reference (e.g., 'SFO-...'). UNIQUE so
        // client can use it for idempotent lookup + Availment
        // source_reference cross-DB guard (D-04 pattern, must_have
        // key_links).
        public_reference: {
          type: Sequelize.STRING(40),
          allowNull: false
        },
        // Tenant UUID (business_database_registry.business_id). NEVER
        // integer-coerced — ADR 0027 #17. Opaque app-layer ref (no FK).
        tenant_id: {
          type: Sequelize.CHAR(36),
          allowNull: false
        },
        // Order type context (default 'storefront_checkout', allows future
        // extension, STF-05).
        target_type: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'storefront_checkout'
        },
        // Client-provided idempotency key (UUID or opaque string, D-04).
        idempotency_key: {
          type: Sequelize.STRING(120),
          allowNull: false
        },
        // Server-side hash of request content (e.g., SHA256 of canonical
        // order payload), enables dedup on re-submit with same idempotency
        // key but changed payload (detects tampering, D-04).
        request_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false
        },
        // Order lifecycle status. Enum values documented in Task 2 model:
        // pending_payment, awaiting_payment, finalized, expired, failed,
        // finalize_failed_manual_resolution_required (STF-05 D-01 manual
        // resolution for cross-DB failure).
        status: {
          type: Sequelize.STRING(48),
          allowNull: false,
          defaultValue: 'pending_payment'
        },
        // Opaque app-layer cross-database ref to DGFY Account (if
        // logged-in checkout) or NULL (guest). Never integer-coerced.
        // Domain_02 line 473.
        customer_account_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        // Reference to storefront_guest_identities.id (if guest checkout).
        // SET NULL on guest identity deletion (soft-orphaning allowed for
        // audit, D-06).
        guest_identity_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'storefront_guest_identities', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        // Fulfillment mode: 'pickup' or 'delivery' (D-11).
        fulfillment_mode: {
          type: Sequelize.STRING(16),
          allowNull: false
        },
        // Timing: 'immediate' or 'scheduled' (D-11, D-12, D-13).
        fulfillment_timing: {
          type: Sequelize.STRING(16),
          allowNull: false
        },
        // Scheduled fulfillment date (nullable, NULL if immediate; DATE
        // type matches guest_identity.last_order_at, D-12).
        requested_for: {
          type: Sequelize.DATE,
          allowNull: true
        },
        // Payment method chosen at checkout: 'cash', 'gcash', 'credit_card'
        // (D-08 matches POS Payment enum, though Storefront cash is a
        // no-op, credit_card deferred).
        payment_method: {
          type: Sequelize.STRING(24),
          allowNull: false
        },
        // Server-side validated cart snapshot + contact info (JSON).
        // Immutable once set (proof of what the customer submitted).
        checkout_payload: {
          type: Sequelize.JSON,
          allowNull: false
        },
        // Final total in centavos (server-computed, matches checkout
        // payload sum, never client-provided — D-02 POS pattern).
        total_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        // Opaque cross-database reference to tenant Availment.id (written
        // back on finalize, STF-05). No FK (cross-database).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        // Payment session expiry (the ONE shared clock, D-08 — copied from
        // commerce_payment_sessions.expires_at at order creation). Once
        // this timestamp passes, the order moves to 'expired' status and
        // stock reservation is auto-released (D-09).
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        ...timestampColumns()
      });
    }
    // Composite UNIQUE on (tenant_id, target_type, idempotency_key) —
    // client idempotency, prevents duplicate-order collisions (must_have
    // key_links, D-04).
    await addIndexIfMissing('storefront_orders', ['tenant_id', 'target_type', 'idempotency_key'], {
      name: 'unique_storefront_orders_idempotency',
      unique: true
    });
    // UNIQUE on public_reference — opaque lookup + Availment
    // source_reference cross-DB guard.
    await addIndexIfMissing('storefront_orders', ['public_reference'], {
      name: 'unique_storefront_orders_public_reference',
      unique: true
    });
    // Index on status for common "get orders by status" queries.
    await addIndexIfMissing('storefront_orders', ['status'], {
      name: 'idx_storefront_orders_status'
    });
    // Index on tenant_id + status for tenant-scoped order queries.
    await addIndexIfMissing('storefront_orders', ['tenant_id', 'status'], {
      name: 'idx_storefront_orders_tenant_status'
    });

    // --- commerce_payment_sessions (STF-04, D-01: landlord-owned PayMongo
    // payment sessions) ----
    if (!await tableExists('commerce_payment_sessions')) {
      await queryInterface.createTable('commerce_payment_sessions', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        // Opaque public reference (e.g., 'CPS-...'). UNIQUE for session
        // lookup.
        public_reference: {
          type: Sequelize.STRING(40),
          allowNull: false
        },
        // Reference to storefront_orders.id (FK, D-01). One-to-one mapping.
        storefront_order_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'storefront_orders', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // Tenant UUID (business_database_registry.business_id). Repeated
        // from storefront_orders for denormalization (faster queries,
        // ADR 0027 pattern). NEVER integer-coerced. Opaque cross-database
        // ref, no FK.
        tenant_id: {
          type: Sequelize.CHAR(36),
          allowNull: false
        },
        // Payment session lifecycle status (D-01 PayMongo pattern):
        // awaiting_payment, paid, finalized, expired, failed,
        // finalize_failed_manual_resolution_required (STF-05 D-01).
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'awaiting_payment'
        },
        // Payment provider (default 'paymongo' — allows future extensions).
        provider: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'paymongo'
        },
        // PayMongo Payment Intent ID (returned by API, used for status
        // checks).
        provider_payment_intent_id: {
          type: Sequelize.STRING(80),
          allowNull: true
        },
        // PayMongo Payment ID (returned by API after successful payment,
        // used for settlement/reconciliation).
        provider_payment_id: {
          type: Sequelize.STRING(80),
          allowNull: true
        },
        // PayMongo QR Ph URL (the actual QR code image served to customer).
        qr_code_image_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        // Amount in centavos (copied from storefront_orders.total_centavos).
        amount_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        // Payment session expiry (the ONE shared clock, D-08). Drives stock
        // reservation release on timeout (D-09).
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        // When payment was confirmed by webhook (awaiting_payment →
        // paid).
        paid_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        // When Availment finalization completed (paid → finalized).
        finalized_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        // Manual resolution reason (if status is
        // 'finalize_failed_manual_resolution_required', D-01 STF-05).
        manual_resolution_reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        // D-02: Future per-tenant split configuration (JSON, nullable,
        // never populated in Phase 10). Allows phase-10-compatible split
        // addition without schema migration (D-02 "keep adjustable").
        split_payload: {
          type: Sequelize.JSON,
          allowNull: true
        },
        // D-02: Future DGFY platform-fee amount (nullable, never populated
        // in Phase 10, adjustable for future split without re-architecture).
        platform_fee_centavos: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        ...timestampColumns()
      });
    }
    // UNIQUE on public_reference.
    await addIndexIfMissing('commerce_payment_sessions', ['public_reference'], {
      name: 'unique_commerce_payment_sessions_reference',
      unique: true
    });
    // Indexes for PayMongo session resolution lookups (webhook handler
    // queries by intent_id or payment_id).
    await addIndexIfMissing('commerce_payment_sessions', ['provider_payment_intent_id'], {
      name: 'idx_commerce_payment_sessions_intent_id'
    });
    await addIndexIfMissing('commerce_payment_sessions', ['provider_payment_id'], {
      name: 'idx_commerce_payment_sessions_payment_id'
    });
    // Index for tenant-scoped session queries.
    await addIndexIfMissing('commerce_payment_sessions', ['tenant_id', 'status'], {
      name: 'idx_commerce_payment_sessions_tenant_status'
    });
  },

  async down(queryInterface) {
    // Reverse dependency order (FK constraints):
    // 1. commerce_payment_sessions (FK to storefront_orders)
    // 2. storefront_orders (FK to storefront_guest_identities)
    // 3. storefront_guest_identities (no FK dependencies)

    try {
      await queryInterface.dropTable('commerce_payment_sessions');
    } catch {
      // table may not exist — safe no-op on reverse of a partial/no-op up()
    }

    try {
      await queryInterface.dropTable('storefront_orders');
    } catch {
      // table may not exist — safe no-op
    }

    try {
      await queryInterface.dropTable('storefront_guest_identities');
    } catch {
      // table may not exist — safe no-op
    }
  }
};
