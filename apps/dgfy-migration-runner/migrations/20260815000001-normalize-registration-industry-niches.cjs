// Landlord-DB-only (issue #316 follow-up). Sequelize's MariaDB JSON adapter
// can expose a JSON column as text, and an older deployment may also contain
// a JSON string scalar instead of the intended array. Normalize only rows whose
// database-level JSON type is STRING; valid JSON arrays are left untouched.
// This migration is intentionally idempotent and does not delete any data.

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
};

const parseArrayString = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return null;

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

module.exports = {
    parseArrayString,

    async up(queryInterface) {
        if (!await tableExists(queryInterface, 'registration_industries')) return;

        const [rows] = await queryInterface.sequelize.query(
            'SELECT industry_key, niches, JSON_TYPE(niches) AS niches_type FROM registration_industries'
        );

        for (const row of rows) {
            if (String(row.niches_type || '').toUpperCase() !== 'STRING') continue;

            const parsed = parseArrayString(row.niches);
            if (!parsed) continue;

            await queryInterface.sequelize.query(
                'UPDATE registration_industries SET niches = ? WHERE industry_key = ?',
                { replacements: [JSON.stringify(parsed), row.industry_key] }
            );
        }
    },

    // The repair is safe and idempotent; there is no destructive reverse
    // operation that can reconstruct the prior malformed representation.
    async down() {}
};
