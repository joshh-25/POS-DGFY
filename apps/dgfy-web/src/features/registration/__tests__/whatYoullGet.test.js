import { describe, expect, it } from 'vitest';
import { resolveWhatYoullGet } from '../whatYoullGet.js';
import { STORE_TEMPLATE_PRESETS } from '@sieitzz/shared-constants/capabilityModules';

// issue #316: the registration catalog API now returns each entry's live
// template_modules alongside template_key, so "What you'll get" can render
// for an admin-created template that isn't in the code-owned
// STORE_TEMPLATE_PRESETS constant at all.
describe('resolveWhatYoullGet', () => {
  it('resolves modules from STORE_TEMPLATE_PRESETS when templateModules is not supplied (legacy call shape)', () => {
    const modules = resolveWhatYoullGet('retail_store');
    expect(modules.length).toBeGreaterThan(0);
    expect(STORE_TEMPLATE_PRESETS.retail_store.modules).toEqual(expect.arrayContaining(modules.map((m) => m.key)));
  });

  it('resolves modules from the live templateModules array when supplied, even for a template_key not in STORE_TEMPLATE_PRESETS', () => {
    const modules = resolveWhatYoullGet('admin_custom_template', ['catalog', 'pos', 'inventory']);
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.map((m) => m.key).sort()).toEqual(['catalog', 'inventory', 'pos'].sort());
  });

  it('prefers a non-empty templateModules array over the STORE_TEMPLATE_PRESETS entry for the same key', () => {
    const presetModules = resolveWhatYoullGet('retail_store');
    const liveModules = resolveWhatYoullGet('retail_store', ['catalog']);
    expect(liveModules).not.toEqual(presetModules);
    expect(liveModules.map((m) => m.key)).toEqual(['catalog']);
  });

  it('falls back to STORE_TEMPLATE_PRESETS when templateModules is an empty array', () => {
    const modules = resolveWhatYoullGet('retail_store', []);
    expect(modules.length).toBeGreaterThan(0);
  });

  it('returns an empty list for a null template_key with no templateModules supplied - the shape a template-less (external-engine) catalog entry always sends', () => {
    expect(resolveWhatYoullGet(null)).toEqual([]);
    expect(resolveWhatYoullGet(null, [])).toEqual([]);
  });

  it('returns an empty list for an unknown template_key with no templateModules supplied', () => {
    expect(resolveWhatYoullGet('not_a_real_template')).toEqual([]);
  });
});
