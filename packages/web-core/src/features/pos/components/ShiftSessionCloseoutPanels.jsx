import React from 'react';
import { Banknote, Receipt, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosShiftRefreshButton from './PosShiftRefreshButton.jsx';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

export function CashierShiftClosePanel({
  currencySymbol,
  expectedCashAmount,
  closeShiftForm,
  setCloseShiftForm,
  canCloseShift,
  shiftActionLoading,
  locked,
  handleCloseShift
}) {
  return (
    <section
      aria-labelledby="pos-close-cashier-shift-heading"
      data-testid="pos-close-cashier-shift-panel"
      className="min-w-0 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 sm:p-4"
    >
      <header className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-200 bg-white text-[#1A4E8D]">
          <Banknote className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="pos-close-cashier-shift-heading" className="text-sm font-black text-[#0F172A]">Close Shift</h2>
            <span className="rounded-full border border-blue-200 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#1A4E8D]">Cashier register</span>
          </div>
        </div>
      </header>

      {!canCloseShift ? (
        <PosShiftStateNotice
          variant="warning"
          message="You need shift-close or close-day permission to close shifts."
          compact
          className="mt-3"
        />
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-blue-100 bg-white/80 px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-600">Expected cash in drawer</span>
            <span className="text-sm font-black tabular-nums text-[#1A4E8D]">{currencySymbol} {expectedCashAmount}</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-closing-cash-amount" className="text-xs font-extrabold text-[#0F172A]">
              Physical cash counted ({currencySymbol})
            </Label>
            <Input
              id="shift-closing-cash-amount"
              className="h-11 rounded-lg border-blue-200 bg-white text-sm font-semibold tabular-nums text-[#0F172A] placeholder:text-slate-500 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
              type="number"
              min="0"
              step="0.01"
              value={closeShiftForm.closingCashAmount}
              onChange={(event) => setCloseShiftForm((previous) => ({ ...previous, closingCashAmount: event.target.value }))}
              placeholder={expectedCashAmount}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-closing-note" className="text-xs font-extrabold text-[#0F172A]">Closing note (optional)</Label>
            <Input
              id="shift-closing-note"
              className="h-11 rounded-lg border-blue-200 bg-white text-xs text-[#0F172A] placeholder:text-slate-500 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
              value={closeShiftForm.closingNote}
              onChange={(event) => setCloseShiftForm((previous) => ({ ...previous, closingNote: event.target.value }))}
              placeholder="End-of-shift handover note"
            />
          </div>
          <Button
            type="button"
            className={`min-h-11 w-full rounded-lg px-4 text-xs font-extrabold ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
            onClick={handleCloseShift}
            disabled={shiftActionLoading.close || locked}
            aria-busy={shiftActionLoading.close || undefined}
          >
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            {shiftActionLoading.close ? 'Closing Shift...' : 'Close Shift'}
          </Button>
        </div>
      )}
    </section>
  );
}

export function BranchDayClosePanel({
  layout = 'card',
  activeShift,
  canCloseDay,
  shiftActionLoading,
  locked,
  isOnline,
  activeTerminalMatchesOperatingLocation,
  shiftState,
  dayCloseReadinessState,
  refreshDayCloseReadiness,
  handleCloseDay
}) {
  if (!canCloseDay) return null;

  const dayCloseReadiness = dayCloseReadinessState?.readiness || null;
  const dayCloseOpenShiftCount = Number(dayCloseReadiness?.open_shift_count || 0);
  const dayCloseReady = !activeShift && dayCloseReadiness?.ready === true;
  const dayCloseActionDisabled = shiftActionLoading.zReading
    || dayCloseReadinessState?.loading
    || shiftState?.loading
    || Boolean(shiftState?.errorMessage)
    || locked
    || !isOnline
    || !activeTerminalMatchesOperatingLocation
    || !dayCloseReady;
  const isFlatLayout = layout === 'flat';
  const closeDayButton = (
    <Button
      type="button"
      data-testid="pos-close-day-button"
      className={`min-h-11 h-auto min-w-0 max-w-96 flex-[1_1_16rem] whitespace-normal rounded-lg px-3 py-2 text-center text-xs font-extrabold leading-tight ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
      onClick={handleCloseDay}
      disabled={dayCloseActionDisabled}
      aria-describedby="pos-close-day-readiness"
      aria-busy={shiftActionLoading.zReading || undefined}
    >
      <Receipt className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
      {shiftActionLoading.zReading
        ? 'Closing…'
        : dayCloseReadiness?.already_closed
          ? 'Print Z-reading'
          : 'Close Day'}
    </Button>
  );
  const refreshStatusButton = (
    <PosShiftRefreshButton
      dataTestId="pos-close-day-refresh"
      label="Refresh day-close status"
      onClick={() => void refreshDayCloseReadiness()}
      disabled={dayCloseReadinessState?.loading || shiftActionLoading.zReading || locked || !isOnline || !activeTerminalMatchesOperatingLocation}
      loading={dayCloseReadinessState?.loading}
    />
  );

  return (
    <section
      aria-labelledby="pos-branch-day-close-heading"
      data-testid="pos-branch-day-close-panel"
      className={isFlatLayout ? 'min-w-0 border-t border-slate-200 pt-5' : 'min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5'}
    >
      <header className={isFlatLayout
        ? 'flex flex-wrap items-center justify-between gap-3'
        : 'flex items-start gap-2.5'}>
        <div className={`flex min-w-0 items-start gap-2.5 ${isFlatLayout ? 'min-w-[min(100%,18rem)] flex-1' : 'flex-1'}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#1A4E8D] ${isFlatLayout ? 'bg-[#F1F2FF]' : 'border border-slate-200 bg-white'}`}>
            <Receipt className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="pos-branch-day-close-heading" className="text-sm font-black text-[#0F172A]">Branch Z-Reading</h2>
            </div>
            <p className={`${isFlatLayout ? 'mt-0.5' : 'mt-1'} text-[11px] leading-4 text-slate-600`}>
              Financially recognized sales across all cashiers.
            </p>
          </div>
        </div>
        {isFlatLayout ? (
          <div className="flex min-w-[min(100%,18rem)] flex-1 flex-wrap items-center justify-end gap-2">
            {refreshStatusButton}
            {closeDayButton}
          </div>
        ) : <div className="shrink-0">{refreshStatusButton}</div>}
      </header>

      {!isFlatLayout ? (
        <div className="mt-3 flex min-w-0 flex-wrap justify-end gap-2">
          {closeDayButton}
        </div>
      ) : null}

      <div className="mt-3" data-testid="pos-close-day-readiness">
        {!activeShift && shiftState?.loading ? (
          <PosShiftStateNotice variant="loading" message="Checking this terminal’s shift before confirming Day Close status..." compact />
        ) : !activeShift && shiftState?.errorMessage ? (
          <PosShiftStateNotice variant="error" message="The current terminal shift could not be verified. Retry before generating the branch Z-reading." compact />
        ) : activeShift ? (
          <PosShiftStateNotice variant="warning" message="Close this cashier shift before generating the branch Z-reading." compact />
        ) : dayCloseReadinessState?.loading ? (
          <PosShiftStateNotice variant="loading" message="Checking whether every cashier shift is closed..." compact />
        ) : dayCloseReadinessState?.errorMessage ? (
          <PosShiftStateNotice variant="error" message={dayCloseReadinessState.errorMessage} compact />
        ) : dayCloseReadiness && !dayCloseReadiness.ready ? (
          <PosShiftStateNotice
            variant="warning"
            message={`Close every cashier shift in this branch before generating the Z-reading. ${dayCloseOpenShiftCount} shift${dayCloseOpenShiftCount === 1 ? '' : 's'} remain open.`}
            compact
          >
            {Array.isArray(dayCloseReadiness.open_shifts) && dayCloseReadiness.open_shifts.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-4">
                {dayCloseReadiness.open_shifts.map((shift) => (
                  <li key={shift.shift_id || `${shift.terminal_id}-${shift.cashier_name}`} className="list-disc break-words">
                    {shift.terminal_id || 'Terminal'} — {shift.cashier_name || 'Cashier'}
                  </li>
                ))}
              </ul>
            ) : null}
          </PosShiftStateNotice>
        ) : dayCloseReady && !activeTerminalMatchesOperatingLocation ? (
          <PosShiftStateNotice
            variant="warning"
            message="This terminal is assigned to another branch. Select a terminal in this branch to generate its Z-reading."
            compact
          />
        ) : dayCloseReady ? (
          <PosShiftStateNotice
            variant="success"
            message={dayCloseReadiness?.already_closed
              ? 'The branch Z-reading is already generated and ready to print again.'
              : 'All cashier shifts are closed. The branch Z-reading is ready to generate.'}
            compact
          />
        ) : (
          <PosShiftStateNotice variant="info" message="Check Day Close status before generating the Z-reading." compact />
        )}
      </div>
      {!isOnline ? <p className="mt-2 text-[11px] text-amber-800">Reconnect before closing the day.</p> : null}
    </section>
  );
}
