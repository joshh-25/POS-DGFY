import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Coffee, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  fetchPosCashierAttendanceConfig,
  POS_ATTENDANCE_CONFIG_CHANGED_EVENT,
  updatePosCashierAttendanceConfig
} from '../services/posService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

const initialState = {
  loading: true,
  saving: false,
  error: '',
  blockers: [],
  config: { enabled: false, location_ids: [] },
  revision: null,
  locations: []
};

const errorDetails = (error) => {
  const payload = error?.response?.data || {};
  return {
    message: payload.message || error?.message || 'Cashier attendance configuration could not be saved.',
    blockers: Array.isArray(payload?.errors?.blockers) ? payload.errors.blockers : []
  };
};

export default function PosCashierAttendanceSettingsCard({ locked = false, canEdit = false }) {
  const [state, setState] = useState(initialState);
  const selected = useMemo(() => new Set(state.config.location_ids.map(Number)), [state.config.location_ids]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((current) => ({ ...current, loading: true, error: '', blockers: [] }));
    try {
      const payload = await fetchPosCashierAttendanceConfig();
      setState((current) => ({
        ...current,
        loading: false,
        error: '',
        blockers: [],
        config: {
          enabled: payload?.config?.enabled === true,
          location_ids: Array.isArray(payload?.config?.location_ids) ? payload.config.location_ids.map(Number) : []
        },
        revision: payload?.revision || null,
        locations: Array.isArray(payload?.active_locations) ? payload.active_locations : []
      }));
    } catch (error) {
      const details = errorDetails(error);
      setState((current) => ({ ...current, loading: false, error: details.message, blockers: [] }));
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => { load({ silent: true }); }, 0);
    return () => window.clearTimeout(timerId);
  }, [load]);

  const toggleLocation = (locationId) => {
    setState((current) => {
      const ids = new Set(current.config.location_ids.map(Number));
      if (ids.has(locationId)) ids.delete(locationId);
      else ids.add(locationId);
      return {
        ...current,
        error: '',
        blockers: [],
        config: { ...current.config, location_ids: Array.from(ids).sort((a, b) => a - b) }
      };
    });
  };

  const save = async () => {
    if (state.config.enabled && state.config.location_ids.length === 0) {
      setState((current) => ({ ...current, error: 'Select at least one active location before enabling cashier attendance.' }));
      return;
    }
    setState((current) => ({ ...current, saving: true, error: '', blockers: [] }));
    try {
      const payload = await updatePosCashierAttendanceConfig({
        enabled: state.config.enabled,
        location_ids: state.config.location_ids,
        revision: state.revision
      });
      setState((current) => ({
        ...current,
        saving: false,
        config: payload?.config || current.config,
        revision: payload?.revision || current.revision
      }));
      window.dispatchEvent(new CustomEvent(POS_ATTENDANCE_CONFIG_CHANGED_EVENT, {
        detail: { config: payload?.config || state.config }
      }));
      toast.success('Cashier Attendance & Breaks configuration saved.');
    } catch (error) {
      const details = errorDetails(error);
      setState((current) => ({
        ...current,
        saving: false,
        error: details.message,
        blockers: details.blockers
      }));
    }
  };

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-6" aria-labelledby="cashier-attendance-settings-title">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600" aria-hidden="true">
            <Coffee className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 id="cashier-attendance-settings-title" className="text-[15px] font-bold text-slate-800">Cashier Attendance &amp; Breaks</h3>
            <p className="mt-1 text-[12px] font-medium leading-5 text-slate-500">
              Enable time in, breaks, relief duty, cashier takeover, and register handoff per location.
            </p>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-64">
          <div>
            <span className="block text-[12px] font-extrabold text-slate-800">Attendance workflow</span>
            <span className="text-[11px] font-semibold text-slate-500">{state.config.enabled ? 'Enabled at selected stores' : 'Disabled'}</span>
          </div>
          <Switch
            aria-label="Enable Cashier Attendance and Breaks"
            checked={state.config.enabled}
            onCheckedChange={(enabled) => setState((current) => ({
              ...current,
              error: '',
              blockers: [],
              config: { ...current.config, enabled: enabled === true }
            }))}
            disabled={locked || state.loading || state.saving || !canEdit}
          />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold leading-5 text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Finish every open shift, attendance session, break, and cashier operator session before enabling, disabling, or removing a location.</p>
      </div>

      {state.error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-800" role="alert">
          <p className="font-extrabold">{state.error}</p>
          {state.blockers.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
              {state.blockers.map((blocker, index) => (
                <li key={`${blocker.type}-${blocker.record_id || index}`}>
                  {String(blocker.type || 'active_workflow').replace(/_/g, ' ')} at location {blocker.location_id}
                  {blocker.terminal_id ? ` · ${blocker.terminal_id}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <fieldset className="mt-5" disabled={locked || state.loading || state.saving || !canEdit}>
        <legend className="text-[12px] font-extrabold text-slate-800">Active locations</legend>
        <p className="mt-1 text-[11px] font-medium text-slate-500">Choose every store that should use the cashier attendance lifecycle.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {state.locations.map((location) => {
            const locationId = Number(location.location_id);
            return (
              <label key={locationId} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-blue-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#1A4E8D]"
                  checked={selected.has(locationId)}
                  onChange={() => toggleLocation(locationId)}
                />
                <span className="min-w-0 text-[12px] font-bold text-slate-800">{location.name || `Location ${locationId}`}</span>
              </label>
            );
          })}
        </div>
        {!state.loading && state.locations.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[12px] font-semibold text-slate-500">No active tenant locations are available.</p>
        ) : null}
      </fieldset>

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-[11px] font-semibold text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span>{canEdit ? 'Every change records the administrator, request, prior value, result, and affected locations.' : 'You have view-only settings access.'}</span>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl px-4 text-[12px] font-extrabold sm:flex-none" onClick={() => load()} disabled={state.loading || state.saving}>
            <RefreshCw className={`mr-2 h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {canEdit ? (
            <Button type="button" className="h-11 flex-1 rounded-xl bg-[#1A4E8D] px-5 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none" onClick={save} disabled={locked || state.loading || state.saving}>
              <Save className="mr-2 h-4 w-4" /> {state.saving ? 'Saving...' : 'Save Attendance Settings'}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
