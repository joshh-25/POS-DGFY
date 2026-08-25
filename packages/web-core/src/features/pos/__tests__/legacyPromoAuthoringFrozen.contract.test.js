import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

// #776/#695/#988: the merchant-facing "Add Promo" button was frozen first (#776) so a new promo
// could no longer be CREATED outside the voucher system. A PR #988 review correctly found that
// EDITING an existing promo card was still fully live -- code, discount, usage limit, time window,
// and eligibility were all mutable, and the storefront save handler still wrote both legacy
// settings keys (storefront_promo, storefront_promos) on every save regardless, which would
// silently recreate them after the #695 migration deletes them. This is what makes
// VoucherCodePanel's merged "Available Offers" listing safe to dispatch every "Use" click through
// onApplyVoucher -- see that component's own file header for the full reasoning. Every control in
// this section is now disabled, and both legacy keys are omitted from the save payload.
describe('Legacy storefront promo authoring is frozen (#776/#695/#988)', () => {
  const source = fs.readFileSync(workspacePath, 'utf8');

  it('disables the Add Promo button unconditionally', () => {
    expect(source).toMatch(/onClick=\{addStorefrontPromo\} disabled title=/);
  });

  it('points merchants at Vouchers as the replacement', () => {
    expect(source).toContain('Promo codes now run on Vouchers');
  });

  it('disables the Remove button', () => {
    expect(source).toMatch(/disabled onClick=\{\(\) => removeStorefrontPromo\(storefrontForm\.storefrontPromoEditingId\)\}/);
  });

  it('disables the Selected Promo Active checkbox', () => {
    expect(source).toMatch(/<input type="checkbox" disabled className="h-4 w-4 accent-\[#1A4E8D\]" checked=\{storefrontForm\.storefrontPromoActive === true\}/);
  });

  it('disables the channel, fulfillment, and order-timing eligibility checkboxes', () => {
    for (const stateKey of ['storefrontPromoChannels', 'storefrontPromoFulfillmentMethods', 'storefrontPromoOrderTiming']) {
      const pattern = new RegExp(`<input type="checkbox" disabled className="h-4 w-4 accent-\\[#1A4E8D\\]" checked=\\{storefrontForm\\.${stateKey}\\?\\.\\[key\\] === true\\}`);
      expect(source).toMatch(pattern);
    }
  });

  it('disables every promo field input', () => {
    const textInputNames = [
      'storefrontPromoTitle', 'storefrontPromoBadge', 'storefrontPromoSubtitle',
      'storefrontPromoValidityText', 'storefrontPromoCode'
    ];
    for (const name of textInputNames) {
      const pattern = new RegExp(`<Input disabled value=\\{storefrontForm\\.${name}\\}`);
      expect(source).toMatch(pattern);
    }
    expect(source).toMatch(/<Input disabled type="number" min="0" max="100" step="0.01" value=\{storefrontForm\.storefrontPromoDiscountPercent\}/);
    expect(source).toMatch(/<Input disabled type="number" min="1" step="1" value=\{storefrontForm\.storefrontPromoUsageLimit\}/);
  });

  it('disables the From and To date pickers', () => {
    const matches = source.match(/<Input\s+disabled\s+type="datetime-local"/g) || [];
    expect(matches.length).toBe(2);
  });

  it('disables the promo item picker, Add Item button, and item remove chips', () => {
    expect(source).toMatch(/value=\{storefrontPromoCandidateItemId\}\s*\n\s*onChange=\{\(event\) => setStorefrontPromoCandidateItemId\(event\.target\.value\)\}\s*\n\s*disabled\s*\n\s*>/);
    expect(source).toMatch(/onClick=\{addStorefrontPromoTargetItem\} disabled>/);
    expect(source).toMatch(/onClick=\{\(\) => removeStorefrontPromoTargetItem\(item\.item_id\)\}/);
    expect(source).toMatch(/type="button"\s*\n\s*disabled\s*\n\s*className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-\[12px\] font-medium text-slate-700"\s*\n\s*onClick=\{\(\) => removeStorefrontPromoTargetItem/);
  });

  it('omits storefront_promo and storefront_promos from the storefront save payload', () => {
    const saveHandlerMatch = source.match(/const handleStorefrontSave = useCallback\(async \(\) => \{[\s\S]*?\n {2}\}, \[/);
    expect(saveHandlerMatch).not.toBeNull();
    const handlerBody = saveHandlerMatch[0];
    expect(handlerBody).not.toMatch(/storefront_promo:\s/);
    expect(handlerBody).not.toMatch(/storefront_promos:\s/);
  });
});
