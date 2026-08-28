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
const checkoutViewContent = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
  'utf8'
);
const checkoutDialogContent = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutConfirmDialog.jsx'),
  'utf8'
);
const discountWorkspaceContent = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/components/POSDiscountWorkspace.jsx'),
  'utf8'
);
const checkoutUtilsContent = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/utils/posCheckoutTerminalUtils.js'),
  'utf8'
);
const checkoutRenderContent = `${checkoutContent}\n${checkoutViewContent}\n${checkoutDialogContent}\n${discountWorkspaceContent}\n${checkoutUtilsContent}`;
const discountModalContent = discountWorkspaceContent;

describe('Apply Discount type-card navigation contract', () => {
  it('uses six visible type cards and no Discount Type select', () => {
    expect(checkoutRenderContent.indexOf("{ value: 'employee', label: 'Employee'")).toBeLessThan(
      checkoutRenderContent.indexOf("{ value: 'senior', label: 'Senior Citizen'")
    );
    expect(checkoutRenderContent).toContain("{ value: 'senior', label: 'Senior Citizen'");
    expect(checkoutRenderContent).toContain("{ value: 'pwd', label: 'PWD'");
    expect(checkoutRenderContent).toContain("{ value: 'employee', label: 'Employee'");
    expect(checkoutRenderContent).toContain("{ value: 'promo', label: 'Promo'");
    expect(checkoutRenderContent).toContain("{ value: 'voucher', label: 'Voucher'");
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
    expect(checkoutRenderContent).toContain('handleDiscountTypeChange(option.value)');
    expect(discountModalContent).toContain('handleDiscountTypeChange(option.value)');
    expect(discountModalContent).toContain("['senior', 'pwd'].includes(discountDraft.type)");
    expect(discountModalContent).toContain("discountDraft.type === 'employee'");
    expect(discountModalContent).toContain("discountDraft.type === 'manual'");
    expect(discountModalContent).toContain("discountDraft.type === 'promo'");
    expect(discountModalContent).toContain('Customer Name');
    expect(discountModalContent).toContain('Promo Code');
    expect(discountModalContent).toContain("discountDraft.type !== 'employee'");
    expect(discountModalContent).toContain('Employee Name <span className="text-rose-500">*</span>');
    expect(discountModalContent).toContain('Employee ID</label>');
    expect(discountModalContent).toContain("discountDraft.type === 'manual'");
    expect(discountModalContent).toContain('Discount Rate');
    expect(discountModalContent).toContain('employeeDiscountRateOptions.map');
    expect(discountModalContent).toContain('placeholder="Enter discount reason (optional)"');
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
    expect(checkoutRenderContent).toContain('usePosDiscountDirectory');
    expect(checkoutRenderContent).toContain('employee_directory_id: type === \'employee\'');
    expect(checkoutRenderContent).not.toContain('Number(discountDraft.employee_id)');
    expect(checkoutRenderContent).toContain("type === 'employee' && !(Number(discountDraft.employee_directory_id) > 0)");
    expect(discountModalContent).toContain('Select registered employee');
    expect(discountModalContent).toContain('readOnly');
    expect(checkoutRenderContent).toContain('verifyPosDiscountApproval');
    expect(checkoutRenderContent).toContain('const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);');
    expect(checkoutRenderContent).toContain('const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0');
    expect(checkoutRenderContent).toContain('approver_user_id: governedDiscountApproverUserId,');
    expect(checkoutRenderContent).not.toContain('approver_user_id: verifiedApprover?.user_id || approvalUserId || discountDraft.approver_user_id,');
    expect(discountModalContent).toContain('discountPreviewTotals.vatRemoved');
    expect(discountModalContent).toContain('discountPreviewTotals.discountAmount');
    expect(discountModalContent).toContain('discountPreviewTotals.total');
    expect(discountModalContent).toContain('selectedQuantity');
    expect(discountModalContent).toContain('Select all items');
    expect(discountModalContent).toContain('Uncheck items with no discount');
    expect(discountModalContent).toContain('handleApplyGovernedDiscount');
    expect(checkoutRenderContent).not.toContain('onApplyDiscount={() => openDiscountModal({ returnToCheckout: true })}');
    expect(discountModalContent).toContain('Select authorized employee');
    expect(discountModalContent).toContain('No authorized employees are configured.');
    expect(discountModalContent).not.toContain('No active registered employees are available.');
    expect(discountModalContent).toContain('PIN not configured');
  });

  it('keeps approval controls on one responsive row and hides the duplicate preview when embedded', () => {
    expect(discountModalContent).toContain('<div className="grid gap-2.5 sm:grid-cols-2">');
    expect(discountModalContent).toContain('<div className="space-y-1 sm:col-span-2">');
    expect(discountModalContent).toContain('data-testid="pos-discount-preview-summary"');
    expect(discountModalContent).toContain('{!embedded && (');
  });

  it('renders Customer Name before Eligible Items on tablet and restores desktop placement', () => {
    const workspaceCustomerNameIndex = discountWorkspaceContent.indexOf('>Customer Name <');
    const workspaceEligibleItemsIndex = discountWorkspaceContent.indexOf('>Eligible Items</');

    expect(workspaceCustomerNameIndex).toBeGreaterThan(-1);
    expect(workspaceCustomerNameIndex).toBeLessThan(workspaceEligibleItemsIndex);
    expect(discountWorkspaceContent).toContain('isTabletViewport && discountDraft.type && discountDraft.type !== \'employee\'');
    expect(discountWorkspaceContent).toContain('!isTabletViewport && discountDraft.type && discountDraft.type !== \'employee\'');
    expect(checkoutViewContent).toContain('<POSDiscountWorkspace viewModel={viewModel} onCancel={handleCloseDiscountModal} />');
  });

  it('renders Employee Name and ID before Eligible Items on tablet and restores desktop placement', () => {
    const workspaceTabletEmployeeIndex = discountWorkspaceContent.indexOf('{isTabletViewport ? employeeDiscountIdentityFields : null}');
    const workspaceEligibleItemsIndex = discountWorkspaceContent.indexOf('>Eligible Items</');
    const workspaceDesktopEmployeeIndex = discountWorkspaceContent.indexOf('{!isTabletViewport ? employeeDiscountIdentityFields : null}');

    expect(workspaceTabletEmployeeIndex).toBeGreaterThan(-1);
    expect(workspaceTabletEmployeeIndex).toBeLessThan(workspaceEligibleItemsIndex);
    expect(workspaceDesktopEmployeeIndex).toBeGreaterThan(workspaceEligibleItemsIndex);
    expect(checkoutViewContent).not.toContain('employeeDiscountIdentityFields');
  });
});
