import { STORE_TEMPLATE_PRESETS } from '../../shared/constants/capabilityModules.js';

// Seeds the landlord template catalog from the frozen STORE_TEMPLATE_PRESETS
// constant (packages/shared-constants/src/capabilityModules.js) - so preset
// content is authored once, in code, and this just materializes it into
// queryable rows (issue #178 Phase 13). Idempotent: an existing template_key
// is left untouched, never overwritten, so re-running this after a preset
// has been curated away from its original code-defined shape is safe.
export const buildSeedCanonicalTemplatePresetsUseCase = ({ repository }) => async () => {
    const results = [];

    for (const [presetKey, preset] of Object.entries(STORE_TEMPLATE_PRESETS)) {
        const existing = await repository.findByKey(presetKey);
        if (existing) {
            results.push({ template_key: presetKey, action: 'skipped_existing' });
            continue;
        }

        const created = await repository.create({
            templateKey: presetKey,
            label: preset.label,
            baseMode: preset.base_mode,
            isPreset: true,
            visibility: 'visible',
            owner: 'platform',
            moduleKeys: [...preset.modules]
        });
        await repository.setStatus(created.template_id, 'published');
        results.push({ template_key: presetKey, action: 'created_and_published', template_id: created.template_id });
    }

    return results;
};
