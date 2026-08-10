// Landlord-DB-only (issue #316). Folds the Phase 39 visibility store
// (registration_industry_visibility / _audit_logs) into the new
// registration_industries catalog table: `hidden` becomes a column on the
// catalog row instead of a separate row's mere existence. This is a
// data-copy step only - it does NOT drop the Phase 39 tables. Every
// consumer (public read, registration write path, admin API) cuts over
// to the new table across the following phases; the old tables are
// retired only once nothing reads them (migration 20260812000004), so an
// in-flight deploy stays runtime-coherent at every commit in between.
//
// Safe to run against an environment that never had the Phase 39 tables
// (a fresh install skips both loops below) and safe to re-run (the fold
// re-applies hidden/reason/updated_by idempotently; the audit copy is
// skipped once any hidden/unhidden row already exists in the destination
// table, since a real admin hide/unhide after the first run would also
// look like this migration's own copy is "already applied").
//
// The audit copy re-encodes before_snapshot/after_snapshot via
// toJsonColumnValue() before bulkInsert - see that helper's comment. An
// environment with at least one real hidden/unhidden audit row (i.e. any
// deploy that has seen admin activity on the Phase 39 store) hits this
// path; a fresh DB with zero legacy audit rows skips it via the
// auditRows.length guard.

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
};

// before_snapshot/after_snapshot are Sequelize.JSON columns. The rows read
// here come from a raw SELECT, so mysql2 has already deserialized them into
// plain JS objects - and queryInterface.bulkInsert() has no attribute-type
// metadata to re-encode them, so handing an object straight through makes
// Sequelize's SqlString.escape() throw ("Invalid value {...}"). Re-stringify
// here; pass a value through untouched if it's already a string, so this can
// never double-encode (e.g. under a driver/config that returns JSON columns
// as raw strings).
const toJsonColumnValue = (value) => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
};

module.exports = {
    async up(queryInterface) {
        const hasVisibilityTable = await tableExists(queryInterface, 'registration_industry_visibility');
        const hasCatalogTable = await tableExists(queryInterface, 'registration_industries');
        if (!hasVisibilityTable || !hasCatalogTable) return;

        const [visibilityRows] = await queryInterface.sequelize.query(
            'SELECT industry_key, hidden, reason, updated_by FROM registration_industry_visibility'
        );

        for (const row of visibilityRows) {
            await queryInterface.sequelize.query(
                `UPDATE registration_industries
                 SET hidden = ?, hidden_reason = ?, updated_by = ?
                 WHERE industry_key = ?`,
                { replacements: [row.hidden, row.reason, row.updated_by, row.industry_key] }
            );
        }

        const hasVisibilityAuditTable = await tableExists(queryInterface, 'registration_industry_visibility_audit_logs');
        const hasCatalogAuditTable = await tableExists(queryInterface, 'registration_industry_audit_logs');
        if (!hasVisibilityAuditTable || !hasCatalogAuditTable) return;

        const [[{ existingCount }]] = await queryInterface.sequelize.query(
            "SELECT COUNT(*) AS existingCount FROM registration_industry_audit_logs WHERE action IN ('hidden', 'unhidden')"
        );
        if (Number(existingCount) > 0) return;

        const [auditRows] = await queryInterface.sequelize.query(
            `SELECT industry_key, action, actor_username, reason, before_snapshot, after_snapshot, created_at, updated_at
             FROM registration_industry_visibility_audit_logs
             ORDER BY audit_log_id ASC`
        );
        if (auditRows.length === 0) return;

        await queryInterface.bulkInsert(
            'registration_industry_audit_logs',
            auditRows.map((row) => ({
                industry_key: row.industry_key,
                action: row.action,
                actor_username: row.actor_username,
                reason: row.reason,
                before_snapshot: toJsonColumnValue(row.before_snapshot),
                after_snapshot: toJsonColumnValue(row.after_snapshot),
                created_at: row.created_at,
                updated_at: row.updated_at
            }))
        );
    },

    // Best-effort only: this migration is additive (it never drops the
    // source tables), so there is nothing destructive to reverse. Re-running
    // up() after a down() is always safe.
    async down() {
        // Intentional no-op - see file header.
    }
};
