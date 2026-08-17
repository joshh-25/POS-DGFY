import React from 'react';
import {
  Calendar,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
  Truck,
  UserRound
} from 'lucide-react';
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

const resolveLineName = (line) => String(
  line?.item?.name
  || line?.item_name_snapshot
  || line?.name
  || `Item #${line?.item_id || line?.line_id || 'Unknown'}`
).trim();

const formatQuantity = (value) => {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) return '0';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
};

const normalizePaymentStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unspecified';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const humanize = (value) => String(value || '').trim().replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const resolveCustomerNotes = (order = {}) => String(
  order?.special_instructions || order?.customer_note || '-'
).trim() || '-';

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

const MetricCard = ({ icon: Icon, label, value, tone = 'blue' }) => {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600'
  };
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone] || tones.blue}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xs sm:text-[13px] font-black text-slate-950">{value}</p>
      </div>
    </div>
  );
};

const SectionTitle = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-600">
      <Icon className="h-3.5 w-3.5" />
    </span>
    <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-950">{children}</h3>
  </div>
);

const DetailRow = ({ label, value, valueClassName = '' }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-1 text-[11px] sm:text-xs">
    <dt className="text-slate-500">{label}</dt>
    <dd className={`max-w-[15rem] text-right font-semibold text-slate-900 ${valueClassName}`}>{value ?? '-'}</dd>
  </div>
);

export default function OnlineOrderDetailsModal({
  open = false,
  onOpenChange = () => {},
  order = null,
  loading = false
}) {
  const lines = Array.isArray(order?.lines) ? order.lines : [];
  const totalAmount = Number(order?.total_amount || 0);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);
  const pickupSchedule = order?.scheduled_for || order?.created_at || null;
  const deliveryJob = order?.deliveryJob || null;
  const assignedRider = resolveAssignedRider(deliveryJob);
  const discount = order?.discount && typeof order.discount === 'object' ? order.discount : null;
  const orderNumber = order?.invoice_number || order?.tracking_pin || '-';
  const orderMethod = ORDER_METHOD_LABELS[order?.order_method] || order?.order_method || '-';
  const orderStatus = FULFILLMENT_STATUS_LABELS[order?.fulfillment_status] || order?.fulfillment_status || '-';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden border border-slate-200 bg-slate-50 p-0 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-5 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-2.5 pr-8">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 sm:h-10 sm:w-10">
              <Receipt className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <DialogTitle className="truncate text-base font-black text-slate-950 sm:text-xl">
                  {order ? `Order #${orderNumber}` : 'Open Order'}
                </DialogTitle>
                {order && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    <Truck className="h-3 w-3" />
                    {orderMethod}
                  </span>
                )}
              </div>
              <DialogDescription className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">
                Review the customer order details.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-4 sm:py-3.5">
          {loading ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-600">
              Loading order details...
            </div>
          ) : !order ? (
            <div className="rounded-lg border border-dashed border-rose-300 bg-rose-50 p-5 text-center text-xs font-semibold text-rose-700">
              Failed to load the order details.
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Calendar} label="Scheduled Date/Time" value={formatDateTime(pickupSchedule)} />
                <MetricCard icon={Receipt} label="Payment Status" value={paymentStatus} tone="emerald" />
                <MetricCard icon={Receipt} label="Payment Method" value={PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'} tone="amber" />
                <MetricCard icon={Package} label="Order Status" value={orderStatus} tone="violet" />
              </div>

              <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)_minmax(280px,0.78fr)]">
                <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                  <SectionTitle icon={Package}>Ordered Items</SectionTitle>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-[11px] sm:text-xs">
                      <thead>
                        <tr className="text-left text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">
                          <th className="py-1.5 pr-2">Item</th>
                          <th className="px-2 py-1.5 text-right">Qty</th>
                          <th className="px-2 py-1.5 text-right">Unit Price</th>
                          <th className="py-1.5 pl-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, index) => (
                          <tr key={line?.line_id || `${line?.item_id || 'item'}-${index}`}>
                            <td className="py-2 pr-2 font-semibold text-slate-900">{resolveLineName(line)}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">{formatQuantity(resolveQuantity(line))}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-700">PHP {money(resolveUnitPrice(line))}</td>
                            <td className="whitespace-nowrap py-2 pl-2 text-right font-black tabular-nums text-slate-950">PHP {money(resolveLineSubtotal(line))}</td>
                          </tr>
                        ))}
                        {lines.length === 0 && (
                          <tr><td colSpan={4} className="py-4 text-center text-xs text-slate-500">No ordered items found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="grid min-w-0 gap-2.5">
                  <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                    <SectionTitle icon={UserRound}>Customer Information</SectionTitle>
                    <div className="mt-2 grid gap-1.5 text-[11px] sm:text-xs">
                      <div className="flex min-w-0 items-start gap-2">
                        <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-slate-500">Name</p>
                          <p className="break-words font-bold text-slate-950">{order.customer_name || '-'}</p>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-start gap-2">
                        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-slate-500">Phone</p>
                          <p className="break-words font-semibold text-slate-900">{order.customer_phone || '-'}</p>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-start gap-2">
                        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-slate-500">Email</p>
                          <p className="break-all font-semibold text-slate-900">{order.customer_email || '-'}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {order.order_method === 'delivery' && (
                    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                      <SectionTitle icon={Truck}>Delivery Information</SectionTitle>
                      <dl className="mt-1 divide-y divide-slate-100">
                        <DetailRow label="Provider" value={deliveryJob?.provider || 'Manual'} />
                        <DetailRow label="Delivery Status" value={DELIVERY_JOB_STATUS_LABELS[deliveryJob?.status] || deliveryJob?.status || 'Pending Dispatch'} />
                        <DetailRow label="Address" value={order.delivery_address || '-'} />
                        <DetailRow label="Contact" value={order.customer_phone || '-'} />
                        <DetailRow label="Delivery Fee" value={`PHP ${money(order.delivery_fee)}`} />
                        {assignedRider && <DetailRow label="Assigned Rider" value={assignedRider} />}
                      </dl>
                    </section>
                  )}

                  <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                    <SectionTitle icon={MapPin}>Customer Request / Notes</SectionTitle>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-700 sm:text-xs">{resolveCustomerNotes(order)}</p>
                  </section>
                </div>

                <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3 xl:sticky xl:top-0">
                  <SectionTitle icon={Receipt}>Order Summary</SectionTitle>
                  <dl className="mt-1 divide-y divide-slate-100">
                    <DetailRow label="Order Number" value={orderNumber} />
                    <DetailRow label="Mode" value={orderMethod} />
                    <DetailRow label="Tracking PIN" value={order.tracking_pin || '-'} />
                    <DetailRow label="Original Subtotal" value={`PHP ${money(order.subtotal_amount)}`} />
                    {Number(order.discount_amount || 0) > 0 && <DetailRow label="Discount" value={`-PHP ${money(order.discount_amount)}`} valueClassName="text-rose-600" />}
                    {discount?.promo_code && <DetailRow label="Promo Code" value={discount.promo_code} />}
                    {discount?.discount_type && <DetailRow label="Discount Type" value={humanize(discount.discount_type)} />}
                    {order.discount_rate_snapshot != null && <DetailRow label="Discount Rate" value={`${Number(order.discount_rate_snapshot).toFixed(2)}%`} />}
                    {order.payment_provider && <DetailRow label="Payment Provider" value={humanize(order.payment_provider)} />}
                    {order.payment_reference && <DetailRow label="Payment Reference" value={order.payment_reference} />}
                    <DetailRow label="DGFY Convenience Fee" value={`PHP ${money(order.service_fee_amount)}`} />
                    <DetailRow label="Delivery Fee" value={`PHP ${money(order.delivery_fee)}`} />
                  </dl>
                  <div className="mt-2.5 flex items-end justify-between gap-2.5 border-t border-slate-200 pt-2">
                    <span className="text-xs font-black text-slate-950">Total Amount</span>
                    <span className="text-lg font-black tabular-nums text-[#1A4E8D] sm:text-xl">PHP {money(totalAmount)}</span>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-2 sm:justify-between sm:px-5">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
