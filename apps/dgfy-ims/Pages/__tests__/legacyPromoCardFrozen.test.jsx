import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.resolve(__dirname, '../Settings.jsx');

// #695: the singular storefront_promo editor -- the "Promo Card" block in the Storefront Page
// settings tab -- is the one authoring surface the #776 freeze (packages/web-core's plural
// storefront_promos "Add Promo" button) never touched. commercialPromoPolicy.js still redeems
// whatever is stored under storefront_promo on both POS and storefront checkout, so every input
// here is disabled, not just relabeled -- the same posture as
// legacyPromoAuthoringFrozen.contract.test.js asserts for the plural editor.
describe('Legacy Promo Card in IMS Settings is frozen (#695)', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');

  it('relabels the section as legacy', () => {
    expect(source).toContain('Promo Card (Legacy)');
  });

  it('points merchants at Vouchers as the replacement', () => {
    expect(source).toContain('Promo codes now run on Vouchers');
  });

  it('disables every promo field input', () => {
    const promoInputNames = [
      'storefrontPromoTitle',
      'storefrontPromoBadge',
      'storefrontPromoSubtitle',
      'storefrontPromoValidityText',
      'storefrontPromoCode',
      'storefrontPromoDiscountPercent',
      'storefrontPromoUsageLimit',
      'storefrontPromoValidTimeStart',
      'storefrontPromoValidTimeEnd'
    ];
    for (const name of promoInputNames) {
      const pattern = new RegExp(`<Input disabled[^>]*value=\\{settings\\.${name}\\}`);
      expect(source).toMatch(pattern);
    }
  });

  it('disables the Active switch', () => {
    expect(source).toMatch(/<Switch disabled checked=\{settings\.storefrontPromoActive === true\}/);
  });

  it('omits storefront_promo from the settings save payload', () => {
    const saveHandlerMatch = source.match(/const\s+updatePayload\s*=\s*\{[\s\S]*?storefront_ui_v2_enabled/);
    expect(saveHandlerMatch).not.toBeNull();
    expect(saveHandlerMatch[0]).not.toMatch(/storefront_promo:\s*\{/);
  });
});
