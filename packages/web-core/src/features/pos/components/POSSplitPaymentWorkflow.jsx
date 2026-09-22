import React, { useMemo } from 'react';
import POSSplitPaymentDialog from './POSSplitPaymentDialog.jsx';
import { buildFnbGlobalOrderNote } from '../utils/posOrderNotes.js';

const buildCheckoutSnapshot = (context = {}) => ({
  schema_version: 1,
  order_method: context.orderMethod,
  table_number: context.orderMethod === 'dine_in' ? String(context.tableNumber || '').trim() || null : null,
  customer_name: context.posWorkflowMode === 'services' ? context.servicesClientName?.trim() || null : null,
  special_instructions: context.posWorkflowMode === 'services'
      ? context.servicesNotes?.trim() || null
      : context.posWorkflowMode === 'fnb'
        ? buildFnbGlobalOrderNote({
          kitchenNotes: context.kitchenNotes
        }) || null
      : null,
  scheduled_for: context.posWorkflowMode === 'services' && context.servicesDateTime
    ? new Date(context.servicesDateTime).toISOString()
    : null,
  discount_mode: context.appliedDiscount
    ? 'amount'
    : (context.selectedDiscount ? 'preset' : (context.manualDiscountAmount > 0 ? context.manualDiscountMode : 'none')),
  discount_amount: Number(context.calculatedDiscountAmount || 0),
  discount_profile_name: context.appliedDiscount ? null : (context.selectedDiscount?.name || null),
  discount_rate: context.appliedDiscount
    ? null
    : context.selectedDiscount
      ? Number(context.selectedDiscount.percentage || 0)
      : (context.manualDiscountMode === 'percentage' && context.manualDiscountRate > 0 ? Number(context.manualDiscountRate) : null),
  discount_beneficiary: context.appliedDiscount && ['senior', 'pwd'].includes(context.appliedDiscount.type)
    ? {
        category: context.appliedDiscount.type,
        name: context.appliedDiscount.customer_name,
        id_number: context.appliedDiscount.id_number
      }
    : null,
  governed_discount: context.appliedDiscount ? {
    ...context.appliedDiscount,
    ...(context.discountApproval?.manager_pin
      ? {
          manager_pin: context.discountApproval.manager_pin,
          approver_user_id: context.discountApproval.approver_user_id || context.appliedDiscount.approver_user_id
        }
      : {})
  } : null,
  affiliate_code: context.affiliateCodeInput?.trim() || null,
  fnb_check_id: context.fnbContext?.fnb_check_id || null,
  fnb_table_id: context.fnbContext?.fnb_table_id || null,
  fnb_table_label_snapshot: context.fnbContext?.fnb_table_label_snapshot
    || (context.posWorkflowMode === 'fnb' && context.orderMethod === 'dine_in'
      ? String(context.tableNumber || '').trim() || null
      : null),
  fnb_guest_count: context.fnbContext?.fnb_guest_count || null,
  fnb_server_id: context.fnbContext?.fnb_server_id || null,
  restaurant_service_charge: context.fnbContext?.restaurant_service_charge || null,
  lines: (Array.isArray(context.cart) ? context.cart : []).map((line) => ({
    item_id: Number(line?.item_id),
    quantity: Number(line?.quantity),
    sale_price: Number(line?.sale_price),
    item_discount: line?.item_discount || null,
    item_discount_approval: context.itemDiscountApproval?.get?.(line?.line_key || line?.line_id)
      ? {
          approver_user_id: context.itemDiscountApproval.get(line?.line_key || line?.line_id).approver_user_id,
          manager_pin: context.itemDiscountApproval.get(line?.line_key || line?.line_id).manager_pin
        }
      : null,
    price_override_reason: String(line?.price_override_reason || '').trim() || null,
    course: line?.course || context.fnbContext?.default_course || null,
    line_modifiers: Array.isArray(line?.line_modifiers) ? line.line_modifiers : [],
    special_instructions: String(line?.special_instructions || '').trim() || null,
    kitchen_station_id: line?.kitchen_station_id || null,
    selected_option_ids: Array.isArray(line?.service_option_ids) ? line.service_option_ids : [],
    scan_metadata: line?.scan_metadata || null
  }))
});

export default function POSSplitPaymentWorkflow({
  open,
  onOpenChange,
  cart,
  catalog,
  subtotalAmount,
  totalAmount,
  shiftId,
  locationId,
  terminalId,
  parkedSaleId,
  isMsmeMode,
  checkoutContext,
  employeeCreditAccountCode,
  employeeCreditAccount,
  selectedEmployeeCreditOption,
  employeeCreditLookupLoading,
  canUseEmployeeCredit,
  onSelectEmployeeCredit,
  onSessionStateChange,
  onReadyToComplete
}) {
  const checkoutSnapshot = useMemo(
    () => buildCheckoutSnapshot(checkoutContext),
    [checkoutContext]
  );

  return (
    <>
      {open && (
        <POSSplitPaymentDialog
          open
          onOpenChange={onOpenChange}
          cart={cart}
          catalog={catalog}
          subtotalAmount={subtotalAmount}
          totalAmount={totalAmount}
          shiftId={shiftId}
          locationId={locationId}
          terminalId={terminalId}
          parkedSaleId={parkedSaleId}
          isMsmeMode={isMsmeMode}
          checkoutSnapshot={checkoutSnapshot}
          employeeCreditAccountCode={employeeCreditAccountCode}
          employeeCreditAccount={employeeCreditAccount}
          selectedEmployeeCreditOption={selectedEmployeeCreditOption}
          employeeCreditLookupLoading={employeeCreditLookupLoading}
          canUseEmployeeCredit={canUseEmployeeCredit}
          onSelectEmployeeCredit={onSelectEmployeeCredit}
          onSessionStateChange={onSessionStateChange}
          onReadyToComplete={onReadyToComplete}
        />
      )}
    </>
  );
}
