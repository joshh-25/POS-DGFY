import React from 'react';
import { Button } from '@/components/ui/button';
import { QUEUE_RUN_FILTER_ALL, QUEUE_RUN_FILTER_UNASSIGNED } from '../utils/deliveryRunQueueFilter.js';

// Phase 229 (#1290). Presentational -- value and change handler come from the parent
// (IncomingQueueWorkspace), which owns the filter state, the shared run list, and the
// visible/total counts. Placed in the queue's header controls row, next to Sort.

export default function QueueRunFilterControl({
  value = QUEUE_RUN_FILTER_ALL,
  onChange = () => {},
  options = [],
  loading = false,
  errorMessage = '',
  visibleCount = 0,
  totalCount = 0,
  disabled = false
}) {
  const isFiltered = value !== QUEUE_RUN_FILTER_ALL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        Delivery run
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || loading}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-100"
          aria-label="Filter by delivery run"
        >
          <option value={QUEUE_RUN_FILTER_ALL}>All orders</option>
          <option value={QUEUE_RUN_FILTER_UNASSIGNED}>Unassigned (no run)</option>
          {options.map((run) => (
            <option key={run.delivery_run_id} value={run.delivery_run_id}>
              {run.label} — {run.queueCount ?? 0} in queue
            </option>
          ))}
        </select>
      </label>

      {isFiltered ? (
        <>
          <span className="text-xs font-semibold text-slate-500">
            Showing {visibleCount} of {totalCount}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(QUEUE_RUN_FILTER_ALL)}>
            Clear filter
          </Button>
        </>
      ) : null}

      {errorMessage ? <span className="text-xs font-semibold text-rose-700">{errorMessage}</span> : null}
    </div>
  );
}
