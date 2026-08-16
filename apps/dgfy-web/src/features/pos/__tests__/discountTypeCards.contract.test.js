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
    expect(checkoutContent.indexOf("{ value: 'employee', label: 'Employee'")).toBeLessThan(
      checkoutContent.indexOf("{ value: 'senior', label: 'Senior Citizen'")
    );
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
    expect(checkoutContent).toContain("type: 'employee', method: 'percentage', rate: '15'");
    expect(checkoutContent).toContain('activeShiftCashierId = null');
    expect(checkoutContent).toContain('Number(approver?.user_id) === shiftCashierId');
    expect(checkoutContent).toContain('approver_user_id = shiftCashierApprover?.user_id || \'\';');
    expect(checkoutContent).toContain("option.value === 'employee'");
    expect(discountModalContent).toContain('type: option.value');
    expect(discountModalContent).toContain("['senior', 'pwd'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'employee'");
    expect(discountModalContent).toContain("['employee', 'manual'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'promo'");
    expect(discountModalContent).toContain('Customer Name');
    expect(discountModalContent).toContain('Promo Code');
    expect(discountModalContent).toContain("discountDraft.type !== 'employee'");
    expect(discountModalContent).toContain('Employee Name <span className="text-rose-500">*</span>');
    expect(discountModalContent).toContain('Employee ID <span className="font-medium text-slate-400">(optional)</span>');
    expect(discountModalContent).toContain("discountDraft.type === 'manual'");
    expect(discountModalContent).not.toContain("{['employee', 'manual'].includes(discountDraft.type) && (\n                                <div className=\"space-y-1\">");
    expect(discountModalContent).toContain("['employee', 'manual'].includes(discountDraft.type)");
    expect(discountModalContent).toContain('placeholder="Enter manual discount reason"');
    expect(discountModalContent).toContain('Employee PIN');
    expect(discountModalContent).toContain('discountDraft.approver_user_id');
    expect(discountModalContent).toContain('Authorizing employee');
    expect(checkoutContent).not.toContain('signedInUserIsAdminLike');
    expect(checkoutContent).not.toContain('signedInUserCanApproveManualDiscount');
    expect(checkoutContent).not.toContain('currentUserIsConfiguredDiscountApprover');
    expect(checkoutContent).toContain('safeDiscountApprovers.map');
    expect(checkoutContent).not.toContain('manualDiscountUsesCurrentPosApprover');
    expect(checkoutContent).not.toContain("type === 'manual' && discountDraft.reason.trim().length < 3");
    expect(checkoutContent).not.toContain('Enter a reason of at least 3 characters for this manual discount.');
    expect(checkoutContent).toContain("discount_type: type");
    expect(checkoutContent).toContain('const parsedEmployeeUserId = type === \'employee\'');
    expect(checkoutContent).toContain('const employeeUserId = Number.isInteger(parsedEmployeeUserId) && parsedEmployeeUserId > 0');
    expect(checkoutContent).toContain('employee_user_id: employeeUserId');
    expect(checkoutContent).toContain("type === 'employee' && !discountDraft.employee_name.trim()");
    expect(checkoutContent).toContain('verifyPosDiscountApproval');
    expect(checkoutContent).toContain('const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);');
    expect(checkoutContent).toContain('const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0');
    expect(checkoutContent).toContain('approver_user_id: governedDiscountApproverUserId,');
    expect(checkoutContent).not.toContain('approver_user_id: verifiedApprover?.user_id || approvalUserId || discountDraft.approver_user_id,');
    expect(discountModalContent).toContain('calculateGovernedDiscount(safeCart, { ...discountDraft, eligible_item_ids: safeEligibleDiscountItemIds })');
    expect(discountModalContent).toContain('eligible_quantity: 1');
    expect(discountModalContent).toContain('Select only items and quantities for this Senior/PWD customer.');
    expect(discountModalContent).toContain('handleApplyGovernedDiscount');
    expect(checkoutContent).toContain('onApplyDiscount={() => openDiscountModal({ returnToCheckout: true })}');
    expect(discountModalContent).toContain('Select authorized employee');
    expect(discountModalContent).toContain('No authorized employees are configured.');
    expect(discountModalContent).toContain('PIN not configured');
  });
});
