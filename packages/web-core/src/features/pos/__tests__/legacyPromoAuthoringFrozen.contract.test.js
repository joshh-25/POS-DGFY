import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

// #776/#695: the merchant-facing "Add Promo" button is frozen (not removed) so a new promo can no
// longer be created outside the voucher system. This is what makes VoucherCodePanel's merged
// "Available Offers" listing safe to dispatch every "Use" click through onApplyVoucher -- see that
// component's own file header for the full reasoning. Editing an existing promo card, if any tenant
// still has one, is intentionally left untouched.
describe('Legacy storefront promo authoring is frozen (#776/#695)', () => {
  it('disables the Add Promo button unconditionally', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');
    expect(source).toMatch(/onClick=\{addStorefrontPromo\} disabled title=/);
  });

  it('points merchants at Vouchers as the replacement', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');
    expect(source).toContain('Promo codes now run on Vouchers');
  });
});
