import React from 'react';
import { fetchDeliveryRuns } from '../services/deliveryRunService.js';

// Phase 229 (#1290). Lifted out of QueueRunAssignBar.jsx (Phase 227) so the Active Queue's run
// filter and the "add to run" target picker share one fetch of GET /pos/delivery-runs instead of
// each keeping an independent copy. Two independent fetches would let the filter dropdown and the
// assign picker momentarily disagree about which runs exist on this screen.
//
// Carries the same RF-3 request-generation staleness guard DeliveryRunsWorkspacePanel.jsx and the
// pre-lift QueueRunAssignBar.jsx both already used: a slower, older fetch (e.g. one issued right
// before a location-scope switch) must never overwrite state committed by a newer one.

const getErrorMessage = (error, fallback) => error?.response?.data?.message || fallback;

// `enabled` (Phase 229): the run API is mode-agnostic, but retail is the only mode with any UI
// that surfaces a run -- gate the fetch itself so an F&B tenant (or a not-yet-retail-mode render)
// never issues it. Mirrors D-3's retail gate on the filter/assign-bar UI at the data layer.
export default function useDeliveryRunOptions(queueLocationScopeId, { enabled = true } = {}) {
  const [state, setState] = React.useState({ loading: false, runs: [], errorMessage: '' });
  const requestIdRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    if (!enabled) return;
    const requestId = (requestIdRef.current += 1);
    setState((current) => ({ ...current, loading: true }));
    try {
      const payload = await fetchDeliveryRuns({
        location_id: queueLocationScopeId || undefined,
        limit: 100
      });
      if (requestId !== requestIdRef.current) return; // stale
      const runs = Array.isArray(payload?.items) ? payload.items : [];
      setState({ loading: false, runs, errorMessage: '' });
    } catch (error) {
      if (requestId !== requestIdRef.current) return; // stale
      setState({ loading: false, runs: [], errorMessage: getErrorMessage(error, 'Failed to load delivery runs.') });
    }
  }, [queueLocationScopeId, enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    reload();
  }, [reload, enabled]);

  return { runs: state.runs, loading: state.loading, errorMessage: state.errorMessage, reload };
}
