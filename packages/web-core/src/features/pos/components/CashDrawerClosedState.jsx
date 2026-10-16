import React, { useEffect, useRef } from 'react';
import { ArrowRight, Banknote, Clock3, History, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import PosShiftRefreshButton from './PosShiftRefreshButton.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';
import {
  formatCashierHistoryDateTime,
  formatCashierHistoryMoney
} from '../utils/cashierHistoryFormatters.js';

const normalizeId = (value) => String(value ?? '').trim();

const formatDateTime = (value) => value ? formatCashierHistoryDateTime(value) : '—';
const formatMoney = formatCashierHistoryMoney;

const getLatestClosedShift = (records, terminalId) => {
  const matchingRecords = (Array.isArray(records) ? records : []).filter((record) => {
    const shift = record?.shift;
    return String(shift?.status || '').toLowerCase() === 'closed'
      && normalizeId(shift?.terminal_id) === terminalId
      && Boolean(shift?.closed_at);
  });
  matchingRecords.sort((left, right) => (
    new Date(right?.shift?.closed_at).getTime() - new Date(left?.shift?.closed_at).getTime()
  ));
  return matchingRecords[0] || null;
};

function DetailRow({ icon: Icon, label, value, emphasis = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-[#1A4E8D]" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <dt className="min-w-0 flex-1 text-sm text-slate-600">{label}</dt>
      <dd className={`max-w-[55%] break-words text-right text-sm tabular-nums ${emphasis ? 'font-black text-[#0F172A]' : 'font-semibold text-slate-800'}`}>
        {value}
      </dd>
    </div>
  );
}

export default function CashDrawerClosedState({
  terminalId = '',
  locationId = null,
  state = { loading: false, records: [], errorMessage: '' },
  onRefresh = async () => null,
  onOpenShiftSession = () => {},
  shiftStatusLoading = false,
  locked = false,
  isOnline = true,
  currency = '₱'
}) {
  const requestedScopeRef = useRef('');
  const normalizedTerminalId = normalizeId(terminalId);
  const normalizedLocationId = normalizeId(locationId);

  useEffect(() => {
    if (!normalizedTerminalId || !isOnline || locked) return;
    const scopeKey = `${normalizedLocationId}:${normalizedTerminalId}`;
    if (requestedScopeRef.current === scopeKey) return;
    requestedScopeRef.current = scopeKey;
    void onRefresh({ status: 'closed', page: 1, limit: 50, ...(locationId ? { location_id: locationId } : {}) });
  }, [isOnline, locationId, locked, normalizedLocationId, normalizedTerminalId, onRefresh]);

  const latestClosedShift = getLatestClosedShift(state?.records, normalizedTerminalId);

  const shift = latestClosedShift?.shift || null;
  const shiftId = shift?.pos_terminal_shift_id || shift?.shift_id;
  const hasExpectedCash = latestClosedShift?.cash_summary?.expected_cash_amount != null;
  const hasClosedShiftHistoryError = Boolean(state?.errorMessage);

  return (
    <section className="grid gap-4 lg:grid-cols-2" data-testid="cash-drawer-closed-state" aria-busy={state?.loading || shiftStatusLoading || undefined}>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 sm:p-5" aria-labelledby="cash-drawer-status-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="cash-drawer-status-heading" className="text-lg font-black text-[#0F172A]">Shift Status</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700" aria-live="polite" aria-atomic="true">
            <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden="true" />
            {shiftStatusLoading ? 'Checking shift status' : 'No active shift'}
          </span>
        </div>

        <dl className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3">
          <DetailRow icon={Monitor} label="Terminal" value={normalizedTerminalId || 'No terminal selected'} />
          <DetailRow icon={History} label="Last closed shift" value={shiftId ? `#${shiftId}` : '—'} />
          <DetailRow icon={Clock3} label="Closed at" value={formatDateTime(shift?.closed_at)} />
          <DetailRow
            icon={Banknote}
            label="Expected cash at close"
            value={hasExpectedCash ? formatMoney(latestClosedShift.cash_summary.expected_cash_amount, currency) : '—'}
            emphasis
          />
        </dl>

        {hasClosedShiftHistoryError ? (
          <PosShiftStateNotice
            variant="error"
            title={latestClosedShift ? 'Refresh failed — showing last results' : ''}
            message={state.errorMessage}
            compact
            className="mt-3"
          />
        ) : state?.loading && !latestClosedShift ? (
          <PosShiftStateNotice variant="loading" message="Loading the latest closed shift for this terminal…" compact className="mt-3" />
        ) : null}
        {!shiftStatusLoading && !state?.loading && !state?.errorMessage && state?.cashier && !latestClosedShift ? (
          <PosShiftStateNotice
            variant="empty"
            message="No closed shift found for this terminal."
            compact
            className="mt-3"
          />
        ) : null}
        {!isOnline ? (
          <PosShiftStateNotice variant="warning" message="You are offline. Shift history may be unavailable or out of date." compact className="mt-3" />
        ) : null}
        <PosShiftRefreshButton
          label="Refresh closed shift history"
          className="mt-3"
          onClick={() => void onRefresh({ status: 'closed', page: 1, limit: 50, ...(locationId ? { location_id: locationId } : {}) })}
          disabled={state?.loading || shiftStatusLoading || locked || !isOnline}
          loading={state?.loading}
        />
      </article>

      <article className="flex flex-col rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5" aria-labelledby="cash-drawer-next-step-heading">
        <div>
          <h2 id="cash-drawer-next-step-heading" className="mt-1 text-lg font-black text-[#0F172A]">Start a shift</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Open a shift to record drawer activity.
          </p>
        </div>
        <Button
          type="button"
          className={`mt-4 h-12 w-full rounded-lg text-sm font-extrabold ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
          onClick={onOpenShiftSession}
          disabled={shiftStatusLoading}
        >
          Go to Shift Session
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </article>
    </section>
  );
}
