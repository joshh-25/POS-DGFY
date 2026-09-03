import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// #788 (Phase 269): the allowlist of DGFY accounts permitted to redeem an account-restricted
// voucher. A child table rather than a JSON column, for the same reason `voucher_scopes` is one:
// the set is variable-length and has to be answerable in SQL (`WHERE voucher_id = ? AND
// dgfy_account_id = ?`), which ADR 0066 decision 9 requires of anything that participates in an
// eligibility decision. #454 decision 4 already anticipated this exact shape ("the schema is
// deliberately hedged so a `voucher_codes` child table can be added later without migrating the
// campaign table"); this is that child table, keyed on the account rather than on a per-recipient
// code.
//
// `dgfy_account_id` is a CHAR(36) UUID and deliberately carries NO foreign key: `dgfy_accounts`
// lives in the LANDLORD database while every `voucher*` table is tenant-scoped, so a real FK is
// not expressible across the connection boundary (ADR 0052). This mirrors the two pointers that
// already exist for the same reason -- `store_customers.dgfy_account_id` and
// `voucher_redemptions.dgfy_account_id` -- both of which are equally unconstrained.
//
// Existence of at least one row here IS the restriction; `vouchers.is_account_restricted` is the
// indexable gate derived from it, written in the same transaction by the same function
// (voucherUseCases.js), never by a client.
const VoucherAccountGrant = sequelize.define('VoucherAccountGrant', {
  voucher_account_grant_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  voucher_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'vouchers', key: 'voucher_id' },
    // Sequelize emits no referential action unless it is declared here -- same note as
    // VoucherScope.voucher_id, and the same consequence if omitted (a new tenant gets a bare FK and
    // deleting a voucher with grants errors instead of cascading).
    onDelete: 'CASCADE'
  },
  dgfy_account_id: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'voucher_account_grants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  // uq_voucher_account_grants_voucher_account is an integrity constraint, not a lookup index:
  // without it the same account can be granted the same voucher twice, and `replaceAccountGrants`'s
  // reconcile-don't-recreate logic would silently accumulate duplicates. Unreachable from the
  // attribute-level `unique` flag because it spans two columns.
  indexes: [
    {
      name: 'uq_voucher_account_grants_voucher_account',
      unique: true,
      fields: ['voucher_id', 'dgfy_account_id']
    },
    { name: 'idx_voucher_account_grants_account', fields: ['dgfy_account_id'] }
  ]
});

export default VoucherAccountGrant;
