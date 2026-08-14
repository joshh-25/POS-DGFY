import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const checkoutPath = path.resolve(
  webCoreRoot,
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
    expect(discountModalContent).toContain("['employee', 'manual'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'manual' ? 'Enter manual discount reason' : 'Enter reason'");
    expect(discountModalContent).toContain('Approver PIN');
    expect(discountModalContent).toContain('discountDraft.approver_user_id');
    expect(discountModalContent).toContain('Approving as');
    expect(checkoutContent).toContain('signedInUserIsAdminLike');
    expect(checkoutContent).toContain('signedInUserCanApproveManualDiscount');
    expect(checkoutContent).toContain('currentUserIsConfiguredDiscountApprover');
    expect(checkoutContent).toContain('safeDiscountApprovers.some');
    expect(checkoutContent).toContain('manualDiscountUsesCurrentPosApprover');
    expect(checkoutContent).toContain("type === 'manual' && discountDraft.reason.trim().length < 3");
    expect(checkoutContent).toContain('Enter a reason of at least 3 characters for this manual discount.');
    expect(checkoutContent).toContain("discount_type: type");
    expect(checkoutContent).toContain("type === 'employee' && !signedInUserIsAdminLike");
    expect(checkoutContent).toContain('verifyPosDiscountApproval');
    expect(checkoutContent).toContain('const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);');
    expect(checkoutContent).toContain('const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0');
    expect(checkoutContent).toContain('approver_user_id: governedDiscountApproverUserId,');
    expect(checkoutContent).not.toContain('approver_user_id: verifiedApprover?.user_id || approvalUserId || discountDraft.approver_user_id,');
    expect(discountModalContent).toContain('calculateGovernedDiscount(safeCart, { ...discountDraft, eligible_item_ids: safeEligibleDiscountItemIds })');
    expect(discountModalContent).toContain('eligible_quantity: 1');
    expect(discountModalContent).toContain('Select only items and quantities for this Senior/PWD customer.');
    expect(discountModalContent).toContain('handleApplyGovernedDiscount');
    expect(discountModalContent).toContain('Select configured manager or admin');
    expect(discountModalContent).toContain('Ask the Master Admin to configure one.');
  });
});
