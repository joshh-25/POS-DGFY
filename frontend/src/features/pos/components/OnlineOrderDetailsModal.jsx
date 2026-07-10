import React from 'react';
import { Calendar, Hash, Mail, Phone, Printer, Receipt, UserRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FULFILLMENT_STATUS_LABELS, ORDER_METHOD_LABELS, PAYMENT_TYPE_LABELS } from './orderFulfillmentUi.js';

const money = (value) => Number(value || 0).toFixed(2);

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

const resolveQuantity = (line) => {
  const quantity = Number(line?.quantity ?? line?.qty ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
};

const resolveUnitPrice = (line) => {
  const explicit = Number(line?.sale_price ?? line?.unit_price ?? line?.price);
  if (Number.isFinite(explicit)) return explicit;
  const subtotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? 0);
  const quantity = resolveQuantity(line);
  return quantity > 0 ? subtotal / quantity : subtotal;
};

const resolveLineSubtotal = (line) => {
  const subtotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? 0);
  if (Number.isFinite(subtotal)) return subtotal;
  return resolveQuantity(line) * resolveUnitPrice(line);
};

const resolveLineName = (line) => (
  String(
    line?.item?.name
    || line?.item_name_snapshot
    || line?.name
    || `Item #${line?.item_id || line?.line_id || 'Unknown'}`
  ).trim()
);

const formatQuantity = (value) => {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) return '0';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
};

const normalizePaymentStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unspecified';
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const humanize = (value) => String(value || '').trim().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const resolveCustomerNotes = (order = {}) => {
  const direct = String(order?.special_instructions || order?.customer_note || '').trim();
  if (direct) return direct;
  return '-';
};

const DELIVERY_JOB_STATUS_LABELS = {
  pending_dispatch: 'Pending Dispatch',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

const resolveAssignedRider = (deliveryJob = {}) => {
  const payload = deliveryJob?.provider_payload;
  if (!payload || typeof payload !== 'object') return '';
  return String(
    payload?.assigned_rider
    || payload?.rider_name
    || payload?.rider?.name
    || ''
  ).trim();
};

export default function OnlineOrderDetailsModal({
  open = false,
  onOpenChange = () => {},
  order = null,
  loading = false,
  mode = 'view',
  onPrint = () => {},
  printLoading = false
}) {
  const lines = Array.isArray(order?.lines) ? order.lines : [];
  const totalAmount = Number(order?.total_amount || 0);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);
  const pickupSchedule = order?.scheduled_for || order?.created_at || null;
  const deliveryJob = order?.deliveryJob || null;
  const assignedRider = resolveAssignedRider(deliveryJob);
  const discount = order?.discount && typeof order.discount === 'object' ? order.discount : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-4xl">
        <DialogHeader className="border-b border-slate-100 px-5 py-4">
          <DialogTitle className="text-lg font-black text-slate-950">
            {mode === 'print' ? 'Print Order' : 'Open Order'}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {mode === 'print'
              ? 'Review the active customer order before printing the order copy.'
              : 'Review the active customer order details.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
              Loading active order details...
            </div>
          ) : !order ? (
            <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
              Failed to load the active order details.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Order Number</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-slate-900">{order.invoice_number || order.tracking_pin || '-'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Scheduled Date/Time</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-slate-900">{formatDateTime(pickupSchedule)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment Status</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-slate-900">{paymentStatus}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Order Status</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || '-'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-black text-slate-950">Ordered Items</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <thead>
                        <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3">Item</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Price</th>
                          <th className="py-2 pl-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, index) => (
                          <tr key={line?.line_id || `${line?.item_id || 'item'}-${index}`}>
                            <td className="py-2 pr-3 font-medium text-slate-900">{resolveLineName(line)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-700">{formatQuantity(resolveQuantity(line))}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-700">PHP {money(resolveUnitPrice(line))}</td>
                            <td className="py-2 pl-3 text-right font-bold tabular-nums text-slate-900">PHP {money(resolveLineSubtotal(line))}</td>
                          </tr>
                        ))}
                        {lines.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-sm text-slate-500">
                              No ordered items found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-950">Customer</h3>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p className="flex items-start gap-2">
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span><span className="font-semibold text-slate-900">Name:</span> {order.customer_name || '-'}</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span><span className="font-semibold text-slate-900">Phone:</span> {order.customer_phone || '-'}</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span><span className="font-semibold text-slate-900">Email:</span> {order.customer_email || '-'}</span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-950">Order Summary</h3>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Payment Method:</span> {PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Payment Status:</span> {paymentStatus}</p>
                      {order.payment_provider && <p><span className="font-semibold text-slate-900">Payment Provider:</span> {humanize(order.payment_provider)}</p>}
                      {order.payment_reference && <p><span className="font-semibold text-slate-900">Payment Reference:</span> {order.payment_reference}</p>}
                      <p><span className="font-semibold text-slate-900">Mode:</span> {ORDER_METHOD_LABELS[order.order_method] || order.order_method || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Tracking PIN:</span> {order.tracking_pin || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Original Subtotal:</span> PHP {money(order.subtotal_amount)}</p>
                      {Number(order.discount_amount || 0) > 0 && <p><span className="font-semibold text-slate-900">Discount:</span> -PHP {money(order.discount_amount)}</p>}
                      {discount?.promo_code && <p><span className="font-semibold text-slate-900">Promo Code:</span> {discount.promo_code}</p>}
                      {discount?.discount_type && <p><span className="font-semibold text-slate-900">Discount Type:</span> {humanize(discount.discount_type)}</p>}
                      {order.discount_rate_snapshot != null && <p><span className="font-semibold text-slate-900">Discount Rate:</span> {Number(order.discount_rate_snapshot).toFixed(2)}%</p>}
                      <p><span className="font-semibold text-slate-900">DGFY Convenience Fee:</span> PHP {money(order.service_fee_amount)}</p>
                      <p><span className="font-semibold text-slate-900">Delivery Fee:</span> PHP {money(order.delivery_fee)}</p>
                      <p><span className="font-semibold text-slate-900">Final Total:</span> PHP {money(totalAmount)}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-slate-950">Customer Request / Notes</h3>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {resolveCustomerNotes(order)}
                    </div>
                  </div>

                  {order.order_method === 'delivery' && (
                    <div>
                      <h3 className="text-sm font-black text-slate-950">Delivery</h3>
                      <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p><span className="font-semibold text-slate-900">Provider:</span> {deliveryJob?.provider || 'Manual'}</p>
                        <p><span className="font-semibold text-slate-900">Delivery Status:</span> {DELIVERY_JOB_STATUS_LABELS[deliveryJob?.status] || deliveryJob?.status || 'Pending Dispatch'}</p>
                        <p><span className="font-semibold text-slate-900">Address:</span> {order.delivery_address || '-'}</p>
                        <p><span className="font-semibold text-slate-900">Contact:</span> {order.customer_phone || '-'}</p>
                        <p><span className="font-semibold text-slate-900">Delivery Fee:</span> PHP {money(order.delivery_fee)}</p>
                        {assignedRider && <p><span className="font-semibold text-slate-900">Assigned Rider:</span> {assignedRider}</p>}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 px-5 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={printLoading}>
            Close
          </Button>
          <Button type="button" className="bg-[#1A4E8D] text-white hover:bg-[#143F73]" onClick={onPrint} disabled={loading || !order || printLoading}>
            <Printer className="mr-2 h-4 w-4" />
            {printLoading ? 'Printing...' : 'Print Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
