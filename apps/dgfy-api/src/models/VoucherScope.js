import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Which items or item folders a voucher applies to. A table rather than a JSON column because
// `fixed_price` requires scoping to be meaningful, and the catalog-display query has to answer
// "which items on this page carry a voucher price?" in SQL for a paginated list.
//
// `scope_ref_id` is polymorphic across items(item_id) and item_folders(folder_id) depending on
// `scope_type`, so it deliberately carries no foreign key -- the reference is validated in
// voucherRepository. A folder scope includes its descendants, resolved at redemption time and
// snapshotted into voucher_redemption_lines so a later folder move cannot retroactively change what
// a completed redemption meant (ADR 0066 decision 11).
const VoucherScope = sequelize.define('VoucherScope', {
  voucher_scope_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  voucher_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'vouchers', key: 'voucher_id' }
  },
  scope_type: {
    type: DataTypes.ENUM('item', 'item_folder'),
    allowNull: false
  },
  scope_ref_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'voucher_scopes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

export default VoucherScope;
