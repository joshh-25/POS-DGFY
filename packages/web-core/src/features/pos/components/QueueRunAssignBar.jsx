import React from 'react';
import { toast } from 'sonner';
import { CheckSquare, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEligibleRunTargets, getRunAssignEligibility } from '../utils/deliveryRunEligibility.js';

// Phase 227 (#1273). Sticky selection toolbar for the Active Queue's bulk "add to run" flow.
// Always rendered when retail-gated + the Active Queue tab is showing (even at 0 selected --
// it's the discoverability surface for the whole feature, not just a contextual action bar).
// Selection *state* lives in the parent (IncomingQueueWorkspace, so it survives a tab switch);
// this component owns only the target-run picker's own local state.
//
// Phase 230 (#1290): the delivery-runs fetch that used to live here was lifted into the shared
// useDeliveryRunOptions hook (now owned by IncomingQueueWorkspace) so this bar's target picker and
// the queue's new run filter can never disagree about which runs exist. `runs`/`runsLoading`/
// `runsError` arrive as props instead.

export default function QueueRunAssignBar({
  orders = [],
  selectedCount = 0,
  selectedEligibleCount = 0,
  driftCount = 0,
  hiddenCount = 0,
  activeShiftLocationId = null,
  runs = [],
  runsLoading = false,
  runsError = '',
  disabled = false,
  submitting = false,
  onSelectAllEligible = () => {},
  onClearSelection = () => {},
  onSubmit = async () => false
}) {
  const [targetRunId, setTargetRunId] = React.useState('');

  const eligibleRunTargets = React.useMemo(
    () => getEligibleRunTargets(runs, { locationId: activeShiftLocationId }),
    [runs, activeShiftLocationId]
  );

  // A previously chosen target run can drop out of the eligible set (dispatched elsewhere,
  // lost its accountable person) between fetches -- never leave the picker pointed at a run
  // that's no longer a valid choice.
  React.useEffect(() => {
    if (!targetRunId) return;
    if (eligibleRunTargets.some((run) => String(run.delivery_run_id) === String(targetRunId))) return;
    setTargetRunId('');
  }, [eligibleRunTargets, targetRunId]);

  const targetRun = eligibleRunTargets.find((run) => String(run.delivery_run_id) === String(targetRunId)) || null;

  const eligibleOrderIds = React.useMemo(() => {
    if (!targetRun) return [];
    return orders
      .filter((order) => getRunAssignEligibility(order, { targetRunLocationId: targetRun.location_id }).eligible)
      .map((order) => Number(order?.pos_transaction_id));
  }, [orders, targetRun]);

  const handleSelectAllEligible = () => {
    if (!targetRun) {
      toast.error('Select a target run before selecting eligible orders.');
      return;
    }
    onSelectAllEligible(eligibleOrderIds);
  };

  const handleSubmit = async () => {
    if (!targetRun) {
      toast.error('Select a target run before adding orders.');
      return;
    }
    await onSubmit(targetRun.delivery_run_id);
  };

  const barDisabled = disabled || submitting;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm shadow-slate-200/70 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-[#0F172A]">
          <Truck className="h-4 w-4 text-[#1A4E8D]" />
          {selectedCount > 0 ? `${selectedEligibleCount} order${selectedEligibleCount === 1 ? '' : 's'} selected` : 'Select delivery orders below to add them to a run.'}
        </div>

        {driftCount > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            {driftCount} selected order{driftCount === 1 ? ' is' : 's are'} no longer eligible and will be skipped.
          </p>
        ) : null}

        {hiddenCount > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            {hiddenCount} selected order{hiddenCount === 1 ? ' is' : 's are'} hidden by the run filter and will not be added.
          </p>
        ) : null}

        {runsError ? (
          <p className="text-xs font-semibold text-rose-700">{runsError}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onClearSelection} disabled={barDisabled}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear selection
          </Button>
        ) : null}

        <Button type="button" variant="outline" size="sm" onClick={handleSelectAllEligible} disabled={barDisabled || !targetRun}>
          <CheckSquare className="mr-1 h-3.5 w-3.5" /> Select all eligible ({eligibleOrderIds.length})
        </Button>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          Target run
          <select
            value={targetRunId}
            onChange={(event) => setTargetRunId(event.target.value)}
            disabled={barDisabled || runsLoading}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold"
            aria-label="Target delivery run"
          >
            <option value="">
              {runsLoading
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

        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={barDisabled || selectedCount === 0 || !targetRun}
          className="!bg-[#1A4E8D] text-white hover:!bg-[#123B6D]"
        >
          {submitting ? 'Adding...' : `Add ${selectedEligibleCount} order${selectedEligibleCount === 1 ? '' : 's'} to run`}
        </Button>
      </div>
    </div>
  );
}
