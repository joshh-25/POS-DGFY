import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// The redemption ledger -- the authoritative record of voucher usage (ADR 0066 decision 4).
// Append-only, so `updatedAt: false`, matching EmployeeCreditLedgerEntry.
//
// `idempotency_key` is NOT NULL UNIQUE and its row is inserted BEFORE the counter UPDATE, so a
// replayed checkout is rejected by the unique constraint rather than double-counting.
//
// The before/after counter snapshots mirror EmployeeCreditLedgerEntry's balance_before/after: they
// are what a periodic reconciler replays to prove vouchers.redeemed_* still agrees with this ledger.
const VoucherRedemption = sequelize.define('VoucherRedemption', {
  voucher_redemption_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  voucher_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'vouchers', key: 'voucher_id' }
  },
  entry_type: {
    type: DataTypes.ENUM('redemption', 'reversal', 'adjustment'),
    allowNull: false,
    defaultValue: 'redemption'
  },
  pos_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'pos_transactions', key: 'pos_transaction_id' },
    onDelete: 'SET NULL'
  },
  channel: {
    type: DataTypes.ENUM('storefront', 'pos'),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tenant_locations', key: 'location_id' },
    onDelete: 'SET NULL'
  },
  cashier_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'user_id' },
    onDelete: 'SET NULL'
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  store_customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'store_customers', key: 'customer_id' },
    onDelete: 'SET NULL'
  },
  // Landlord-side account pointer. Non-authoritative, no FK, and NULL for the whole POS half by
  // design -- #454 decision 6 makes POS redemption identity-free (re-verified 2026-09-03 for #788:
  // posUseCases.js still passes `storeCustomerId: null` and no account identity of any kind; ADR
  // 0066's 2026-08-20 amendment narrowed that decision only as far as a free-typed customer NAME).
  //
  // #788 (Phase 269): retyped INTEGER -> UUID. `DgfyAccount.id` is a UUID and always has been, so
  // the original INTEGER declaration could never have held a real account id -- MySQL would have
  // coerced the UUID string to 0 (or errored under strict mode). Latent rather than live: nothing
  // in this repo ever wrote this column, so every existing row is NULL and the retype is lossless.
  // Written for the first time by this phase, from the storefront's authenticated
  // `store_customers.dgfy_account_id` (itself a UUID).
  dgfy_account_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  code_snapshot: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  // The voucher as actually evaluated, so this row stays auditable after the voucher is edited.
  benefit_config_snapshot: {
    type: DataTypes.JSON,
    allowNull: false
  },
  subtotal_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  discount_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  benefit_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  redeemed_count_before: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  redeemed_count_after: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  redeemed_value_before_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  redeemed_value_after_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  redeemed_quantity_before: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  redeemed_quantity_after: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Named in the `indexes` block, not via `unique: true` -- see the note on Voucher.code for why the
  // two forms are not interchangeable.
  idempotency_key: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  reversal_of_redemption_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'voucher_redemptions', key: 'voucher_redemption_id' },
    onDelete: 'SET NULL'
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'voucher_redemptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  // Mirrors the migration's addIndex calls one for one, by name. The five FK-column indexes are
  // declared explicitly rather than left to MySQL's implicit FK index, so the name matches what
  // inspectRequiredTenantSchemaIndexes looks for.
  indexes: [
    { name: 'uq_voucher_redemptions_idempotency', unique: true, fields: ['idempotency_key'] },
    { name: 'idx_voucher_redemptions_voucher_created', fields: ['voucher_id', 'created_at'] },
    { name: 'idx_voucher_redemptions_transaction', fields: ['pos_transaction_id'] },
    { name: 'idx_voucher_redemptions_store_customer', fields: ['store_customer_id'] },
    { name: 'idx_voucher_redemptions_channel', fields: ['channel'] },
    { name: 'idx_voucher_redemptions_reversal_of', fields: ['reversal_of_redemption_id'] },
    { name: 'idx_voucher_redemptions_location', fields: ['location_id'] },
    { name: 'idx_voucher_redemptions_cashier', fields: ['cashier_user_id'] },
    // #788: answers "has this account already redeemed this voucher?" -- the per-customer read the
    // account-restriction feature makes meaningful for the first time, and the index #606
    // (per-customer limits) will need as-is when it lands.
    { name: 'idx_voucher_redemptions_account', fields: ['dgfy_account_id', 'voucher_id'] }
  ]
});

export default VoucherRedemption;
