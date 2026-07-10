import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutPath = path.resolve(
  process.cwd(),
  'src/features/pos/components/POSCheckoutTerminal.jsx'
);
const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
const modalStart = checkoutContent.indexOf('<Dialog open={discountModalOpen}');
const modalEnd = checkoutContent.indexOf('<Dialog open={checkoutConfirmModalOpen}', modalStart);
const discountModalContent = checkoutContent.slice(modalStart, modalEnd);

describe('Apply Discount type-card navigation contract', () => {
  it('uses five visible type cards and no Discount Type select', () => {
    expect(checkoutContent).toContain("{ value: 'senior', label: 'Senior Citizen'");
    expect(checkoutContent).toContain("{ value: 'pwd', label: 'PWD'");
    expect(checkoutContent).toContain("{ value: 'employee', label: 'Employee'");
    expect(checkoutContent).toContain("{ value: 'promo', label: 'Promo'");
    expect(checkoutContent).toContain("{ value: 'manual', label: 'Manual'");
    expect(discountModalContent).toContain('role="tablist"');
    expect(discountModalContent).toContain('role="tab"');
    expect(discountModalContent).toContain('aria-selected={active}');
    expect(discountModalContent).not.toContain('<label className="block text-sm font-semibold">Discount Type');
  });

  it('switches the existing draft type and preserves dynamic panels', () => {
    expect(discountModalContent).toContain('type: option.value');
    expect(discountModalContent).toContain("['senior', 'pwd'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'employee'");
    expect(discountModalContent).toContain("['employee', 'manual'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'promo'");
    expect(discountModalContent).toContain('Customer Name');
    expect(discountModalContent).toContain('Promo Code');
    expect(discountModalContent).toContain('Approver PIN');
    expect(discountModalContent).toContain('discountDraft.approver_user_id');
    expect(checkoutContent).toContain('signedInUserIsAdminLike');
    expect(checkoutContent).toContain("discount_type: type");
    expect(checkoutContent).toContain("type === 'employee' && !signedInUserIsAdminLike");
    expect(checkoutContent).toContain('verifyPosDiscountApproval');
    expect(discountModalContent).toContain('calculateGovernedDiscount(safeCart, { ...discountDraft, eligible_item_ids: safeEligibleDiscountItemIds })');
    expect(discountModalContent).toContain('handleApplyGovernedDiscount');
  });
});
