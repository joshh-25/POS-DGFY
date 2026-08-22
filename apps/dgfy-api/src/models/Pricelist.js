import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Tenant-local wholesale pricelist (#696, extends #584/ADR 0066). A `fixed_price` voucher attaches
// one of these instead of a single `fixed_unit_price_centavos` when it needs N prices for N items
// rather than one price for the whole scope.
//
// `draft_of_pricelist_id` implements #698's draft-revision -> publish cycle: a non-null value marks
// this row as the open draft of the referenced published pricelist. Publish swaps `pricelist_items`
// from the draft into the published row inside one transaction, then deletes the draft row -- the
// published row's own `pricelist_id` never changes, so `vouchers.pricelist_id` is never rewritten
// and a buyer mid-checkout never sees prices shift.
const Pricelist = sequelize.define('Pricelist', {
  pricelist_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  draft_of_pricelist_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'pricelists', key: 'pricelist_id' },
    // Sequelize emits no referential action unless declared here, so without this a new tenant gets
    // a bare FK and deleting a published pricelist with an open draft errors instead of cascading.
    onDelete: 'CASCADE'
  },
  // Manual optimistic locking, same convention as Voucher.version.
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'pricelists',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // Mirrors the migration's addIndex calls one for one, by name. sequelize.sync() -- how
  // tenantProvisioningService.js provisions a NEW tenant -- creates only what the model declares,
  // so without this block a new tenant gets none of these.
  indexes: [
    { name: 'idx_pricelists_status', fields: ['status'] },
    { name: 'uq_pricelists_draft_of', unique: true, fields: ['draft_of_pricelist_id'] }
  ]
});

export default Pricelist;
