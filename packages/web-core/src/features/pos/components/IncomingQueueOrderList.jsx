import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Info, Tag, User, Wallet, Receipt, ShoppingBag, Calendar, MapPin, Clipboard, Printer, ExternalLink, Check, Ban, Truck, Package, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  DELIVERY_JOB_STATUS_LABELS,
  hasCompleteDeliveryAssignment,
  isManualDeliveryJob,
  isCompletionPaymentPending,
  getDeliveryJobActionLabel,
  getFulfillmentActionLabel,
  getIncomingOrderUtilityActions,
  getNextDeliveryJobStatus,
  getNextStatusActions
} from './orderFulfillmentUi.js';
import DeliveryAssignmentControl from './DeliveryAssignmentControl.jsx';
import DeliveryAddressEditControl from './DeliveryAddressEditControl.jsx';
import QueueOrderSelectCheckbox from './QueueOrderSelectCheckbox.jsx';
import { getRunAssignEligibility, getActiveRunMembership } from '../utils/deliveryRunEligibility.js';
import {
  formatOrderDateTime,
  formatOrderAmount,
  parseDeliveryCoords,
  resolveOrderDownpaymentSplit,
  resolveBalanceCollectionLabel
} from '../utils/incomingQueueOrderFormatting.js';

// Phase 229 (#1289), §2.7. Pure extraction of the Active Queue's order-card grid out of
// TerminalOperationsPanels.jsx's IncomingQueueWorkspace, so #1288 (view-mode toggle) and #1290
// (run filter) each only have to change one place, and so the new split view (§2.4-2.6) can render
// the identical card body at a different column count without duplicating ~250 lines of JSX.
//
// Behavior must be byte-identical to the pre-extraction inline version in the non-split path --
// this file changes *where* the JSX lives, not what it renders or how it behaves. The two existing
// Phase 227 behavior tests (deliveryRunBulkAssign.behavior.test.jsx,
// deliveryRunsWorkspace.behavior.test.jsx) are the regression guard and must pass unmodified.
//
// `draggable` (Phase 229, new): when true, each eligible card becomes a dnd-kit drag source
// (`useDraggable`, id = pos_transaction_id, never an index -- §2.10) so it can be dropped onto
// DeliveryRunDropPanel.jsx in the split view. `useDraggable` is called unconditionally (rules of
// hooks) with `disabled` covering both "drag not enabled here" and every reason the checkbox
// selection already disables assignment (§2.8) -- the two paths share one predicate so drag and
// checkbox selection can never disagree about which cards are actionable.
export default function IncomingQueueOrderList({
  orders = [],
  isRetailMode = false,
  selectedOrderIds = new Set(),
  onToggleSelection = () => {},
  incomingOrderActionState = {},
  workflowMode = '',
  canTransactPos = false,
  canViewPos = false,
  locked = false,
  isOnline = true,
  hasActiveShift = false,
  bulkAssignSubmitting = false,
  handleOpenCashCollection = () => {},
  handleOpenBalanceSettlement = () => {},
  handleViewBalancePaymentProof = () => {},
  handleDeliveryJobStatusChange = () => {},
  handleIncomingOrderStatusChange = () => {},
  onRequestReject = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  incomingReceiptOpeningId = null,
  deliveryPersonnelState,
  handleAssignDeliveryPersonnel = () => {},
  handleUpdateOnlineOrderDeliveryAddress = () => {},
  columns = 'auto',
  draggable = false
}) {
  if (orders.length === 0) {
    return (
      <div className="grid min-h-[11rem] grid-cols-1 items-center gap-5 rounded-lg border border-slate-200 bg-white px-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex justify-center md:border-r md:border-slate-200">
          <div className="relative grid h-32 w-40 place-items-end">
            <div className="absolute inset-x-4 bottom-1 h-3 rounded-full bg-blue-100/70 blur-sm" />
            <div className="relative h-16 w-28 rounded-b-lg rounded-t-xl border-2 border-blue-300 bg-blue-50 shadow-inner">
              <div className="absolute -top-4 left-8 h-5 w-12 rounded-b-lg border-x-2 border-b-2 border-blue-300 bg-white" />
              <div className="absolute -top-12 left-11 h-10 w-8 rounded-md border border-blue-200 bg-white shadow-sm">
                <span className="mx-auto mt-2 block h-1 w-4 rounded bg-blue-200" />
                <span className="mx-auto mt-2 block h-1 w-5 rounded bg-blue-100" />
                <span className="mx-auto mt-2 block h-1 w-3 rounded bg-blue-100" />
              </div>
            </div>
          </div>
        </div>
        <div>
          <p className="text-xl font-black tracking-tight text-[#0F172A]">No online orders in active queue.</p>
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-3 text-sm leading-5 text-[#334155]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
              <Info className="h-4 w-4" />
            </span>
            <p>
              Completed paid sales move to Sales History. Rejected, cancelled, or unpaid online orders move to Order History.
              <br />
              Incoming Queue shows active fulfillment statuses only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const gridClassName = columns === 1
    ? 'grid grid-cols-1 gap-3'
    : 'grid grid-cols-1 gap-3 lg:grid-cols-2';

  return (
    <div className={gridClassName}>
      {orders.map((order) => (
        <OrderCard
          key={`incoming-workspace-${order.pos_transaction_id}`}
          order={order}
          isRetailMode={isRetailMode}
          selected={selectedOrderIds.has(Number(order.pos_transaction_id))}
          onToggleSelection={onToggleSelection}
          actionLoading={incomingOrderActionState?.[order.pos_transaction_id] || ''}
          workflowMode={workflowMode}
          canTransactPos={canTransactPos}
          canViewPos={canViewPos}
          locked={locked}
          isOnline={isOnline}
          hasActiveShift={hasActiveShift}
          bulkAssignSubmitting={bulkAssignSubmitting}
          handleOpenCashCollection={handleOpenCashCollection}
          handleOpenBalanceSettlement={handleOpenBalanceSettlement}
          handleViewBalancePaymentProof={handleViewBalancePaymentProof}
          handleDeliveryJobStatusChange={handleDeliveryJobStatusChange}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          onRequestReject={onRequestReject}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          deliveryPersonnelState={deliveryPersonnelState}
          handleAssignDeliveryPersonnel={handleAssignDeliveryPersonnel}
          handleUpdateOnlineOrderDeliveryAddress={handleUpdateOnlineOrderDeliveryAddress}
          draggable={draggable}
        />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  isRetailMode,
  selected,
  onToggleSelection,
  actionLoading,
  workflowMode,
  canTransactPos,
  canViewPos,
  locked,
  isOnline,
  hasActiveShift,
  bulkAssignSubmitting,
  handleOpenCashCollection,
  handleOpenBalanceSettlement,
  handleViewBalancePaymentProof,
  handleDeliveryJobStatusChange,
  handleIncomingOrderStatusChange,
  onRequestReject,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  deliveryPersonnelState,
  handleAssignDeliveryPersonnel,
  handleUpdateOnlineOrderDeliveryAddress,
  draggable
}) {
  const orderId = Number(order.pos_transaction_id);
  const nextActions = getNextStatusActions(order, workflowMode);
  const nextDeliveryJobStatus = getNextDeliveryJobStatus(order);
  const utilityActions = getIncomingOrderUtilityActions(order);
  const canCollectCash = order.payment_type === 'cash'
    && order.payment_status === 'unpaid'
    && (
      (order.order_method === 'pickup' && order.fulfillment_status === 'ready_for_pickup')
      || (order.order_method === 'delivery' && order.fulfillment_status === 'out_for_delivery')
    );
  // Phase 148 (#825): the balance-settlement twin of canCollectCash. Deliberately a
  // separate predicate on a disjoint payment_status -- collect-cash owns 'unpaid', this
  // owns 'partially_paid', so the two buttons can never both appear on one card and the
  // live COD path's own condition is untouched.
  const orderBalanceDue = Number(order.balance_due || 0);
  const canSettleBalance = order.payment_status === 'partially_paid'
    && orderBalanceDue > 0
    && (
      (order.order_method === 'pickup' && order.fulfillment_status === 'ready_for_pickup')
      || (order.order_method === 'delivery' && order.fulfillment_status === 'out_for_delivery')
    );
  const deliveryCoords = parseDeliveryCoords(order);
  const deliveryJob = order.deliveryJob || null;
  const activeRunMembership = getActiveRunMembership(order);
  const manualDeliveryJob = Boolean(deliveryJob) && isManualDeliveryJob(deliveryJob);
  const hasDeliveryAssignment = hasCompleteDeliveryAssignment(deliveryJob || {});
  const cashierName = order.cashier?.username || order.acceptedByUser?.username || '-';
  const mapLink = deliveryCoords
    ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
    : '';

  const bulkAssignEligibility = getRunAssignEligibility(order, {});

  // §2.8/§2.10: the same predicate the checkbox already disables on, plus eligibility -- a card
  // that cannot legally join a run is never a drag source, and drag/checkbox can never disagree.
  // Called unconditionally regardless of `draggable` (rules of hooks); `disabled` covers the
  // "drag isn't enabled on this render" case as well.
  const dragBlocked = !canTransactPos || locked || !isOnline || !hasActiveShift || bulkAssignSubmitting;
  const dragEnabled = draggable && !dragBlocked && bulkAssignEligibility.eligible;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: orderId,
    disabled: !dragEnabled,
    data: { eligible: bulkAssignEligibility.eligible }
  });
  const dragStyle = draggable && transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : undefined
  } : undefined;
  // Review RF-1/RF-3 (#1305): the activator (listeners/attributes, and the touch-action:none that
  // comes with them) lives on a dedicated grip handle, not the card root -- dnd-kit's own guidance
  // for a draggable inside a scrollable list, so the rest of the card stays touch-scrollable on the
  // Falcon 1 tablet. `setNodeRef` stays on the card root (that's the node dnd-kit actually
  // repositions); `setActivatorNodeRef` + the listeners/attributes move to the handle instead.
  const handleDragProps = dragEnabled ? { ...listeners, ...attributes } : {};

  const buttons = [];
  if (canCollectCash) {
    buttons.push(
      <Button
        key="collect_cash"
        type="button"
        size="sm"
        disabled={Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift}
        onClick={() => handleOpenCashCollection?.(order)}
      >
        <Wallet className="mr-2 h-4 w-4 shrink-0" />
        {order.order_method === 'delivery' ? 'Collect Delivery Cash' : 'Collect Cash'}
      </Button>
    );
  }
  if (canSettleBalance) {
    buttons.push(
      <Button
        key="settle_balance"
        type="button"
        size="sm"
        disabled={Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift}
        onClick={() => handleOpenBalanceSettlement?.(order)}
      >
        <Wallet className="mr-2 h-4 w-4 shrink-0" />
        Settle Balance
      </Button>
    );
  }
  // Phase 204 (#965): "View proof" -- the smallest place the settled payment is already
  // displayed, not a full evidence-browser UI. Independent of canSettleBalance: the
  // balance may already be settled (payment_status moved off 'partially_paid') while the
  // order is still visible in this queue during fulfillment.
  if (order.has_payment_proof) {
    buttons.push(
      <Button
        key="view_payment_proof"
        type="button"
        size="sm"
        variant="outline"
        onClick={() => handleViewBalancePaymentProof?.(order)}
      >
        <Receipt className="mr-2 h-4 w-4 shrink-0" />
        View Proof
      </Button>
    );
  }
  if (nextDeliveryJobStatus && nextDeliveryJobStatus !== 'assigned' && manualDeliveryJob && hasDeliveryAssignment) {
    const deliveryJobActionKey = `delivery-job:${nextDeliveryJobStatus}`;
    buttons.push(
      <Button
        key={deliveryJobActionKey}
        type="button"
        size="sm"
        variant={nextDeliveryJobStatus === 'delivered' ? 'default' : 'outline'}
        disabled={Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift}
        onClick={() => handleDeliveryJobStatusChange?.(order.pos_transaction_id, nextDeliveryJobStatus)}
      >
        <Truck className="mr-2 h-4 w-4 shrink-0" />
        {actionLoading === deliveryJobActionKey ? 'Saving...' : getDeliveryJobActionLabel(nextDeliveryJobStatus)}
      </Button>
    );
  }
  nextActions.forEach((status) => {
    const getStatusIcon = (statusName) => {
      switch (statusName) {
      case 'confirmed':
        return <Check className="mr-2 h-4 w-4 shrink-0" />;
      case 'rejected':
        return <Ban className="mr-2 h-4 w-4 shrink-0" />;
      case 'preparing':
        return <Clipboard className="mr-2 h-4 w-4 shrink-0" />;
      case 'packed':
        return <Package className="mr-2 h-4 w-4 shrink-0" />;
      case 'ready_for_pickup':
        return <ShoppingBag className="mr-2 h-4 w-4 shrink-0" />;
      case 'out_for_delivery':
        return <Truck className="mr-2 h-4 w-4 shrink-0" />;
      case 'completed':
        return <Check className="mr-2 h-4 w-4 shrink-0" />;
      default:
        return null;
      }
    };
    // Phase 229 (#1291): once an order is a member of an active (not
    // completed/cancelled) delivery run, the run's own Dispatch action is the sole
    // path to out_for_delivery -- the per-order control is withheld here, with an
    // explanatory tooltip, rather than hidden. Scoped to `out_for_delivery` only:
    // gating the whole nextActions array would also disable `packed`, deadlocking the
    // run's own DELIVERY_RUN_UNPACKED_MEMBERS dispatch precondition (#1272).
    const gatedByActiveRun = status === 'out_for_delivery' && activeRunMembership.inActiveRun;
    const runGateReason = gatedByActiveRun
      ? (activeRunMembership.runLabel
        ? `This order is in delivery run "${activeRunMembership.runLabel}". Dispatch it from the Delivery Runs tab.`
        : 'This order is in a delivery run. Dispatch it from the Delivery Runs tab.')
      : null;
    buttons.push(
      <Button
        key={`incoming-workspace-action-${order.pos_transaction_id}-${status}`}
        type="button"
        size="sm"
        variant={status === 'rejected' ? 'destructive' : 'outline'}
        disabled={Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift || (status === 'completed' && isCompletionPaymentPending(order)) || gatedByActiveRun}
        title={runGateReason || undefined}
        aria-label={runGateReason || undefined}
        onClick={() => {
          if (status === 'rejected') {
            onRequestReject(Number(order.pos_transaction_id));
            return;
          }
          handleIncomingOrderStatusChange?.(order.pos_transaction_id, status);
        }}
      >
        {actionLoading === status ? null : getStatusIcon(status)}
        {actionLoading === status ? 'Saving...' : getFulfillmentActionLabel(status, order)}
      </Button>
    );
  });
  if (utilityActions.includes('print_receipt')) {
    buttons.push(
      <Button
        key="print_receipt"
        type="button"
        size="sm"
        variant="outline"
        disabled={locked || !canViewPos || !isOnline || incomingReceiptOpeningId !== null}
        onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, {
          printMode: true,
          retryPrint: order.receipt_print_status === 'failed'
        })}
      >
        <Printer className="mr-2 h-4 w-4 shrink-0" />
        {incomingReceiptOpeningId === Number(order.pos_transaction_id)
          ? 'Printing...'
          : order.receipt_print_status === 'failed'
            ? 'Retry Print'
          : order.receipt_print_status === 'printed'
              ? 'Reprint Receipt'
              : 'Print Receipt'}
      </Button>
    );
  }
  if (utilityActions.includes('print_order')) {
    buttons.push(
      <Button
        key="print_order"
        type="button"
        size="sm"
        variant="outline"
        disabled={locked || !canViewPos || !isOnline || incomingReceiptOpeningId !== null}
        onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, { printOrder: true })}
      >
        <Printer className="mr-2 h-4 w-4 shrink-0" />
        {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Printing...' : 'Print Order'}
      </Button>
    );
  }
  if (utilityActions.includes('open_order')) {
    buttons.push(
      <Button
        key="open_order"
        type="button"
        size="sm"
        variant="secondary"
        disabled={locked || !canViewPos || !isOnline || incomingReceiptOpeningId !== null}
        onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, { printMode: false })}
      >
        <ExternalLink className="mr-2 h-4 w-4 shrink-0" />
        {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open Order'}
      </Button>
    );
  }

  return (
    <div
      ref={draggable ? setNodeRef : undefined}
      style={dragStyle}
      className={`rounded-xl border border-slate-200 bg-white p-4 xl:p-5 shadow-sm shadow-slate-200/70 flex flex-col justify-between ${isDragging ? 'opacity-50 shadow-2xl' : ''}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            {draggable ? (
              <span
                ref={dragEnabled ? setActivatorNodeRef : undefined}
                {...handleDragProps}
                aria-hidden={!dragEnabled}
                title={dragEnabled ? 'Drag to assign to a run' : undefined}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 ${dragEnabled ? 'touch-none cursor-grab active:cursor-grabbing hover:bg-slate-50 hover:text-slate-600' : 'opacity-40'}`}
              >
                <GripVertical className="h-4 w-4" />
              </span>
            ) : null}
            {isRetailMode ? (
              <QueueOrderSelectCheckbox
                orderId={orderId}
                checked={selected}
                eligible={bulkAssignEligibility.eligible}
                reason={bulkAssignEligibility.reason}
                disabled={!canTransactPos || locked || !isOnline || !hasActiveShift || bulkAssignSubmitting}
                onToggle={onToggleSelection}
              />
            ) : null}
            <p className="text-sm font-extrabold text-[#0F172A]">{order.customer_name || 'Guest Buyer'}</p>
          </div>
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-[#1A4E8D]">
            {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || 'Unknown'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5">
          {/* Left Column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <Tag className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">PIN</span>
                <span className="text-xs font-semibold text-slate-900 break-all flex-1">{order.tracking_pin || '-'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <User className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Cashier</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{cashierName}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <User className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Customer</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{order.customer_name || 'Guest Buyer'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Payment</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'}</span>
              </div>
            </div>

            <div className={`flex items-center gap-3 py-1.5 ${order.payment_collected_at ? 'border-b border-slate-100' : ''}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Payment Status</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{String(order.payment_status || 'unpaid').replace(/_/g, ' ')}</span>
              </div>
            </div>

            {(() => {
              const split = resolveOrderDownpaymentSplit(order);
              if (!split) return null;
              return (
                <>
                  <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100/80">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Downpayment</span>
                      <span className="text-xs font-semibold text-emerald-700 break-words flex-1 tabular-nums">
                        {formatOrderAmount(split.amountPaid)} <span className="font-medium text-slate-500">paid online</span>
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 py-1.5 ${order.payment_collected_at ? 'border-b border-slate-100' : ''}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100/80">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div className="flex items-center flex-1 min-w-0">
                      <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Balance due</span>
                      <span className="text-xs font-black text-amber-700 break-words flex-1 tabular-nums">
                        {formatOrderAmount(split.balanceDue)} <span className="font-medium text-slate-500">{resolveBalanceCollectionLabel(order.order_method)}</span>
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}

            {order.payment_collected_at && (
              <div className="flex items-center gap-3 py-1.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex items-center flex-1 min-w-0">
                  <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Collected by</span>
                  <span className="text-xs font-semibold text-slate-900 break-words flex-1">{order.paymentCollectedByUser?.username || 'Cashier'} · {formatOrderDateTime(order.payment_collected_at)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Mode</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{ORDER_METHOD_LABELS[order.order_method] || order.order_method || '-'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Order Time</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{formatOrderDateTime(order.created_at)}</span>
              </div>
            </div>

            {order.order_method === 'delivery' && (
              <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                  <Truck className="h-4 w-4" />
                </div>
                <div className="flex items-center flex-1 min-w-0">
                  <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Delivery</span>
                  <span className="text-xs font-semibold text-slate-900 break-words flex-1">{deliveryJob?.provider || 'Manual'} · {DELIVERY_JOB_STATUS_LABELS[deliveryJob?.status] || deliveryJob?.status || 'Pending Dispatch'}</span>
                </div>
              </div>
            )}

            {order.order_method === 'delivery' && manualDeliveryJob && (
              <DeliveryAssignmentControl
                orderId={order.pos_transaction_id}
                deliveryJob={deliveryJob}
                canAssignOrder={order.fulfillment_status === 'out_for_delivery'}
                deliveryPersonnelState={deliveryPersonnelState}
                actionLoading={actionLoading}
                canTransactPos={canTransactPos}
                locked={locked}
                isOnline={isOnline}
                hasActiveShift={hasActiveShift}
                onAssign={handleAssignDeliveryPersonnel}
              />
            )}

            <div className="flex items-center gap-3 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex items-center flex-1 min-w-0">
                <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Address</span>
                <span className="text-xs font-semibold text-slate-900 break-words flex-1">{String(order.delivery_address || '').trim() || 'Address not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {deliveryCoords && (
          <div className="mt-3">
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[#1A4E8D] underline hover:text-blue-800"
            >
              Open pin in map
            </a>
          </div>
        )}

        <DeliveryAddressEditControl
          orderId={order.pos_transaction_id}
          order={order}
          addressChanges={order.addressChanges}
          actionLoading={actionLoading}
          canTransactPos={canTransactPos}
          locked={locked}
          isOnline={isOnline}
          hasActiveShift={hasActiveShift}
          onSave={handleUpdateOnlineOrderDeliveryAddress}
        />
      </div>

      <div>
        <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
          {buttons.map((button, index) => {
            const isLast = index === buttons.length - 1;
            const isOdd = buttons.length % 2 !== 0;
            return React.cloneElement(button, {
              key: button.key || `btn-${index}`,
              className: `w-full ${button.props.className || ''} ${isLast && isOdd ? 'col-span-2' : ''}`
            });
          })}
        </div>
        {!canTransactPos && (
          <p className="mt-2 text-[11px] text-slate-500">You need POS transact permission to update order statuses.</p>
        )}
      </div>
    </div>
  );
}
