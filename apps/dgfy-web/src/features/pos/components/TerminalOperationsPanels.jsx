import React from 'react';
import { Info, MapPinned, RefreshCcw, Tag, User, Wallet, Receipt, ShoppingBag, Calendar, MapPin, Clipboard, Printer, ExternalLink, Check, Ban, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  DELIVERY_JOB_STATUS_LABELS,
  getDeliveryJobActionLabel,
  getFulfillmentActionLabel,
  getIncomingOrderUtilityActions,
  getNextDeliveryJobStatus,
  getNextStatusActions
} from './orderFulfillmentUi.js';

const parseDeliveryCoords = (order = {}) => {
  if (
    order?.delivery_latitude === null
    || order?.delivery_latitude === undefined
    || order?.delivery_latitude === ''
    || order?.delivery_longitude === null
    || order?.delivery_longitude === undefined
    || order?.delivery_longitude === ''
  ) {
    return null;
  }
  const lat = Number(order?.delivery_latitude);
  const lng = Number(order?.delivery_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng
  };
};

function WorkspaceShell({ title, children, locked, className = 'p-5' }) {
  const isIncomingQueue = title === 'Incoming Online Queue';

  if (isIncomingQueue) {
    return (
      <section className="min-w-0 max-w-full space-y-4">
        <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80">
          {children}
          {locked && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Terminal is locked. Unlock to run protected operational actions.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`min-w-0 max-w-full rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${className}`}>
      {children}
    </section>
  );
}

const formatOrderDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};

function IncomingQueueWorkspace({
  canViewPos,
  canTransactPos,
  shiftState = { shift: null },
  incomingOrdersState,
  incomingOrderActionState,
  handleIncomingOrderStatusChange,
  handleDeliveryJobStatusChange,
  handleOpenCashCollection,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  refreshIncomingOrders,
  locationsState,
  queueLocationScopeId,
  locked,
  isOnline = true,
  sectionId
}) {
  const [orderSort, setOrderSort] = React.useState('newest');
  const [pendingRejectionOrderId, setPendingRejectionOrderId] = React.useState(null);
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const sortedIncomingOrders = [...incomingOrders].sort((left, right) => {
    const leftTime = new Date(left?.created_at || left?.order_time || 0).getTime() || 0;
    const rightTime = new Date(right?.created_at || right?.order_time || 0).getTime() || 0;
    const difference = leftTime - rightTime;
    if (difference !== 0) return orderSort === 'oldest' ? difference : -difference;

    return Number(left?.pos_transaction_id || 0) - Number(right?.pos_transaction_id || 0);
  });
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
  const hasActiveShift = Boolean(shiftState?.shift);
  const selectedLocationName = !queueLocationScopeId
    ? 'Not selected'
    : (locations.find((location) => Number(location.location_id) === Number(queueLocationScopeId))?.name || 'Selected Location');

  return (
    <div id={sectionId} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[#1A4E8D]">
            <MapPinned className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm leading-5 text-[#475569]">Location scope:</p>
            <p className="text-lg font-black leading-6 text-[#0F172A]">{selectedLocationName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Sort
            <select
              value={orderSort}
              onChange={(event) => setOrderSort(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-100"
              aria-label="Sort incoming orders"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={() => refreshIncomingOrders?.()}
            disabled={incomingOrdersState?.loading || locked || !isOnline || !hasActiveShift}
            className="h-10 rounded-lg !bg-[#2563EB] px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {incomingOrdersState?.loading ? 'Refreshing...' : 'Refresh Queue'}
          </Button>
        </div>
      </div>

      {!isOnline ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Incoming orders are read-only while offline. Reconnect before refreshing, collecting payment, printing, or changing fulfillment status.
        </p>
      ) : null}

      {!canViewPos || incomingOrdersAccessState === 'forbidden' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {incomingOrdersErrorMessage || 'You need POS view permission to access incoming online orders.'}
        </p>
      ) : incomingOrdersAccessState === 'error' ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {incomingOrdersErrorMessage || 'Failed to load incoming online orders. Try refreshing.'}
        </p>
      ) : incomingOrdersAccessState === 'shift_required' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {incomingOrdersErrorMessage || 'Open a shift to view orders for this branch.'}
        </p>
      ) : incomingOrdersState?.loading && incomingOrders.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading incoming orders...</p>
      ) : incomingOrders.length === 0 ? (
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
                Completed or cancelled online orders move to History/Receipt Preview.
                <br />
                Incoming Queue shows active fulfillment statuses only.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sortedIncomingOrders.map((order) => {
            const actionLoading = incomingOrderActionState?.[order.pos_transaction_id] || '';
            const nextActions = getNextStatusActions(order);
            const nextDeliveryJobStatus = getNextDeliveryJobStatus(order);
            const utilityActions = getIncomingOrderUtilityActions(order);
            const canCollectCash = order.payment_type === 'cash'
              && order.payment_status === 'unpaid'
              && (
                (order.order_method === 'pickup' && order.fulfillment_status === 'ready_for_pickup')
                || (order.order_method === 'delivery' && order.fulfillment_status === 'out_for_delivery')
              );
            const deliveryCoords = parseDeliveryCoords(order);
            const deliveryJob = order.deliveryJob || null;
            const cashierName = order.cashier?.username || order.acceptedByUser?.username || '-';
            const mapLink = deliveryCoords
              ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
              : '';

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
            if (nextDeliveryJobStatus) {
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
              buttons.push(
                <Button
                  key={`incoming-workspace-action-${order.pos_transaction_id}-${status}`}
                  type="button"
                  size="sm"
                  variant={status === 'rejected' ? 'destructive' : 'outline'}
                  disabled={Boolean(actionLoading) || !canTransactPos || locked || !isOnline || !hasActiveShift}
                  onClick={() => {
                    if (status === 'rejected') {
                      setPendingRejectionOrderId(Number(order.pos_transaction_id));
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
              <div key={`incoming-workspace-${order.pos_transaction_id}`} className="rounded-xl border border-slate-200 bg-white p-4 xl:p-5 shadow-sm shadow-slate-200/70 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <p className="text-sm font-extrabold text-[#0F172A]">{order.customer_name || 'Guest Buyer'}</p>
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

                      <div className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100/80">
                          <Printer className="h-4 w-4" />
                        </div>
                        <div className="flex items-center flex-1 min-w-0">
                          <span className="w-16 md:w-20 shrink-0 text-xs text-slate-500 font-medium">Receipt</span>
                          <span className={`text-xs font-semibold break-words flex-1 ${order.receipt_print_status === 'printed' ? 'text-emerald-700' : order.receipt_print_status === 'failed' ? 'text-rose-700' : 'text-amber-700'}`}>
                            {order.receipt_print_status === 'printed' ? 'Printed' : order.receipt_print_status === 'failed' ? 'Print failed' : 'Not printed'}
                          </span>
                        </div>
                      </div>

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
          })}
        </div>
      )}
      <ConfirmActionDialog
        open={pendingRejectionOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRejectionOrderId(null);
        }}
        title="Reject and refund this order?"
        description="The order will be rejected. If PayMongo already collected payment, DGFY will request a full refund and keep the transaction out of tenant settlement."
        confirmLabel="Reject and request refund"
        cancelLabel="Keep order"
        variant="destructive"
        reasonLabel="Rejection reason"
        reasonPlaceholder="Explain why this paid order is being rejected."
        reasonRequired
        reasonMinLength={3}
        onConfirm={async (reason) => {
          const succeeded = await handleIncomingOrderStatusChange?.(
            pendingRejectionOrderId,
            'rejected',
            reason
          );
          if (succeeded !== false) setPendingRejectionOrderId(null);
          return succeeded;
        }}
      />
    </div>
  );
}

export {
  IncomingQueueWorkspace,
  WorkspaceShell
};
