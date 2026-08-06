import React, { useEffect } from 'react';
import { Printer, Receipt } from 'lucide-react';
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
  return parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
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

const resolveLineTotal = (line) => {
  const subtotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? 0);
  return Number.isFinite(subtotal) ? subtotal : resolveQuantity(line) * resolveUnitPrice(line);
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

const paymentStatus = (value) => String(value || 'unpaid')
  .trim()
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export default function OnlineOrderReceiptModal({
  open = false,
  onOpenChange = () => {},
  order = null,
  loading = false,
  onPrint = () => {},
  printLoading = false
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('pos-online-order-receipt-print-mode', open);
    return () => document.body.classList.remove('pos-online-order-receipt-print-mode');
  }, [open]);

  const lines = Array.isArray(order?.lines) ? order.lines : [];
  const orderNumber = order?.invoice_number || order?.tracking_pin || '-';
  const orderMethod = ORDER_METHOD_LABELS[order?.order_method] || order?.order_method || '-';
  const orderStatus = FULFILLMENT_STATUS_LABELS[order?.fulfillment_status] || order?.fulfillment_status || '-';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pos-online-order-receipt-dialog flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden border border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:w-full print:max-h-none print:w-full print:max-w-[80mm] print:border-none print:shadow-none">
        <DialogHeader className="border-b border-slate-200 px-4 py-3 print:hidden">
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-950">
            <Receipt className="h-5 w-5 text-blue-600" />
            Non-Fiscal Order Receipt
          </DialogTitle>
          <DialogDescription>Printable active-order copy. It is not a final fiscal receipt.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 print:overflow-visible print:p-0">
          {loading ? (
            <p className="text-center text-sm text-slate-600">Loading active order details...</p>
          ) : !order ? (
            <p className="text-center text-sm font-semibold text-rose-700">Failed to load the active order details.</p>
          ) : (
            <article className="font-mono text-[11px] leading-[1.35] text-slate-900 print:text-[10px]">
              <header className="border-b border-dashed border-slate-300 pb-3 text-center">
                <h2 className="font-bold uppercase tracking-wide">Non-Fiscal Order Receipt</h2>
                <p className="mt-1 text-[9px] uppercase text-amber-700">Active order copy - not a fiscal receipt</p>
              </header>

              <dl className="space-y-1 border-b border-dashed border-slate-300 py-3">
                <div className="flex justify-between gap-3"><dt>Order No.</dt><dd>{orderNumber}</dd></div>
                <div className="flex justify-between gap-3"><dt>Order Time</dt><dd className="text-right">{formatDateTime(order.scheduled_for || order.created_at)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Customer</dt><dd className="text-right">{order.customer_name || '-'}</dd></div>
                {order.customer_phone && <div className="flex justify-between gap-3"><dt>Contact</dt><dd>{order.customer_phone}</dd></div>}
                <div className="flex justify-between gap-3"><dt>Mode</dt><dd>{orderMethod}</dd></div>
                <div className="flex justify-between gap-3"><dt>Order Status</dt><dd>{orderStatus}</dd></div>
                <div className="flex justify-between gap-3"><dt>Payment</dt><dd>{PAYMENT_TYPE_LABELS[order.payment_type] || order.payment_type || '-'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Payment Status</dt><dd>{paymentStatus(order.payment_status)}</dd></div>
                {order.tracking_pin && <div className="flex justify-between gap-3"><dt>Tracking PIN</dt><dd>{order.tracking_pin}</dd></div>}
                {order.order_method === 'delivery' && <div className="flex justify-between gap-3"><dt>Address</dt><dd className="max-w-[12rem] text-right">{order.delivery_address || '-'}</dd></div>}
              </dl>

              <table className="w-full border-b border-dashed border-slate-300 py-3">
                <thead className="border-b border-dashed border-slate-300 text-left text-[9px] uppercase text-slate-600">
                  <tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line?.line_id || `${line?.item_id || 'item'}-${index}`}>
                      <td className="py-1.5 pr-2">{resolveLineName(line)}</td>
                      <td className="py-1.5 text-right">{formatQuantity(resolveQuantity(line))}</td>
                      <td className="py-1.5 text-right">PHP {money(resolveLineTotal(line))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="space-y-1 border-b border-dashed border-slate-300 py-3">
                <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>PHP {money(order.subtotal_amount)}</dd></div>
                {Number(order.discount_amount || 0) > 0 && <div className="flex justify-between gap-3"><dt>Discount</dt><dd>-PHP {money(order.discount_amount)}</dd></div>}
                {Number(order.delivery_fee || 0) > 0 && <div className="flex justify-between gap-3"><dt>Delivery Fee</dt><dd>PHP {money(order.delivery_fee)}</dd></div>}
                {Number(order.service_fee_amount || 0) > 0 && <div className="flex justify-between gap-3"><dt>Fees</dt><dd>PHP {money(order.service_fee_amount)}</dd></div>}
                <div className="flex justify-between gap-3 border-t border-slate-300 pt-2 text-sm font-bold"><dt>Total</dt><dd>PHP {money(order.total_amount)}</dd></div>
              </dl>

              {order.special_instructions && <p className="pt-3">Notes: {order.special_instructions}</p>}
              <p className="pt-3 text-center text-[9px] text-slate-500">This document is an active-order copy. Final receipt is available after completion.</p>
            </article>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-200 px-4 py-3 print:hidden sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={printLoading}>Close</Button>
          <Button type="button" className="bg-[#1A4E8D] text-white hover:bg-[#143F73]" onClick={onPrint} disabled={loading || !order || printLoading}>
            <Printer className="mr-2 h-4 w-4" />
            {printLoading ? 'Printing...' : 'Print Receipt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
