import React from 'react';
import { MapPin } from 'lucide-react';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  DELIVERY_JOB_STATUS_LABELS
} from './orderFulfillmentUi.js';
import QueueOrderSelectCheckbox from './QueueOrderSelectCheckbox.jsx';
import { getRunAssignEligibility } from '../utils/deliveryRunEligibility.js';
import {
  formatOrderDateTime,
  formatOrderAmount,
  resolveOrderDownpaymentSplit,
  parseDeliveryCoords
} from '../utils/incomingQueueOrderFormatting.js';
import { buildIncomingQueueOrderActions } from '../utils/incomingQueueOrderActions.js';

// Phase 230 (#1288). The Active Queue's table view mode. Receives the same
// sortedIncomingOrders array and the same handler props IncomingQueueWorkspace already threads to
// the card `.map()` -- no new prop surface. See plan-1288-queue-view-mode.md's "Table columns"
// mapping for the per-field rationale, including what is deliberately omitted from this view
// (still one click away via card view, which stays the default and is never removed):
//
// - The "Collected by <user> · <time>" detail (folded into Payment/Balance already showing).
// - DeliveryAssignmentControl / DeliveryAddressEditControl -- both are multi-field interactive
//   widgets; the table shows their *current* read-only value only. Switch to card view to
//   assign/reassign delivery personnel or edit the address.

export default function QueueOrderTableView({
  orders = [],
  isRetailMode = false,
  selectedOrderIds = new Set(),
  toggleOrderSelection = () => {},
  bulkAssignSubmitting = false,
  canTransactPos = false,
  canViewPos = false,
  locked = false,
  isOnline = true,
  hasActiveShift = false,
  incomingOrderActionState = {},
  incomingReceiptOpeningId = null,
  workflowMode = '',
  handleOpenCashCollection = () => {},
  handleOpenBalanceSettlement = () => {},
  handleViewBalancePaymentProof = () => {},
  handleDeliveryJobStatusChange = () => {},
  handleIncomingOrderStatusChange = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  onRequestRejection = () => {}
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
        <thead className="bg-slate-50">
          <tr>
            {isRetailMode && (
              <th scope="col" className="px-3 py-2 font-bold text-slate-600">Select</th>
            )}
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Customer</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Status</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">PIN</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Cashier</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Payment</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Balance</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Mode</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Order Time</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Delivery</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Address</th>
            <th scope="col" className="px-3 py-2 font-bold text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {orders.map((order) => {
            const orderId = Number(order.pos_transaction_id);
            const actionLoading = incomingOrderActionState?.[order.pos_transaction_id] || '';
            const bulkAssignEligibility = getRunAssignEligibility(order, {});
            const split = resolveOrderDownpaymentSplit(order);
            const deliveryJob = order.deliveryJob || null;
            const deliveryCoords = parseDeliveryCoords(order);
            const mapLink = deliveryCoords
              ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
              : '';
            const cashierName = order.cashier?.username || order.acceptedByUser?.username || '-';

            const buttons = buildIncomingQueueOrderActions(order, {
              actionLoading,
              workflowMode,
              canTransactPos,
              canViewPos,
              locked,
              isOnline,
              hasActiveShift,
              incomingReceiptOpeningId,
              handleOpenCashCollection,
              handleOpenBalanceSettlement,
              handleViewBalancePaymentProof,
              handleDeliveryJobStatusChange,
              handleIncomingOrderStatusChange,
              handleOpenIncomingOrderReceipt,
              onRequestRejection
            });

            return (
              <tr key={`incoming-queue-table-row-${order.pos_transaction_id}`} className="align-top">
                {isRetailMode && (
                  <td className="whitespace-nowrap px-3 py-3">
                    <QueueOrderSelectCheckbox
                      orderId={orderId}
                      checked={selectedOrderIds.has(orderId)}
                      eligible={bulkAssignEligibility.eligible}
                      reason={bulkAssignEligibility.reason}
                      disabled={!canTransactPos || locked || !isOnline || !hasActiveShift || bulkAssignSubmitting}
                      onToggle={toggleOrderSelection}
                    />
                  </td>
                )}
                <td className="px-3 py-3 font-extrabold text-[#0F172A]">{order.customer_name || 'Guest Buyer'}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-[#1A4E8D]">
                    {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || 'Unknown'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{order.tracking_pin || '-'}</td>
                <td className="px-3 py-3 text-slate-700">{cashierName}</td>
                <td className="px-3 py-3 text-slate-700">
                  <p className="font-semibold text-slate-900">{PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'}</p>
                  <p className="mt-0.5 text-slate-500">{String(order.payment_status || 'unpaid').replace(/_/g, ' ')}</p>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {split
                    ? `${formatOrderAmount(split.amountPaid)} paid · ${formatOrderAmount(split.balanceDue)} due`
                    : '-'}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{ORDER_METHOD_LABELS[order.order_method] || order.order_method || '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatOrderDateTime(order.created_at)}</td>
                <td className="px-3 py-3 text-slate-700">
                  {order.order_method === 'delivery'
                    ? `${deliveryJob?.provider || 'Manual'} · ${DELIVERY_JOB_STATUS_LABELS[deliveryJob?.status] || deliveryJob?.status || 'Pending Dispatch'}${deliveryJob?.delivery_personnel_name ? ` — ${deliveryJob.delivery_personnel_name}` : ''}`
                    : '-'}
                </td>
                <td className="max-w-[16rem] px-3 py-3 text-slate-700">
                  <span className="line-clamp-2 break-words" title={String(order.delivery_address || '').trim() || undefined}>
                    {String(order.delivery_address || '').trim() || 'Address not provided'}
                  </span>
                  {deliveryCoords && (
                    <a
                      href={mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#1A4E8D] underline hover:text-blue-800"
                      aria-label={`Open pin in map for order ${orderId}`}
                    >
                      <MapPin className="h-3 w-3" />
                      Map
                    </a>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    {buttons.map((button, index) => React.cloneElement(button, {
                      key: button.key || `table-btn-${orderId}-${index}`,
                      className: `w-full ${button.props.className || ''}`
                    }))}
                  </div>
                  {!canTransactPos && (
                    <p className="mt-2 text-[11px] text-slate-500">Needs POS transact permission.</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
