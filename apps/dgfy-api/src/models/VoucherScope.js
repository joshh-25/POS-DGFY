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
    references: { model: 'vouchers', key: 'voucher_id' },
    // Sequelize emits no referential action unless it is declared here, so without this a new tenant
    // gets a bare FK and deleting a voucher with scopes errors instead of cascading.
    onDelete: 'CASCADE'
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
  updatedAt: false,
  // uq_voucher_scopes_voucher_type_ref is an integrity constraint, not a lookup index: without it
  // the same item can be scoped to one voucher twice. It is unreachable from the attribute-level
  // `unique` flag because it spans three columns.
  indexes: [
    {
      name: 'uq_voucher_scopes_voucher_type_ref',
      unique: true,
      fields: ['voucher_id', 'scope_type', 'scope_ref_id']
    },
    { name: 'idx_voucher_scopes_type_ref', fields: ['scope_type', 'scope_ref_id'] }
  ]
});

export default VoucherScope;
