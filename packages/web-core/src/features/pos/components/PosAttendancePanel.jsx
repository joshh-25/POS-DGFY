import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Coffee,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import {
  countedPosCustodyHandoff,
  endPosCashierBreak,
  endPosCashierReliefDuty,
  endPosSharedRelief,
  fetchCurrentPosOperator,
  fetchCurrentPosCashierAttendance,
  fetchEligiblePosOperators,
  POS_ATTENDANCE_CONFIG_CHANGED_EVENT,
  returnPosRegister,
  startPosCashierBreak,
  startPosCashierReliefDuty,
  startPosSharedRelief,
  takeOverPosRegister,
  timeInPosCashierAttendance,
  timeOutPosCashierAttendance
} from '../services/posService.js';

const makeIdempotencyKey = (action) => {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `pos-attendance-${action}-${suffix}`.slice(0, 120);
};

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const elapsedMinutes = (value, nowValue) => {
  const started = new Date(value || '').getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((nowValue - started) / 60000));
};

const readErrorMessage = (error) => (
  error?.response?.data?.message
  || error?.message
  || 'The attendance action could not be completed.'
);
const NOOP = () => {};

export default function PosAttendancePanel({
  locationId,
  terminalId,
  shiftId,
  isOnline = true,
  canOperate = false,
  canView = false,
  compact = false,
  locked = false,
  onBreakAndLock = NOOP,
  onOperatorAuthorityChange = NOOP
}) {
  const [state, setState] = useState({ loading: true, payload: null, error: '' });
  const [operatorState, setOperatorState] = useState({ loading: false, current: null, eligible: [], error: '' });
  const [operatorForm, setOperatorForm] = useState({ userId: '', pin: '', countedCashAmount: '', countedAcknowledged: false });
  const [inFlight, setInFlight] = useState('');
  const [clock, setClock] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!canView || locked || !locationId || !isOnline) {
      setState((previous) => ({ ...previous, loading: false }));
      return null;
    }
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const payload = await fetchCurrentPosCashierAttendance({ location_id: locationId });
      setState({ loading: false, payload: payload || null, error: '' });
      return payload;
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: readErrorMessage(error) }));
      return null;
    }
  }, [canView, isOnline, locationId, locked]);

  const refreshOperator = useCallback(async () => {
    if (!canView || compact || locked || !locationId || !terminalId || !shiftId || !isOnline) {
      setOperatorState((previous) => ({ ...previous, loading: false }));
      return null;
    }
    const params = { terminal_id: terminalId, location_id: locationId, shift_id: shiftId };
    setOperatorState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const [current, eligiblePayload] = await Promise.all([
        fetchCurrentPosOperator(params),
        fetchEligiblePosOperators(params)
      ]);
      const eligible = Array.isArray(eligiblePayload?.operators) ? eligiblePayload.operators : [];
      setOperatorState({ loading: false, current: current || null, eligible, error: '' });
      setOperatorForm((previous) => ({
        ...previous,
        userId: previous.userId || String(current?.operator_session?.user_id || eligible[0]?.user_id || '')
      }));
      onOperatorAuthorityChange(current || null);
      return current;
    } catch (error) {
      const message = readErrorMessage(error);
      setOperatorState((previous) => ({ ...previous, loading: false, current: null, error: message }));
      onOperatorAuthorityChange(null);
      return null;
    }
  }, [canView, compact, isOnline, locationId, locked, onOperatorAuthorityChange, shiftId, terminalId]);

  useEffect(() => {
    if (!canView) return undefined;
    refresh();
  }, [canView, refresh]);

  useEffect(() => {
    if (!canView || compact) return undefined;
    const handleConfigChange = () => {
      setState((previous) => ({ ...previous, loading: true, error: '' }));
      refresh();
    };
    window.addEventListener(POS_ATTENDANCE_CONFIG_CHANGED_EVENT, handleConfigChange);
    return () => window.removeEventListener(POS_ATTENDANCE_CONFIG_CHANGED_EVENT, handleConfigChange);
  }, [refresh]);

  useEffect(() => {
    if (state.payload?.feature?.enabled === true) refreshOperator();
  }, [canView, compact, refreshOperator, state.payload?.feature?.enabled]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const attendance = state.payload?.attendance_session || null;
  const activeBreak = state.payload?.active_break || null;
  const enabled = state.payload?.feature?.enabled === true;
  const isRelief = attendance?.duty_type === 'relief';
  const breakElapsed = useMemo(() => elapsedMinutes(activeBreak?.started_at, clock), [activeBreak?.started_at, clock]);
  const currentOperator = operatorState.current?.operator_session || null;
  const currentOperatorUser = operatorState.current?.operator_user || null;
  const operatorAuthorityValid = operatorState.current?.authority_valid === true && Boolean(currentOperator);

  if (!canView) return null;

  const runAction = async (action, operation) => {
    if (!canOperate || inFlight || !isOnline) return;
    setInFlight(action);
    setState((previous) => ({ ...previous, error: '' }));
    try {
      await operation({
        idempotency_key: makeIdempotencyKey(action),
        location_id: locationId
      });
      await refresh();
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: `${readErrorMessage(error)} Refresh the attendance state and try again.`
      }));
    } finally {
      setInFlight('');
    }
  };

  const runOperatorAction = async (action, operation, { counted = false } = {}) => {
    if (!canOperate || inFlight || !isOnline || !terminalId || !shiftId) return;
    const userId = Number.parseInt(operatorForm.userId, 10);
    if (!Number.isInteger(userId) || userId <= 0 || !/^[0-9]{4,12}$/.test(operatorForm.pin)) {
      setOperatorState((previous) => ({ ...previous, error: 'Select a timed-in cashier and enter their 4 to 12 digit PIN.' }));
      return;
    }
    if (counted && (!operatorForm.countedCashAmount || Number(operatorForm.countedCashAmount) < 0)) {
      setOperatorState((previous) => ({ ...previous, error: 'Enter the counted cash amount for the custody handoff.' }));
      return;
    }
    if (counted && operatorForm.countedAcknowledged !== true) {
      setOperatorState((previous) => ({ ...previous, error: 'The outgoing cashier must confirm the counted cash and custody transfer.' }));
      return;
    }
    setInFlight(action);
    setOperatorState((previous) => ({ ...previous, error: '' }));
    try {
      await operation({
        idempotency_key: makeIdempotencyKey(action),
        user_id: userId,
        pin: operatorForm.pin,
        terminal_id: terminalId,
        location_id: locationId,
        shift_id: shiftId,
        ...(counted ? {
          counted_cash_amount: Number(operatorForm.countedCashAmount),
          outgoing_acknowledged: operatorForm.countedAcknowledged,
          incoming_acknowledged: true
        } : {})
      });
      setOperatorForm((previous) => ({ ...previous, pin: '', countedCashAmount: '', countedAcknowledged: false }));
      await refreshOperator();
    } catch (error) {
      setOperatorState((previous) => ({ ...previous, error: readErrorMessage(error) }));
    } finally {
      setInFlight('');
    }
  };

  if (locked) return null;
  if (compact) {
    if (!enabled && !state.error) return null;
    return (
      <section className="mx-2 mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:mx-4 lg:mx-6" aria-label="Cashier status" data-testid="pos-attendance-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Coffee size={15} className="shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <span className="truncate text-xs font-extrabold text-slate-800">
              {activeBreak ? `On break since ${formatTime(activeBreak.started_at)}` : attendance ? `Working since ${formatTime(attendance.started_at)}` : 'Shift attendance will start when you open the shift'}
            </span>
          </div>
          {attendance && activeBreak && canOperate ? (
            <button type="button" onClick={() => runAction('break-end', endPosCashierBreak)} disabled={!isOnline || Boolean(inFlight)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-[11px] font-extrabold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Coffee size={13} aria-hidden="true" /> End Break
            </button>
          ) : attendance && !activeBreak ? (
            <button type="button" onClick={onBreakAndLock} disabled={!canOperate || !isOnline || Boolean(inFlight)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-[11px] font-extrabold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Coffee size={13} aria-hidden="true" /> Break &amp; Lock
            </button>
          ) : null}
        </div>
        {state.error ? <p className="mt-1 text-[11px] font-semibold text-rose-700" role="alert">{state.error}</p> : null}
      </section>
    );
  }
  if (!enabled) {
    if (!state.error) return null;
    return (
      <section className="mx-2 mt-2 rounded-2xl border border-rose-200 bg-white px-3 py-3 shadow-sm sm:mx-4 lg:mx-6" aria-label="Cashier attendance" data-testid="pos-attendance-panel">
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
        <button type="button" onClick={refresh} disabled={state.loading || !isOnline} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-300 px-3 text-xs font-extrabold text-rose-800 disabled:opacity-50">
          <RefreshCw size={13} aria-hidden="true" /> Retry attendance
        </button>
      </section>
    );
  }

  return (
    <section
      className="mx-2 mt-2 rounded-2xl border border-blue-100 bg-white px-3 py-3 shadow-sm sm:mx-4 lg:mx-6"
      aria-label="Cashier attendance"
      data-testid="pos-attendance-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]" aria-hidden="true">
              <Coffee size={17} />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">Attendance</h2>
              <p className="text-[11px] font-semibold text-slate-500">
                {attendance ? `${isRelief ? 'Relief duty' : 'Regular duty'} since ${formatTime(attendance.started_at)}` : 'Not timed in'}
              </p>
            </div>
          </div>
          {activeBreak ? (
            <p className="mt-2 text-xs font-semibold text-amber-800" role="status">
              On break since {formatTime(activeBreak.started_at)} · {breakElapsed} min elapsed
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={state.loading || Boolean(inFlight) || !isOnline}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Refresh attendance"
        >
          <RefreshCw size={13} className={state.loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {state.error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      {!isOnline ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" role="status">
          Reconnect to change attendance. The server is the official time source.
        </p>
      ) : null}

      {canOperate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!attendance ? (
            <>
              <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runAction('time-in', timeInPosCashierAttendance)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-xs font-extrabold text-white hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-50">
                <LogIn size={14} /> Time In
              </button>
              <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runAction('relief-start', startPosCashierReliefDuty)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1A4E8D] px-3 text-xs font-extrabold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                <LogIn size={14} /> Start Relief Duty
              </button>
            </>
          ) : activeBreak ? (
            <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runAction('break-end', endPosCashierBreak)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-extrabold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Coffee size={14} /> End Break
            </button>
          ) : (
            <>
              <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runAction('break-start', startPosCashierBreak)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 px-3 text-xs font-extrabold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50">
                <Coffee size={14} /> Start Break
              </button>
              <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runAction(isRelief ? 'relief-end' : 'time-out', isRelief ? endPosCashierReliefDuty : timeOutPosCashierAttendance)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                <LogOut size={14} /> {isRelief ? 'End Relief Duty' : 'Time Out'}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-500">You have view-only attendance access.</p>
      )}

      {shiftId ? (
        <div className="mt-4 border-t border-slate-200 pt-3" data-testid="pos-operator-authority-panel">
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${operatorAuthorityValid ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
            {operatorAuthorityValid ? <ShieldCheck size={16} className="mt-0.5 shrink-0" /> : <UserRound size={16} className="mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-black">
                {operatorAuthorityValid
                  ? `Current cashier: ${currentOperatorUser?.username || currentOperatorUser?.email || `User ${currentOperator.user_id}`}`
                  : 'Register locked: cashier takeover required'}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold">
                Sales, payments, refunds, voids, and drawer actions are recorded under this cashier.
              </p>
            </div>
          </div>

          {operatorState.error ? (
            <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{operatorState.error}</p>
          ) : null}

          {canOperate ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.55fr)_minmax(8rem,0.45fr)]">
              <label className="text-[11px] font-bold text-slate-700">
                Cashier
                <select
                  value={operatorForm.userId}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, userId: event.target.value }))}
                  disabled={operatorState.loading || Boolean(inFlight)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                >
                  <option value="">Select timed-in cashier</option>
                  {operatorState.eligible.map((operator) => (
                    <option key={operator.user_id} value={operator.user_id}>
                      {operator.username || operator.email || `User ${operator.user_id}`}{operator.duty_type === 'relief' ? ' · Relief' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-bold text-slate-700">
                Cashier PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={operatorForm.pin}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, pin: event.target.value.replace(/\D/g, '').slice(0, 12) }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold"
                  aria-label="Cashier PIN"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-700">
                Counted cash
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={operatorForm.countedCashAmount}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, countedCashAmount: event.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold"
                  aria-label="Counted cash"
                />
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700 sm:col-span-3">
                <input
                  type="checkbox"
                  checked={operatorForm.countedAcknowledged}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, countedAcknowledged: event.target.checked }))}
                  disabled={Boolean(inFlight) || !isOnline}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>Outgoing cashier confirms the counted cash and transfer of drawer custody.</span>
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runOperatorAction('takeover', takeOverPosRegister)} className="h-9 rounded-lg bg-[#1A4E8D] px-3 text-xs font-extrabold text-white disabled:opacity-50">Take over</button>
                <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runOperatorAction('return', returnPosRegister)} className="h-9 rounded-lg border border-[#1A4E8D] px-3 text-xs font-extrabold text-[#1A4E8D] disabled:opacity-50">Return register</button>
                <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runOperatorAction('relief-start', startPosSharedRelief)} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-extrabold text-slate-700 disabled:opacity-50">Start shared relief</button>
                <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runOperatorAction('relief-end', endPosSharedRelief)} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-extrabold text-slate-700 disabled:opacity-50">End shared relief</button>
                <button type="button" disabled={Boolean(inFlight) || !isOnline} onClick={() => runOperatorAction('counted-handoff', countedPosCustodyHandoff, { counted: true })} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white disabled:opacity-50">Counted handoff</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
