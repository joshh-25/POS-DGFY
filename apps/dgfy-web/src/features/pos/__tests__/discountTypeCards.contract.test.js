import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutPath = path.resolve(
  process.cwd(),
  'src/features/pos/components/POSCheckoutTerminal.jsx'
);
const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
const checkoutViewContent = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
  'utf8'
);
const checkoutUtilsContent = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/pos/utils/posCheckoutTerminalUtils.js'),
  'utf8'
);
const checkoutRenderContent = `${checkoutContent}\n${checkoutViewContent}\n${checkoutUtilsContent}`;
const modalStart = checkoutRenderContent.indexOf('<Dialog open={discountModalOpen}');
const modalEnd = checkoutRenderContent.indexOf('<Dialog open={checkoutConfirmModalOpen}', modalStart);
const discountModalContent = checkoutRenderContent.slice(modalStart, modalEnd);

describe('Apply Discount type-card navigation contract', () => {
  it('uses five visible type cards and no Discount Type select', () => {
    expect(checkoutRenderContent.indexOf("{ value: 'employee', label: 'Employee'")).toBeLessThan(
      checkoutRenderContent.indexOf("{ value: 'senior', label: 'Senior Citizen'")
    );
    expect(checkoutRenderContent).toContain("{ value: 'senior', label: 'Senior Citizen'");
    expect(checkoutRenderContent).toContain("{ value: 'pwd', label: 'PWD'");
    expect(checkoutRenderContent).toContain("{ value: 'employee', label: 'Employee'");
    expect(checkoutRenderContent).toContain("{ value: 'promo', label: 'Promo'");
    expect(checkoutRenderContent).toContain("{ value: 'manual', label: 'Other'");
    expect(discountModalContent).toContain('role="tablist"');
    expect(discountModalContent).toContain('role="tab"');
    expect(discountModalContent).toContain('aria-selected={active}');
    expect(discountModalContent).not.toContain('<label className="block text-sm font-semibold">Discount Type');
  });

  it('switches the existing draft type and preserves dynamic panels', () => {
    expect(checkoutRenderContent).toContain("type: 'employee', method: 'percentage', rate: '15'");
    expect(checkoutRenderContent).toContain('activeShiftCashierId = null');
    expect(checkoutRenderContent).toContain('Number(approver?.user_id) === shiftCashierId');
    expect(checkoutRenderContent).toContain('approver_user_id = shiftCashierApprover?.user_id || \'\';');
    expect(checkoutRenderContent).toContain("option.value === 'employee'");
    expect(discountModalContent).toContain('type: option.value');
    expect(discountModalContent).toContain("['senior', 'pwd'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'employee'");
    expect(discountModalContent).toContain("discountDraft.type === 'manual'");
    expect(discountModalContent).toContain("discountDraft.type === 'promo'");
    expect(discountModalContent).toContain('Customer Name');
    expect(discountModalContent).toContain('Promo Code');
    expect(discountModalContent).toContain("discountDraft.type !== 'employee'");
    expect(discountModalContent).toContain('Employee Name <span className="text-rose-500">*</span>');
    expect(discountModalContent).toContain('Employee ID <span className="font-medium text-slate-400">(optional)</span>');
    expect(discountModalContent).toContain("discountDraft.type === 'manual'");
    expect(discountModalContent).toContain('Discount Rate');
    expect(discountModalContent).toContain('employeeDiscountRateOptions.map');
    expect(discountModalContent).toContain('placeholder="Enter other discount reason (optional)"');
    expect(discountModalContent).toContain('Employee PIN');
    expect(discountModalContent).toContain('discountDraft.approver_user_id');
    expect(discountModalContent).toContain('Authorizing employee');
    expect(checkoutRenderContent).not.toContain('signedInUserIsAdminLike');
    expect(checkoutRenderContent).not.toContain('signedInUserCanApproveManualDiscount');
    expect(checkoutRenderContent).not.toContain('currentUserIsConfiguredDiscountApprover');
    expect(checkoutRenderContent).toContain('safeDiscountApprovers.map');
    expect(checkoutRenderContent).not.toContain('manualDiscountUsesCurrentPosApprover');
    expect(checkoutRenderContent).not.toContain("type === 'manual' && discountDraft.reason.trim().length < 3");
    expect(checkoutRenderContent).not.toContain('Enter a reason of at least 3 characters for this manual discount.');
    expect(checkoutRenderContent).toContain("discount_type: type");
    expect(checkoutRenderContent).toContain('const parsedEmployeeUserId = type === \'employee\'');
    expect(checkoutRenderContent).toContain('const employeeUserId = Number.isInteger(parsedEmployeeUserId) && parsedEmployeeUserId > 0');
    expect(checkoutRenderContent).toContain('employee_user_id: employeeUserId');
    expect(checkoutRenderContent).toContain("type === 'employee' && !discountDraft.employee_name.trim()");
    expect(checkoutRenderContent).toContain('verifyPosDiscountApproval');
    expect(checkoutRenderContent).toContain('const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);');
    expect(checkoutRenderContent).toContain('const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0');
    expect(checkoutRenderContent).toContain('approver_user_id: governedDiscountApproverUserId,');
    expect(checkoutRenderContent).not.toContain('approver_user_id: verifiedApprover?.user_id || approvalUserId || discountDraft.approver_user_id,');
    expect(discountModalContent).toContain('discountPreviewTotals.vatRemoved');
    expect(discountModalContent).toContain('discountPreviewTotals.discountAmount');
    expect(discountModalContent).toContain('discountPreviewTotals.total');
    expect(discountModalContent).toContain('eligible_quantity: 1');
    expect(discountModalContent).toContain('Select only items and quantities for this Senior/PWD customer.');
    expect(discountModalContent).toContain('handleApplyGovernedDiscount');
    expect(checkoutRenderContent).not.toContain('onApplyDiscount={() => openDiscountModal({ returnToCheckout: true })}');
    expect(discountModalContent).toContain('Select authorized employee');
    expect(discountModalContent).toContain('No authorized employees are configured.');
    expect(discountModalContent).toContain('PIN not configured');
  });
});
