import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosShiftRefreshButton from './PosShiftRefreshButton.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

const normalizeLabel = (label) => String(label || '').replace(/:$/, '').trim();

function ShiftContextItem({ row }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 text-[11px] leading-4 sm:flex-row sm:items-baseline sm:gap-1.5 sm:text-xs sm:leading-5 ${row.mobileSpan === 'full' ? 'col-span-2 sm:col-auto' : ''}`}>
      <dt className="min-w-0 break-words font-semibold text-slate-500 sm:shrink-0">{normalizeLabel(row.label)}</dt>
      <dd className="min-w-0 break-words font-bold text-slate-800 sm:truncate" title={typeof row.value === 'string' ? row.value : undefined}>
        {row.value}
      </dd>
    </div>
  );
}

function ShiftMetric({ row }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 sm:p-3.5 ${row.highlight
      ? 'border-blue-200 bg-blue-50/80'
      : 'border-slate-200 bg-white'}`}>
      <dt className="text-[11px] font-bold leading-4 text-slate-600 sm:text-xs">{normalizeLabel(row.label)}</dt>
      <dd className={`mt-1.5 break-words text-base font-black leading-5 tabular-nums sm:text-lg ${row.highlight ? 'text-[#1A4E8D]' : 'text-[#0F172A]'}`}>
        {row.value}
      </dd>
    </div>
  );
}

export default function ShiftSessionSummary({
  summaryRows = [],
  onViewSummary = () => {},
  onRefresh = () => {},
  summaryLoading = false,
  refreshLoading = false,
  refreshErrorMessage = '',
  closeLoading = false,
  locked = false,
  isOnline = true
}) {
  const detailRows = summaryRows.filter((row) => row.group !== 'financial');
  const financialRows = summaryRows.filter((row) => row.group === 'financial');
  const shiftIdRow = detailRows.find((row) => /shift\s*(id|#)/i.test(normalizeLabel(row.label)));
  const contextRows = detailRows.filter((row) => row !== shiftIdRow);

  return (
    <section
      aria-labelledby="pos-shift-session-summary-heading"
      data-testid="pos-shift-session-summary"
      className="space-y-3"
    >
      <header className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-white px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {shiftIdRow ? (
              <span className="inline-flex min-h-7 items-center rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-black tracking-wide text-[#1A4E8D]">
                SHIFT <span>{shiftIdRow.value}</span>
              </span>
            ) : null}
            <h2 id="pos-shift-session-summary-heading" className="text-base font-black tracking-tight text-[#0B1647] sm:text-lg">
              Active Shift
            </h2>
            <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-extrabold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
              Open
            </span>
          </div>
          {contextRows.length > 0 ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-0.5">
              {contextRows.map((row) => <ShiftContextItem key={`pos-shift-session-${row.label}`} row={row} />)}
            </dl>
          ) : null}
          <h3 className="sr-only">Shift details</h3>
        </div>
        <div className="flex w-full min-w-0 shrink-0 items-center gap-2 sm:w-auto">
          <Button
            type="button"
            className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 text-xs font-extrabold sm:flex-none sm:w-auto ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
            onClick={onViewSummary}
            disabled={locked || closeLoading || summaryLoading}
          >
            {summaryLoading ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {summaryLoading ? 'Refreshing...' : 'View Summary'}
          </Button>
          <PosShiftRefreshButton
            label="Refresh shift data"
            onClick={onRefresh}
            disabled={locked || !isOnline || refreshLoading}
            loading={refreshLoading}
          />
        </div>
      </header>

      {refreshErrorMessage ? (
        <PosShiftStateNotice
          variant="error"
          title="Shift data could not be refreshed"
          message={`${refreshErrorMessage} The last successfully loaded figures remain visible.`}
          compact
        />
      ) : null}

      <section aria-labelledby="pos-shift-cash-overview-heading">
        <h3 id="pos-shift-cash-overview-heading" className="sr-only">Cash overview</h3>
        <dl className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {financialRows.map((row) => <ShiftMetric key={`pos-shift-session-${row.label}`} row={row} />)}
        </dl>
      </section>
    </section>
  );
}
