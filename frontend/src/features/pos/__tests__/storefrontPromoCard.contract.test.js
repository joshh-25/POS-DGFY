import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspacePath = resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const workspaceSource = readFileSync(workspacePath, 'utf8');

describe('Storefront promo card settings contract', () => {
  it('uses a pressed-state discount control instead of a plain checkbox', () => {
    const promoCardBlock = workspaceSource.slice(
      workspaceSource.indexOf('<Label className="text-[13px] font-black text-[#0F172A]">Promo Card</Label>'),
      workspaceSource.indexOf("{savingTab === 'storefront' ? 'Saving...' : 'Save Storefront'}")
    );

    expect(promoCardBlock).toContain('aria-pressed={storefrontForm.storefrontPromoActive === true}');
    expect(promoCardBlock).toContain('<Tags className="h-4 w-4" />');
    expect(promoCardBlock).toContain('Enable Discount');
    expect(promoCardBlock).not.toContain('type="checkbox"');
  });

  it('mutes and disables promo fields while the discount control is inactive', () => {
    expect(workspaceSource).toContain("disabled={storefrontForm.storefrontPromoActive !== true}");
    expect(workspaceSource).toContain("Promo card is disabled and kept muted.");
    expect(workspaceSource).toContain("Promo card is visible on the storefront.");
    expect(workspaceSource).toContain("className={storefrontForm.storefrontPromoActive === true ? '' : 'border-slate-200 bg-slate-100 text-slate-500 placeholder:text-slate-400'}");
  });

  it('stores promo code limits and valid time range inside POS storefront settings', () => {
    expect(workspaceSource).toContain('storefrontPromoCode');
    expect(workspaceSource).toContain('storefrontPromoDiscountValue');
    expect(workspaceSource).toContain('storefrontPromoUsageLimit');
    expect(workspaceSource).toContain('storefrontPromoUsedCount');
    expect(workspaceSource).toContain('storefrontPromoValidTimeStart');
    expect(workspaceSource).toContain('storefrontPromoValidTimeEnd');
    expect(workspaceSource).toContain("placeholder=\"PROMO20\"");
    expect(workspaceSource).toContain("placeholder=\"20%\"");
    expect(workspaceSource).toContain("type=\"time\"");
  });

  it('keeps the save action responsive under the storefront settings form', () => {
    expect(workspaceSource).toContain("className=\"h-10 w-full rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white hover:bg-[#143F73] sm:w-auto\"");
  });
});
