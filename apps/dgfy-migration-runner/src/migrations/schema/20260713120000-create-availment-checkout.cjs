'use strict';

/**
 * Phase 09 Plan 01: POS Checkout & Payment — the authoritative tenant-schema
 * migration for Availment, AvailmentItem, AvailmentDiscount, Payment,
 * Receipt, and ComplianceEvidence (CHK-01..CHK-06, FSC-03).
 *
 * `meta.targetKind: 'business'` structurally excludes this migration from
 * any run against `dgfy_core` or any other non-business target — it only
 * ever applies to a `dgfy_business_*` tenant database, exactly like
 * `20260712100000-create-commerce-foundation.cjs`, whose idempotent
 * helper shape (`tableExists`/`hasIndex`/`addIndexIfMissing`/
 * `timestampColumns()`) this file copies verbatim.
 *
 * Creates 6 new tenant-local tables:
 *   availments, availment_items, availment_discounts, payments, receipts,
 *   compliance_evidence
 *
 * DB-level integrity guarantees encoded here (not just app-layer
 * conventions):
 *   - receipts and payments are append-only: BEFORE UPDATE / BEFORE DELETE
 *     triggers SIGNAL SQLSTATE '45000' (same pattern as Phase 8's
 *     inventory_movements / cash_drawer_events).
 *   - availment_items carries a nullable `cancelled_at` soft-delete column
 *     (audit trail for removed lines; NOT append-only like receipts).
 *   - availment_discounts is NOT append-only-triggered (discounts can be
 *     added/removed while availment is draft), but carries created_at only
 *     for audit ordering.
 *   - compliance_evidence carries a MySQL GENERATED ALWAYS AS (...) STORED
 *     column (`branch_scope_key`) + a UNIQUE INDEX
 *     (`unique_compliance_evidence_business_branch_scope`) enforcing
 *     one row per (business_id, branch_scope_key) at the DB layer (D-23,
 *     mirrors ComplianceModeState pattern from Phase 8 gap-closure CR-01).
 *
 * Cross-database references (business_id, customer_account_id,
 * cashier_dgfy_account_id) are opaque CHAR(36) UUID columns with NO
 * foreignKey — MySQL cannot enforce a foreign key across two separate
 * databases. Same-DB FKs (availment_id -> availments.id, product_id ->
 * products.id, branch_id -> locations.id, terminal_id ->
 * terminal_identities.id, shift_id -> shifts.id, cashier_account_id ->
 * staff_accounts.id, applied_by_staff_account_id -> staff_accounts.id)
 * use INTEGER autoincrement PKs to match the existing tenant-table
 * convention.
 *
 * availment_discounts is deliberately a separate table (RESEARCH Open
 * Question #4 resolution), not a JSON blob — per D-14 (each discount listed
 * separately on the receipt) and CHK-03 (staff id + reason per discount).
 *
 * Zero backend/ writes: every backend/ file cited above is a read-only
 * pattern-porting source. No new table declares a foreign key into legacy
 * `items`/`PosTransactionLine`.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops the POS Checkout & Payment tables (availments, availment_items, ' +
      'availment_discounts, payments, receipts, compliance_evidence) plus their ' +
      'append-only triggers and the compliance_evidence generated-column unique ' +
      'index — additive Phase 09 availment/payment/receipt/compliance-evidence ' +
      'foundation only, no legacy pos_transaction_* schema and no other ' +
      'dgfy_business_* table is touched.',
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

    // --- availments (CHK-01, D-01, D-15: draft-to-finalized workflow) -------
    if (!await tableExists('availments')) {
      await queryInterface.createTable('availments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // branch binding (D-16: shift precondition uses terminal, not branch,
        // but availment carries branch for context/audit).
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'locations', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        customer_account_id: { type: Sequelize.CHAR(36), allowNull: true },
        // D-16: Availment finalize requires an open shift (CHK-06); shift_id
        // is optional during draft (can be null), bound at finalize.
        shift_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'shifts', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // D-16: terminal binding for shift lookup (CHK-06).
        terminal_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'terminal_identities', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // Cashier who opened/finalized this availment (tenant-local
        // staff_accounts.id, not landlord dgfy_account_id — D-13 pattern).
        cashier_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — kept alongside
        // cashier_account_id for audit only (D-13 pattern).
        cashier_dgfy_account_id: { type: Sequelize.CHAR(36), allowNull: true },
        // D-01: draft → finalized → voided lifecycle (voided is for refunds,
        // Phase 11+).
        status: {
          type: Sequelize.ENUM('draft', 'finalized', 'voided'),
          allowNull: false,
          defaultValue: 'draft'
        },
        // D-15: fiscal | non_fiscal context passed at finalize time
        // (controller input, gate port requirement).
        document_context: {
          type: Sequelize.ENUM('fiscal', 'non_fiscal'),
          allowNull: true
        },
        // D-09: computed server-side (never accepted from client CHK-02).
        subtotal_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // Sum of all applied discounts (promo + manual + SC/PWD, D-05
        // independent calculation).
        discount_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // VAT amount (VAT-inclusive per D-19).
        vat_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // VAT-exempt amount (SC/PWD sales, D-20).
        vat_exempt_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // Final sale total (subtotal + vat - discounts).
        total_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // D-06: SC/PWD ID number (optimistic scan or manual fallback).
        sc_pwd_id_number: { type: Sequelize.STRING(64), allowNull: true },
        // D-06: optional metadata from SC/PWD scan (e.g., customer name,
        // OCR confidence).
        sc_pwd_metadata: { type: Sequelize.JSON, allowNull: true },
        // Finalization timestamp (nullable until finalized).
        finalized_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('availments', ['business_id', 'status'], {
      name: 'idx_availments_business_status'
    });

    // --- availment_items (D-01, D-02, D-03: flexible line editing) ----------
    if (!await tableExists('availment_items')) {
      await queryInterface.createTable('availment_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // Parent Availment reference (same-DB FK).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'availments', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // Product reference (same-DB FK, D-07: prevent orphaned product
        // deletions).
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        // Snapshot of product name at line-add time (audit trail for
        // renamed products).
        product_name: { type: Sequelize.STRING(255), allowNull: false },
        // Line item quantity (DECIMAL(24,12) per Phase 8 convention for
        // quantity columns).
        quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false },
        // Line item unit price snapshot (D-07: prevent orphaned line
        // repricings).
        unit_price: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
        // D-03: per-line toggle, default derived from Product.inventory_mode
        // (basic_inventory → inventory_issue; non_stock → stock_exempt).
        stock_effect_type: {
          type: Sequelize.ENUM('inventory_issue', 'stock_exempt'),
          allowNull: false
        },
        // D-13: per-item hierarchical structure; Phase 9 uniform 12% VAT.
        tax_treatment: {
          type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'),
          allowNull: false,
          defaultValue: 'vatable'
        },
        // D-13: per-item rate (currently uniform 0.1200 = 12% for Phase 9).
        tax_rate: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: false,
          defaultValue: 0.1200
        },
        // D-02, D-18: soft-delete for removed lines (audit trail, restore
        // capability, append-only principle).
        cancelled_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('availment_items', ['business_id', 'availment_id'], {
      name: 'idx_availment_items_business_availment'
    });

    // --- availment_discounts (D-04, D-05, CHK-03, D-14: separate table, ------
    // not JSON blob — each discount type listed separately on receipt) -------
    if (!await tableExists('availment_discounts')) {
      await queryInterface.createTable('availment_discounts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // Parent Availment reference (same-DB FK).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'availments', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // D-04: all three discount types can stack on one Availment; one row
        // per applied discount (D-14 receipt requirement).
        discount_type: {
          type: Sequelize.ENUM('promo_code', 'manual', 'sc_pwd'),
          allowNull: false
        },
        // D-06: free-text promo code (stored, not validated per RESEARCH Open
        // Question #4 + D-06).
        code: { type: Sequelize.STRING(64), allowNull: true },
        // D-05: amount or percent, never both (server recomputes applied peso
        // at finalize via money.js).
        amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // D-05: percent value (e.g., 0.2000 for 20% SC/PWD).
        percent: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        // D-05: CHK-03 staff id + reason (mandatory for discount_type
        // 'manual').
        applied_by_staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // D-05: CHK-03 reason text (mandatory for discount_type 'manual').
        reason: { type: Sequelize.STRING(255), allowNull: true },
        // D-06: SC/PWD ID number (populated only for discount_type
        // 'sc_pwd').
        sc_pwd_id_number: { type: Sequelize.STRING(64), allowNull: true },
        // D-06: SC/PWD customer name (optional, populated only for
        // discount_type 'sc_pwd').
        sc_pwd_customer_name: { type: Sequelize.STRING(255), allowNull: true },
        // Append-only audit row — created_at ONLY, no updated_at.
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing('availment_discounts', ['business_id', 'availment_id'], {
      name: 'idx_availment_discounts_business_availment'
    });

    // --- payments (D-08, D-09, D-10: single method per availment, ----
    // automatic change computation, record method + amount only) -----
    if (!await tableExists('payments')) {
      await queryInterface.createTable('payments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // Parent Availment reference (same-DB FK, RESTRICT at finalize —
        // payments are immutable once persisted).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'availments', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // D-08: single method per Availment (split-tender deferred to Phase
        // 11+).
        payment_method: {
          type: Sequelize.ENUM('cash', 'gcash', 'credit_card'),
          allowNull: false
        },
        // D-10: amount received (for GCash/Credit Card, this equals total;
        // for Cash, change is computed server-side CHK-02).
        amount_received: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
        // D-09: change_due for Cash only (null for GCash/Credit Card).
        change_due: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        // D-10: records method + amount, never a live gateway charge (Phase
        // 11+ gateway integration separate).
        payment_handoff_mode: { type: Sequelize.STRING(32), allowNull: true },
        // Append-only: created_at ONLY, no updated_at.
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing('payments', ['business_id', 'availment_id'], {
      name: 'idx_payments_business_availment'
    });

    // --- receipts (D-11, D-12, D-14: generated + stored, immutable, -------
    // append-only) -------------------------------------------------------
    if (!await tableExists('receipts')) {
      await queryInterface.createTable('receipts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // Parent Availment reference (same-DB FK, RESTRICT at finalize —
        // receipts bind to finalized availments only).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'availments', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        // D-14: receipt ID / transaction number (unique per business).
        receipt_number: { type: Sequelize.STRING(64), allowNull: false },
        // D-14: Fiscal/Non-Fiscal document type (set by
        // assertComplianceGate).
        document_type: {
          type: Sequelize.ENUM('fiscal_invoice', 'non_fiscal_slip'),
          allowNull: false
        },
        // D-23 interim attestation: compliance mode context (stored for
        // audit).
        compliance_mode: { type: Sequelize.STRING(32), allowNull: true },
        // D-12/D-14: stores all line items, discounts, tax breakdown, payment,
        // change, staff id, receipt id (payload for reprint/audit).
        payload: { type: Sequelize.JSON, allowNull: false },
        // D-11: receipt printing status (for reprint/retry logic).
        printed: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        // D-22: print error message (if device-bridge failed after DB
        // commit).
        print_error: { type: Sequelize.STRING(255), allowNull: true },
        // Append-only immutable receipt record — created_at ONLY, no
        // updated_at (D-12).
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    // D-14: unique receipt number per business (for lookup/reprint).
    await addIndexIfMissing('receipts', ['business_id', 'receipt_number'], {
      name: 'unique_receipts_business_number',
      unique: true
    });

    // --- compliance_evidence (D-23: interim attestation store for fiscal ----
    // evidence bundle) ---------------------------------------------------
    if (!await tableExists('compliance_evidence')) {
      await queryInterface.createTable('compliance_evidence', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // D-23: branch-scoped attestation (one row per business_id,
        // branch_id pair). RESTRICT (not CASCADE): base column of the
        // branch_scope_key STORED generated column added below — MySQL 8.0
        // forbids CASCADE/SET NULL/SET DEFAULT on a foreign key whose
        // column feeds a STORED generated column.
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'locations', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // D-23: operator-attested evidence bundle (7-signal set:
        // { profile, settings, artifacts, peripherals, evidence }).
        evidence_bundle: { type: Sequelize.JSON, allowNull: false },
        // D-23: who attested (e.g., 'operator', 'system', 'importer').
        attested_by_actor_type: { type: Sequelize.STRING(64), allowNull: true },
        // D-23: when attested.
        attested_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }

    // D-23 CR-01 (mirrors ComplianceModeState gap-closure): MySQL generated
    // column + unique-index one-row-per-(business_id, branch_scope_key)
    // invariant to handle NULL branch_id safely (MySQL treats every NULL as
    // distinct for uniqueness).
    {
      const complianceEvidenceTableDescription = await queryInterface.describeTable('compliance_evidence');
      if (!complianceEvidenceTableDescription.branch_scope_key) {
        await queryInterface.sequelize.query(`
          ALTER TABLE compliance_evidence
          ADD COLUMN branch_scope_key VARCHAR(150)
          GENERATED ALWAYS AS (COALESCE(branch_id, 0)) STORED
        `);
      }
    }
    await addIndexIfMissing('compliance_evidence', ['business_id', 'branch_scope_key'], {
      name: 'unique_compliance_evidence_business_branch_scope',
      unique: true
    });

    // --- Append-only triggers (D-12, D-22) — ported from Phase 08 -------
    // backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs
    // (read-only pattern source). DROP TRIGGER IF EXISTS precedes each
    // CREATE TRIGGER for idempotency.
    const appendOnlyTables = ['receipts', 'payments'];
    for (const tableName of appendOnlyTables) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_update`);
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_delete`);

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`
        CREATE TRIGGER trg_${tableName}_append_only_update
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        BEGIN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = '${tableName} is append-only and cannot be updated';
        END
      `);

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`
        CREATE TRIGGER trg_${tableName}_append_only_delete
        BEFORE DELETE ON ${tableName}
        FOR EACH ROW
        BEGIN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = '${tableName} is append-only and cannot be deleted';
        END
      `);
    }
  },

  async down(queryInterface) {
    const appendOnlyTables = ['receipts', 'payments'];
    for (const tableName of appendOnlyTables) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_update`);
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_delete`);
    }

    try {
      await queryInterface.removeIndex('compliance_evidence', 'unique_compliance_evidence_business_branch_scope');
    } catch {
      // index may not exist — safe no-op on reverse of a partial/no-op up()
    }
    try {
      const complianceEvidenceTableDescription = await queryInterface.describeTable('compliance_evidence');
      if (complianceEvidenceTableDescription.branch_scope_key) {
        await queryInterface.removeColumn('compliance_evidence', 'branch_scope_key');
      }
    } catch {
      // table may not exist — safe no-op
    }

    // Reverse dependency order.
    await queryInterface.dropTable('receipts');
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('availment_discounts');
    await queryInterface.dropTable('availment_items');
    await queryInterface.dropTable('availments');
    await queryInterface.dropTable('compliance_evidence');

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availments_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availments_document_context').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availment_items_stock_effect_type').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availment_items_tax_treatment').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availment_discounts_discount_type').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_payments_payment_method').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_receipts_document_type').catch(() => {});
    }
  }
};
