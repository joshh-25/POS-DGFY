import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Truck } from 'lucide-react';
import { fetchDeliveryRun, fetchDeliveryRuns } from '../services/deliveryRunService.js';
import { getEligibleRunTargets } from '../utils/deliveryRunEligibility.js';
import DeliveryRunMembersList from './DeliveryRunMembersList.jsx';

const getErrorMessage = (error, fallback) => error?.response?.data?.message || fallback;

// Phase 229 (#1289), §2.5. The split view's right-hand panel -- deliberately NOT
// DeliveryRunsWorkspacePanel.jsx (a 598-line master/detail unusable at half width on a 1280px
// terminal, per the plan's §2.5 trap). Narrow and purpose-built: a target-run picker filtered by
// the exact same `getEligibleRunTargets` the checkbox flow's QueueRunAssignBar already uses (so a
// run that cannot legally receive members is never a drop target here either, by construction),
// the picked run's header, its read-only member list, and one `useDroppable` zone over the whole
// panel body.
//
// `useDroppable`'s id is the picked run's id (a number) whenever one is picked, or a sentinel
// string when none is -- `queueRunDropAssignment.js`'s `resolveRunDropAssignment` treats a
// non-numeric `overRunId` as "no valid target", so dropping before a run is picked is a no-op by
// construction, matching the toolbar's own "select a target run before adding orders" guard.
const NO_TARGET_SENTINEL = 'no-run-selected';

export default function DeliveryRunDropPanel({
  activeShiftLocationId = null,
  queueLocationScopeId = null,
  disabled = false,
  refreshSignal = 0
}) {
  const [runsState, setRunsState] = React.useState({ loading: false, items: [], errorMessage: '' });
  const [targetRunId, setTargetRunId] = React.useState('');
  const [runDetailState, setRunDetailState] = React.useState({ loading: false, run: null, errorMessage: '' });

  // Same RF-3 staleness-guard shape as QueueRunAssignBar.jsx / DeliveryRunsWorkspacePanel.jsx --
  // a slower, older fetch must never overwrite state committed by a newer one.
  const runsRequestIdRef = React.useRef(0);
  const runDetailRequestIdRef = React.useRef(0);

  const loadRuns = React.useCallback(async () => {
    const requestId = (runsRequestIdRef.current += 1);
    setRunsState((current) => ({ ...current, loading: true }));
    try {
      const payload = await fetchDeliveryRuns({
        location_id: queueLocationScopeId || undefined,
        limit: 100
      });
      if (requestId !== runsRequestIdRef.current) return; // stale
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setRunsState({ loading: false, items, errorMessage: '' });
    } catch (error) {
      if (requestId !== runsRequestIdRef.current) return; // stale
      setRunsState({ loading: false, items: [], errorMessage: getErrorMessage(error, 'Failed to load delivery runs.') });
    }
  }, [queueLocationScopeId]);

  React.useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const eligibleRunTargets = React.useMemo(
    () => getEligibleRunTargets(runsState.items, { locationId: activeShiftLocationId }),
    [runsState.items, activeShiftLocationId]
  );

  React.useEffect(() => {
    if (!targetRunId) return;
    if (eligibleRunTargets.some((run) => String(run.delivery_run_id) === String(targetRunId))) return;
    setTargetRunId('');
  }, [eligibleRunTargets, targetRunId]);

  const loadRunDetail = React.useCallback(async (deliveryRunId) => {
    const requestId = (runDetailRequestIdRef.current += 1);
    if (!deliveryRunId) {
      setRunDetailState({ loading: false, run: null, errorMessage: '' });
      return;
    }
    setRunDetailState((current) => ({ ...current, loading: true }));
    try {
      const run = await fetchDeliveryRun(deliveryRunId);
      if (requestId !== runDetailRequestIdRef.current) return; // stale
      setRunDetailState({ loading: false, run, errorMessage: '' });
    } catch (error) {
      if (requestId !== runDetailRequestIdRef.current) return; // stale
      setRunDetailState({ loading: false, run: null, errorMessage: getErrorMessage(error, 'Failed to load run detail.') });
    }
  }, []);

  React.useEffect(() => {
    loadRunDetail(targetRunId || null);
  }, [targetRunId, loadRunDetail]);

  // §2.9: refetch the picked run's detail after a successful drop-driven (or checkbox-driven)
  // assignment elsewhere in the split view -- `refreshSignal` is a counter IncomingQueueWorkspace
  // bumps on every successful handleBulkAssignSubmit.
  const previousRefreshSignalRef = React.useRef(refreshSignal);
  React.useEffect(() => {
    if (previousRefreshSignalRef.current === refreshSignal) return;
    previousRefreshSignalRef.current = refreshSignal;
    loadRuns();
    if (targetRunId) loadRunDetail(targetRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const droppableId = targetRunId ? Number(targetRunId) : NO_TARGET_SENTINEL;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled });

  const selectedRun = runDetailState.run;

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#0F172A]">
        <Truck className="h-4 w-4 text-[#1A4E8D]" />
        Delivery run
      </div>

      <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
        Target run
        <select
          value={targetRunId}
          onChange={(event) => setTargetRunId(event.target.value)}
          disabled={disabled || runsState.loading}
          className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold"
          aria-label="Split view target delivery run"
        >
          <option value="">
            {runsState.loading
              ? 'Loading runs...'
              : eligibleRunTargets.length === 0
                ? 'No eligible runs for this location'
                : 'Choose a run'}
          </option>
          {eligibleRunTargets.map((run) => (
            <option key={run.delivery_run_id} value={run.delivery_run_id}>{run.label}</option>
          ))}
        </select>
      </label>

      {runsState.errorMessage ? (
        <p className="text-xs font-semibold text-rose-700">{runsState.errorMessage}</p>
      ) : null}

      <div
        ref={setNodeRef}
        data-testid="delivery-run-drop-zone"
        className={`min-h-[10rem] flex-1 overflow-y-auto rounded-lg border-2 border-dashed p-3 transition ${isOver && !disabled && targetRunId
          ? 'border-[#1A4E8D] bg-blue-50/60'
          : 'border-slate-200 bg-slate-50/40'}`}
      >
        {!targetRunId ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
            Choose a target run, then drag orders from the queue and drop them here.
          </p>
        ) : runDetailState.loading ? (
          <p className="mt-3 text-center text-xs text-slate-500">Loading run...</p>
        ) : runDetailState.errorMessage ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{runDetailState.errorMessage}</p>
        ) : selectedRun ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-950">{selectedRun.label}</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {selectedRun.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {(Array.isArray(selectedRun.personnel) ? selectedRun.personnel.find((person) => person?.is_accountable)?.delivery_personnel_name : null) || 'No accountable person'}
              {' · '}
              {Number.isFinite(Number(selectedRun.member_count)) ? selectedRun.member_count : (Array.isArray(selectedRun.members) ? selectedRun.members.length : 0)} order(s)
            </p>
            {/* Read-only here (§2.5) -- no remove/move controls, full run management stays on the
                Delivery Runs tab. DeliveryRunMembersList's onRemoveMember/onMoveMember default to
                no-ops and `readOnly` hides the buttons that would otherwise call them. */}
            <DeliveryRunMembersList run={selectedRun} readOnly />
          </div>
        ) : null}
      </div>
    </div>
  );
}
