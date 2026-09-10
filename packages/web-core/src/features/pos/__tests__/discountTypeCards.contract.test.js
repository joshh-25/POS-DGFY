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
    expect(checkoutRenderContent).toContain("{ value: 'manual', label: 'Others'");
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

  it('clears the active checkout discount when its type card is clicked again', () => {
    expect(checkoutDialogContent).toContain('const handleCheckoutDiscountTypeClick = (discountType) => {');
    expect(checkoutDialogContent).toContain('if (selectedDiscountType === discountType) {');
    expect(checkoutDialogContent).toContain('clearAppliedDiscount();');
    expect(checkoutDialogContent).toContain('onClick={() => handleCheckoutDiscountTypeClick(option.value)}');
  });

  it('matches the compact discount wireframe and hides the duplicate preview when embedded', () => {
    expect(discountModalContent).toContain('<div className="grid gap-2.5 sm:grid-cols-2">');
    expect(discountModalContent).toContain('<select value={discountDraft.method}');
    expect(discountModalContent).toContain('<div className="space-y-1 sm:col-span-2">');
    expect(discountModalContent).toContain('data-testid="pos-discount-preview-summary"');
    expect(discountModalContent).toContain('{!embedded && (');
  });

  it('uses the ice-blue selection accents and POS-primary apply action', () => {
    expect(discountModalContent).toContain('border-blue-200 bg-blue-50/50');
    expect(discountModalContent).toContain('accent-[#1A4E8D]');
    expect(discountModalContent).toContain('bg-[#EFF7FF]');
    expect(discountModalContent).toContain('bg-[#1A4E8D]');
    expect(discountModalContent).toContain('hover:bg-[#143F73]');
    expect(discountModalContent).not.toContain('hover:shadow-[0_4px_12px_rgba(26,78,141,0.25)]');
    expect(discountModalContent).toContain('inline-flex items-center gap-1">');
    expect(discountModalContent).not.toContain('inline-flex items-center gap-1 rounded-lg border');
    expect(discountModalContent).toContain('border border-[#B9D8F4] bg-[#EFF7FF]');
    expect(discountModalContent).toContain('p-0 text-center text-sm font-black leading-[1]');
    expect(discountModalContent).toContain('<Minus className="h-3 w-3"');
    expect(discountModalContent).toContain('<Plus className="h-3 w-3"');
    expect(discountModalContent).toContain('hover:bg-[#DCEEFF]');
    expect(discountModalContent).not.toContain('bg-emerald-600');
    expect(discountModalContent).not.toContain('bg-teal-50');
  });

  it('keeps statutory discount headers in one desktop row and preserves tablet placement', () => {
    expect(discountWorkspaceContent).toContain('data-testid="pos-discount-identity-header"');
    expect(discountWorkspaceContent).toContain('isDesktopIdentityHeader');
    expect(discountWorkspaceContent).toContain('lg:top-[5px]');
    expect(discountWorkspaceContent).toContain('lg:-mb-[5px]');
    expect(discountWorkspaceContent).toContain('lg:gap-y-0');
    expect(discountWorkspaceContent).toContain('grid grid-cols-2 gap-2.5 pl-1');
    expect(discountWorkspaceContent).toContain('border-r border-slate-200 pr-4');
    expect(discountWorkspaceContent).toContain('lg:hidden');
    expect(discountWorkspaceContent).toContain('lg:space-y-0');
    expect(discountWorkspaceContent).not.toContain('lg:before:top-');
    expect(discountWorkspaceContent).toContain('text-[11px] font-extrabold leading-[14px] text-slate-500');
    expect(discountWorkspaceContent).toContain('text-[11px] font-extrabold leading-[14px] text-[#0F172A]');
    expect(discountWorkspaceContent).toContain('isTabletViewport && discountDraft.type && discountDraft.type !== \'employee\'');
    expect(discountWorkspaceContent).toContain('!isTabletViewport && (');
    expect(discountWorkspaceContent).toContain("discountDraft.type && discountDraft.type !== 'employee'");
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

  it('supports multiple statutory beneficiaries with per-person quantities', () => {
    expect(discountWorkspaceContent).toContain('Add another Senior/PWD');
    expect(discountWorkspaceContent).toContain('Additional beneficiary');
    expect(discountWorkspaceContent).toContain('beneficiary.eligible_items');
    expect(checkoutContent).toContain('const statutoryBeneficiaries');
    expect(checkoutContent).toContain('Each beneficiary ID number must be unique in this order.');
    expect(checkoutContent).toContain('Senior/PWD quantities cannot exceed the quantities in the cart.');
    expect(checkoutContent).toContain('beneficiaries: statutory ? statutoryBeneficiaries : undefined');
  });

  it('clears statutory beneficiaries when switching back to Employee', () => {
    expect(discountWorkspaceContent).toContain("beneficiaries: isStatutoryDiscountType(type)");
    expect(discountWorkspaceContent).toContain(': []');
    expect(checkoutContent).toContain('beneficiaries: statutory ? statutoryBeneficiaries : undefined');
  });

  it('prevents statutory beneficiary quantities from exceeding the unallocated cart quantity', () => {
    expect(discountWorkspaceContent).toContain('const statutoryAllocatedQuantityByLine');
    expect(discountWorkspaceContent).toContain('const hasUnallocatedStatutoryQuantity');
    expect(discountWorkspaceContent).toContain('max={availableQuantity}');
    expect(discountWorkspaceContent).toContain('disabled={availableQuantity === 0}');
    expect(discountWorkspaceContent).toContain('disabled={!canAddStatutoryBeneficiary}');
    expect(discountWorkspaceContent).toContain('All eligible item quantities are already assigned.');
    expect(discountWorkspaceContent).toContain('Complete the current beneficiary before adding another.');
  });
});
