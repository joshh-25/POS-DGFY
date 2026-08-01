// Tables/columns that check:tenant-schema-coverage should NOT require a
// apps/dgfy-api/scripts/sync-tenant-schemas.js registry entry for, even though
// they're tenant-scoped or unmapped to a model. Entries are either a bare
// table name (exempts the whole table) or `table.column` (exempts just that
// column). Add an entry here, with a reason, only when a migration's
// tenant-scoped change genuinely doesn't need tenant-DB propagation --
// don't use this to silence a real gap.
export const TENANT_SCHEMA_COVERAGE_EXEMPTIONS = Object.freeze([
  // Central financial-control records live only in the landlord database.
  // They reference tenants but must never be copied into tenant databases.
  'tenant_revenue_fee_policies',
  'tenant_revenue_transactions',
  'tenant_revenue_ledger_entries',
  'tenant_settlement_batches',
  'tenant_settlement_batch_items',
  'tenant_settlement_batch_ledger_items',
  'tenant_payouts',
  'tenant_revenue_adjustments',
  'tenant_revenue_reconciliation_records'
]);

export default TENANT_SCHEMA_COVERAGE_EXEMPTIONS;
