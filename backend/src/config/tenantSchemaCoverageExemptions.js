// Tables/columns that check:tenant-schema-coverage should NOT require a
// backend/scripts/sync-tenant-schemas.js registry entry for, even though
// they're tenant-scoped or unmapped to a model. Entries are either a bare
// table name (exempts the whole table) or `table.column` (exempts just that
// column). Add an entry here, with a reason, only when a migration's
// tenant-scoped change genuinely doesn't need tenant-DB propagation --
// don't use this to silence a real gap.
export const TENANT_SCHEMA_COVERAGE_EXEMPTIONS = Object.freeze([]);

export default TENANT_SCHEMA_COVERAGE_EXEMPTIONS;
