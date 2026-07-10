import React from 'react';
import {
  Calendar,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
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
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const humanize = (value) => String(value || '').trim().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

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
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-black text-slate-950">{value}</p>
      </div>
    </div>
  );
};

const SectionTitle = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
      <Icon className="h-4 w-4" />
    </span>
    <h3 className="text-xs font-black uppercase tracking-wide text-slate-950">{children}</h3>
  </div>
);

const DetailRow = ({ label, value, valueClassName = '' }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-1.5 text-xs sm:text-sm">
    <dt className="text-slate-600">{label}</dt>
    <dd className={`max-w-[15rem] text-right font-semibold text-slate-900 ${valueClassName}`}>{value ?? '-'}</dd>
  </div>
);

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
  const orderNumber = order?.invoice_number || order?.tracking_pin || '-';
  const orderMethod = ORDER_METHOD_LABELS[order?.order_method] || order?.order_method || '-';
  const orderStatus = FULFILLMENT_STATUS_LABELS[order?.fulfillment_status] || order?.fulfillment_status || '-';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden border border-slate-200 bg-slate-50 p-0 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] xl:max-w-[1480px]">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 sm:h-12 sm:w-12">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-lg font-black text-slate-950 sm:text-2xl">
                  {order ? `Order #${orderNumber}` : mode === 'print' ? 'Print Order' : 'Open Order'}
                </DialogTitle>
                {order && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                    <Truck className="h-3.5 w-3.5" />
                    {orderMethod}
                  </span>
                )}
              </div>
              <DialogDescription className="mt-0.5 truncate text-xs text-slate-600 sm:text-sm">
                {mode === 'print'
                  ? 'Review the active customer order before printing the order copy.'
                  : 'Review the active customer order details.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              Loading active order details...
            </div>
          ) : !order ? (
            <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
              Failed to load the active order details.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Calendar} label="Scheduled Date/Time" value={formatDateTime(pickupSchedule)} />
                <MetricCard icon={Receipt} label="Payment Status" value={paymentStatus} tone="emerald" />
                <MetricCard icon={Receipt} label="Payment Method" value={PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'} tone="amber" />
                <MetricCard icon={Package} label="Order Status" value={orderStatus} tone="violet" />
              </div>

              <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)_minmax(280px,0.78fr)]">
                <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                  <SectionTitle icon={Package}>Ordered Items</SectionTitle>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-xs sm:text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                          <th className="py-2 pr-3">Item</th>
                          <th className="px-2 py-2 text-right">Qty</th>
                          <th className="px-2 py-2 text-right">Unit Price</th>
                          <th className="py-2 pl-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line, index) => (
                          <tr key={line?.line_id || `${line?.item_id || 'item'}-${index}`}>
                            <td className="py-3 pr-3 font-semibold text-slate-900">{resolveLineName(line)}</td>
                            <td className="px-2 py-3 text-right tabular-nums text-slate-700">{formatQuantity(resolveQuantity(line))}</td>
                            <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-slate-700">PHP {money(resolveUnitPrice(line))}</td>
                            <td className="whitespace-nowrap py-3 pl-2 text-right font-black tabular-nums text-slate-950">PHP {money(resolveLineSubtotal(line))}</td>
                          </tr>
                        ))}
                        {lines.length === 0 && (
                          <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-500">No ordered items found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="grid min-w-0 gap-3">
                  <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                    <SectionTitle icon={UserRound}>Customer Information</SectionTitle>
                    <div className="mt-2 grid gap-2 text-xs sm:text-sm">
                      <div className="flex min-w-0 items-start gap-2">
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0"><p className="text-slate-500">Name</p><p className="break-words font-bold text-slate-950">{order.customer_name || '-'}</p></div>
                      </div>
                      <div className="flex min-w-0 items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0"><p className="text-slate-500">Phone</p><p className="break-words font-semibold text-slate-900">{order.customer_phone || '-'}</p></div>
                      </div>
                      <div className="flex min-w-0 items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0"><p className="text-slate-500">Email</p><p className="break-all font-semibold text-slate-900">{order.customer_email || '-'}</p></div>
                      </div>
                    </div>
                  </section>

                  {order.order_method === 'delivery' && (
                    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
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

                  <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                    <SectionTitle icon={MapPin}>Customer Request / Notes</SectionTitle>
                    <p className="mt-2 text-xs leading-5 text-slate-700 sm:text-sm">{resolveCustomerNotes(order)}</p>
                  </section>
                </div>

                <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 xl:sticky xl:top-0">
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
                  <div className="mt-3 flex items-end justify-between gap-3 border-t-2 border-slate-100 pt-3">
                    <span className="text-sm font-black text-slate-950">Total Amount</span>
                    <span className="text-xl font-black tabular-nums text-[#1A4E8D] sm:text-2xl">PHP {money(totalAmount)}</span>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-between sm:px-5">
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
