# MySQL Database Schema Design - SKU Inventory Manager

## Table of Contents

> **Navigation Tip:** Click a table name to jump directly to its schema definition.

### Overview
- [Database Overview](#database-overview)
- [Entity-Relationship Diagram](#entity-relationship-diagram)

### Multi-Tenant Architecture
- [Landlord Database (Registry)](#landlord-database-registry)
- [Tenant Databases (Isolated Contexts)](#tenant-databases-isolated-contexts)

### Recent Addenda
- [POS Shift-Location Safety Addendum (2026-04-21)](#pos-shift-location-safety-addendum-2026-04-21)
- [Food & Beverage Mode Addendum (2026-05-06)](#food--beverage-mode-addendum-2026-05-06)
- [Item Financial Readiness Addendum (2026-05-07)](#item-financial-readiness-addendum-2026-05-07)
- [Account Phone Contact Addendum (2026-05-15)](#account-phone-contact-addendum-2026-05-15)
- [DGFY Legal Acknowledgement Addendum (2026-06-08)](#dgfy-legal-acknowledgement-addendum-2026-06-08)
- [DGFY Customer Account Addendum (2026-05-24)](#dgfy-customer-account-addendum-2026-05-24)
- [Platform Admin Capability Audit Addendum (2026-06-07)](#platform-admin-capability-audit-addendum-2026-06-07)

### Table Definitions
- [1. Users Table](#1-users-table)
- [2. Items (SKU Master) Table](#2-items-sku-master-table)
- [3. FIFO Batches Table](#3-fifo-batches-table)
- [4. Item Nutrition Table](#4-item-nutrition-table)
- [5. Item Allergens Table](#5-item-allergens-table)
- [6. Product Composition Table](#6-product-composition-table)
- [7. Suppliers Table](#7-suppliers-table)
- [8. Supplier Items Table](#8-supplier-items-table)
- [9. Bulk Discounts Table](#9-bulk-discounts-table)
- [10. Purchase Orders Table](#10-purchase-orders-table)
- [11. PO Line Items Table](#11-po-line-items-table)
- [12. Job Orders Table](#12-job-orders-table)
- [13. JO Ingredients Table](#13-jo-ingredients-table)
- [14. Stock Movements Table](#14-stock-movements-table)
- [15. Batch Transactions Table](#15-batch-transactions-table)
- [16. Audit Logs Table](#16-audit-logs-table)
- [17. System Settings Table](#17-system-settings-table)
- [18. POS Catalog Overrides Table](#18-pos-catalog-overrides-table)
- [19. POS Terminal Shifts Table](#19-pos-terminal-shifts-table)
- [20. POS Cash Drawer Events Table](#20-pos-cash-drawer-events-table)
- [Food & Beverage Mode Addendum (2026-05-06)](#food--beverage-mode-addendum-2026-05-06)
- [Item Financial Readiness Addendum (2026-05-07)](#item-financial-readiness-addendum-2026-05-07)
- [DGFY Legal Acknowledgement Addendum (2026-06-08)](#dgfy-legal-acknowledgement-addendum-2026-06-08)
- [DGFY Customer Account Addendum (2026-05-24)](#dgfy-customer-account-addendum-2026-05-24)
- [Platform Admin Capability Audit Addendum (2026-06-07)](#platform-admin-capability-audit-addendum-2026-06-07)

### Database Administration
- [Key Indexes & Performance Optimization](#key-indexes--performance-optimization)
- [Data Integrity Constraints](#data-integrity-constraints)
- [Initial Data Setup](#initial-data-setup)
- [Backup & Recovery Strategy](#backup--recovery-strategy)
- [Migration Strategy](#migration-strategy)

---

# MySQL Database Schema Design - SKU Inventory Manager

## Database Overview

**MySQL Version**: 8.0+
**Character Set**: utf8mb4
**Collation**: utf8mb4_unicode_ci

## Multi-Tenant Architecture

This system uses a **Database-per-Tenant** isolation strategy. A central **Landlord** database manages the registry, while each company has its own isolated **Tenant** database.

### 1. Landlord Database (Registry)
**Database Name**: `SKU` (or as configured in `DB_NAME`)

This database identifies each tenant and routes API requests to the correct data source.

```sql
CREATE TABLE tenants (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    subdomain VARCHAR(100),
    db_name VARCHAR(100) NOT NULL UNIQUE,
    company_token VARCHAR(255) NOT NULL UNIQUE,
    db_host VARCHAR(255),
    status ENUM('pending', 'active', 'inactive', 'rejected', 'archived') DEFAULT 'pending',
    plan ENUM('standard', 'premium') DEFAULT 'standard',
    billing_cycle_anchor INT NULL,
    subscription_status ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') DEFAULT 'inactive',
    paypal_subscription_id VARCHAR(255) NULL,
    current_period_end DATETIME NULL,
    trial_ends_at DATETIME NULL,
    grace_period_end DATETIME NULL,
    cancelled_at DATETIME NULL,
    last_expiry_notified_at DATETIME NULL,
    last_expiry_notification_type VARCHAR(255) NULL,
    -- Subscription management fields (Phase 65)
    pending_plan ENUM('standard', 'premium') NULL,
    pending_plan_change_date DATE NULL,
    pending_plan_approved BOOLEAN DEFAULT false,
    pending_paypal_subscription_id VARCHAR(255) NULL,
    paypal_setup_initiated_at DATE NULL,
    pending_paymongo_subscription_id VARCHAR(255) NULL,
    paymongo_setup_initiated_at DATE NULL,
    paymongo_subscription_id VARCHAR(255) NULL,
    paymongo_source_id VARCHAR(255) NULL,
    payment_method ENUM('manual', 'paypal', 'paymongo') DEFAULT 'manual',
    reactivation_requested_at DATE NULL,
    rejection_reason VARCHAR(500) NULL,
    compliance_mode_state ENUM('non_compliant_active', 'compliant_pending', 'compliant_active') NULL,
    compliance_mode_choice_required BOOLEAN NOT NULL DEFAULT true,
    compliance_mode_selected_at DATETIME NULL,
    compliance_mode_selected_by VARCHAR(120) NULL,
    compliance_mode_override_by VARCHAR(120) NULL,
    compliance_mode_override_at DATETIME NULL,
    compliance_mode_override_reason VARCHAR(255) NULL,
    compliance_mode_revert_by VARCHAR(120) NULL,
    compliance_mode_revert_at DATETIME NULL,
    compliance_mode_revert_reason VARCHAR(255) NULL,
    compliance_cycle_version INT NOT NULL DEFAULT 0,
    compliance_revert_last_cycle_version INT NOT NULL DEFAULT 0,
    compliance_activated_at DATETIME NULL,
    compliance_policy_version VARCHAR(40) NULL,
    compliance_profile JSON NULL,
    owner_dgfy_account_id BIGINT NULL,
    ownership_transferred_at DATETIME NULL,
    ownership_transferred_by BIGINT NULL,
    settings JSON,
    admin_email VARCHAR(255),
    admin_phone VARCHAR(40) NULL,
    admin_password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Subscription notes:
- Tenant DB credentials are environment-driven at runtime (`DB_USER`, `DB_PASSWORD`); tenant-row plaintext credential columns are intentionally removed.
- `owner_dgfy_account_id` is the landlord-scoped active company owner for DGFY-only company access. It is set at DGFY company creation and updated by the single-owner transfer flow; tenant-local Master Admin role is not sufficient to prove current ownership.
- `provisioning_source` identifies whether the tenant came from public registration or platform-admin assisted provisioning.
- `ownership_status` is `claimed` for ordinary owner-linked companies, `unassigned` for admin-provisioned ownerless companies, and `handover_pending` for future acceptance-based handovers.
- `ownership_transferred_at` and `ownership_transferred_by` audit the latest owner transfer. Detailed attempts/results remain in landlord business audit logs.
- `dgfy_account_business_audit_logs.action` includes company switch, invitation create/accept/reject, leave-company, ownership transfer, legacy link, and POS unlock attempt/success/failure actions. The POS actions intentionally separate DGFY auth/no-access failures from POS permission, terminal registry, and hardware-adjacent follow-up diagnostics.
- `billing_cycle_anchor` backfill migration (`20260303000005-backfill-missing-billing-anchor.cjs`) only updates premium tenants with non-null `current_period_end` and null anchor.
- Phase 65 fields added via `20260309000001-extend-tenant-subscription-fields.cjs` (idempotent `describeTable` guard):
  - `payment_method`: `'manual'` = admin-invoiced; `'paypal'` = PayPal recurring; `'paymongo'` = PayMongo recurring
  - `pending_plan*` fields: track a queued plan change awaiting PayPal user re-consent
  - `pending_paypal_subscription_id` / `paypal_setup_initiated_at`: track admin-initiated PayPal setup links (72h TTL)
  - `pending_paymongo_subscription_id` / `paymongo_setup_initiated_at`: track admin-initiated PayMongo setup links
  - `paymongo_subscription_id` / `paymongo_source_id`: active PayMongo billing references
  - `reactivation_requested_at`: set when an inactive tenant requests reactivation
  - `rejection_reason`: populated by `rejectTenantUseCase`; surfaced in email lookup response
- Compliance lifecycle fields are landlord-tenant scoped and enforced in runtime + DB:
  - `compliance_mode_state`, `compliance_mode_choice_required`
  - `compliance_mode_selected_*`, `compliance_activated_at`
  - `compliance_mode_override_*`, `compliance_mode_revert_*`

Tenant-local platform capability switches are stored in each tenant database's `system_settings` table:
- `tenant_ims_enabled` (`boolean`, default if missing: `true`) gates authenticated IMS route groups without changing landlord tenant lifecycle status.
- `tenant_pos_enabled` (`boolean`, default if missing: `true`) gates `/api/v1/pos/*` without changing item-level POS catalog visibility.
- `store_is_visible` and `customer_access_mode` remain the Storefront publication/access-mode controls described in the Storefront contract.

## Account Phone Contact Addendum (2026-05-15)

Company registration, direct company-user registration, and invitation acceptance now require account phone numbers.

Schema contract:
- `tenants.admin_phone` stores the founder/admin phone number submitted during public company registration. Pending manual-approval tenants keep this value until provisioning; provisioning copies it into the seeded founder/admin user's `users.phone_number`.
- `users.phone_number` exists in tenant-local user tables and stores the account contact number for accepted users.
- Migration `20260514000001-add-phone-number-to-users.cjs` is tenant-aware: it adds `users.phone_number` to the landlord/current database when present and to every active tenant database listed in the landlord `tenants` registry.
- Migration `20260514000002-add-admin-phone-to-tenants.cjs` adds `tenants.admin_phone` to the landlord registry.

Validation contract:
- Phone values are trimmed.
- Accepted format is 7-40 characters using digits, spaces, `+`, `-`, parentheses, and periods.
- Existing users created before this requirement can add or change their number through Settings > Profile. Admin user management surfaces display existing numbers and mark accepted legacy users whose phone number is missing.
- Accepted legacy users with blank `users.phone_number` are allowed to read/update their own profile and log out whenever phone-completion enforcement is active for their tenant; only then is normal authenticated tenant work blocked with `428 PHONE_NUMBER_REQUIRED` until the stored phone number is completed.
- Enforcement is staged through `PHONE_COMPLETION_ENFORCEMENT_MODE`:
  - `observe` (non-test default): report and remediate without blocking.
  - `tenant_allowlist`: enforce only tenant IDs or company tokens in `PHONE_COMPLETION_ENFORCED_TENANTS`.
  - `all`: enforce globally after closure evidence is clean.
- Operators can run `npm run verify:phone-rollout` from `backend/` to report active-tenant schema presence, outstanding legacy-user gaps, and current enforcement mode. `npm run verify:phone-rollout:users` prints the exact accepted active users still missing phone numbers, `npm run verify:phone-rollout:config-safe` fails if currently enforced tenants are not ready, and `npm run verify:phone-rollout:complete` remains the global rollout-closure gate.

## DGFY Legacy Tenant Login Grace Addendum (2026-06-17)

Direct tenant-local IMS/POS login has a temporary DGFY migration grace policy rather than new tenant-local columns. The backend computes `dgfy_link_status`, `legacy_grace_expires_at`, `dgfy_membership_id`, `can_legacy_login`, and `legacy_login_block_reason` from tenant-local `users` and landlord `dgfy_account_tenant_memberships`.

Operational contract:

- `LEGACY_TENANT_LOGIN_GRACE_END=2027-06-17` is the default end date.
- `LEGACY_TENANT_LOGIN_GRACE_ENABLED=true` keeps accepted unlinked legacy users able to use direct IMS/POS login until the deadline.
- `DGFY_LEGACY_TENANT_REGISTRATION_ENABLED` defaults off so the grace cohort cannot grow through new direct tenant-user registration.
- `DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED` defaults off. When explicitly enabled for repair, DGFY tenant-session creation may attach a missing membership `tenant_user_id` after exact email match; normal DGFY tenant sessions must use the explicit accepted membership link.

After June 17, 2027, unlinked legacy users cannot use IMS/POS until they create or link a DGFY account.
  - `compliance_cycle_version`, `compliance_revert_last_cycle_version`
  - `compliance_policy_version`, `compliance_profile`
- Drift-alignment migrations:
  - `20260407000003-align-tenant-schema-with-model.cjs` aligns tenant landlord schema with active runtime model (including admin fields and enum normalization).
  - `20260407000002-compliance-hardening-phase1-2.cjs` and `20260407000005-add-compliance-audit-fallback-table.cjs` complete compliance table/column hardening for runtime checks.
  - `20260422000001-add-compliance-downgrade-override-controls.cjs` adds governed downgrade columns, audit event types, and controlled downgrade trigger support.
  - `20260422000002-harden-compliance-downgrade-controls.cjs` tightens trigger invariants (same-update marker mutation, no mixed override+revert mutation, and tenant one-per-cycle enforcement parity).

## Platform Admin, Manual Registration Review, And QA Invoicing Addendum (2026-07-28)

Primary landlord migrations:

1. `20260728000001-create-platform-admin-identity.cjs`
2. `20260728000002-create-company-registration-applications.cjs`
3. `20260728000003-create-platform-invoices.cjs`
4. `20260728000004-create-platform-invoice-payments-and-sequences.cjs`
5. `20260728000005-create-platform-invoice-artifacts-and-deliveries.cjs`
6. `20260728000006-create-platform-invoice-adjustments.cjs`
7. `20260728000007-create-platform-invoice-events.cjs`
8. `20260728000008-add-platform-invoice-replacements.cjs`
9. `20260728000009-remove-platform-invoice-original-unique-index.cjs`

Platform Admin tables:

1. `platform_admin_users` stores delegated/master identity state and password hashes.
2. `platform_admin_permissions` stores live page grants; API middleware resolves these rows on every protected request.
3. `platform_admin_sessions` stores revocable, expiring HttpOnly admin sessions.
4. `platform_admin_audit_logs` stores reasoned privileged identity and grant changes without password values.

Company-registration review tables:

1. `company_registration_applications` stores the submitting DGFY account, tenant, review state, provisioning state, current attempt, and optimistic version.
2. `company_registration_attempts` stores immutable submission/legal snapshots and review decisions.
3. `company_registration_events` stores the append-only review/provisioning lifecycle.
4. `company_registration_email_deliveries` stores durable applicant notification attempts.

QA landlord-invoice tables:

1. `platform_invoices` stores immutable seller, buyer, service, VAT, status, numbering, and replacement-parent snapshots.
2. `platform_invoice_sequences` allocates non-reused TEST invoice numbers atomically.
3. `platform_invoice_payments` stores append-only cash tender, applied amount, and confirmed change.
4. `platform_invoice_artifacts` stores private PDF metadata, storage keys, and SHA-256 digests.
5. `platform_invoice_deliveries` stores rate-limited provider delivery attempts and actual QA recipients.
6. `platform_invoice_adjustments` stores full-credit records.
7. `platform_invoice_events` stores the append-only invoice lifecycle.

These are landlord-only tables. They must not be cloned into tenant databases or joined to tenant POS invoice/payment/inventory ledgers. Live fiscal issuance remains disabled while the seller snapshot contains TEST mode or unresolved fiscal authority placeholders.

## DGFY Legal Acknowledgement Addendum (2026-06-08)

DGFY account registration and public company registration require versioned ToS/T&C acknowledgement before the mutation proceeds.

Primary migration:

1. `20260526000001-create-dgfy-legal-acknowledgements.cjs`

Landlord table:

1. `dgfy_legal_acknowledgements` stores immutable acknowledgement evidence for `dgfy_account_registration` and `dgfy_company_registration`. Rows include `dgfy_account_id`, optional `tenant_id`, flow, account/company/privacy/marketplace terms versions, acknowledgement text, acknowledgement hash, IP address, user agent, request ID, and `accepted_at`.

Operational contract:

- Missing, false, or stale terms acknowledgement is rejected with `422 TERMS_ACKNOWLEDGEMENT_REQUIRED`.
- Legal acknowledgement persistence fails closed when the repository/transaction path is unavailable.
- DGFY account registration consumes a `dgfy_account_verification` OTP, writes the verified account row, invitation membership mirrors, and acknowledgement row in one landlord transaction.
- Platform-admin DGFY account creation does not consume public OTP. It records `provisioning_status=admin_provisioned`, `temporary_password_active=true`, and `email_verification_source=platform_admin_provisioned`; temporary passwords must not be persisted outside the password hash or audit snapshots.
- Company registration uses the authenticated verified DGFY account email and does not consume a second same-address company-registration OTP. The tenant row and acknowledgement row are written in one landlord transaction before tenant provisioning.
- Company registration acknowledgement is captured before tenant provisioning and is tied to the authenticated DGFY account plus the landlord tenant row.
- Acknowledgement copy preserves the marketplace-provider framing: DGFY facilitates the transaction through a licensed payment partner while the merchant remains seller of record and receives net settlement after disclosed fees.
- Legacy IMS/POS account linking uses `email_otps.purpose='dgfy_legacy_link'` from an authenticated tenant session. The OTP proves ownership of the existing tenant-local email before the user links that authorization profile to a matching DGFY account.

## DGFY Customer Account Addendum (2026-05-24)

DGFY front-facing customer accounts are landlord-scoped and separate from tenant-local Storefront customer records. Tenant-local `store_customers` remain compatibility rows, but now include nullable `dgfy_account_id` so Storefront customer flows can prefer direct DGFY account linkage over email or phone fallback.

Primary migration:

1. `20260522000002-add-dgfy-front-facing-customer-account.cjs`
2. `20260528000001-add-middle-name-to-dgfy-accounts.cjs`

Landlord account field update:

- `dgfy_accounts.middle_name` is nullable `STRING(80)` and stores the optional DGFY account middle name collected between first and last name in account/profile flows.

Landlord tables:

1. `dgfy_customer_activities` stores account-facing activity snapshots across tenant databases. Activity rows include DGFY account, tenant, optional store customer, activity type (`order`, `service_booking`, `hospitality_booking`, or `fnb_order`), public reference, store label, status, payment status, total amount, customer contact snapshot, display snapshot, and occurrence timestamp.
2. `dgfy_customer_addresses` stores global saved addresses for DGFY customer accounts, including label, address lines, city/province/postal/country, phone, coordinates, metadata, and default-address flag.
3. `dgfy_customer_reviews` stores account-gated typed reviews. Reviews are purchase-gated by paid or completed DGFY customer activity, start pending approval, and identify `target_type`/`target_id` for product, service, Hospitality booking, F&B order, or F&B item review targets.
4. `dgfy_customer_notifications` stores account-scoped notification rows for DGFY customer activity updates. Rows include DGFY account, optional tenant/activity linkage, public reference, idempotent `event_key`, notification type, title/body, status, `read_at`, timestamps, and indexes for account/time and unread account reads.
5. `dgfy_loyalty_transactions` stores read-only DGFY loyalty ledger rows. Balance is an aggregate of all transactions, not only recent visible rows.
6. `dgfy_tracking_recovery_codes` stores hashed tracking-recovery codes with generic production responses, attempt limits, expiry, and single-use consumption.
7. `dgfy_customer_backfill_runs` stores historical backfill audit rows, including dry-run/apply status, tenant/activity counters, mode-specific `order_count`, `service_booking_count`, `hospitality_booking_count`, `fnb_order_count`, matched-account/upsert counters, failures, timestamps, and JSON summary.
8. `dgfy_account_admin_audit_logs` stores platform-admin DGFY account lifecycle evidence. Rows include `audit_log_id`, `dgfy_account_id`, action (`profile_update`, `suspend`, `reactivate`, `delete`), actor username, optional reason, request ID, IP address, user agent, safe `before_snapshot`/`after_snapshot` JSON, and timestamps. Snapshots must not include password hashes, tokens, OTP values, or other secrets.

Operational contract:

- `npm run backfill:dgfy-customer-activity:apply` runs landlord migrations before applying historical customer activity writes.
- Dry-run uses `npm run backfill:dgfy-customer-activity -- ...` and does not write activity rows.
- Historical backfill scans POS customer orders, F&B checks linked through POS transactions, Services bookings, and Hospitality reservations.
- Production dry-runs can require mode evidence with `--require-activity-types=order,service_booking,hospitality_booking,fnb_order` before apply.
- Phone verification remains deferred for the customer account rollout. Phone values are matching/contact data only and must not be treated as verified identity.
- Platform-admin DGFY account management uses `dgfy_accounts.is_active` as `active`/`suspended`; `dgfy_accounts.deleted_at` marks a deleted/deidentified account. Suspended or deleted accounts cannot log in, and existing DGFY sessions fail on the next authenticated DGFY request when the account is reloaded.
- Platform-admin DGFY delete/deidentify preserves the account row and evidence-bearing related rows while overwriting email, phone, username, names, and password hash with non-user placeholders. This releases the original credentials for re-registration without physically deleting legal acknowledgements, memberships, customer activity, reviews, loyalty, order/history, or admin audit evidence.

## Platform Admin Tenant Audit Addendum (2026-06-07; updated 2026-06-15)

Platform-admin tenant capability and DGFY POS metadata changes are persisted in the landlord audit table `tenant_admin_audit_logs`. This table records capability switch changes for IMS, POS, and Storefront/Maps, plus POS software identity saves and tenant receipt metadata approvals/rejections, with before/after snapshots, actor identity, request metadata, and a required reason.

```sql
CREATE TABLE tenant_admin_audit_logs (
    tenant_admin_audit_log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id CHAR(36) NOT NULL,
    action ENUM('capability_update', 'pos_metadata_update') NOT NULL,
    actor_username VARCHAR(120) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    request_id VARCHAR(100) NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    before_snapshot JSON NULL,
    after_snapshot JSON NULL,
    metadata JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_admin_audit_tenant_time (tenant_id, created_at),
    INDEX idx_tenant_admin_audit_action (action),
    INDEX idx_tenant_admin_audit_actor (actor_username),
    CONSTRAINT fk_tenant_admin_audit_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
```

The tenant-local capability switches themselves remain in each tenant database's `system_settings` table:

- `tenant_ims_enabled`
- `tenant_pos_enabled`
- `store_is_visible`
- `customer_access_mode`

### 2. Tenant Databases (Isolated Contexts)
**Database Name Pattern**: `sku_tenant_[id]` or as specified in `tenants.db_name`

Every tenant database follows the **Master Schema** defined below. When a new company is registered, the system creates a new database and executes all migrations to ensure it matches this structure.

## POS Shift-Location Safety Addendum (2026-04-21)

The following POS location-safety schema additions are now part of the active tenant schema behavior:

1. `pos_terminal_shifts.location_id` is the shift location anchor for POS operations.
2. `pos_shift_location_transitions` stores privileged location switch audit transitions (close+open flow).
3. `pos_shift_location_backfill_audit` stores legacy shift-location remediation provenance (`resolution_source`, `resolution_reason`, `migration_tag`).
4. Terminal registry entries support a single home location mapping (`pos_terminal_registry[].location_id`) used by remediation and strict-binding policy checks.

Primary migrations:

1. `20260421000001-add-pos-shift-location-binding.cjs`
2. `20260421000002-remediate-pos-shift-location-backfill.cjs`

---

## Food & Beverage Mode Addendum (2026-05-06)

Food & Beverage Mode adds restaurant-only side tables while reusing shared `items`, nutrition/allergen, product composition, POS transaction, and stock-movement contracts.

Primary migration:

1. `20260505000002-create-fnb-restaurant-mode-tables.cjs`

Tenant-local F&B tables:

1. `fnb_modifier_groups`
2. `fnb_modifier_options`
3. `fnb_item_modifier_groups`
4. `fnb_dining_areas`
5. `fnb_dining_tables`
6. `fnb_kitchen_stations`
7. `fnb_item_kitchen_routes`
8. `fnb_checks`
9. `fnb_check_lines`
10. `fnb_kitchen_tickets`
11. `fnb_reservation_requests`
12. `fnb_reservation_tables`
13. `fnb_restaurant_service_charge_snapshots`

POS snapshot additions:

1. `pos_transactions.fnb_check_id`
2. `pos_transactions.fnb_table_id`
3. `pos_transactions.fnb_table_label_snapshot`
4. `pos_transactions.fnb_guest_count`
5. `pos_transactions.fnb_server_id`
6. `pos_transactions.restaurant_service_charge_amount`
7. `pos_transactions.restaurant_service_charge_label_snapshot`
8. `pos_transactions.restaurant_service_charge_rate_snapshot`
9. `pos_transactions.restaurant_service_charge_taxable`
10. `pos_transactions.fnb_metadata`
11. `pos_transaction_lines.fnb_course_snapshot`
12. `pos_transaction_lines.fnb_modifiers_snapshot`
13. `pos_transaction_lines.fnb_special_instructions`
14. `pos_transaction_lines.fnb_kitchen_station_snapshot`

Restaurant service charge remains separate from the DGFY convenience fee. DGFY continues to use `pos_transactions.service_fee_amount`; restaurant service charge uses `restaurant_service_charge_*` columns and `fnb_restaurant_service_charge_snapshots`. When `restaurant_service_charge_taxable=true`, checkout includes the restaurant service charge in the VATable gross calculation at transaction time.

F&B menu inventory reuses `product_composition` for recipes. POS checkout deducts ingredient rows for F&B menu items with `composition_type='ingredient'`; menu items without recipe rows continue to deduct the sold item directly.

F&B reservation scheduling stores `duration_minutes` and `buffer_minutes` on `fnb_reservation_requests` with `requested_at` and optional primary `table_id`. Combined-table bookings use `fnb_reservation_tables` to store every assigned table. Confirmed/seated reservations use the combined duration plus reset-buffer window to prevent overlap on any assigned table and to reject party sizes above selected seat capacity.

---

## RMO 24-2023 Fiscal Runtime Addendum (2026-06-01)

The tenant-local POS schema now carries internal RMO 24-2023 fiscal preparation controls. These records support compliant-mode activation evidence and fiscal runtime auditability; they do not replace external BIR accreditation, PTU/ATG approval, legal/tax sign-off, or official filing acknowledgement.

Primary migration:

1. `20260601000001-add-rmo-fiscal-document-snapshot-fields.cjs`

`pos_transactions` fiscal snapshot additions. These columns are required runtime schema fields because the POS model selects them on normal reads, but they remain nullable unless noted by the migration. Non-fiscal/non-compliant checkout stores buyer fiscal details and fiscal document snapshot fields as `null`; missing columns are migration drift, not a customer-facing buyer-TIN requirement.

1. `buyer_tin`
2. `buyer_business_style`
3. `buyer_address`
4. `fiscal_document_template_version`
5. `fiscal_document_hash`
6. `fiscal_document_snapshot`
7. `fiscal_lifecycle_state`
8. `fiscal_reprint_count`
9. `fiscal_void_event_hash`
10. `void_reason`

Fiscal runtime tables:

1. `pos_fiscal_terminal_registrations` stores terminal-specific MIN, machine serial, software serial, software version, PTU, binding, evidence reference, status, and verification metadata. Fiscal checkout and compliant activation require at least one verified terminal registration.
2. `pos_fiscal_events` stores append-only fiscal events with `event_sequence`, `previous_event_hash`, `event_hash`, payload, actor, terminal, invoice, and timestamp fields. `/pos/fiscal-ledger/integrity` recomputes the hash chain and reports sequence or linkage issues.
3. `pos_fiscal_print_events` stores original print and reprint evidence. Reprints require a reason; browser print completion remains operator-attested.
4. `pos_esales_reports` stores monthly Asia/Manila eSales package payloads, payload hashes, generation evidence, and submitted/accepted/rejected lifecycle evidence references.

---

## Item Financial Readiness Addendum (2026-05-07)

The shared `items` table stores both internal cost and customer selling price, but they are separate contracts:

1. `items.cost_per_unit`, FIFO batch cost, weighted-average cost, stock-movement snapshots, valuation, COGS, and profitability reports are internal accounting fields.
2. `items.default_sale_price` is the explicit customer price for POS cart defaults, public Storefront catalog/checkout/QR, Dispatch Orders, and future customer sale surfaces.
3. Customer-facing sale flows must reject or suppress rows with missing or zero `default_sale_price`; they must not substitute `cost_per_unit` as the sale amount.
4. Storefront public payloads must not expose `cost_per_unit`, FIFO cost, weighted cost, raw stock, or inventory value.
5. Corrected mode presets define when cost and selling price appear in IMS. Pure service rows are stock-exempt and hide cost unless internal service-cost tracking is enabled; stock-bearing items keep inventory cost visible and require selling price only when made sellable.

---

## Entity-Relationship Diagram

> **Reference Diagram**: See [Data Model Diagram](./images/data-model-diagram.png) for a visual representation of the complete database schema and entity relationships.
> **Implementation Note (2026-04-18)**: The diagram is conceptual and may omit newer generated/location-scoped columns (for example `items.active_sku_code`, location-scoped FIFO, and location-ledger tables). Treat SQL table definitions below as canonical.

```
┌─────────────────┐
│     Users       │
│─────────────────│
│ user_id (PK)    │
│ username        │
│ email           │
│ password_hash   │
│ role            │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────▼─────────────────┐
    │  AuditLogs           │
    │──────────────────────│
    │ log_id (PK)          │
    │ user_id (FK)         │
    │ entity_type          │
    │ entity_id            │
    │ action               │
    │ changes              │
    │ timestamp            │
    └──────────────────────┘

┌──────────────────────────┐
│      Items (SKU Master)  │
│──────────────────────────│
│ item_id (PK)             │
│ sku_code (UNIQUE)        │
│ name                     │
│ category                 │
│ description              │
│ current_stock            │
│ max_capacity             │
│ min_threshold            │
│ purchase_allowance       │
│ unit_of_measure          │
│ cost_per_unit            │
│ default_sale_price       │
│ fifo_enabled             │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
    ┌────┴────────────────────┐
    │                         │
    │ 1:N                     │ 1:N
    │                         │
    ▼                         ▼
┌──────────────────┐   ┌──────────────────┐
│  FIFOBatches     │   │ ItemNutrition    │
│──────────────────│   │──────────────────│
│ batch_id (PK)    │   │ nutrition_id(PK) │
│ item_id (FK)     │   │ item_id (FK)     │
│ quantity         │   │ calories         │
│ cost_per_unit    │   │ protein          │
│ received_date    │   │ fat              │
│ expiry_date      │   │ carbohydrates    │
│ po_number (FK)   │   │ fiber            │
│ created_at       │   │ sodium           │
└──────────────────┘   └──────────────────┘

┌──────────────────┐
│  ItemAllergens   │
│──────────────────│
│ allergen_id(PK)  │
│ item_id (FK)     │
│ allergen_name    │
└──────────────────┘

┌──────────────────────────────┐
│  ProductComposition          │
│──────────────────────────────│
│ composition_id (PK)          │
│ product_id (FK)              │
│ ingredient_id (FK)           │
│ quantity_required            │
│ unit_of_measure              │
└──────────────────────────────┘

┌──────────────────────────┐
│      Suppliers           │
│──────────────────────────│
│ supplier_id (PK)         │
│ name                     │
│ contact_person           │
│ email                    │
│ phone                    │
│ address                  │
│ quality_rating           │
│ avg_delivery_days        │
│ is_active                │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
    ┌────┴─────────────────────┐
    │                          │
    │ 1:N                      │ 1:N
    │                          │
    ▼                          ▼
┌────────────────────┐  ┌──────────────────┐
│ SupplierItems      │  │ BulkDiscounts    │
│────────────────────│  │──────────────────│
│ supplier_item_id   │  │ discount_id (PK) │
│ supplier_id (FK)   │  │ supplier_id (FK) │
│ item_id (FK)       │  │ min_quantity     │
│ moq                │  │ discount_percent │
│ price_per_unit     │  │ created_at       │
│ last_price_update  │  └──────────────────┘
└────────────────────┘

┌────────────────────────────────┐
│     PurchaseOrders             │
│────────────────────────────────│
│ po_id (PK)                     │
│ po_number (UNIQUE)             │
│ supplier_id (FK)               │
│ order_date                     │
│ expected_delivery_date         │
│ received_date                  │
│ status                         │
│ subtotal                       │
│ discount                       │
│ total_amount                   │
│ delivery_rating                │
│ notes                          │
│ created_by (FK - Users)        │
│ created_at                     │
│ updated_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │  POLineItems           │
    │────────────────────────│
    │ line_item_id (PK)      │
    │ po_id (FK)             │
    │ item_id (FK)           │
    │ quantity_ordered       │
    │ quantity_received      │
    │ unit_price             │
    │ total_price            │
    │ quality_check_status   │
    │ notes                  │
    └────────────────────────┘

┌────────────────────────────────┐
│       JobOrders                │
│────────────────────────────────│
│ jo_id (PK)                     │
│ jo_number (UNIQUE)             │
│ product_id (FK - Items)        │
│ quantity_to_produce            │
│ status                         │
│ created_date                   │
│ completion_date                │
│ responsible_user (FK - Users)  │
│ notes                          │
│ created_at                     │
│ updated_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │ JOIngredients          │
    │────────────────────────│
    │ jo_ingredient_id (PK)  │
    │ jo_id (FK)             │
    │ item_id (FK)           │
    │ quantity_required      │
    │ quantity_consumed      │
    │ stock_before           │
    │ stock_after            │
    └────────────────────────┘

┌────────────────────────────────┐
│     StockMovements             │
│────────────────────────────────│
│ movement_id (PK)               │
│ item_id (FK)                   │
│ movement_type                  │
│ quantity                       │
│ from_location                  │
│ to_location                    │
│ reference_id                   │
│ reference_type                 │
│ user_responsible (FK - Users)  │
│ notes                          │
│ loss_reason                    │
│ weighted_average_cost          │
│ timestamp                      │
│ created_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │ BatchTransactions      │
    │────────────────────────│
    │ transaction_id (PK)    │
    │ movement_id (FK)       │
    │ batch_id (FK)          │
    │ quantity_consumed      │
    │ remaining_after        │
    │ cost_per_unit          │
    └────────────────────────┘

┌────────────────────────────────┐
│      SystemSettings            │
│────────────────────────────────│
│ setting_id (PK)                │
│ setting_key (UNIQUE)           │
│ setting_value                  │
│ data_type                      │
│ description                    │
│ updated_at                     │
└────────────────────────────────┘
```

---

## Detailed Table Definitions

### Soft Delete Contract (2026-03-03)
- The system uses **manual soft delete** for `users`, `items`, and `suppliers`.
- Sequelize `paranoid` is **not** the source of truth for visibility.
- Service-layer queries enforce visibility using `deleted_at IS NULL` plus entity-specific status rules.
- Default resource behavior for soft-deleted targets is `404 Not Found`.

### 1. Users Table

```sql
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(40) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo') DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSON,                    -- Granular permission array
    is_master_admin BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP NULL,

    -- Invitation system fields
    invitation_token VARCHAR(255) NULL,
    invitation_expires_at TIMESTAMP NULL,
    invited_by INT NULL,
    invitation_status ENUM('pending', 'accepted', 'expired') NULL,

    -- Soft delete fields (Remove from Company)
    deleted_at TIMESTAMP NULL,           -- When user was removed
    deleted_by INT NULL,                 -- Who removed the user (FK to user_id)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role),

    CONSTRAINT fk_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);
```

**Soft Delete Notes:**
- When a user is removed from the company, `deleted_at` is set to the removal timestamp
- `deleted_by` tracks which admin/manager performed the removal (audit trail)
- Removed users are excluded from `getAllUsers()` queries
- Removed users cannot log in (auth service checks `deleted_at`)
- User data is preserved for audit purposes
- Removed users can be re-invited (creates a new user record)

**Role Contract Notes (2026-03):**
- Expanded operational roles now include:
  - `cashier` (POS-first transactional operations)
  - `po` (purchase order operations)
  - `do` (dispatch order operations)
  - `jo` (job order operations)
- Role assignment defaults are enforced by backend permission maps (`DEFAULT_ROLE_PERMISSIONS`).

### 2. Item Folders Table

```sql
CREATE TABLE item_folders (
    folder_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    show_in_pos_filter BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_item_folders_name (name),
    INDEX idx_item_folders_show_in_pos_filter (show_in_pos_filter)
);
```

**Folder Visibility Contract (2026-03-30 update):**
- `show_in_pos_filter = TRUE`: folder is available as POS category filter.
- `show_in_pos_filter = FALSE`: folder is hidden from POS category filters.
- Item sellability is still controlled by POS catalog override `pos_visible` at item level.

### 3. Items (SKU Master) Table

```sql
CREATE TABLE items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    sku_code VARCHAR(50) NULL,
    active_sku_code VARCHAR(50)
      GENERATED ALWAYS AS (
        CASE
          WHEN deleted_at IS NULL
            AND status NOT IN ('draft', 'inactive')
            AND sku_code IS NOT NULL
            AND TRIM(sku_code) <> ''
          THEN UPPER(TRIM(sku_code))
          ELSE NULL
        END
      ) STORED,
    name VARCHAR(255) NOT NULL,
    category ENUM('raw_material', 'packaging', 'product', 'supplies', 'service') NOT NULL,
    product_type ENUM('work_in_progress', 'finished_goods') NULL,
    mode_item_preset VARCHAR(64) NULL,
    product_folder VARCHAR(100),
    folder_id INT NULL,
    description TEXT,
    current_stock DECIMAL(12, 2) DEFAULT 0,
    max_capacity DECIMAL(12, 2) NULL,
    min_threshold DECIMAL(12, 2),
    purchase_allowance DECIMAL(12, 2),
    unit_of_measure VARCHAR(50) NULL,  -- See UOM Standards below
    cost_per_unit DECIMAL(10, 4),
    default_sale_price DECIMAL(10, 4) NULL,
    fifo_enabled BOOLEAN DEFAULT TRUE,
    shelf_life_days INT NULL,
    opened_shelf_life_days INT NULL,
    batch_size DECIMAL(12, 2),
    yield_percentage DECIMAL(5, 2),
    processing_loss DECIMAL(5, 2),
    production_notes TEXT,
    packaging_specs JSON NULL,
    status ENUM('draft', 'active', 'inactive') DEFAULT 'active',
    deleted_by INT NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_sku_code (sku_code),
    INDEX idx_category (category),
    INDEX idx_folder_id (folder_id),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_status (status),
    UNIQUE KEY uq_items_active_sku_code (active_sku_code),
    CONSTRAINT fk_items_folder FOREIGN KEY (folder_id) REFERENCES item_folders(folder_id),
    CONSTRAINT fk_items_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);
```

**Current Implementation Note (2026-05):**
- `items.vat_type` is implemented as `ENUM('vatable','vat_exempt','zero_rated')` with default `vatable`.
- POS uses this as the default tax classification source, then snapshots it at transaction-line level.
- `items.category` includes `service` for Services Mode item-backed catalog rows. Service-only rows are stock-exempt; physical products, add-ons, consumables, and supplies remain stock-bearing.
- `items.mode_item_preset` stores the corrected workflow-mode preset key when a row was created or intentionally recategorized through a governed mode taxonomy. It is nullable for legacy rows. F&B uses it to distinguish `menu_item` from `packaged_beverage` when both share `category='product'` and `product_type='finished_goods'`.

**SKU Uniqueness Contract (2026-04-18):**
- Runtime and DB both enforce case/whitespace-normalized uniqueness for active SKUs.
- `active_sku_code` is generated from `UPPER(TRIM(sku_code))` only for non-deleted and non-`draft`/`inactive` rows.
- The unique key `uq_items_active_sku_code` allows draft/inactive/archive flows without blocking active catalog uniqueness.

**Soft Delete Notes (Items):**
- Soft delete writes `status = 'inactive'`, `deleted_at`, and `deleted_by`.
- Default reads and mutations treat soft-deleted items as not found.
- Visibility is enforced in services, not via model-level paranoid behavior.

**Folder Filtering Canonical Path (2026-03-03 update):**
- Query filtering must use `items.folder_id` (indexed) instead of the legacy `items.product_folder` string.
- `product_folder` remains for compatibility/export metadata only and is not the performance path.
- `mode_item_preset` is indexed by `idx_items_mode_item_preset` for mode-native preset filtering and import/reporting checks.
- CSV export filtering was updated to resolve folder name via `item_folders.name` (indexed) then filter by `items.folder_id`.

#### UOM (Unit of Measure) Standards

The `unit_of_measure` field uses standardized abbreviations organized into convertible inventory groups and non-convertible business groups. Only weight, volume, and count units are **automatically convertible** for job order, recipe, and inventory calculations.

| Group | UOM Code | Display Name | Conversion Factor |
|-------|----------|--------------|-------------------|
| **Weight** | mg | Milligram | 0.001 g |
| | g | Gram | 1 (base) |
| | kg | Kilogram | 1000 g |
| | lb | Pound | 453.592 g |
| | oz | Ounce | 28.3495 g |
| **Volume** | mL | Milliliter | 1 (base) |
| | L | Liter | 1000 mL |
| | gal | Gallon | 3785.41 mL |
| | cup | Cup | 236.588 mL |
| | tbsp | Tablespoon | 14.787 mL |
| | tsp | Teaspoon | 4.929 mL |
| **Count** | pcs | Pieces | 1 (base) |
| | units | Units | 1 (equivalent to pcs) |
| | dozen | Dozen | 12 pcs |
| **Packaging** | pack | Pack | valid, not auto-convertible |
| | case | Case | valid, not auto-convertible |
| | carton | Carton | valid, not auto-convertible |
| | box | Box | valid, not auto-convertible |
| | tray | Tray | valid, not auto-convertible |
| | sack | Sack | valid, not auto-convertible |
| | bottle | Bottle | valid, not auto-convertible |
| | can | Can | valid, not auto-convertible |
| | pouch | Pouch | valid, not auto-convertible |
| | bag | Bag | valid, not auto-convertible |
| **Presentation** | serving | Serving | valid, not auto-convertible |
| | portion | Portion | valid, not auto-convertible |
| | service | Service | valid, not auto-convertible |
| | session | Session | valid, not auto-convertible |
| | booking | Booking | valid, not auto-convertible |
| | ticket | Ticket | valid, not auto-convertible |
| | room_night | Room night | valid, not auto-convertible |
| **Time** | minute | Minute | valid, not auto-convertible |
| | hour | Hour | valid, not auto-convertible |
| | day | Day | valid, not auto-convertible |

**Conversion Rules:**
- Only weight, volume, and count are convertible groups.
- Units within the same group convert automatically (e.g., kg ↔ g, L ↔ mL)
- Units in different groups are **incompatible** (e.g., kg ↔ L = error)
- `pcs` and `units` are treated as equivalent (1:1)
- Packaging, presentation, and time units are valid for item display, menu/service sales, ticketing, and supplier packaging, but they do not convert automatically. For example, `serving` cannot become `kg`, and `case` cannot become `pcs`, unless a future item/vendor conversion table explicitly defines that relationship.
- Legacy values (e.g., "Kilogram", "liters") are normalized via migration script

**Mode-Aware Item Taxonomy (2026-05-06):**
- Food Manufacturing uses Raw Material/Ingredient (`raw_material`), Packaging (`packaging`), Supplies (`supplies`), and Finished Product (`product` + `finished_goods`).
- MSME uses Products (`product` + `finished_goods`) and Supplies (`supplies`), preserving legacy raw/packaging records without destructive recategorization.
- Services uses Service (`service`, stock-exempt), Physical Add-on/Product (`product` + `finished_goods`), and Supplies (`supplies`).
- Food & Beverage uses Menu Item (`product` + `finished_goods`, default `serving`), Ingredient (`raw_material`, default `kg`), Packaged Beverage/Retail Item (`product` + `finished_goods`, default `bottle`), and Packaging/To-go Supply (`packaging`, default `pcs`).
- New corrected-mode rows persist `mode_item_preset`; legacy rows without it remain readable through category/product/UOM inference until the operator selects a corrected preset.
- Retail, Hospitality, Healthcare, Ticketing & Transport, Logistics & Distribution, and Education & Institutions remain placeholder item-taxonomy modes until their own governed mode pass defines item presets and UOM rules.

### 4. FIFO Batches Table

```sql
CREATE TABLE fifo_batches (
    batch_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    location_id INT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    cost_per_unit DECIMAL(10, 4),
    received_date DATE NOT NULL,
    expiry_date DATE,
    po_number VARCHAR(50),
    notes TEXT,
    quantity_consumed DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    INDEX idx_item_id (item_id),
    INDEX idx_location_id (location_id),
    INDEX idx_item_location (item_id, location_id),
    INDEX idx_expiry_date (expiry_date),
    INDEX idx_received_date (received_date)
);
```

**Special Values:**
- `po_number = 'LEGACY-STOCK'`: Auto-created batch for legacy items that had `current_stock` but no FIFO batches. Created during JO completion when consumption is attempted on items without batches.

**Location Scope Note (2026-04-18):**
- FIFO batches are location-scoped when `location_id` is present.
- Batch reads for inventory operations can be filtered by `location_id` to preserve per-location FIFO depletion.

### Multi-Location Ledger Tables (2026-04-18)

```sql
CREATE TABLE tenant_locations (
    location_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    address_line TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    delivery_radius_km DECIMAL(5, 2) NOT NULL DEFAULT 5,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary_storefront BOOLEAN NOT NULL DEFAULT FALSE,
    operating_hours JSON NULL,
    current_wait_time_minutes INT NOT NULL DEFAULT 15,
    allow_out_of_stock_sales BOOLEAN NOT NULL DEFAULT FALSE,
    supports_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    supports_pickup BOOLEAN NOT NULL DEFAULT TRUE,
    supports_dine_in BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_is_active (is_active),
    INDEX idx_is_open (is_open),
    INDEX idx_primary_active (is_primary_storefront, is_active),
    INDEX idx_lat_lng (latitude, longitude)
);

CREATE TABLE item_location_stocks (
    item_location_stock_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    location_id INT NOT NULL,
    quantity_on_hand DECIMAL(24, 12) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_location_stock (item_id, location_id),
    INDEX idx_item_id (item_id),
    INDEX idx_location_id (location_id)
);

CREATE TABLE user_location_grants (
    user_location_grant_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    location_id INT NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_location_grant (user_id, location_id),
    INDEX idx_user_id (user_id),
    INDEX idx_location_id (location_id)
);
```

### 5. Item Nutrition Table

```sql
CREATE TABLE item_nutrition (
    nutrition_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL UNIQUE,
    serving_size VARCHAR(50),
    calories DECIMAL(8, 2),
    total_fat DECIMAL(8, 2),
    saturated_fat DECIMAL(8, 2),
    cholesterol DECIMAL(8, 2),
    sodium DECIMAL(8, 2),
    total_carbohydrates DECIMAL(8, 2),
    dietary_fiber DECIMAL(8, 2),
    sugars DECIMAL(8, 2),
    protein DECIMAL(8, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id)
);
```

### 6. Item Allergens Table

```sql
CREATE TABLE item_allergens (
    allergen_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    allergen_name VARCHAR(100) NOT NULL,
    is_cross_contamination BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id),
    UNIQUE KEY unique_allergen (item_id, allergen_name)
);
```

### 7. Product Composition Table

```sql
CREATE TABLE product_composition (
    composition_id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity_required DECIMAL(12, 2) NOT NULL,
    unit_of_measure VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES items(item_id) ON DELETE RESTRICT,
    INDEX idx_product_id (product_id),
    INDEX idx_ingredient_id (ingredient_id)
);
```

### 8. Suppliers Table

```sql
CREATE TABLE suppliers (
    supplier_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    quality_rating DECIMAL(3, 2),
    avg_delivery_days INT,
    status ENUM('draft', 'active', 'inactive') DEFAULT 'active',
    last_delivery_date DATE,
    notes TEXT,
    deleted_by INT NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_deleted_at (deleted_at),
    CONSTRAINT fk_suppliers_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);
```

**Soft Delete Notes (Suppliers):**
- Soft delete writes `status = 'inactive'`, `deleted_at`, and `deleted_by`.
- Default list/detail/mutation behavior excludes soft-deleted suppliers.

### 9. Supplier Items Table

```sql
CREATE TABLE supplier_items (
    supplier_item_id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    item_id INT NOT NULL,
    moq DECIMAL(12, 2),
    price_per_unit DECIMAL(10, 4),
    last_price_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_item_id (item_id),
    UNIQUE KEY unique_supplier_item (supplier_id, item_id)
);
```

### 10. Bulk Discounts Table

```sql
CREATE TABLE bulk_discounts (
    discount_id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    min_quantity DECIMAL(12, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    INDEX idx_supplier_id (supplier_id)
);
```

### 11. Purchase Orders Table

```sql
CREATE TABLE purchase_orders (
    po_id INT PRIMARY KEY AUTO_INCREMENT,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INT NOT NULL,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    received_date DATE,
    status ENUM('pending', 'partial', 'received', 'cancelled') DEFAULT 'pending',
    subtotal DECIMAL(12, 2),
    discount DECIMAL(12, 2),
    total_amount DECIMAL(12, 2),
    delivery_rating DECIMAL(3, 2),
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_po_number (po_number),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_status (status),
    INDEX idx_order_date (order_date)
);
```

### 12. PO Line Items Table

```sql
CREATE TABLE po_line_items (
    line_item_id INT PRIMARY KEY AUTO_INCREMENT,
    po_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity_ordered DECIMAL(12, 2) NOT NULL,
    quantity_received DECIMAL(12, 2) DEFAULT 0,
    unit_price DECIMAL(10, 4) NOT NULL,
    total_price DECIMAL(12, 2),
    quality_check_status ENUM('pending', 'passed', 'failed') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    INDEX idx_po_id (po_id),
    INDEX idx_item_id (item_id)
);
```

### 13. Job Orders Table

```sql
CREATE TABLE job_orders (
    jo_id INT PRIMARY KEY AUTO_INCREMENT,
    jo_number VARCHAR(50) UNIQUE NULL,
    product_id INT NOT NULL,
    quantity_to_produce DECIMAL(24, 12) NOT NULL,
    status ENUM('draft', 'in_progress', 'partial', 'completed', 'cancelled') DEFAULT 'draft',
    quantity_produced DECIMAL(24, 12) NOT NULL DEFAULT 0,
    quality_check ENUM('pass', 'fail', 'pending') NULL,
    completed_by INT NULL,
    archived_by INT NULL,
    archived_at TIMESTAMP NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completion_date TIMESTAMP NULL,
    responsible_user INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES items(item_id),
    FOREIGN KEY (responsible_user) REFERENCES users(user_id),
    INDEX idx_jo_number (jo_number),
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_created_date (created_date)
);
```

**Status Lifecycle:**
- `draft` → JO created but not finalized (no JO number assigned)
- `in_progress` → JO finalized and ready for production
- `partial` → Production partially completed (quantity_produced < quantity_to_produce)
- `completed` → Production fully completed
- `cancelled` → JO cancelled

**Partial Completion Support:**
- `quantity_produced` tracks how much has been produced so far
- Multiple completion operations can be performed until `quantity_produced = quantity_to_produce`
- Each partial completion consumes proportional ingredients

**Alignment Note (2026-04-07):**
- `20260407000004-align-job-orders-schema-with-model.cjs` adds missing `quality_check` and aligns `quantity_produced` precision with the runtime model contract.

### 14. JO Ingredients Table

```sql
CREATE TABLE jo_ingredients (
    jo_ingredient_id INT PRIMARY KEY AUTO_INCREMENT,
    jo_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity_required DECIMAL(12, 2) NOT NULL,
    unit_of_measure VARCHAR(20),          -- Recipe UOM (may differ from item's stock UOM)
    quantity_consumed DECIMAL(12, 2),
    stock_before DECIMAL(12, 2),
    stock_after DECIMAL(12, 2),
    batch_id INT NULL,                    -- Primary FIFO batch used for consumption
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (jo_id) REFERENCES job_orders(jo_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (batch_id) REFERENCES fifo_batches(batch_id),
    INDEX idx_jo_id (jo_id),
    INDEX idx_item_id (item_id)
);
```

### 15. Stock Movements Table

```sql
CREATE TABLE stock_movements (
    movement_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    location_id INT NULL,
    source_location_id INT NULL,
    destination_location_id INT NULL,
    movement_type ENUM('production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss', 'adjustment', 'production_output', 'goods_issue') NOT NULL,
    quantity DECIMAL(24, 12) NOT NULL,
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    reference_id VARCHAR(50),
    reference_type ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS') DEFAULT 'MANUAL',
    user_responsible INT,
    notes TEXT,
    loss_reason ENUM('waste', 'spoilage', 'damage', 'pilferage', NULL) NULL,
    weighted_average_cost DECIMAL(10, 4),
    batch_id INT NULL,
    expiry_date DATE NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    FOREIGN KEY (source_location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    FOREIGN KEY (destination_location_id) REFERENCES tenant_locations(location_id) ON DELETE SET NULL,
    FOREIGN KEY (user_responsible) REFERENCES users(user_id),
    INDEX idx_item_id (item_id),
    INDEX idx_location_id (location_id),
    INDEX idx_source_location_id (source_location_id),
    INDEX idx_destination_location_id (destination_location_id),
    INDEX idx_movement_type (movement_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_reference_id (reference_id),
    INDEX idx_item_type_timestamp (item_id, movement_type, timestamp)
);
```

**Current Implementation Note (2026-05-07):**
- Runtime movement usage includes `goods_issue` for outbound sales/dispatch.
- `reference_type` includes `POS` and `DO` in addition to legacy reference types.
- Transfer movements require `source_location_id` and `destination_location_id` with different values.
- Non-transfer movements use `location_id` for location-scoped stock and FIFO handling.
- Pure service rows (`items.category = service` or `items.mode_item_preset = service`) are stock-exempt and must not create manual stock movement, transfer, FIFO, weighted-cost, or inventory-valuation rows. Physical service add-ons/products and supplies remain normal stock-bearing inventory rows.

### 16. Batch Transactions Table

```sql
CREATE TABLE batch_transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    movement_id INT NOT NULL,
    batch_id INT NOT NULL,
    quantity_consumed DECIMAL(12, 2) NOT NULL,
    remaining_after DECIMAL(12, 2),
    cost_per_unit DECIMAL(10, 4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (movement_id) REFERENCES stock_movements(movement_id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES fifo_batches(batch_id),
    INDEX idx_movement_id (movement_id),
    INDEX idx_batch_id (batch_id)
);
```

### 17. Audit Logs Table

```sql
CREATE TABLE audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    action ENUM('CREATE', 'UPDATE', 'DELETE', 'VIEW') NOT NULL,
    changes JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_entity_type (entity_type),
    INDEX idx_timestamp (timestamp)
);
```

### 18. System Settings Table

```sql
CREATE TABLE system_settings (
    setting_id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    data_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_setting_key (setting_key)
);
```

**Current Implementation Note (2026-03):**
- POS receipt/compliance settings are stored tenant-locally in this table:
  - `pos_business_name`
  - `pos_tin_branch`
  - `pos_address`
  - `pos_ptu_number`
  - `pos_min_number`
  - `pos_accreditation_number`
  - `pos_software_name` (platform-admin managed; not tenant-admin editable)
  - `pos_software_version` (platform-admin managed; not tenant-admin editable)
  - `pos_software_serial_number` (platform-admin managed; not tenant-admin editable)
  - `pos_receipt_footer_message`
  - `pos_receipt_metadata_pending_changes` (JSON review payload for tenant-submitted receipt metadata edits awaiting platform-admin approval)
  - `pos_discount_profiles` (JSON array with named percentage presets)
  - `pos_order_method_fees` (deprecated, retained only for historical compatibility; no runtime pricing effect)
  - `pos_petty_cash_symbol` (string, e.g. `PHP`)
  - `pos_petty_cash_amount` (number, operational float for reconciliation)
- Compliance lifecycle is tenant-level (`tenants.compliance_mode_state`, `tenants.compliance_mode_choice_required`, `tenants.compliance_profile`) and no longer driven by a strict-toggle setting.
- Tenant admins submit receipt identity edits for platform-admin approval. Platform admins own DGFY POS software name, software version, and software serial number through `/admin/tenants/:id/pos-metadata`; approved tenant edits are applied back into tenant-local `system_settings`.

- POS discount and service-fee audit snapshots are stored in `pos_transactions`:
  - `discount_label_snapshot` (string, nullable)
  - `discount_rate_snapshot` (`DECIMAL(7,4)`, nullable, supports `0.0000` to `100.0000`)
  - `service_fee_amount` (decimal, default 0)
  - `service_fee_label_snapshot` (string, nullable)
  - `service_fee_method_snapshot` (enum `dine_in|takeout|pickup|delivery`, nullable; legacy `online` remains read-compatible for historical data)
  - `service_fee_overridden` (boolean, default false)
  - `payment_status` (enum `unpaid|payment_pending|paid|failed|refund_pending|partial_refunded|refunded`, default `paid`)
  - `payment_reference` (provider payment/reference ID, nullable)
  - `payment_checkout_url` (provider checkout URL, nullable)
  - `payment_provider` (provider key such as `paymongo`, nullable)
  - `payment_session_reference` (commerce payment session public reference, nullable)
  - `payment_status` supports `refund_pending`, `partial_refunded`, and `refunded` for PayMongo commerce refund reconciliation.

## Commerce Payment Sessions Addendum (2026-05-19)

Landlord-level payment routing tables support PayMongo QR Ph Storefront payments without coupling provider webhooks to tenant-local lookups:

- `tenant_payment_accounts`: one row per UUID tenant/provider with PayMongo child merchant ID, wallet ID, wallet status (`unknown`, `closed_loop`, `enabled`, `restricted`), wallet verification timestamp, onboarding status, QR Ph readiness, split readiness, charge readiness, requirements snapshot, readiness evidence metadata, fee-contract metadata, and last sync time.
- `commerce_payment_sessions`: one row per Storefront online payment attempt with UUID `tenant_id`, immutable checkout payload, DGFY fee snapshot, `fee_policy` snapshot (`dgfy_fee_basis=subtotal`, `dgfy_fee_charged_to=customer`, `provider_fee_shoulder=tenant_company`), total amount in pesos and centavos, PayMongo Payment Intent/Payment Method/Payment IDs, QR image URL, expiration, webhook state, split payload, final `pos_transaction_id`, and manual-resolution failure fields.
- `commerce_payment_refunds`: one row per PayMongo refund attempt with UUID `tenant_id`, public refund reference, linked commerce session, provider payment/refund IDs, amount in centavos, reason, notes, refund strategy, split-refund payload, provider payload, status, failure fields, and requester.
- Admin settlement reporting is derived from `commerce_payment_sessions` plus `commerce_payment_refunds`; it is a reconciliation view over stored local payment evidence, not a PayMongo payout ledger.
- ADR 0040 adds the landlord-owned tenant financial ledger: `tenant_revenue_fee_policies`, `tenant_revenue_transactions`, `tenant_revenue_ledger_entries`, `tenant_settlement_batches`, `tenant_settlement_batch_items`, `tenant_settlement_batch_ledger_items`, `tenant_payouts`, `tenant_revenue_adjustments`, and `tenant_revenue_reconciliation_records`. Amounts are integer centavos. Fee versions and ledger entries are append-only; later paid-transaction corrections are allocated once to a future settlement through `tenant_settlement_batch_ledger_items`.

### 19. POS Catalog Overrides Table

```sql
CREATE TABLE pos_catalog_overrides (
    pos_catalog_override_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL UNIQUE,
    pos_visible BOOLEAN NOT NULL DEFAULT TRUE,
    pos_image_path VARCHAR(500) NULL,
    pos_image_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_item_id (item_id)
);
```

**Current Implementation Note (2026-03):**
- This table is tenant-local and optional-per-item.
- POS catalog read behavior:
  1. Base eligibility from `items` (active status/visibility constraints; all categories supported).
  2. Apply override if row exists:
     - `pos_visible=false` hides item from POS catalog.
     - `pos_image_url` provides terminal/in-house POS image override.
- Missing override row means category-aware default behavior (no image override):
  - `product + finished_goods` => visible
  - other categories/types => hidden until explicitly enabled

### 20. Storefront Catalog Overrides Table

```sql
CREATE TABLE storefront_catalog_overrides (
    storefront_catalog_override_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL UNIQUE,
    storefront_visible BOOLEAN NOT NULL DEFAULT TRUE,
    storefront_image_path VARCHAR(500) NULL,
    storefront_image_url VARCHAR(500) NULL,
    storefront_image_gallery JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_item_id (item_id)
);
```

**Current Implementation Note (2026-06):**
- This table is tenant-local and optional per item.
- `storefront_visible` controls customer-facing Storefront catalog membership independently from POS visibility.
- `storefront_image_url` is the backward-compatible primary item image.
- `storefront_image_gallery` stores the ordered customer-facing gallery; the first entry is primary and is mirrored to `storefront_image_url`.
- POS-derived image data is a rollout fallback only when this table is unavailable.

### 21. POS Terminal Shifts Table

```sql
CREATE TABLE pos_terminal_shifts (
    pos_terminal_shift_id INT PRIMARY KEY AUTO_INCREMENT,
    terminal_id VARCHAR(100) NOT NULL,
    opened_by INT NOT NULL,
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    opening_float_amount DECIMAL(14, 4) NOT NULL DEFAULT 0,
    opening_note TEXT NULL,
    closed_by INT NULL,
    closed_at TIMESTAMP NULL,
    closing_cash_amount DECIMAL(14, 4) NULL,
    closing_note TEXT NULL,
    expected_cash_amount DECIMAL(14, 4) NULL,
    variance_amount DECIMAL(14, 4) NULL,
    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    business_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (opened_by) REFERENCES users(user_id),
    FOREIGN KEY (closed_by) REFERENCES users(user_id),
    INDEX idx_terminal_id (terminal_id),
    INDEX idx_status (status),
    INDEX idx_business_date (business_date)
);
```

**Current Implementation Note (2026-03):**
- Tracks cashier/session accountability for isolated terminal workflows.
- Checkout flow can require an active open shift before allowing POS transactions.

### 22. POS Cash Drawer Events Table

```sql
CREATE TABLE pos_cash_drawer_events (
    pos_cash_drawer_event_id INT PRIMARY KEY AUTO_INCREMENT,
    pos_terminal_shift_id INT NOT NULL,
    event_type ENUM('cash_in', 'cash_out') NOT NULL,
    amount DECIMAL(14, 4) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    recorded_by INT NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pos_terminal_shift_id) REFERENCES pos_terminal_shifts(pos_terminal_shift_id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(user_id),
    INDEX idx_shift_id (pos_terminal_shift_id),
    INDEX idx_recorded_at (recorded_at)
);
```

**Current Implementation Note (2026-03):**
- Used for shift-level cash-in/cash-out adjustments.
- Included in terminal cash summary and variance calculations.

---

## Key Indexes & Performance Optimization

### Primary Indexes
- All tables have primary keys for unique identification
- Foreign keys are indexed for join performance
- Frequently queried columns are indexed

### Runtime/CI Index Guard (2026-03-03)
- Backend enforces a required index contract for:
  - `items`: `sku_code`, `category`, `folder_id`, `deleted_at`, `status`
  - `stock_movements`: `item_id`, `batch_id`, `movement_type`, `timestamp`, `(item_id,movement_type,timestamp)`
  - `job_orders`: `product_id`, `status`
  - `jo_ingredients`: `item_id`, `batch_id`
- CI command: `npm run audit:indexes` (fails build on missing required indexes).
- Runtime guard: `/health` includes `services.schemaIndexes`; health becomes `503` when audit is degraded.
- Audit cadence/config:
  - `SCHEMA_INDEX_AUDIT_ENABLED`
  - `SCHEMA_INDEX_AUDIT_INTERVAL_MINUTES` (default `360`)
  - `SCHEMA_INDEX_AUDIT_TIMEOUT_MS` (default `5000`)

### Composite Indexes (for optimization)
```sql
-- For finding items by category and stock level
CREATE INDEX idx_category_stock ON items(category, current_stock);

-- For finding movements by item and date range
CREATE INDEX idx_item_timestamp ON stock_movements(item_id, timestamp);

-- For PO status tracking
CREATE INDEX idx_po_status_date ON purchase_orders(status, order_date);

-- For JO tracking
CREATE INDEX idx_jo_status_date ON job_orders(status, created_date);
```

---

## Data Integrity Constraints

### Referential Integrity
- All foreign keys enforce referential integrity
- Cascade delete for dependent records where appropriate
- Restrict delete for items referenced in compositions

### Business Rules
- Stock levels cannot go negative (enforced at application level)
- FIFO batches must have received_date before expiry_date
- Purchase order total must equal sum of line items
- Job order completion requires all ingredients to be available

### Unique Constraints
- SKU codes are globally unique
- PO numbers are unique
- JO numbers are unique
- Usernames and emails are unique

---

## Initial Data Setup

### Default System Settings
```sql
INSERT INTO system_settings (setting_key, setting_value, data_type, description) VALUES
('min_stock_threshold_percent', '40', 'number', 'Minimum stock as percentage of capacity'),
('purchase_allowance_percent', '20', 'number', 'Purchase allowance as percentage of capacity'),
('low_stock_alert_threshold', '30', 'number', 'Days before low stock alert'),
('forecast_days_ahead', '30', 'number', 'Number of days for forecasting'),
('currency', 'PHP', 'string', 'Default currency for financial tracking'),
('system_timezone', 'Asia/Manila', 'string', 'System timezone');
```

---

## Backup & Recovery Strategy

- Daily automated backups
- Point-in-time recovery capability
- Separate backup storage
- Regular backup integrity tests

---

## Migration Strategy

### Tenant Schema Safety

- Tenant schema report mode is read-only and is the only mode allowed in normal deployment checks.
- `repair-apply` changes every affected tenant database and requires `TENANT_SCHEMA_MUTATION_APPROVED=true` after backup and SQL review.
- `alter` is development-only and also requires `TENANT_SCHEMA_MUTATION_APPROVED=true`; it is blocked when `NODE_ENV=production`.
- New tenant databases use `sequelize.sync()` only while empty. Existing tenant upgrades must use reviewed additive migrations or an explicitly approved repair operation; do not rely on `sync({ alter: true })` in production.

### Phase 1: Schema Creation
- Create all tables with relationships
- Create indexes and constraints
- Create views for reporting

### Phase 2: Data Migration
- Migrate from frontend mock data to database
- Validate data integrity
- Create audit trail for initial data

### Phase 3: Optimization
- Monitor query performance
- Add additional indexes if needed
- Optimize slow queries

## Storefront Custom Domain Addendum (2026-07-23)

`storefront_custom_domains` is landlord-owned and maps one globally unique,
normalized hostname to a tenant. `canonical_tenant_id` is nullable and unique for
the tenant's canonical slot. `canonical_domain_id` links up to five alias rows to
that canonical row. Removal clears the canonical slot without deleting evidence.

Lifecycle status begins at `pending_dns` and may move through `verified`,
`provisioning`, `active`, `eligibility_grace`, `suspended`, `failed`, `removing`,
and `removed`. Active and unexpired eligibility-grace mappings participate in
host resolution. Eligibility, DNS drift, and controller results drive lifecycle
changes rather than arbitrary direct activation.

The verification secret is stored only as a SHA-256 hash plus a short non-secret
hint. DNS observations, safe errors, lifecycle timestamps, and the external
provisioning reference support operational proof without storing TLS material.
Additional evidence includes last DNS/health check times, TLS expiry, grace
deadline, safe failure code/message, and optimistic version.

`storefront_custom_domain_audit_logs` records tenant/domain IDs, action, actor,
reason, request ID, before/after snapshots, metadata, and timestamps.

`storefront_custom_domain_operations` is a landlord-owned durable controller work
queue. It stores domain/tenant IDs, operation type, unique idempotency key, status,
lease owner/expiry, bounded attempt counters, retry schedule, safe request/result
JSON, safe error details, and completion timestamps. Certificate and private-key
material are never stored.

The base tables are created by
`20260722000001-create-storefront-custom-domains.cjs`; canonical/alias lifecycle
columns and the operation queue are added by
`20260723000001-expand-storefront-custom-domain-lifecycle.cjs`.
