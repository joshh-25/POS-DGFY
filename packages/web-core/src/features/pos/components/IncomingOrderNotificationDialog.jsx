import React from 'react';
import { BellRing, Clock3, CreditCard, Receipt, ShoppingBag, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  getFulfillmentStatusLabel,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS
} from './orderFulfillmentUi.js';
import { formatOrderAmount, formatOrderDateTime, formatOrderQuantity } from '../utils/incomingQueueOrderFormatting.js';

const getOrderReference = (order) => (
  order?.invoice_number
  || order?.tracking_pin
  || order?.pos_transaction_id
  || 'Pending'
);

const getLineName = (line) => (
  line?.item?.name
  || line?.item_name
  || line?.description
  || 'Item'
);

const getLineKey = (line, index) => (
  line?.pos_transaction_line_id
  || line?.id
  || line?.item_id
  || `${getLineName(line)}-${index}`
);

const getCustomerDisplayName = (order) => (
  String(order?.storeCustomer?.name || order?.store_customer?.name || order?.customer_name || '').trim()
  || 'Guest Buyer'
);

export default function IncomingOrderNotificationDialog({
  order = null,
  onClose,
  onViewOrder
}) {
  const lines = Array.isArray(order?.lines) ? order.lines : [];
  const orderMethod = String(order?.order_method || '').trim();
  const fulfillmentStatus = getFulfillmentStatusLabel(order?.fulfillment_status, order) || 'Placed';
  const orderReference = getOrderReference(order);
  const customerDisplayName = getCustomerDisplayName(order);

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-lg rounded-2xl border border-blue-100 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
        data-testid="pos-incoming-order-notification-dialog"
      >
        <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-[#1A4E8D] to-[#2563EB] px-5 py-5 text-left text-white sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-white">
            <BellRing className="h-5 w-5" aria-hidden="true" />
            New incoming order
          </DialogTitle>
          <DialogDescription className="text-sm text-blue-100">
            Order #{orderReference} has been received and is ready for review.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                Customer
              </p>
              <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{customerDisplayName}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                Order type
              </p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">
                {ORDER_METHOD_LABELS[orderMethod] || orderMethod || 'Online'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                Payment
              </p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">
                {PAYMENT_TYPE_LABELS[order?.payment_type] || order?.payment_type || 'Not specified'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                Received
              </p>
              <p className="mt-1 text-sm font-extrabold text-slate-900">{formatOrderDateTime(order?.created_at)}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-blue-700">Status</p>
              <p className="mt-1 text-sm font-extrabold text-blue-950">{fulfillmentStatus}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-black uppercase tracking-wide text-blue-700">Total</p>
              <p className="mt-1 text-lg font-black tabular-nums text-[#1A4E8D]">{formatOrderAmount(order?.total_amount)}</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Items
            </p>
            {lines.length > 0 ? (
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {lines.map((line, index) => (
                  <div key={getLineKey(line, index)} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-semibold text-slate-900">{getLineName(line)}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-600">× {formatOrderQuantity(line?.quantity ?? 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">
                Item details are available on the Orders page.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} className="w-full font-extrabold sm:w-auto">
            Close
          </Button>
          <Button type="button" onClick={onViewOrder} className="w-full bg-[#1A4E8D] font-extrabold text-white hover:bg-[#143F73] sm:w-auto">
            View Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
