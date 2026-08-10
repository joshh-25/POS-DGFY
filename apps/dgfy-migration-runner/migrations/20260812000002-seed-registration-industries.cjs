// Landlord-DB-only (issue #316). Materializes REGISTRATION_INDUSTRIES
// (packages/shared-constants/src/registrationIndustries.js) into
// registration_industries rows on deploy - the seed baseline for the
// DB-driven catalog. From this point on, the constant is the seed source
// + fail-open fallback only; the catalog an admin curates and merchants
// see at signup lives in the table this migration populates.
//
// Deliberately reads REGISTRATION_INDUSTRIES via a dynamic import rather
// than restating its content here - a second, hand-copied source of truth
// is exactly what this issue exists to remove (mirrors
// 20260810000002-seed-store-configuration-template-presets.cjs, which
// applies the same ADR 0056 clause 3 reasoning to templates). Idempotent
// per industry_key: an existing row (including one an admin has since
// edited) is left untouched, never overwritten. down() removes only the
// is_system rows this migration would have inserted.

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
};

const loadIndustries = async () => {
    const module = await import('@sieitzz/shared-constants/registrationIndustries');
    return module.REGISTRATION_INDUSTRIES;
};

// Pure row-builders, exported so a test can pin their output against
// REGISTRATION_INDUSTRIES directly - without mocking a database - and so
// up()/down() have nothing to compute that isn't independently verifiable.
const buildIndustryRow = (industryKey, entry, now) => ({
    industry_key: industryKey,
    label: entry.label,
    summary: entry.summary,
    niches: JSON.stringify(entry.niches),
    workflow_mode: entry.workflow_mode,
    template_key: entry.template_key,
    display_order: entry.order,
    hidden: false,
    hidden_reason: null,
    is_system: true,
    created_by: 'system_seed',
    updated_by: 'system_seed',
    created_at: now,
    updated_at: now
});

const buildSeedAuditRow = (industryKey, entry, now) => ({
    industry_key: industryKey,
    action: 'created',
    actor_username: 'system_seed',
    reason: 'Seeded baseline industry from REGISTRATION_INDUSTRIES',
    before_snapshot: null,
    after_snapshot: JSON.stringify({
        industry_key: industryKey,
        workflow_mode: entry.workflow_mode,
        template_key: entry.template_key
    }),
    created_at: now,
    updated_at: now
});

module.exports = {
    buildIndustryRow,
    buildSeedAuditRow,

    async up(queryInterface) {
        if (!await tableExists(queryInterface, 'registration_industries')) return;

        const industries = await loadIndustries();
        const now = new Date();

        for (const [industryKey, entry] of Object.entries(industries)) {
            const [existingRows] = await queryInterface.sequelize.query(
                'SELECT industry_key FROM registration_industries WHERE industry_key = ?',
                { replacements: [industryKey] }
            );
            if (existingRows.length > 0) continue;

            await queryInterface.bulkInsert('registration_industries', [
                buildIndustryRow(industryKey, entry, now)
            ]);

            if (await tableExists(queryInterface, 'registration_industry_audit_logs')) {
                await queryInterface.bulkInsert(
                    'registration_industry_audit_logs',
                    [buildSeedAuditRow(industryKey, entry, now)]
                );
            }
        }
    },

    async down(queryInterface) {
        if (!await tableExists(queryInterface, 'registration_industries')) return;

        const industries = await loadIndustries();
        const industryKeys = Object.keys(industries);
        if (industryKeys.length === 0) return;

        if (await tableExists(queryInterface, 'registration_industry_audit_logs')) {
            const placeholders = industryKeys.map(() => '?').join(', ');
            await queryInterface.sequelize.query(
                `DELETE FROM registration_industry_audit_logs WHERE industry_key IN (${placeholders}) AND actor_username = ?`,
                { replacements: [...industryKeys, 'system_seed'] }
            );
        }

        const placeholders = industryKeys.map(() => '?').join(', ');
        await queryInterface.sequelize.query(
            `DELETE FROM registration_industries WHERE industry_key IN (${placeholders}) AND is_system = 1`,
            { replacements: industryKeys }
        );
    }
};
