import React from 'react';
import {
  Eye,
  LogIn,
  MapPinned,
  Monitor,
  RefreshCcw,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS,
  POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

const normalizeLabel = (value, fallback = '') => String(value || '').trim() || fallback;

const branchStatus = (location) => {
  const terminals = Array.isArray(location?.terminals) ? location.terminals : [];
  const unavailableTerminals = terminals.filter((terminal) => terminal?.status === 'unavailable');
  const occupiedTerminals = terminals.filter(
    (terminal) => terminal?.status === 'occupied' || terminal?.status === 'stale'
  );
  const allTerminalsOccupied = terminals.length > 0 && occupiedTerminals.length === terminals.length;

  if (terminals.length > 0 && unavailableTerminals.length === terminals.length) {
    return {
      label: 'Unavailable',
      className: 'border-slate-300 bg-slate-100 text-slate-600',
      cardClassName: 'border-slate-200 bg-slate-50'
    };
  }

  if (allTerminalsOccupied) {
    return {
      label: 'In use',
      className: 'border-slate-300 bg-slate-200 text-slate-700',
      cardClassName: 'border-slate-300 bg-slate-100/90'
    };
  }
  if (occupiedTerminals.length > 0) {
    return {
      label: 'Partially in use',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
      cardClassName: 'border-amber-200 bg-amber-50/50'
    };
  }
  return {
    label: 'Available',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    cardClassName: 'border-slate-200 bg-white'
  };
};

const terminalStatus = (terminal) => {
  if (terminal?.status === 'stale') return 'Stale';
  if (terminal?.status === 'occupied') return 'In use';
  if (terminal?.status === 'unavailable') return 'Unavailable';
  return 'Available';
};

const terminalKey = (terminal) => String(terminal?.terminal_id || '').trim().toUpperCase();

const terminalOwnerLabel = (terminal) => normalizeLabel(
  terminal?.shift?.cashier?.display_name,
  'another cashier'
);

const resolveBranchOperation = ({
  location,
  locations,
  operatorState,
  isOnline
}) => {
  const locationId = Number(location?.location_id || 0);
  const terminals = Array.isArray(location?.terminals) ? location.terminals : [];
  const activeShiftId = Number(operatorState?.activeShiftId || 0);
  const activeShiftLocationId = Number(operatorState?.activeShiftLocationId || 0);
  const activeShiftTerminalId = String(operatorState?.activeShiftTerminalId || '').trim().toUpperCase();
  const actionLoading = Boolean(operatorState?.actionLoading);
  const canOpenShift = operatorState?.canOpenShift !== false;
  const activeShiftMatches = (terminal) => Boolean(
    activeShiftId
    && activeShiftLocationId === locationId
    && activeShiftTerminalId
    && terminalKey(terminal) === activeShiftTerminalId
  );
  const resumableTerminal = terminals.find(
    (terminal) => terminal?.can_resume === true || activeShiftMatches(terminal)
  );
  const ownedShiftLocation = (Array.isArray(locations) ? locations : []).find((candidate) => (
    (Array.isArray(candidate?.terminals) ? candidate.terminals : [])
      .some((terminal) => terminal?.can_resume === true)
  ));
  const hasOwnedShift = Boolean(activeShiftId || ownedShiftLocation);

  if (resumableTerminal) {
    return {
      kind: 'resume',
      label: 'Resume Shift',
      terminal: resumableTerminal,
      disabled: !isOnline || actionLoading,
      reason: !isOnline
        ? 'Reconnect before resuming this shift.'
        : (actionLoading ? 'Updating the shift session…' : '')
    };
  }

  if (hasOwnedShift) {
    const activeLocationLabel = normalizeLabel(
      operatorState?.activeShiftLocationName || ownedShiftLocation?.name,
      'another branch'
    );
    return {
      kind: 'open',
      label: 'Open Shift',
      terminal: null,
      disabled: true,
      reason: `Your existing shift is active at ${activeLocationLabel}. Close it before opening another shift.`
    };
  }

  if (!canOpenShift) {
    return {
      kind: 'open',
      label: 'Open Shift',
      terminal: null,
      disabled: true,
      reason: 'Your account is not permitted to open a shift.'
    };
  }

  const openTerminal = terminals.find((terminal) => terminal?.can_open === true);
  if (openTerminal) {
    return {
      kind: 'open',
      label: 'Open Shift',
      terminal: openTerminal,
      disabled: !isOnline || actionLoading,
      reason: !isOnline
        ? 'Reconnect before opening a shift.'
        : (actionLoading ? 'Updating the shift session…' : '')
    };
  }

  const staleTerminal = terminals.find((terminal) => terminal?.status === 'stale');
  if (staleTerminal) {
    return {
      kind: 'open',
      label: 'Recovery required',
      terminal: null,
      disabled: true,
      reason: 'This stale shift belongs to another cashier and must be recovered by a master administrator before it can be used.'
    };
  }

  let reason = 'No terminal is available for a new shift.';
  if (!isOnline) {
    reason = 'Reconnect before opening a shift.';
  } else if (location?.is_open === false) {
    reason = 'This branch is closed.';
  } else if (terminals.length === 0) {
    reason = 'No active terminal here.';
  } else {
    const blockedTerminal = terminals[0];
    if (blockedTerminal?.reason_code === 'POS_TERMINAL_STALE_SHIFT') {
      reason = 'A stale shift requires recovery before this terminal can be used.';
    } else if (blockedTerminal?.reason_code === 'POS_TERMINAL_SHIFT_OCCUPIED') {
      reason = `Terminal in use by ${terminalOwnerLabel(blockedTerminal)}.`;
    } else if (blockedTerminal?.reason_code === 'POS_OPERATOR_ACTIVE_ELSEWHERE') {
      reason = 'Your existing POS session is active at another branch.';
    }
  }

  return {
    kind: 'open',
    label: 'Open Shift',
    terminal: null,
    disabled: true,
    reason
  };
};

export default function PosBranchSelectorDialog({
  open = false,
  mode = 'directory',
  branchDirectoryState = { loading: false, locations: [], errorMessage: '' },
  cashierRegister = null,
  operatorState = {},
  isOnline = true,
  onOpenChange = () => {},
  onViewBranch = async () => false,
  onOpenShift = async () => false,
  onResumeShift = async () => false,
  onContinue = () => {},
  onRefresh = () => {}
}) {
  const isCashier = mode === 'cashier';
  const locations = Array.isArray(branchDirectoryState?.locations)
    ? branchDirectoryState.locations
    : [];
  const cashierLocations = Array.isArray(cashierRegister?.branches)
    ? cashierRegister.branches
    : [];
  const hasCashierBranchList = Array.isArray(cashierRegister?.branches);
  const loading = Boolean(branchDirectoryState?.loading);
  const refreshing = loading && locations.length > 0;
  const cashierLoading = Boolean(cashierRegister?.loading);
  const cashierRefreshing = cashierLoading && cashierLocations.length > 0;
  const orderedLocations = locations
    .map((location, index) => ({
      location,
      index,
      operation: resolveBranchOperation({
        location,
        locations,
        operatorState,
        isOnline
      })
    }))
    .sort((left, right) => {
      const leftPriority = left.operation.kind === 'resume' ? 1 : 0;
      const rightPriority = right.operation.kind === 'resume' ? 1 : 0;
      return rightPriority - leftPriority || left.index - right.index;
    })
    .map(({ location }) => location);
  const orderedCashierLocations = cashierLocations
    .map((location, index) => ({
      location,
      index,
      operation: resolveBranchOperation({
        location,
        locations: cashierLocations,
        operatorState,
        isOnline
      })
    }))
    .sort((left, right) => {
      const leftPriority = left.operation.kind === 'resume' ? 1 : 0;
      const rightPriority = right.operation.kind === 'resume' ? 1 : 0;
      return rightPriority - leftPriority || left.index - right.index;
    })
    .map(({ location }) => location);

  const handleViewBranch = async (locationId) => {
    const viewed = await onViewBranch({ locationId });
    if (viewed !== false) onOpenChange(false);
  };

  const handleBranchOperation = async (location, operation) => {
    if (!operation || operation.disabled || !operation.terminal) return;
    const handler = operation.kind === 'resume' ? onResumeShift : onOpenShift;
    const result = await handler({
      locationId: Number(location?.location_id || 0),
      terminalId: operation.terminal?.terminal_id,
      shiftId: operation.terminal?.shift?.pos_terminal_shift_id || null
    });
    if (result !== false) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="pos-branch-selector-dialog"
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border border-slate-200 bg-white p-0 shadow-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-[#0F172A]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
              <MapPinned className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            {isCashier ? (hasCashierBranchList ? 'Choose your branch' : 'Confirm your branch') : 'Select a branch'}
          </DialogTitle>
          {isCashier ? (
            <DialogDescription className="text-sm leading-6 text-slate-600">
              {hasCashierBranchList
                ? 'Choose one of your assigned branches, then resume your shift or open a new shift on an available terminal.'
                : 'Confirm the branch and terminal assigned to your POS session before continuing.'}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-6">
          {isCashier ? (
            !hasCashierBranchList ? (
              <section
                data-testid="pos-cashier-branch-card"
                className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 shadow-sm shadow-blue-100/60"
                aria-labelledby="pos-cashier-branch-card-heading"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D]">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="pos-cashier-branch-card-heading" className="text-sm font-black text-[#0F172A]">
                      Assigned branch
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Cashiers can continue only in the branch and terminal assigned to their POS session.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-blue-100 bg-white/85 px-3 py-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Branch</p>
                    <p className="mt-1 truncate text-xs font-black text-[#0F172A]">
                      {normalizeLabel(cashierRegister?.branchName, 'Assigned branch')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-white/85 px-3 py-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Terminal</p>
                    <p className="mt-1 truncate text-xs font-black text-[#0F172A]">
                      {normalizeLabel(cashierRegister?.terminalLabel, 'Assigned terminal')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-white/85 px-3 py-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Cashier</p>
                    <p className="mt-1 truncate text-xs font-black text-[#0F172A]">
                      {normalizeLabel(cashierRegister?.cashierLabel, 'Signed-in cashier')}
                    </p>
                  </div>
                </div>

                <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-extrabold ${cashierRegister?.hasActiveShift ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                  {cashierRegister?.hasActiveShift ? 'Existing shift found — resume is a separate step' : 'No active shift — opening is a separate step'}
                </div>
              </section>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[#0F172A]">Assigned branches</p>
                    <p className="mt-1 text-xs text-slate-600">Select where you want to open or resume your cashier shift.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className={`h-9 rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                    onClick={onRefresh}
                    disabled={!isOnline || cashierRefreshing}
                    aria-busy={cashierRefreshing || undefined}
                  >
                    <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${cashierRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                    Refresh
                  </Button>
                </div>

                {cashierRegister?.errorMessage ? (
                  <PosShiftStateNotice
                    variant="error"
                    message={cashierRegister.errorMessage}
                    compact
                  />
                ) : null}
                {cashierLoading && cashierLocations.length === 0 ? (
                  <PosShiftStateNotice variant="loading" message="Loading your assigned branches…" compact />
                ) : cashierLocations.length === 0 ? (
                  <PosShiftStateNotice variant="empty" message="No active branches are assigned to this cashier account." compact />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {orderedCashierLocations.map((location) => {
                      const locationId = Number(location?.location_id || 0);
                      const terminals = Array.isArray(location?.terminals) ? location.terminals : [];
                      const status = branchStatus(location);
                      const operation = resolveBranchOperation({
                        location,
                        locations: cashierLocations,
                        operatorState,
                        isOnline
                      });
                      return (
                        <article
                          key={`pos-cashier-branch-selector-${locationId}`}
                          data-testid={`pos-cashier-branch-card-${locationId}`}
                          className={`rounded-xl border p-3.5 ${status.cardClassName}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-black text-[#0F172A]">
                                {normalizeLabel(location?.name, `Branch #${locationId || 'unknown'}`)}
                              </h3>
                              <p className="mt-1 text-xs text-slate-600">
                                {Number(location?.open_shift_count || 0)} active shift{Number(location?.open_shift_count || 0) === 1 ? '' : 's'}
                                {' · '}{location?.is_open === false ? 'Closed' : 'Open'}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${status.className}`}>
                              {status.label}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {terminals.length === 0 ? (
                              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                                No active terminal is assigned here.
                              </p>
                            ) : terminals.map((terminal) => {
                              const occupied = terminal?.status === 'occupied' || terminal?.status === 'stale';
                              const terminalMessage = terminal?.status === 'unavailable'
                                ? 'Terminal availability could not be confirmed.'
                                : (occupied ? 'Your active shift is on this terminal.' : 'No active shift');
                              return (
                                <div
                                  key={`${locationId}-${terminal?.terminal_id || terminal?.label || 'terminal'}`}
                                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${occupied ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-100 bg-emerald-50/40'}`}
                                >
                                  <div className="flex min-w-0 items-start gap-2.5">
                                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/80 text-[#1A4E8D]" aria-hidden="true">
                                      <Monitor className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-black text-[#0F172A]">
                                        {normalizeLabel(terminal?.label, terminal?.terminal_id || 'Terminal')}
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-slate-600">{terminalMessage}</p>
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${terminal?.status === 'unavailable' ? 'bg-slate-100 text-slate-600' : (occupied ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800')}`}>
                                    {terminalStatus(terminal)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <Button
                            type="button"
                            className={`mt-3 h-10 w-full justify-center rounded-lg px-3 text-xs font-extrabold ${operation.disabled ? 'border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100' : POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
                            onClick={() => void handleBranchOperation(location, operation)}
                            disabled={operation.disabled || !isOnline}
                            title={operation.disabled ? operation.reason : undefined}
                            data-testid={`pos-cashier-branch-selector-${operation.kind}-${locationId}`}
                          >
                            {operation.kind === 'resume' ? (
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <LogIn className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {operation.label}
                          </Button>
                          {operation.disabled && operation.reason ? (
                            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                              {operation.reason}
                            </p>
                          ) : operation.terminal ? (
                            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                              {operation.kind === 'resume' ? 'Existing shift on' : 'Opens on'}{' '}
                              {normalizeLabel(operation.terminal?.label, operation.terminal?.terminal_id || 'the selected terminal')}.
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#0F172A]">Authorized branches</p>
                  <p className="mt-1 text-xs text-slate-600">Choose a branch to open its read-only view.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={`h-9 rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                  onClick={onRefresh}
                  disabled={!isOnline || refreshing}
                  aria-busy={refreshing || undefined}
                >
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                  Refresh
                </Button>
              </div>

              {branchDirectoryState?.errorMessage ? (
                <PosShiftStateNotice
                  variant="error"
                  title={locations.length > 0 ? 'Refresh failed — showing last results' : ''}
                  message={branchDirectoryState.errorMessage}
                  compact
                />
              ) : null}
              {loading && locations.length === 0 ? (
                <PosShiftStateNotice variant="loading" message="Loading authorized branches…" compact />
              ) : locations.length === 0 ? (
                <PosShiftStateNotice variant="empty" message="No authorized branches are available for this account." compact />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {orderedLocations.map((location) => {
                    const locationId = Number(location?.location_id || 0);
                    const terminals = Array.isArray(location?.terminals) ? location.terminals : [];
                    const status = branchStatus(location);
                    const operation = resolveBranchOperation({
                      location,
                      locations,
                      operatorState,
                      isOnline
                    });
                    return (
                      <article
                        key={`pos-branch-selector-${locationId}`}
                        data-testid={`pos-branch-selector-card-${locationId}`}
                        className={`rounded-xl border p-3.5 ${status.cardClassName}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-[#0F172A]">
                              {normalizeLabel(location?.name, `Branch #${locationId || 'unknown'}`)}
                            </h3>
                            <p className="mt-1 text-xs text-slate-600">
                              {Number(location?.open_shift_count || 0)} active shift{Number(location?.open_shift_count || 0) === 1 ? '' : 's'}
                              {' · '}{location?.is_open === false ? 'Closed' : 'Open'}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${status.className}`}>
                            {status.label}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {terminals.length === 0 ? (
                            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                              No active terminal here.
                            </p>
                          ) : terminals.map((terminal) => {
                            const occupied = terminal?.status === 'occupied' || terminal?.status === 'stale';
                            const shiftCashier = terminal?.shift?.cashier?.display_name || 'No shift owner';
                            const activeCashier = terminal?.current_operator?.display_name
                              || terminal?.current_operator?.username
                              || (occupied ? 'Not signed in' : '');
                            return (
                              <div
                                key={`${locationId}-${terminal?.terminal_id || terminal?.label || 'terminal'}`}
                                className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${occupied ? 'border-slate-300 bg-slate-200/80' : 'border-emerald-100 bg-emerald-50/40'}`}
                              >
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/80 text-[#1A4E8D]" aria-hidden="true">
                                    <Monitor className="h-3.5 w-3.5" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-black text-[#0F172A]">
                                      {normalizeLabel(terminal?.label, terminal?.terminal_id || 'Terminal')}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-slate-600">
                                      {occupied ? `Shift cashier: ${shiftCashier}` : 'No active shift'}
                                    </p>
                                    {activeCashier ? (
                                      <p className="mt-0.5 truncate text-[11px] text-slate-600">
                                        Active cashier: {activeCashier}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${terminal?.status === 'stale' ? 'bg-rose-100 text-rose-800' : (occupied ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800')}`}>
                                  {terminalStatus(terminal)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className={`mt-3 h-10 w-full justify-center rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                          onClick={() => void handleViewBranch(locationId)}
                          disabled={!location?.can_view || !isOnline}
                          data-testid={`pos-branch-selector-view-${locationId}`}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          View Branch
                        </Button>
                        <Button
                          type="button"
                          className={`mt-2 h-10 w-full justify-center rounded-lg px-3 text-xs font-extrabold ${operation.disabled ? 'border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100' : POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
                          onClick={() => void handleBranchOperation(location, operation)}
                          disabled={operation.disabled || !isOnline}
                          title={operation.disabled ? operation.reason : undefined}
                          data-testid={`pos-branch-selector-${operation.kind}-${locationId}`}
                        >
                          {operation.kind === 'resume' ? (
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <LogIn className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {operation.label}
                        </Button>
                        {operation.disabled && operation.reason ? (
                          <p
                            className="mt-1.5 text-[11px] leading-4 text-slate-500"
                            data-testid={`pos-branch-selector-operation-reason-${locationId}`}
                          >
                            {operation.reason}
                          </p>
                        ) : operation.terminal ? (
                          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                            {operation.kind === 'resume' ? 'Existing shift on' : 'Opens on'}{' '}
                            {normalizeLabel(operation.terminal?.label, operation.terminal?.terminal_id || 'the selected terminal')}.
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
          {!isCashier || hasCashierBranchList ? (
            <Button
              type="button"
              variant="outline"
              className={`h-10 rounded-lg px-4 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          ) : null}
          {isCashier && !hasCashierBranchList ? (
            <Button
              type="button"
              className={`h-10 rounded-lg px-4 text-xs font-extrabold ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
              onClick={onContinue}
              disabled={!isOnline}
            >
              <Monitor className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Continue to POS
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
