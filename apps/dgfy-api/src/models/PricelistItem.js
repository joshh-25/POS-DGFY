import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// One per-item price row within a Pricelist (#696). Intent, not a delta -- same reasoning as
// Voucher.fixed_unit_price_centavos (ADR 0066 decision 5): Item.default_sale_price moves with
// Dispatch Order dispatches, so a stored delta would silently drift.
//
// `is_manual_override` distinguishes a deliberately-typed price from #698's SRP prefill. Load-
// bearing, not bookkeeping: without it there is no way to tell an untouched row (which drifts as
// Item.default_sale_price moves) from one the merchant actually priced -- the only thing that makes
// the SRP-prefill's staleness hazard mitigable.
const PricelistItem = sequelize.define('PricelistItem', {
  pricelist_item_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  pricelist_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'pricelists', key: 'pricelist_id' },
    // Sequelize emits no referential action unless declared here, so without this a new tenant
    // gets a bare FK and deleting a pricelist with rows errors instead of cascading.
    onDelete: 'CASCADE'
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'items', key: 'item_id' }
    // No onDelete override -- RESTRICT (the DB default and the migration's explicit choice) matches
    // voucher_redemption_lines.item_id's own precedent: an item with pricing history should not be
    // deletable out from under it.
  },
  unit_price_centavos: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  is_manual_override: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'pricelist_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'uq_pricelist_items_pricelist_item', unique: true, fields: ['pricelist_id', 'item_id'] },
    { name: 'idx_pricelist_items_item', fields: ['item_id'] }
  ]
});

export default PricelistItem;
