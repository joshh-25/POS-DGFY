import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Tenant-local voucher campaign. Governed by ADR 0066 (#455, epic #453).
//
// `redeemed_count` / `redeemed_value_centavos` / `redeemed_quantity` are a DERIVED CACHE of
// `voucher_redemptions`, not the source of truth (ADR 0066 decision 4). They exist so the three
// exhaustion limits can be enforced by one atomic conditional UPDATE at redemption time.
//
// Eligibility is bitmask-encoded rather than MySQL SET: `DataTypes.SET` does not exist in
// Sequelize 6.x, and `sequelize.sync()` over these models is how new tenants are provisioned. The
// property that matters is preserved -- NOT NULL with an explicit default, so "eligible everywhere"
// cannot be produced by omission (the #459 failure mode).
const Voucher = sequelize.define('Voucher', {
  voucher_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Uniqueness is declared in the `indexes` block below, not with `unique: true` here. Both produce
  // a unique key, but the attribute form makes Sequelize name it `code`, while the migration and the
  // tenant-repair registry both name it `uq_vouchers_code` -- and
  // inspectRequiredTenantSchemaIndexes matches by name, so the two forms are not interchangeable.
  code: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  voucher_kind: {
    type: DataTypes.ENUM('promo_code'),
    allowNull: false,
    defaultValue: 'promo_code'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  subtitle: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  badge: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  validity_text: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  benefit_class: {
    type: DataTypes.ENUM('percent_off', 'amount_off', 'fixed_price'),
    allowNull: false
  },
  percent_off_bps: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  amount_off_centavos: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  fixed_unit_price_centavos: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  max_discount_centavos: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  min_spend_centavos: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  min_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  allow_below_cost: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  // #696: a fixed_price voucher carries EITHER fixed_unit_price_centavos (one price, above) OR a
  // pricelist (N prices for N items), never both -- enforced in voucherUseCases.js's
  // applyBenefitConfig, not the schema. Nullable: most vouchers never attach one.
  pricelist_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'pricelists', key: 'pricelist_id' },
    // A pricelist in use by a voucher must not vanish out from under it.
    onDelete: 'RESTRICT'
  },
  stackable_with_statutory: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  valid_from: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  valid_until: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  valid_time_start: {
    type: DataTypes.STRING(5),
    allowNull: true
  },
  valid_time_end: {
    type: DataTypes.STRING(5),
    allowNull: true
  },
  weekday_mask: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 127
  },
  channels_mask: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 1
  },
  // #713: independent of channels_mask above. channels_mask controls where a code is USABLE
  // (storefront/POS); this controls whether the voucher is ADVERTISED on the public storefront
  // discovery page. A B2B pricelist voucher (#696) wants POS-usable and unadvertised -- the reverse
  // combination channels_mask alone can't express.
  is_publicly_listed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  fulfillment_methods_mask: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 3
  },
  order_timings_mask: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 3
  },
  max_redemptions: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_total_discount_centavos: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  max_benefit_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  redeemed_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  redeemed_value_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  redeemed_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Reserved, always empty in v1. ADR 0066 decision 9 -- a condition that must appear in a WHERE
  // clause belongs in a column, not here.
  conditions: {
    type: DataTypes.JSON,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'paused', 'expired', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  // Manual optimistic locking, same convention as EmployeeCreditAccount.version.
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'vouchers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // Mirrors the migration's addIndex calls one for one, by name. sequelize.sync() -- how
  // tenantProvisioningService.js provisions a NEW tenant -- creates only what the model declares, so
  // without this block a new tenant gets none of these.
  indexes: [
    { name: 'uq_vouchers_code', unique: true, fields: ['code'] },
    { name: 'idx_vouchers_status_validity', fields: ['status', 'valid_from', 'valid_until'] },
    { name: 'idx_vouchers_kind', fields: ['voucher_kind'] },
    { name: 'idx_vouchers_pricelist', fields: ['pricelist_id'] }
  ]
});

export default Voucher;
