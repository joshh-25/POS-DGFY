import React from 'react';
import { Wallet, Receipt, Truck, Check, Ban, Clipboard, Package, ShoppingBag, Printer, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isCompletionPaymentPending,
  getDeliveryJobActionLabel,
  getFulfillmentActionLabel,
  getIncomingOrderUtilityActions,
  getNextDeliveryJobStatus,
  getNextStatusActions,
  isManualDeliveryJob,
  hasCompleteDeliveryAssignment
} from '../components/orderFulfillmentUi.js';

// Phase 229 (#1288). Extracted, behavior-preserving, from the ~150-line `buttons` array that used
// to be built inline inside IncomingQueueWorkspace's per-order .map() in
// TerminalOperationsPanels.jsx (lines 768-926 as of the extraction). Card view and the new
// QueueOrderTableView.jsx both call this one function so the eligibility/predicate logic for which
// action buttons an order gets is never duplicated -- a `.js` file (not `.jsx`) deliberately, so it
// builds elements with React.createElement rather than JSX syntax (this repo's esbuild config does
// not enable the JSX loader for plain `.js` files).
//
// Pure aside from the handler closures passed in via `deps` -- this function reads only `order`
// and `deps`, and returns a fresh array of <Button> elements on every call. It does not read any
// component state directly.

const getStatusIcon = (statusName) => {
  switch (statusName) {
  case 'confirmed':
    return React.createElement(Check, { className: 'mr-2 h-4 w-4 shrink-0' });
  case 'rejected':
    return React.createElement(Ban, { className: 'mr-2 h-4 w-4 shrink-0' });
  case 'preparing':
    return React.createElement(Clipboard, { className: 'mr-2 h-4 w-4 shrink-0' });
  case 'packed':
    return React.createElement(Package, { className: 'mr-2 h-4 w-4 shrink-0' });
  case 'ready_for_pickup':
    return React.createElement(ShoppingBag, { className: 'mr-2 h-4 w-4 shrink-0' });
  case 'out_for_delivery':
    return React.createElement(Truck, { className: 'mr-2 h-4 w-4 shrink-0' });
  case 'completed':
    return React.createElement(Check, { className: 'mr-2 h-4 w-4 shrink-0' });
  default:
    return null;
  }
};

export function buildIncomingQueueOrderActions(order = {}, {
  actionLoading = '',
  workflowMode = '',
  canTransactPos = false,
  canViewPos = false,
  locked = false,
  isOnline = true,
  hasActiveShift = false,
  incomingReceiptOpeningId = null,
  handleOpenCashCollection = () => {},
  handleOpenBalanceSettlement = () => {},
  handleViewBalancePaymentProof = () => {},
  handleDeliveryJobStatusChange = () => {},
  handleIncomingOrderStatusChange = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  onRequestRejection = () => {}
} = {}) {
  const nextActions = getNextStatusActions(order, workflowMode);
  const nextDeliveryJobStatus = getNextDeliveryJobStatus(order);
  const utilityActions = getIncomingOrderUtilityActions(order);
  const deliveryJob = order.deliveryJob || null;
  const manualDeliveryJob = Boolean(deliveryJob) && isManualDeliveryJob(deliveryJob);
  const hasDeliveryAssignment = hasCompleteDeliveryAssignment(deliveryJob || {});
  // Both predicates below are pure functions of `order` alone -- moved in from
  // IncomingQueueWorkspace's per-order .map() body verbatim (Phase 148/#825, Phase 204/#965)
  // rather than threaded through `deps`, so card and table can never drift on eligibility.
  const canCollectCash = order.payment_type === 'cash'
    && order.payment_status === 'unpaid'
    && (
      (order.order_method === 'pickup' && order.fulfillment_status === 'ready_for_pickup')
      || (order.order_method === 'delivery' && order.fulfillment_status === 'out_for_delivery')
    );
  const orderBalanceDue = Number(order.balance_due || 0);
  const canSettleBalance = order.payment_status === 'partially_paid'
    && orderBalanceDue > 0
    && (
      (order.order_method === 'pickup' && order.fulfillment_status === 'ready_for_pickup')
      || (order.order_method === 'delivery' && order.fulfillment_status === 'out_for_delivery')
    );

  const buttons = [];

  if (canCollectCash) {
    buttons.push(
      React.createElement(
        Button,
        {
          key: 'collect_cash',
          type: 'button',
          size: 'sm',
          disabled: Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift,
          onClick: () => handleOpenCashCollection?.(order)
        },
        React.createElement(Wallet, { className: 'mr-2 h-4 w-4 shrink-0' }),
        order.order_method === 'delivery' ? 'Collect Delivery Cash' : 'Collect Cash'
      )
    );
  }

  if (canSettleBalance) {
    buttons.push(
      React.createElement(
        Button,
        {
          key: 'settle_balance',
          type: 'button',
          size: 'sm',
          disabled: Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift,
          onClick: () => handleOpenBalanceSettlement?.(order)
        },
        React.createElement(Wallet, { className: 'mr-2 h-4 w-4 shrink-0' }),
        'Settle Balance'
      )
    );
  }

  // Phase 204 (#965): "View proof" -- the smallest place the settled payment is already
  // displayed, not a full evidence-browser UI. Independent of canSettleBalance: the balance may
  // already be settled (payment_status moved off 'partially_paid') while the order is still
  // visible in this queue during fulfillment.
  if (order.has_payment_proof) {
    buttons.push(
      React.createElement(
        Button,
        {
          key: 'view_payment_proof',
          type: 'button',
          size: 'sm',
          variant: 'outline',
          onClick: () => handleViewBalancePaymentProof?.(order)
        },
        React.createElement(Receipt, { className: 'mr-2 h-4 w-4 shrink-0' }),
        'View Proof'
      )
    );
  }

  if (nextDeliveryJobStatus && nextDeliveryJobStatus !== 'assigned' && manualDeliveryJob && hasDeliveryAssignment) {
    const deliveryJobActionKey = `delivery-job:${nextDeliveryJobStatus}`;
    buttons.push(
      React.createElement(
        Button,
        {
          key: deliveryJobActionKey,
          type: 'button',
          size: 'sm',
          variant: nextDeliveryJobStatus === 'delivered' ? 'default' : 'outline',
          disabled: Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift,
          onClick: () => handleDeliveryJobStatusChange?.(order.pos_transaction_id, nextDeliveryJobStatus)
        },
        React.createElement(Truck, { className: 'mr-2 h-4 w-4 shrink-0' }),
        actionLoading === deliveryJobActionKey ? 'Saving...' : getDeliveryJobActionLabel(nextDeliveryJobStatus)
      )
    );
  }

  nextActions.forEach((status) => {
    buttons.push(
      React.createElement(
        Button,
        {
          key: `incoming-workspace-action-${order.pos_transaction_id}-${status}`,
          type: 'button',
          size: 'sm',
          variant: status === 'rejected' ? 'destructive' : 'outline',
          disabled: Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift || (status === 'completed' && isCompletionPaymentPending(order)),
          onClick: () => {
            if (status === 'rejected') {
              onRequestRejection(Number(order.pos_transaction_id));
              return;
            }
            handleIncomingOrderStatusChange?.(order.pos_transaction_id, status);
          }
        },
        actionLoading === status ? null : getStatusIcon(status),
        actionLoading === status ? 'Saving...' : getFulfillmentActionLabel(status, order)
      )
    );
  });

  if (utilityActions.includes('print_receipt')) {
    buttons.push(
      React.createElement(
        Button,
        {
          key: 'print_receipt',
          type: 'button',
          size: 'sm',
          variant: 'outline',
          disabled: locked || !canViewPos || !isOnline || incomingReceiptOpeningId !== null,
          onClick: () => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, {
            printMode: true,
            retryPrint: order.receipt_print_status === 'failed'
          })
        },
        React.createElement(Printer, { className: 'mr-2 h-4 w-4 shrink-0' }),
        incomingReceiptOpeningId === Number(order.pos_transaction_id)
          ? 'Printing...'
          : order.receipt_print_status === 'failed'
            ? 'Retry Print'
            : order.receipt_print_status === 'printed'
              ? 'Reprint Receipt'
              : 'Print Receipt'
      )
    );
  }

  if (utilityActions.includes('print_order')) {
    buttons.push(
      React.createElement(
        Button,
        {
          key: 'print_order',
          type: 'button',
          size: 'sm',
          variant: 'outline',
          disabled: locked || !canViewPos || !isOnline || incomingReceiptOpeningId !== null,
          onClick: () => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, { printOrder: true })
        },
        React.createElement(Printer, { className: 'mr-2 h-4 w-4 shrink-0' }),
        incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Printing...' : 'Print Order'
      )
    );
  }

  if (utilityActions.includes('open_order')) {
    buttons.push(
      React.createElement(
        Button,
        {
          key: 'open_order',
          type: 'button',
          size: 'sm',
          variant: 'secondary',
          disabled: locked || !canViewPos || !isOnline || incomingReceiptOpeningId !== null,
          onClick: () => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id, { printMode: false })
        },
        React.createElement(ExternalLink, { className: 'mr-2 h-4 w-4 shrink-0' }),
        incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open Order'
      )
    );
  }

  return buttons;
}
