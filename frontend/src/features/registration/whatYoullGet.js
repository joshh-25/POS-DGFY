import { CAPABILITY_MODULES, STORE_TEMPLATE_PRESETS } from '@sieitzz/shared-constants/capabilityModules';

// "What you'll get" is generated from the module catalog's own
// description/enforcement metadata (issue #178 Phase 29), never
// hand-written per-industry copy - so it can never drift from what the
// template actually turns on. Locked/planned modules are never shown; a
// merchant only sees what's actually theirs to use.
//
// Extracted out of IndustryPicker.jsx (Phase 38) so the admin-only picker
// and the merchant-facing IndustrySelect share one resolver instead of two
// copies that could drift.
export const resolveWhatYoullGet = (templateKey) => {
  const preset = templateKey ? STORE_TEMPLATE_PRESETS[templateKey] : null;
  if (!preset) return [];
  return [...preset.modules]
    .map((key) => ({ key, module: CAPABILITY_MODULES[key] }))
    .filter(({ module }) => module && module.status === 'shipped' && module.enforcement !== 'locked')
    .map(({ key, module }) => ({ key, label: module.label, description: module.description }))
    .sort((a, b) => a.label.localeCompare(b.label));
};
