import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.resolve(__dirname, '../Settings.jsx');

// #695: the singular storefront_promo editor -- the "Promo Card" block in the Storefront Page
// settings tab -- was first frozen (PR #988), then removed from the UI entirely once Pat confirmed
// the sole live legacy promo left in production (a test-store tenant) didn't need preserving. This
// now asserts absence, not disabled-presence -- the section, its state fields, and its hydration
// no longer exist on this screen. The underlying storefront_promo settings key, its redemption path
// (commercialPromoPolicy.js), and its retirement are tracked separately by #991.
describe('Legacy Promo Card is removed from IMS Settings (#695)', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');

  it('no longer renders a Promo Card section', () => {
    expect(source).not.toMatch(/<Label>Promo Card/);
  });

  it('no longer carries storefrontPromo* form state', () => {
    expect(source).not.toMatch(/storefrontPromo(Title|Subtitle|Badge|ValidityText|Code|DiscountPercent|UsageLimit|UsedCount|ValidTimeStart|ValidTimeEnd|Active)\b/);
  });

  it('no longer hydrates from the storefront_promo setting', () => {
    expect(source).not.toMatch(/const storefrontPromo = parseJsonObjectSetting/);
  });

  it('omits storefront_promo from the settings save payload', () => {
    const saveHandlerMatch = source.match(/const\s+updatePayload\s*=\s*\{[\s\S]*?storefront_ui_v2_enabled/);
    expect(saveHandlerMatch).not.toBeNull();
    expect(saveHandlerMatch[0]).not.toMatch(/storefront_promo:\s*\{/);
  });
});
