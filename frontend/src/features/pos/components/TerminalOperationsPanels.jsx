import React from 'react';
import { Info, MapPinned, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
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
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80">
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
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${className}`}>
      {children}
    </section>
  );
}

function IncomingQueueWorkspace({
  canViewPos,
  canTransactPos,
  shiftState = { shift: null },
  incomingOrdersState,
  incomingOrderActionState,
  handleIncomingOrderStatusChange,
  handleOpenIncomingOrderReceipt,
  incomingReceiptOpeningId,
  handleOpenIncomingOrderHistory,
  incomingHistoryOpeningId,
  refreshIncomingOrders,
  locationsState,
  queueLocationScopeId,
  locked,
  sectionId
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const incomingOrdersAccessState = String(incomingOrdersState?.accessState || '').trim() || 'idle';
  const incomingOrdersErrorMessage = String(incomingOrdersState?.errorMessage || '').trim();
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
        <Button
          type="button"
          onClick={() => refreshIncomingOrders?.()}
          disabled={incomingOrdersState?.loading || locked}
          className="h-10 rounded-lg !bg-[#2563EB] px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          {incomingOrdersState?.loading ? 'Refreshing...' : 'Refresh Queue'}
        </Button>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-3 text-sm leading-5 text-[#334155]">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
          <Info className="h-4 w-4" />
        </span>
        <p>
          Completed or cancelled online orders move to History/Receipt Preview.
          <br />
          Incoming Queue shows active fulfillment statuses only.
        </p>
      </div>

      {!canViewPos || incomingOrdersAccessState === 'forbidden' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {incomingOrdersErrorMessage || 'You need POS view permission to access incoming online orders.'}
        </p>
      ) : incomingOrdersAccessState === 'error' ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {incomingOrdersErrorMessage || 'Failed to load incoming online orders. Try refreshing.'}
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
            <p className="mt-2 text-sm leading-5 text-[#475569]">New online orders will appear here once they are received.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {incomingOrders.map((order) => {
            const actionLoading = incomingOrderActionState?.[order.pos_transaction_id] || '';
            const nextActions = getNextStatusActions(order);
            const deliveryCoords = parseDeliveryCoords(order);
            const mapLink = deliveryCoords
              ? `https://maps.google.com/?q=${deliveryCoords.latitude},${deliveryCoords.longitude}`
              : '';
            return (
              <div key={`incoming-workspace-${order.pos_transaction_id}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#0F172A]">{order.customer_name || 'Guest Buyer'}</p>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-[#1A4E8D]">
                    {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || 'Unknown'}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <p>PIN: <span className="font-semibold text-slate-900">{order.tracking_pin || '-'}</span></p>
                  <p>{ORDER_METHOD_LABELS[order.order_method] || order.order_method} / {PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type}</p>
                  {order.delivery_address ? <p>{order.delivery_address}</p> : null}
                  {deliveryCoords ? <p>Coords: {deliveryCoords.latitude.toFixed(6)}, {deliveryCoords.longitude.toFixed(6)}</p> : null}
                  {deliveryCoords ? (
                    <a
                      href={mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    className="font-semibold text-[#1A4E8D] underline"
                    >
                      Open pin in map
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {nextActions.map((status) => (
                    <Button
                      key={`incoming-workspace-action-${order.pos_transaction_id}-${status}`}
                      type="button"
                      size="sm"
                      variant={status === 'rejected' ? 'destructive' : 'outline'}
                      disabled={Boolean(actionLoading) || !canTransactPos || locked || !shiftState.shift}
                      onClick={() => handleIncomingOrderStatusChange?.(order.pos_transaction_id, status)}
                    >
                      {actionLoading === status ? 'Saving...' : (FULFILLMENT_STATUS_LABELS[status] || status)}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={locked || !canViewPos || incomingReceiptOpeningId !== null}
                    onClick={() => handleOpenIncomingOrderReceipt?.(order.pos_transaction_id)}
                  >
                    {incomingReceiptOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open Receipt'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={locked || !canViewPos || incomingHistoryOpeningId !== null}
                    onClick={() => handleOpenIncomingOrderHistory?.(order)}
                  >
                    {incomingHistoryOpeningId === Number(order.pos_transaction_id) ? 'Opening...' : 'Open in History'}
                  </Button>
                </div>
                {!canTransactPos && (
                  <p className="mt-2 text-[11px] text-slate-500">You need POS transact permission to update order statuses.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export {
  IncomingQueueWorkspace,
  WorkspaceShell
};
