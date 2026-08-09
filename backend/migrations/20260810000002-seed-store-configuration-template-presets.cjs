// Landlord-DB-only (issue #178 Phase 20). Materializes STORE_TEMPLATE_PRESETS
// (packages/shared-constants/src/capabilityModules.js) into
// store_configuration_templates rows on deploy, closing the gap that made
// Phases 13-19 unreachable in any real environment: the tables existed but
// nothing ever put a row in them, so findPublishedCanonicalForMode always
// returned null and the TenantManager apply-template picker was always
// empty.
//
// Deliberately reads STORE_TEMPLATE_PRESETS via a dynamic import rather than
// restating its content here - a second, hand-copied source of truth is
// exactly what this issue exists to remove (ADR 0056 clause 3). Idempotent
// per template_key, matching seedCanonicalTemplatePresets.js's own contract:
// an existing key is left untouched, never overwritten. down() removes only
// the preset keys this migration would have inserted.
//
// This does the same work as seedCanonicalTemplatePresetsUseCase
// (backend/src/modules/templates/usecases/seedCanonicalTemplatePresets.js)
// via raw queryInterface calls rather than the Sequelize models that use
// case depends on - migrations run before application code is guaranteed to
// be resolvable against the current schema, so they talk to the DB directly.
// The use case remains available for a manual re-seed.

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
};

const loadPresets = async () => {
    const module = await import('../src/modules/shared/constants/capabilityModules.js');
    return module.STORE_TEMPLATE_PRESETS;
};

// Pure row-builders, exported so a test can pin their output against
// STORE_TEMPLATE_PRESETS directly - without mocking a database - and so
// up()/down() have nothing to compute that isn't independently verifiable.
const buildTemplateRow = (templateKey, preset, now) => ({
    template_key: templateKey,
    label: preset.label,
    version: 1,
    status: 'published',
    base_mode: preset.base_mode,
    is_preset: true,
    is_canonical: preset.canonical === true,
    visibility: 'visible',
    owner: 'platform',
    created_at: now,
    updated_at: now
});

const buildModuleRows = (templateId, preset, now) => preset.modules.map((moduleKey) => ({
    template_id: templateId,
    module_key: moduleKey,
    enabled: true,
    created_at: now,
    updated_at: now
}));

const buildAuditLogRows = (templateId, templateKey, preset, now) => ([
    {
        template_id: templateId,
        action: 'draft_created',
        actor_username: 'system_seed',
        reason: null,
        before_snapshot: null,
        after_snapshot: JSON.stringify({ template_key: templateKey, modules: preset.modules }),
        created_at: now,
        updated_at: now
    },
    {
        template_id: templateId,
        action: 'published',
        actor_username: 'system_seed',
        reason: 'Seeded canonical preset from STORE_TEMPLATE_PRESETS',
        before_snapshot: null,
        after_snapshot: JSON.stringify({ template_key: templateKey, status: 'published', modules: preset.modules }),
        created_at: now,
        updated_at: now
    }
]);

module.exports = {
    buildTemplateRow,
    buildModuleRows,
    buildAuditLogRows,

    async up(queryInterface) {
        if (!await tableExists(queryInterface, 'store_configuration_templates')) return;

        const presets = await loadPresets();
        const now = new Date();

        for (const [templateKey, preset] of Object.entries(presets)) {
            const [existingRows] = await queryInterface.sequelize.query(
                'SELECT template_id FROM store_configuration_templates WHERE template_key = ?',
                { replacements: [templateKey] }
            );
            if (existingRows.length > 0) continue;

            await queryInterface.bulkInsert('store_configuration_templates', [
                buildTemplateRow(templateKey, preset, now)
            ]);

            const [[createdRow]] = await queryInterface.sequelize.query(
                'SELECT template_id FROM store_configuration_templates WHERE template_key = ?',
                { replacements: [templateKey] }
            );
            const templateId = createdRow.template_id;

            await queryInterface.bulkInsert(
                'store_configuration_template_modules',
                buildModuleRows(templateId, preset, now)
            );

            if (await tableExists(queryInterface, 'store_configuration_template_audit_logs')) {
                await queryInterface.bulkInsert(
                    'store_configuration_template_audit_logs',
                    buildAuditLogRows(templateId, templateKey, preset, now)
                );
            }
        }
    },

    async down(queryInterface) {
        if (!await tableExists(queryInterface, 'store_configuration_templates')) return;

        const presets = await loadPresets();
        const templateKeys = Object.keys(presets);
        if (templateKeys.length === 0) return;

        const placeholders = templateKeys.map(() => '?').join(', ');
        const [rows] = await queryInterface.sequelize.query(
            `SELECT template_id FROM store_configuration_templates WHERE template_key IN (${placeholders}) AND owner = ?`,
            { replacements: [...templateKeys, 'platform'] }
        );
        const templateIds = rows.map((row) => row.template_id);
        if (templateIds.length === 0) return;

        if (await tableExists(queryInterface, 'store_configuration_template_audit_logs')) {
            await queryInterface.bulkDelete('store_configuration_template_audit_logs', { template_id: templateIds });
        }
        await queryInterface.bulkDelete('store_configuration_template_modules', { template_id: templateIds });
        await queryInterface.bulkDelete('store_configuration_templates', { template_id: templateIds });
    }
};
