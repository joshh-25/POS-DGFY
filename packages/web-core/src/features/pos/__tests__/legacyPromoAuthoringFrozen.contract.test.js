import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

// #776/#695/#988: the plural storefront_promos editor -- "Promo Codes (Legacy)" in the Storefront
// Page settings tab -- went through two stages: #776 froze *creating* a new promo (the "Add Promo"
// button); a PR #988 review found *editing* an existing one was still fully live and froze that
// too. This now asserts full removal (#695): once Pat confirmed production's sole live legacy promo
// (a test-store tenant) didn't need preserving, the whole section -- and every handler/state/helper
// that existed only to serve it -- was deleted rather than left disabled. The underlying
// storefront_promo(s) settings keys, their redemption path (commercialPromoPolicy.js), and their
// retirement are tracked separately by #991.
describe('Legacy storefront promo authoring is removed (#776/#695/#988)', () => {
  const source = fs.readFileSync(workspacePath, 'utf8');

  it('no longer renders a Promo Codes section', () => {
    expect(source).not.toContain('Promo Codes (Legacy)');
    expect(source).not.toContain('Add Promo');
  });

  it('no longer carries any storefrontPromo*-named identifier', () => {
    expect(source).not.toMatch(/[a-zA-Z_$]*[Ss]torefrontPromo[a-zA-Z_$]*/);
  });

  it('no longer defines the promo-only helper functions', () => {
    for (const name of [
      'createBlankStorefrontPromo', 'normalizeStorefrontPromoConfig', 'normalizeStorefrontPromoList',
      'hasMeaningfulStorefrontPromo', 'getStorefrontPromoDate', 'isStorefrontPromoExpired',
      'normalizePromoEligibilityMap', 'getStorefrontPromoScheduleValidationError'
    ]) {
      expect(source).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('omits storefront_promo and storefront_promos from the storefront save payload', () => {
    const saveHandlerMatch = source.match(/const handleStorefrontSave = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[/);
    expect(saveHandlerMatch).not.toBeNull();
    const handlerBody = saveHandlerMatch[0];
    expect(handlerBody).not.toMatch(/storefront_promo:\s/);
    expect(handlerBody).not.toMatch(/storefront_promos:\s/);
  });
});
