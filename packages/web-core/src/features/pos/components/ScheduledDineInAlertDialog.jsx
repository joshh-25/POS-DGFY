import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { getDineInScheduleCountdownLabel } from '../utils/dineInSchedule.js';

export default function ScheduledDineInAlertDialog({
  alert = null,
  now = null,
  onOpenChange = () => {}
}) {
  const [fallbackNow] = React.useState(() => Date.now());
  const effectiveNow = Number.isFinite(Number(now)) ? Number(now) : fallbackNow;
  const order = alert?.order || null;

  return (
    <Dialog open={Boolean(alert)} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="scheduled-dine-in-alert"
        className="border border-amber-200 bg-white shadow-2xl sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-950">
            Scheduled Dine-in Alert
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Prepare this order before the customer&apos;s scheduled serving time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <p className="text-xs font-black uppercase tracking-wide text-amber-800">
              {alert?.milestone}-minute warning
            </p>
            <p className="mt-1 text-base font-black">
              {order?.customer_name || 'Guest Buyer'}
            </p>
            <p className="mt-1 text-xs font-semibold text-amber-800">
              {order?.invoice_number
                || order?.tracking_pin
                || `Order #${order?.pos_transaction_id || '-'}`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500">Serve by</p>
              <p className="mt-1 font-bold text-slate-900">
                {order?.scheduled_for ? new Date(order.scheduled_for).toLocaleString() : '-'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">Time remaining</p>
              <p className="mt-1 font-black tabular-nums text-[#1A4E8D]">
                {order ? getDineInScheduleCountdownLabel(order, effectiveNow) : '-'}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
          >
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
