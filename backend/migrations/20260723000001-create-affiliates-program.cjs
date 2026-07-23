'use strict';

// Affiliates Program - Backend + POS phase (see docs/proposals/2026-07-22-affiliates-program-study.md
// and the follow-up scoping note restricting this phase to backend + POS, no frontend/apps/store
// changes). Creates the six landlord tables backing enrollment, attribution (in-store + future
// online QR), the commission ledger, payout methods, cashouts, and per-store settings.
//
// All money columns are INTEGER centavos (no DECIMAL rounding drift). No cross-database foreign
// keys are used anywhere - order linkage to tenant-DB pos_transactions is by value
// (tenant_id + order_reference), matching the existing DgfyCustomerActivity / DgfyLoyaltyTransaction
// pattern. Idempotent guards (describeTable/showIndex) mirror
// 20260529000001-add-dgfy-review-invites-and-review-metadata.cjs so re-running this migration
// against an already-migrated database is a no-op.

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

const timestampColumns = (Sequelize) => ({
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

module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. dgfy_affiliate_enrollments - one row per (dgfy_account_id, tenant_id)
        const enrollmentsTable = await queryInterface.describeTable('dgfy_affiliate_enrollments').catch(() => null);
        if (!enrollmentsTable) {
            await queryInterface.createTable('dgfy_affiliate_enrollments', {
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // SHA-256 hex digest of the opaque share code. Only the hash is ever persisted,
                // mirroring DgfyReviewInvite's token_hash convention.
                share_code_hash: {
                    type: Sequelize.STRING(128),
                    allowNull: false
                },
                // Typable short code shown to the affiliate / embedded in the QR (e.g. AF-XXXXXX).
                short_code: {
                    type: Sequelize.STRING(16),
                    allowNull: false
                },
                // Per-affiliate override in basis points. NULL = inherit tenant_affiliate_settings.default_rate_bps.
                commission_rate_bps: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                status: {
                    type: Sequelize.ENUM('pending', 'active', 'suspended', 'revoked'),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                source: {
                    type: Sequelize.ENUM('invite', 'self_serve', 'admin_provisioned'),
                    allowNull: false,
                    defaultValue: 'admin_provisioned'
                },
                invited_email: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                activated_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                ...timestampColumns(Sequelize)
            });
        }
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_enrollments', ['dgfy_account_id', 'tenant_id'], {
            name: 'unique_dgfy_affiliate_enrollments_account_tenant',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_enrollments', ['share_code_hash'], {
            name: 'unique_dgfy_affiliate_enrollments_share_code_hash',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_enrollments', ['short_code'], {
            name: 'unique_dgfy_affiliate_enrollments_short_code',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_enrollments', ['tenant_id', 'status'], {
            name: 'idx_dgfy_affiliate_enrollments_tenant_status'
        });

        // 2. dgfy_affiliate_attributions - scan/click + in-store code-entry audit trail
        const attributionsTable = await queryInterface.describeTable('dgfy_affiliate_attributions').catch(() => null);
        if (!attributionsTable) {
            await queryInterface.createTable('dgfy_affiliate_attributions', {
                attribution_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                // 'in_store' is live this phase (cashier-entered code at POS checkout); 'qr'/'link'
                // are reserved for the storefront phase (QR scan / capture cookie).
                channel: {
                    type: Sequelize.ENUM('in_store', 'qr', 'link'),
                    allowNull: false,
                    defaultValue: 'in_store'
                },
                store_slug: {
                    type: Sequelize.STRING(160),
                    allowNull: true
                },
                // Hashed IP+user-agent, a fraud signal only - never raw PII.
                visitor_fingerprint: {
                    type: Sequelize.STRING(128),
                    allowNull: true
                },
                // Filled in when the buyer/scanner is a known DGFY account (e.g. logged-in cashier
                // session context or a future online scanner).
                dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: true
                },
                // Tenant-DB order id (value link only, no FK - cross-database).
                pos_transaction_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                occurred_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                ...timestampColumns(Sequelize)
            });
        }
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_attributions', ['tenant_id', 'enrollment_id', 'occurred_at'], {
            name: 'idx_dgfy_affiliate_attributions_tenant_enrollment_time'
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_attributions', ['tenant_id', 'occurred_at'], {
            name: 'idx_dgfy_affiliate_attributions_tenant_time'
        });

        // 3. dgfy_affiliate_commissions - the ledger, one row per order
        const commissionsTable = await queryInterface.describeTable('dgfy_affiliate_commissions').catch(() => null);
        if (!commissionsTable) {
            await queryInterface.createTable('dgfy_affiliate_commissions', {
                commission_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // Denormalized from the enrollment for fast per-affiliate balance queries.
                dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // Tenant-DB order id (value link only, no FK - cross-database).
                pos_transaction_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                // The order's tracking_pin - the real cross-database join key. Normalized
                // uppercase/trim at write time, matching recordDgfyOrderActivity's convention.
                order_reference: {
                    type: Sequelize.STRING(24),
                    allowNull: false
                },
                // Item subtotal minus discount, in centavos. Excludes delivery fee and the DGFY 1%
                // platform fee.
                commissionable_base_centavos: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                // The rate actually applied, frozen at accrual time - never recomputed later.
                rate_bps_snapshot: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                amount_centavos: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                currency: {
                    type: Sequelize.STRING(3),
                    allowNull: false,
                    defaultValue: 'PHP'
                },
                status: {
                    type: Sequelize.ENUM('pending', 'earned', 'reversed', 'paid'),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                reason: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                // Set once a cashout batch reserves/consumes this row.
                cashout_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                earned_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                reversed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                paid_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                ...timestampColumns(Sequelize)
            });
        }
        // Idempotency guarantee: one commission row per order per store.
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_commissions', ['tenant_id', 'order_reference'], {
            name: 'unique_dgfy_affiliate_commissions_tenant_order_reference',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_commissions', ['dgfy_account_id', 'status'], {
            name: 'idx_dgfy_affiliate_commissions_account_status'
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_commissions', ['enrollment_id', 'status'], {
            name: 'idx_dgfy_affiliate_commissions_enrollment_status'
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_commissions', ['cashout_id'], {
            name: 'idx_dgfy_affiliate_commissions_cashout'
        });

        // 4. dgfy_affiliate_payout_methods - account-level, multiple + one primary
        const payoutMethodsTable = await queryInterface.describeTable('dgfy_affiliate_payout_methods').catch(() => null);
        if (!payoutMethodsTable) {
            await queryInterface.createTable('dgfy_affiliate_payout_methods', {
                payout_method_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                method_type: {
                    type: Sequelize.ENUM('bank', 'gcash', 'maya'),
                    allowNull: false
                },
                label: {
                    type: Sequelize.STRING(100),
                    allowNull: true
                },
                bank_name: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                account_name: {
                    type: Sequelize.STRING(160),
                    allowNull: true
                },
                account_number: {
                    type: Sequelize.STRING(64),
                    allowNull: true
                },
                mobile_number: {
                    type: Sequelize.STRING(24),
                    allowNull: true
                },
                is_default: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                // Forward-compatibility only - unused today, reserved for a future PayMongo
                // beneficiary/recipient token so automated disbursement needs no schema change.
                provider_recipient_ref: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                ...timestampColumns(Sequelize)
            });
        }
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_payout_methods', ['dgfy_account_id', 'is_default'], {
            name: 'idx_dgfy_affiliate_payout_methods_account_default'
        });

        // 5. dgfy_affiliate_cashouts - request -> approval -> paid state machine
        const cashoutsTable = await queryInterface.describeTable('dgfy_affiliate_cashouts').catch(() => null);
        if (!cashoutsTable) {
            await queryInterface.createTable('dgfy_affiliate_cashouts', {
                cashout_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                // A cashout is always scoped to one store.
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                payout_method_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                // Bank/wallet details frozen at request time, so a later edit to the payout method
                // never rewrites settled history.
                payout_snapshot: {
                    type: Sequelize.JSON,
                    allowNull: false
                },
                amount_centavos: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                currency: {
                    type: Sequelize.STRING(3),
                    allowNull: false,
                    defaultValue: 'PHP'
                },
                status: {
                    type: Sequelize.ENUM('requested', 'approved', 'paid', 'rejected', 'cancelled'),
                    allowNull: false,
                    defaultValue: 'requested'
                },
                requested_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                approved_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                paid_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                rejected_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                // Tenant staff user who approved (backend/src/models/User.js, tenant-DB - value
                // link only, no FK - cross-database).
                approved_by_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                // Owner-entered receipt/transaction reference on manual mark-paid.
                external_payment_ref: {
                    type: Sequelize.STRING(160),
                    allowNull: true
                },
                rejection_reason: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                // Forward-compatibility only - NULL today, would become 'paymongo' once an
                // automated disbursement flow drives this same approved -> paid transition.
                disbursement_provider: {
                    type: Sequelize.STRING(40),
                    allowNull: true
                },
                disbursement_payload: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                ...timestampColumns(Sequelize)
            });
        }
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_cashouts', ['tenant_id', 'status'], {
            name: 'idx_dgfy_affiliate_cashouts_tenant_status'
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_cashouts', ['dgfy_account_id', 'status'], {
            name: 'idx_dgfy_affiliate_cashouts_account_status'
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_cashouts', ['enrollment_id', 'status'], {
            name: 'idx_dgfy_affiliate_cashouts_enrollment_status'
        });

        // 6. tenant_affiliate_settings - one row per store
        const settingsTable = await queryInterface.describeTable('tenant_affiliate_settings').catch(() => null);
        if (!settingsTable) {
            await queryInterface.createTable('tenant_affiliate_settings', {
                tenant_id: {
                    type: Sequelize.UUID,
                    primaryKey: true,
                    allowNull: false
                },
                program_enabled: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                // System default: 5% (500 basis points).
                default_rate_bps: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 500
                },
                attribution_window_days: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 60
                },
                // Default PHP 200.00.
                min_cashout_centavos: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 20000
                },
                auto_approve_enrollment: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                ...timestampColumns(Sequelize)
            });
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable('tenant_affiliate_settings').catch(() => null);

        await queryInterface.removeIndex('dgfy_affiliate_cashouts', 'idx_dgfy_affiliate_cashouts_enrollment_status').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_cashouts', 'idx_dgfy_affiliate_cashouts_account_status').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_cashouts', 'idx_dgfy_affiliate_cashouts_tenant_status').catch(() => null);
        await queryInterface.dropTable('dgfy_affiliate_cashouts').catch(() => null);

        await queryInterface.removeIndex('dgfy_affiliate_payout_methods', 'idx_dgfy_affiliate_payout_methods_account_default').catch(() => null);
        await queryInterface.dropTable('dgfy_affiliate_payout_methods').catch(() => null);

        await queryInterface.removeIndex('dgfy_affiliate_commissions', 'idx_dgfy_affiliate_commissions_cashout').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_commissions', 'idx_dgfy_affiliate_commissions_enrollment_status').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_commissions', 'idx_dgfy_affiliate_commissions_account_status').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_commissions', 'unique_dgfy_affiliate_commissions_tenant_order_reference').catch(() => null);
        await queryInterface.dropTable('dgfy_affiliate_commissions').catch(() => null);

        await queryInterface.removeIndex('dgfy_affiliate_attributions', 'idx_dgfy_affiliate_attributions_tenant_time').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_attributions', 'idx_dgfy_affiliate_attributions_tenant_enrollment_time').catch(() => null);
        await queryInterface.dropTable('dgfy_affiliate_attributions').catch(() => null);

        await queryInterface.removeIndex('dgfy_affiliate_enrollments', 'idx_dgfy_affiliate_enrollments_tenant_status').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_enrollments', 'unique_dgfy_affiliate_enrollments_short_code').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_enrollments', 'unique_dgfy_affiliate_enrollments_share_code_hash').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_enrollments', 'unique_dgfy_affiliate_enrollments_account_tenant').catch(() => null);
        await queryInterface.dropTable('dgfy_affiliate_enrollments').catch(() => null);
    }
};
