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
    references: { model: 'pos_transactions', key: 'pos_transaction_id' }
  },
  channel: {
    type: DataTypes.ENUM('storefront', 'pos'),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tenant_locations', key: 'location_id' }
  },
  cashier_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'user_id' }
  },
  terminal_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  store_customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'store_customers', key: 'customer_id' }
  },
  // Landlord-side account pointer. Non-authoritative, no FK, and NULL for the whole POS half by
  // design -- #454 decision 6 makes POS redemption identity-free.
  dgfy_account_id: {
    type: DataTypes.INTEGER,
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
  idempotency_key: {
    type: DataTypes.STRING(160),
    allowNull: false,
    unique: true
  },
  reversal_of_redemption_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'voucher_redemptions', key: 'voucher_redemption_id' }
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
  updatedAt: false
});

export default VoucherRedemption;
