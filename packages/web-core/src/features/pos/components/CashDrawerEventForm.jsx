import React from 'react';
import { Banknote, Check, ClipboardList, History, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PosDropdownSelect from './PosDropdownSelect.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS,
  POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

const EVENT_TYPE_OPTIONS = [
  { value: 'cash_in', label: 'Cash In' },
  { value: 'cash_out', label: 'Cash Out' },
  { value: 'opening_adjustment', label: 'Opening Adjustment' },
  { value: 'closing_adjustment', label: 'Closing Adjustment' }
];

const EVENT_TYPE_HELP = {
  cash_in: 'Add cash to the drawer.',
  cash_out: 'Record cash removed from the drawer.',
  opening_adjustment: 'Correct the opening balance.',
  closing_adjustment: 'Correct the closing balance.'
};

function RequiredLabel({ children, htmlFor, id }) {
  return (
    <Label
      id={id}
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] font-bold text-[#0F172A]"
    >
      {children} <span className="text-rose-600" aria-hidden="true">*</span>
      <span className="sr-only"> (required)</span>
    </Label>
  );
}

export default function CashDrawerEventForm({
  currencySymbol = 'PHP',
  canAdjustCashDrawer = false,
  cashEventForm = { eventType: 'cash_in', amount: '', reason: '' },
  setCashEventForm = () => {},
  saving = false,
  locked = false,
  onRecord = () => {},
  onOpenCashierHistory = () => {}
}) {
  const currency = currencySymbol || 'PHP';
  const eventTypeHelp = EVENT_TYPE_HELP[cashEventForm.eventType] || EVENT_TYPE_HELP.cash_in;

  return (
    <section
      data-testid="pos-cash-drawer-event-form"
      aria-labelledby="pos-cash-drawer-event-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8EDFF] text-[#1A4E8D]">
            <Banknote className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="pos-cash-drawer-event-title" className="text-base font-extrabold text-[#0F172A]">
              Cash Drawer Event
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Record a cash adjustment for this shift.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-md bg-[#E8EDFF] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#1A4E8D]">
          Manual Log
        </span>
      </header>

      {!canAdjustCashDrawer ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          You need cash drawer adjustment permission to use this section.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <div>
            <RequiredLabel id="pos-cash-drawer-event-type-label" htmlFor="pos-cash-drawer-event-type">
              Event Type
            </RequiredLabel>
            <PosDropdownSelect
              id="pos-cash-drawer-event-type"
              ariaLabelledBy="pos-cash-drawer-event-type-label"
              ariaDescribedBy="pos-cash-drawer-event-type-help"
              required
              className="w-full"
              triggerClassName="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-[#0F172A] transition-colors hover:border-[#8AA8CD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              value={cashEventForm.eventType}
              onChange={(eventType) => setCashEventForm((previous) => ({ ...previous, eventType }))}
              listboxLabel="Event Type options"
              options={EVENT_TYPE_OPTIONS}
              startAdornment={<Banknote className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />}
              disabled={locked || saving}
              testId="pos-cash-drawer-event-type-select"
            />
            <p id="pos-cash-drawer-event-type-help" className="mt-1.5 text-xs leading-5 text-slate-500">
              {eventTypeHelp}
            </p>
          </div>

          <div>
            <RequiredLabel htmlFor="pos-cash-drawer-event-amount">Amount ({currency})</RequiredLabel>
            <div className="flex min-h-11 overflow-hidden rounded-lg border border-slate-200 transition-colors focus-within:border-[#1A4E8D] focus-within:ring-2 focus-within:ring-[#1A4E8D]/15">
              <span className="inline-flex min-w-[4.25rem] items-center justify-center bg-[#E8EDFF] px-3 text-sm font-bold text-[#1A4E8D]">
                {currency}
              </span>
              <Input
                id="pos-cash-drawer-event-amount"
                className="h-11 min-w-0 flex-1 rounded-none border-0 px-3 text-base font-semibold text-[#0F172A] shadow-none focus-visible:ring-0"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                required
                value={cashEventForm.amount}
                onChange={(event) => {
                  const amount = event.target.value;
                  setCashEventForm((previous) => ({ ...previous, amount }));
                }}
                placeholder="0.00"
                disabled={locked || saving}
              />
            </div>
          </div>

          <div>
            <RequiredLabel htmlFor="pos-cash-drawer-event-reason">Reason</RequiredLabel>
            <div className="relative">
              <ClipboardList
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <Input
                id="pos-cash-drawer-event-reason"
                className="h-11 rounded-lg border-slate-200 pl-10 text-sm font-medium text-[#0F172A] placeholder:text-slate-400 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/15"
                value={cashEventForm.reason}
                onChange={(event) => {
                  const reason = event.target.value;
                  setCashEventForm((previous) => ({ ...previous, reason }));
                }}
                placeholder="Reason for adjustment"
                minLength={3}
                required
                aria-describedby="pos-cash-drawer-event-reason-help"
                disabled={locked || saving}
              />
            </div>
            <p id="pos-cash-drawer-event-reason-help" className="mt-1.5 text-xs leading-5 text-slate-500">
              Explain this adjustment for the audit trail.
            </p>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className={`h-11 w-full rounded-lg border-[#8AA8CD] px-4 text-sm font-bold text-[#1A4E8D] hover:border-[#1A4E8D] hover:text-[#143F73] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 sm:w-auto ${POS_SHIFT_SECONDARY_BUTTON_CLASS} !bg-[#E8EDFF] hover:!bg-[#DDE6FF]`}
              onClick={onOpenCashierHistory}
              disabled={locked}
            >
              <History className="mr-2 h-4 w-4" aria-hidden="true" />
              Cashier History
            </Button>
            <Button
              type="button"
              className={`h-11 w-full rounded-lg px-4 text-sm font-extrabold shadow-sm sm:w-auto ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
              onClick={onRecord}
              disabled={saving || locked}
              aria-busy={saving || undefined}
            >
              {saving ? (
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Saving Event...' : 'Record Cash Event'}
            </Button>
          </footer>
        </div>
      )}
    </section>
  );
}
