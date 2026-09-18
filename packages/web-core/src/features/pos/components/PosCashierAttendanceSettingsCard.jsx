import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Save } from 'lucide-react';
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

const locationInitials = (name, locationId) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  if (words[0]) return words[0].slice(0, 2).toUpperCase();
  return `L${locationId}`;
};

export default function PosCashierAttendanceSettingsCard({ locked = false, canEdit = false }) {
  const [state, setState] = useState(initialState);
  const [savedConfig, setSavedConfig] = useState(initialState.config);
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const selected = useMemo(() => new Set(state.config.location_ids.map(Number)), [state.config.location_ids]);
  const isDirty = state.config.enabled !== savedConfig.enabled
    || state.config.location_ids.length !== savedConfig.location_ids.length
    || state.config.location_ids.some((locationId, index) => Number(locationId) !== Number(savedConfig.location_ids[index]));

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((current) => ({ ...current, loading: true, error: '', blockers: [] }));
    try {
      const payload = await fetchPosCashierAttendanceConfig();
      const nextConfig = {
        enabled: payload?.config?.enabled === true,
        location_ids: Array.isArray(payload?.config?.location_ids) ? payload.config.location_ids.map(Number) : []
      };
      setSavedConfig(nextConfig);
      setState((current) => ({
        ...current,
        loading: false,
        error: '',
        blockers: [],
        config: nextConfig,
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

  const toggleWarning = () => {
    setWarningOpen((current) => !current);
    setWarningDismissed(warningOpen);
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
      const savedConfig = payload?.config || state.config;
      setSavedConfig({
        enabled: savedConfig.enabled === true,
        location_ids: Array.isArray(savedConfig.location_ids) ? savedConfig.location_ids.map(Number) : []
      });
      setState((current) => ({
        ...current,
        saving: false,
        config: savedConfig,
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
    <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm shadow-slate-200/40" aria-labelledby="cashier-attendance-settings-title">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]" aria-hidden="true">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 id="cashier-attendance-settings-title" className="text-[16px] font-extrabold text-[#0F172A]">Cashier Attendance &amp; Breaks</h3>
            <p className="mt-1 text-[12px] font-medium leading-5 text-[#64748B]">
              Attendance, breaks, and handoffs by location.
            </p>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:min-w-56">
          <div
            className="group relative shrink-0 sm:mr-1"
            onMouseEnter={() => setWarningDismissed(false)}
            onFocus={() => setWarningDismissed(false)}
          >
            <button
              type="button"
              aria-label="Attendance change warning"
              aria-expanded={warningOpen}
              aria-describedby={warningOpen ? 'cashier-attendance-warning' : undefined}
              onClick={toggleWarning}
              className="grid h-8 w-8 place-items-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </button>
            <span
              id="cashier-attendance-warning"
              role="tooltip"
              className={`pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-64 max-w-[calc(100vw-2rem)] break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold leading-4 text-amber-900 shadow-lg shadow-amber-100/70 transition-opacity sm:right-0 sm:left-auto ${
                warningDismissed
                  ? 'invisible opacity-0'
                  : warningOpen
                    ? 'visible opacity-100'
                    : 'invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100'
              }`}
            >
              Finish every open shift, attendance session, break, and cashier operator session before changing a location.
            </span>
          </div>
          <div className="flex h-10 items-center gap-3 border-l border-slate-200 pl-4 sm:pl-5">
          <div>
            <span className="block text-[12px] font-extrabold text-[#0F172A]">Attendance Workflow</span>
            <span className={`text-[11px] font-bold ${state.config.enabled ? 'text-[#1A4E8D]' : 'text-[#64748B]'}`}>
              {state.config.enabled ? 'Enabled' : 'Disabled'}
            </span>
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
      </div>

      <fieldset className="mt-4" disabled={locked || state.loading || state.saving || !canEdit}>
        <legend className="text-[13px] font-extrabold text-[#0F172A]">Active Locations</legend>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {state.locations.map((location) => {
            const locationId = Number(location.location_id);
            const locationName = location.name || `Location ${locationId}`;
            const enabled = selected.has(locationId);
            return (
              <label key={locationId} className="flex min-w-0 cursor-pointer items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 hover:bg-blue-50/30 sm:px-4">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-extrabold text-[#334E73]">
                    {locationInitials(locationName, locationId)}
                  </span>
                  <span className="min-w-0 truncate text-[12px] font-extrabold text-[#0F172A]">{locationName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`hidden text-[11px] font-bold sm:inline ${enabled ? 'text-[#1A4E8D]' : 'text-[#64748B]'}`}>
                    {enabled ? 'Enable' : 'Disabled'}
                  </span>
                  <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                    <input
                      type="checkbox"
                      aria-label={locationName}
                      className="peer sr-only"
                      checked={enabled}
                      onChange={() => toggleLocation(locationId)}
                    />
                    <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-[#1A4E8D] peer-focus-visible:ring-2 peer-focus-visible:ring-[#1A4E8D]/30" />
                    <span className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {!state.loading && state.locations.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[12px] font-semibold text-[#64748B]">No active locations available.</p>
        ) : null}
      </fieldset>

      {state.error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-800" role="alert">
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

      {canEdit && (isDirty || state.saving) ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" className="min-h-10 w-full rounded-lg bg-[#1A4E8D] px-5 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:w-auto" onClick={save} disabled={locked || state.loading || state.saving}>
            <Save className="mr-2 h-4 w-4" /> {state.saving ? 'Saving...' : 'Save Attendance Settings'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
