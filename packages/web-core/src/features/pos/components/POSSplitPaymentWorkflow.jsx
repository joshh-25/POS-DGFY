import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  cancelPosPaymentSession,
  fetchActivePosPaymentSession,
  fetchPosPaymentSession
} from '../services/posService.js';
import {
  buildPosSplitPaymentStorageKey,
  clearPosSplitPaymentSessionPointer,
  isTerminalPosPaymentSession,
  persistPosSplitPaymentSessionPointer,
  readPosSplitPaymentSessionPointer
} from '../services/posSplitPaymentSessionStore.js';
import POSSplitPaymentDialog from './POSSplitPaymentDialog.jsx';
import { buildFnbGlobalOrderNote } from '../utils/posOrderNotes.js';

const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  storageScopeKey,
  isMsmeMode,
  checkoutContext,
  onSessionStateChange,
  onReadyToComplete
}) {
  const [sessionState, setSessionState] = useState({
    active: false,
    recovered: false,
    session: null,
    recoveryError: ''
  });
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const storageKey = useMemo(
    () => buildPosSplitPaymentStorageKey(storageScopeKey),
    [storageScopeKey]
  );
  const checkoutSnapshot = useMemo(
    () => buildCheckoutSnapshot(checkoutContext),
    [checkoutContext]
  );
  const handleSessionStateChange = useCallback((nextState) => {
    setSessionState(nextState);
    onSessionStateChange?.(nextState);
  }, [onSessionStateChange]);

  useEffect(() => {
    if (!storageKey) return undefined;
    let mounted = true;

    const recoverSavedSession = async () => {
      const stored = readPosSplitPaymentSessionPointer(storageKey);
      if (!stored?.sessionId) {
        if (!shiftId || !String(terminalId || '').trim()) {
          clearPosSplitPaymentSessionPointer(storageKey);
          handleSessionStateChange({ active: false, recovered: false, session: null, recoveryError: '' });
          setRecoveryPending(false);
          return;
        }
        try {
          const activeSession = await fetchActivePosPaymentSession({
            shift_id: shiftId,
            terminal_id: String(terminalId || '').trim().toUpperCase(),
            location_id: locationId || undefined
          });
          if (!mounted) return;
          if (activeSession) {
            persistPosSplitPaymentSessionPointer(storageKey, {
              session_id: Number(activeSession.pos_payment_session_id || activeSession.id),
              idempotency_key: ''
            });
            handleSessionStateChange({ active: true, recovered: true, session: activeSession, recoveryError: '' });
            return;
          }
        } catch (requestError) {
          if (!mounted) return;
          handleSessionStateChange({
            active: false,
            recovered: false,
            session: null,
            recoveryError: requestError?.response?.data?.message || requestError?.message || 'Unable to check for an active split payment.'
          });
          return;
        } finally {
          if (mounted) setRecoveryPending(false);
        }
        clearPosSplitPaymentSessionPointer(storageKey);
        handleSessionStateChange({ active: false, recovered: false, session: null, recoveryError: '' });
        return;
      }

      setRecoveryPending(true);
      try {
        const session = await fetchPosPaymentSession(stored.sessionId, {
          shift_id: shiftId,
          terminal_id: String(terminalId || '').trim().toUpperCase(),
          location_id: locationId || undefined
        });
        if (!mounted) return;
        if (isTerminalPosPaymentSession(session)) {
          clearPosSplitPaymentSessionPointer(storageKey);
          handleSessionStateChange({ active: false, recovered: false, session: null, recoveryError: '' });
          return;
        }
        handleSessionStateChange({ active: true, recovered: true, session, recoveryError: '' });
      } catch (requestError) {
        if (!mounted) return;
        if (requestError?.response?.status === 404) {
          clearPosSplitPaymentSessionPointer(storageKey);
          handleSessionStateChange({ active: false, recovered: false, session: null, recoveryError: '' });
          return;
        }
        handleSessionStateChange({
          active: true,
          recovered: true,
          session: null,
          recoveryError: requestError?.response?.data?.message || requestError?.message || 'Unable to verify the saved payment session.'
        });
      } finally {
        if (mounted) setRecoveryPending(false);
      }
    };

    recoverSavedSession();
    return () => {
      mounted = false;
    };
  }, [handleSessionStateChange, locationId, shiftId, storageKey, terminalId]);

  const session = sessionState.session;
  const allocations = Array.isArray(session?.allocations) ? session.allocations : [];
  const canDiscardUnpaid = sessionState.active
    && Number(session?.paid_amount || 0) === 0
    && allocations.every((allocation) => (
      ['failed', 'cancelled', 'reversed'].includes(String(allocation?.status || '').toLowerCase())
    ));

  const discardUnpaid = useCallback(async () => {
    const sessionId = Number(session?.pos_payment_session_id || session?.id || 0);
    if (!sessionId || !canDiscardUnpaid || discarding) return;

    setDiscarding(true);
    try {
      await cancelPosPaymentSession(sessionId, {
        shift_id: shiftId,
        terminal_id: terminalId,
        location_id: locationId || undefined,
        reason: 'Cashier discarded unpaid split-payment draft.'
      });
      clearPosSplitPaymentSessionPointer(storageKey);
      handleSessionStateChange({ active: false, recovered: false, session: null, recoveryError: '' });
      toast.message('Unpaid split payment discarded.');
    } catch (requestError) {
      toast.error(requestError?.response?.data?.message || requestError?.message || 'Unable to discard the unpaid split payment.');
    } finally {
      setDiscarding(false);
    }
  }, [canDiscardUnpaid, discarding, handleSessionStateChange, locationId, session, shiftId, storageKey, terminalId]);

  return (
    <>
      {(recoveryPending || sessionState.active) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm shadow-blue-100/70" data-testid="pos-current-sale-payment-in-progress">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-black text-[#0F172A]">
              {recoveryPending ? 'Checking saved payment…' : 'Saved split payment'}
            </p>
            <span className="rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-700">
              {recoveryPending ? 'Checking' : 'Saved'}
            </span>
          </div>
          {!recoveryPending && sessionState.recoveryError ? (
            <p className="mt-2 text-[12px] font-semibold leading-5 text-rose-700">
              {sessionState.recoveryError} Resume the payment to try again.
            </p>
          ) : !recoveryPending && session ? (
            <>
              <p className="mt-2 text-[12px] font-semibold leading-5 text-slate-700">
                {Number(session.paid_amount || 0) > 0
                  ? `₱${money(session.paid_amount)} is already recorded. Resume this payment to finish the sale.`
                  : 'No money is recorded. Resume this payment or discard the unpaid draft.'}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
                <span>{Number(session?.line_count || session?.snapshot?.lines?.length || 0)} saved item(s)</span>
                <span className="font-black text-[#1A4E8D]">₱{money(session?.total_amount)}</span>
              </div>
            </>
          ) : null}
          {!recoveryPending && (
            <div className={`mt-3 grid gap-2 ${canDiscardUnpaid ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Button type="button" onClick={() => onOpenChange(true)} disabled={discarding} className="h-9 bg-[#1A4E8D] text-xs font-extrabold text-white hover:bg-[#143F73]" data-testid="pos-resume-split-payment">
                Resume Payment
              </Button>
              {canDiscardUnpaid && (
                <Button type="button" variant="outline" onClick={discardUnpaid} disabled={discarding} className="h-9 text-xs font-extrabold text-rose-700" data-testid="pos-discard-unpaid-split-payment">
                  {discarding ? 'Discarding…' : 'Discard Unpaid'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

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
          storageScopeKey={storageScopeKey}
          isMsmeMode={isMsmeMode}
          checkoutSnapshot={checkoutSnapshot}
          onSessionStateChange={handleSessionStateChange}
          onReadyToComplete={onReadyToComplete}
        />
      )}
    </>
  );
}
