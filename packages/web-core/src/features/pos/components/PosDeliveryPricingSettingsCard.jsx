import React, { useCallback, useEffect, useState } from 'react';
import { MapPinned, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllSettings, updateSettings } from '@/services/settingsService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  DEFAULT_DELIVERY_FEE_CALC,
  MIN_DELIVERY_INCREMENT_KM,
  normalizeDeliveryFeeCalcSettings,
  normalizeDeliveryFeeMode,
  serializeDeliveryFeeCalcForSave
} from '@/src/features/settings/deliveryFeeConfig.js';
import {
  buildSettingsVersionMap,
  getSettingsWriteFailureMessage
} from '../utils/settingsWorkspaceModel.js';

// Phase 233b (#1341, epic #1321). POS-side counterpart to apps/dgfy-ims/Pages/Settings.jsx's
// "Storefront Visibility & Ordering" delivery-fee fields -- reads/writes the SAME settings keys
// Phase 233 (#1324, PR #1337) introduced (`store_delivery_fee`, `store_delivery_fee_mode`,
// `store_delivery_fee_calc`) via the same generic settings API IMS uses. No new backend endpoint,
// no schema change. IMS's own screen stays exactly as-is -- this is a second entry point, not a
// replacement (per #1341's own scope).
//
// Modelled on DownpaymentSettingsPanel.jsx / PosCashierAttendanceSettingsCard.jsx: a self-contained
// settings card with its own fetch/save and its own permission gate, rendered as a tab inside
// SettingsWorkspace (TerminalOperationsWorkspace.jsx).

// Duplicated locally rather than imported -- resolveUserPermissionList in
// TerminalOperationsWorkspace.jsx is not exported, and every sibling panel already re-implements
// this same check (see AffiliatesWorkspacePanel.jsx / DownpaymentSettingsPanel.jsx's identical
// comment).
const resolveUserPermissionList = (user) => {
  if (Array.isArray(user?.permissions)) return user.permissions;
  if (typeof user?.permissions !== 'string') return [];
  try {
    const parsed = JSON.parse(user.permissions);
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return [];
    return Object.entries(parsed).flatMap(([entity, actions]) => (
      actions && typeof actions === 'object'
        ? Object.entries(actions).filter(([, allowed]) => allowed === true).map(([action]) => `${entity}:${action}`)
        : []
    ));
  } catch {
    return [];
  }
};

const createDefaultForm = () => ({
  storeDeliveryFee: '',
  storeDeliveryFeeMode: 'fixed',
  storeDeliveryFeeCalc: { ...DEFAULT_DELIVERY_FEE_CALC }
});

const DELIVERY_FEE_MODE_HELP = Object.freeze({
  fixed: 'Customers pay this flat delivery fee at checkout.',
  calculated: 'Customers pay the minimum fee plus distance increments. If the distance or formula cannot be resolved, the fallback fee below is used.',
  free: 'Customers pay no delivery fee at checkout. Keep the fallback fee below configured for safe mode changes or invalid calculated settings.'
});
const CURRENCY_SYMBOL = String.fromCharCode(0x20b1);

const noop = () => {};

const settingsToForm = (settings) => ({
  storeDeliveryFee: settings?.store_delivery_fee?.value == null ? '' : String(settings.store_delivery_fee.value),
  storeDeliveryFeeMode: normalizeDeliveryFeeMode(settings?.store_delivery_fee_mode?.value),
  storeDeliveryFeeCalc: normalizeDeliveryFeeCalcSettings(settings?.store_delivery_fee_calc?.value)
});

export default function PosDeliveryPricingSettingsCard({ terminalUser = null, locked = false, sectionId, onDirtyChange = noop, onSaved = noop }) {
  const isMasterAdmin = terminalUser?.is_master_admin === true;
  const permissionList = resolveUserPermissionList(terminalUser);
  const canView = isMasterAdmin || permissionList.includes('settings:view') || permissionList.includes('settings:edit');
  const canManage = isMasterAdmin || permissionList.includes('settings:edit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(createDefaultForm());
  const [settingsVersionMap, setSettingsVersionMap] = useState({});

  const loadData = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const settings = await getAllSettings({ force });
      setForm(settingsToForm(settings));
      setSettingsVersionMap(buildSettingsVersionMap(settings));
      onDirtyChange(false);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load delivery pricing settings.');
    } finally {
      setLoading(false);
    }
  }, [onDirtyChange]);

  useEffect(() => {
    if (!canView) return;
    loadData();
  }, [canView, loadData]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    onDirtyChange(true);
  };
  const updateCalcField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      storeDeliveryFeeCalc: { ...(prev.storeDeliveryFeeCalc || DEFAULT_DELIVERY_FEE_CALC), [field]: value }
    }));
    onDirtyChange(true);
  };

  const isCalculated = form.storeDeliveryFeeMode === 'calculated';
  const deliveryFeeModeHelp = DELIVERY_FEE_MODE_HELP[form.storeDeliveryFeeMode] || DELIVERY_FEE_MODE_HELP.fixed;
  const flatFeeLabel = form.storeDeliveryFeeMode === 'fixed'
    ? `Flat Delivery Fee (${CURRENCY_SYMBOL})`
    : `Fallback Delivery Fee (${CURRENCY_SYMBOL})`;
  const calcForSave = serializeDeliveryFeeCalcForSave(form.storeDeliveryFeeCalc);
  const calcIncomplete = isCalculated
    && Object.values(form.storeDeliveryFeeCalc || {}).some((value) => String(value ?? '').trim() !== '')
    && !calcForSave;

  const handleSave = async () => {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        store_delivery_fee: Number(form.storeDeliveryFee || 0),
        store_delivery_fee_mode: form.storeDeliveryFeeMode,
        ...(calcForSave ? { store_delivery_fee_calc: calcForSave } : {})
      };
      if (Object.keys(settingsVersionMap).length > 0) {
        await updateSettings(payload, { expectedUpdatedAt: settingsVersionMap });
      } else {
        await updateSettings(payload);
      }
      const refreshed = await getAllSettings({ force: true });
      setForm(settingsToForm(refreshed));
      setSettingsVersionMap(buildSettingsVersionMap(refreshed));
      onDirtyChange(false);
      await onSaved?.();
      toast.success('Delivery pricing settings saved.');
    } catch (err) {
      const message = getSettingsWriteFailureMessage(err, 'Failed to save delivery pricing settings.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div id={sectionId} className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        You don&apos;t have access to view delivery pricing settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div id={sectionId} className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading delivery pricing settings...
      </div>
    );
  }

  return (
    <div id={sectionId} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="flex items-start gap-2">
          <MapPinned className="mt-0.5 h-5 w-5 text-[#1A4E8D]" />
          <div>
            <h2 className="text-[15px] font-black text-slate-950">Delivery Pricing</h2>
            <p className="text-xs text-slate-500">
              Set the store-wide delivery fee charged at checkout. Reads and writes the same
              settings IMS&apos;s Storefront settings screen uses -- a change made here shows up
              there immediately, and vice versa.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
            {error}
          </div>
        ) : null}

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="delivery-fee-mode">Delivery Fee Mode</Label>
          <Select
            value={form.storeDeliveryFeeMode}
            onValueChange={(value) => { if (canManage) updateField('storeDeliveryFeeMode', value); }}
          >
            <SelectTrigger id="delivery-fee-mode" className="w-full" disabled={locked || saving || !canManage}>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="calculated">Calculated (distance-based)</SelectItem>
              <SelectItem value="free">Free</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            {deliveryFeeModeHelp}
          </p>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="delivery-fee-flat">{flatFeeLabel}</Label>
          <Input
            id="delivery-fee-flat"
            type="number"
            min="0"
            step="0.0001"
            disabled={locked || saving || !canManage}
            value={form.storeDeliveryFee}
            onChange={(e) => { if (canManage) updateField('storeDeliveryFee', e.target.value); }}
            placeholder="0.00"
          />
          <p className="text-xs text-slate-500">
            {form.storeDeliveryFeeMode === 'fixed'
              ? 'This is the amount charged for every delivery order.'
              : 'This value is required and protects checkout if the selected pricing rule cannot be applied.'}
          </p>
        </div>

        {isCalculated && (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Label>Calculated Delivery Fee Formula</Label>
            <p className="text-xs text-slate-500">
              Minimum fee covers the included distance; the per-km rate then charges per started
              increment out to the max distance. All five fields are required together to save the
              formula -- an incomplete set is left unsaved rather than partially applied.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="delivery-calc-min-fee" className="text-xs text-slate-500">Minimum Fee (₱)</Label>
                <Input
                  id="delivery-calc-min-fee"
                  type="number"
                  min="0"
                  step="0.0001"
                  disabled={locked || saving || !canManage}
                  value={form.storeDeliveryFeeCalc?.min_fee ?? ''}
                  onChange={(e) => { if (canManage) updateCalcField('min_fee', e.target.value); }}
                  placeholder="50"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="delivery-calc-included-km" className="text-xs text-slate-500">Included Distance (km)</Label>
                <Input
                  id="delivery-calc-included-km"
                  type="number"
                  min="0"
                  step="0.0001"
                  disabled={locked || saving || !canManage}
                  value={form.storeDeliveryFeeCalc?.included_km ?? ''}
                  onChange={(e) => { if (canManage) updateCalcField('included_km', e.target.value); }}
                  placeholder="3"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="delivery-calc-per-km-rate" className="text-xs text-slate-500">Rate per km (₱)</Label>
                <Input
                  id="delivery-calc-per-km-rate"
                  type="number"
                  min="0"
                  step="0.0001"
                  disabled={locked || saving || !canManage}
                  value={form.storeDeliveryFeeCalc?.per_km_rate ?? ''}
                  onChange={(e) => { if (canManage) updateCalcField('per_km_rate', e.target.value); }}
                  placeholder="10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="delivery-calc-increment-km" className="text-xs text-slate-500">Charge Increment (km)</Label>
                <Input
                  id="delivery-calc-increment-km"
                  type="number"
                  min={String(MIN_DELIVERY_INCREMENT_KM)}
                  step={String(MIN_DELIVERY_INCREMENT_KM)}
                  disabled={locked || saving || !canManage}
                  value={form.storeDeliveryFeeCalc?.increment_km ?? ''}
                  onChange={(e) => { if (canManage) updateCalcField('increment_km', e.target.value); }}
                  placeholder="0.5"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="delivery-calc-max-distance-km" className="text-xs text-slate-500">Max Distance (km)</Label>
                <Input
                  id="delivery-calc-max-distance-km"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  disabled={locked || saving || !canManage}
                  value={form.storeDeliveryFeeCalc?.max_distance_km ?? ''}
                  onChange={(e) => { if (canManage) updateCalcField('max_distance_km', e.target.value); }}
                  placeholder="15"
                />
              </div>
            </div>
            {calcIncomplete && (
              <p className="text-xs text-amber-700">
                This formula is incomplete or invalid (charge increment must be at least{' '}
                {MIN_DELIVERY_INCREMENT_KM} km and max distance must be at least the included
                distance) -- saving now will leave the previously stored formula, if any, unchanged.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-[11px] font-semibold text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span>{canManage
            ? 'Every change records the administrator, request, prior value, and result -- same as an IMS-originated change.'
            : 'You can view delivery pricing, but only an account with settings:edit can change it.'}</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => loadData({ force: true })} disabled={loading || saving}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button type="button" disabled={locked || !canManage || saving} onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
