import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Per-item allocation of a voucher redemption. Append-only.
//
// This partially duplicates pos_transaction_discount_lines, deliberately: that pair stays
// authoritative for receipts (ADR 0033 Decision 10) and is still written on every redemption, while
// these rows are the campaign-analytics artifact and carry the base-price snapshot the POS pair
// does not.
//
// Both `base_unit_price_centavos` and `voucher_unit_price_centavos` are stored because
// Item.default_sale_price is auto-updated by Dispatch Order dispatches -- so `base` moves, and
// without the snapshot "what did this campaign cost us" becomes unanswerable after the first
// dispatch.
const VoucherRedemptionLine = sequelize.define('VoucherRedemptionLine', {
  voucher_redemption_line_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  voucher_redemption_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'voucher_redemptions', key: 'voucher_redemption_id' },
    onDelete: 'CASCADE'
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'items', key: 'item_id' }
  },
  // decimal(24,12) matches pos_transaction_discount_lines.eligible_quantity.
  quantity: {
    type: DataTypes.DECIMAL(24, 12),
    allowNull: false,
    defaultValue: 0
  },
  base_unit_price_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  voucher_unit_price_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  },
  discount_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'voucher_redemption_lines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_voucher_redemption_lines_redemption', fields: ['voucher_redemption_id'] },
    { name: 'idx_voucher_redemption_lines_item', fields: ['item_id'] }
  ]
});

export default VoucherRedemptionLine;
