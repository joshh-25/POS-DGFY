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
//
// `templateModules` (issue #316): the registration catalog API now returns
// each entry's live `template_modules` array alongside `template_key` -
// the published template's own module list, fetched server-side regardless
// of whether the template is one of the code-owned STORE_TEMPLATE_PRESETS
// or an admin-created one. When present and non-empty it is authoritative
// (it reflects the actual DB row, including admin edits); the local
// STORE_TEMPLATE_PRESETS lookup is a fallback for two cases only: the
// local-constant catalog fallback (registrationIndustryService.js, which
// carries no template_modules field at all) and any caller that hasn't
// been updated to pass the live list through yet.
export const resolveWhatYoullGet = (templateKey, templateModules = null) => {
  const moduleKeys = Array.isArray(templateModules) && templateModules.length > 0
    ? templateModules
    : (templateKey ? STORE_TEMPLATE_PRESETS[templateKey]?.modules : null);
  if (!moduleKeys) return [];
  return [...moduleKeys]
    .map((key) => ({ key, module: CAPABILITY_MODULES[key] }))
    .filter(({ module }) => module && module.status === 'shipped' && module.enforcement !== 'locked')
    .map(({ key, module }) => ({ key, label: module.label, description: module.description }))
    .sort((a, b) => a.label.localeCompare(b.label));
};
