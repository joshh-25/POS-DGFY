import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  bulkCreateOnboardingItems,
  completeOnboarding,
  saveOnboardingStep,
  trackOnboardingEvent
} from '@/services/onboardingService.js';
import { uploadStorefrontAsset } from '@/services/settingsService.js';
import {
  createTenantLocation,
  listTenantLocations,
  updateTenantLocation
} from '@/src/services/tenantLocationService.js';
import { uploadStorefrontCatalogImage } from '@/src/services/storefrontCatalogService.js';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  normalizeWorkflowMode
} from '@/src/features/settings/workflowMode.js';
import {
  getDefaultItemPreset,
  resolveModeItemTaxonomy
} from '@/src/features/settings/modeItemTaxonomy.js';
import MapPinPicker from '@/src/components/maps/MapPinPicker.jsx';

const WIZARD_STEPS = Object.freeze(['brand_assets', 'primary_location', 'bulk_items']);

const getProgress = (onboarding) => {
  const snapshot = onboarding?.tenant_onboarding_progress?.checklist_snapshot;
  if (!snapshot) {
    return {
      required_total: 3,
      completed_required_count: 0,
      missing_requirements: []
    };
  }

  return {
    required_total: Number(snapshot.required_total || 0),
    completed_required_count: Number(snapshot.completed_required_count || 0),
    missing_requirements: Array.isArray(snapshot.missing_requirements) ? snapshot.missing_requirements : []
  };
};

const formatRequirementLabel = (key) => {
  const labelMap = {
    store_name_ready: 'Store name available',
    has_primary_storefront_location: 'Primary storefront location set',
    has_priced_starter_item: 'At least one priced starter item'
  };
  return labelMap[key] || String(key || '').replace(/_/g, ' ');
};

const makeRowId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fallbackPreset = Object.freeze({
  key: 'default',
  label: 'Default Item',
  category: 'product',
  product_type: 'finished_goods',
  default_unit: 'pcs',
  max_capacity: 100,
  fifo_enabled: true
});

const resolvePresetOptions = (workflowMode) => {
  const taxonomy = resolveModeItemTaxonomy(workflowMode);
  if (taxonomy?.presets?.length) return taxonomy.presets;
  return [fallbackPreset];
};

const buildEmptyItemRow = (workflowMode) => {
  const defaultPreset = getDefaultItemPreset(workflowMode) || resolvePresetOptions(workflowMode)[0] || fallbackPreset;
  return {
    client_row_id: makeRowId(),
    mode_item_preset: defaultPreset.key,
    name: '',
    default_sale_price: '',
    cost_per_unit: '',
    current_stock: '',
    image_file: null,
    status: 'idle',
    errors: [],
    created_item: null
  };
};

const normalizeLocationForm = (currentUser) => ({
  location_id: null,
  name: `${String(currentUser?.company?.name || 'Main').trim()} Main Branch`.trim(),
  address_line: '',
  latitude: '',
  longitude: '',
  delivery_radius_km: 5
});

const isCreatedRow = (row) => ['created', 'created_with_image_error'].includes(row?.status);

const getCreatedItemId = (row) => row?.created_item?.item_id || row?.created_item?.id || null;

export function OnboardingReminderBanner({ onboarding, onOpenWizard }) {
  const progress = getProgress(onboarding);
  const state = String(onboarding?.tenant_onboarding_state || 'not_started').trim().toLowerCase();

  if (state === 'completed') return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Tenant onboarding is incomplete</p>
          <p className="text-xs text-amber-800">Completion progress: {progress.completed_required_count}/{progress.required_total} required checks.</p>
        </div>
        <button
          type="button"
          onClick={onOpenWizard}
          className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Continue Setup
        </button>
      </div>
    </div>
  );
}

export default function OnboardingSetupModal({
  open,
  onClose,
  onboarding,
  currentUser,
  workflowMode = DEFAULT_WORKFLOW_MODE,
  onRefreshUser
}) {
  const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);
  const presetOptions = useMemo(() => resolvePresetOptions(normalizedWorkflowMode), [normalizedWorkflowMode]);
  const progress = useMemo(() => getProgress(onboarding), [onboarding]);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationForm, setLocationForm] = useState(() => normalizeLocationForm(currentUser));
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [itemRows, setItemRows] = useState(() => [buildEmptyItemRow(normalizedWorkflowMode)]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const lastTrackedOpenRef = useRef(false);
  const initializedForOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      lastTrackedOpenRef.current = false;
      initializedForOpenRef.current = false;
      return;
    }

    if (!lastTrackedOpenRef.current) {
      lastTrackedOpenRef.current = true;
      trackOnboardingEvent({
        eventKey: 'wizard_viewed',
        metadata: { surface: 'modal' }
      }).catch(() => {});
    }

    if (!initializedForOpenRef.current) {
      initializedForOpenRef.current = true;
      setCurrentStepIndex(0);
      setLogoFile(null);
      setCoverFile(null);
      setItemRows([buildEmptyItemRow(normalizedWorkflowMode)]);
      setLocationForm(normalizeLocationForm(currentUser));
      setPrimaryLocationId(null);
      setLocationsLoading(true);
      listTenantLocations({ include_inactive: true })
        .then((locations) => {
          const rows = Array.isArray(locations) ? locations : [];
          const primary = rows.find((location) => location?.is_primary_storefront === true)
            || rows.find((location) => location?.is_active === true);
          if (!primary) return;
          setPrimaryLocationId(primary.location_id || null);
          setLocationForm({
            location_id: primary.location_id || null,
            name: primary.name || '',
            address_line: primary.address_line || '',
            latitude: primary.latitude ?? '',
            longitude: primary.longitude ?? '',
            delivery_radius_km: primary.delivery_radius_km ?? 5
          });
        })
        .catch(() => {
          toast.error('Failed to load saved locations.');
        })
        .finally(() => setLocationsLoading(false));
    }
  }, [currentUser, normalizedWorkflowMode, open]);

  if (!open) return null;

  const step = WIZARD_STEPS[currentStepIndex] || WIZARD_STEPS[0];
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < WIZARD_STEPS.length - 1;
  const missingRequirements = progress.missing_requirements;
  const serverHasPrimaryLocation = !missingRequirements.includes('has_primary_storefront_location');
  const serverHasPricedStarterItem = !missingRequirements.includes('has_priced_starter_item');
  const hasCompletionLocation = Boolean(primaryLocationId) || serverHasPrimaryLocation;
  const hasCompletionStarterItem = itemRows.some((row) => (
    isCreatedRow(row) && Number(row.default_sale_price) > 0
  )) || serverHasPricedStarterItem;
  const completionBlockers = [
    hasCompletionLocation ? null : 'save a primary storefront location',
    hasCompletionStarterItem ? null : 'save at least one priced starter item'
  ].filter(Boolean);
  const completionDisabled = finishing || saving || completionBlockers.length > 0;

  const goToNextStep = () => {
    if (!canGoNext) return;
    setCurrentStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const goToPrevStep = () => {
    if (!canGoBack) return;
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleSaveBrandAssets = async ({ skipped = false } = {}) => {
    setSaving(true);
    try {
      if (!skipped) {
        if (logoFile) await uploadStorefrontAsset('profile', logoFile);
        if (coverFile) await uploadStorefrontAsset('cover', coverFile);
      } else {
        await trackOnboardingEvent({
          eventKey: 'optional_asset_skipped',
          metadata: { surface: 'modal' }
        });
      }
      await saveOnboardingStep({
        stepKey: 'brand_assets',
        payload: {
          uploaded_profile_asset: Boolean(logoFile && !skipped),
          uploaded_cover_asset: Boolean(coverFile && !skipped),
          skipped: Boolean(skipped)
        }
      });
      toast.success(skipped ? 'Branding skipped for now.' : 'Branding saved.');
      setLogoFile(null);
      setCoverFile(null);
      await onRefreshUser?.();
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save branding.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocation = async () => {
    const payload = {
      name: String(locationForm.name || '').trim(),
      address_line: String(locationForm.address_line || '').trim(),
      latitude: Number(locationForm.latitude),
      longitude: Number(locationForm.longitude),
      delivery_radius_km: Number(locationForm.delivery_radius_km || 5),
      is_active: true,
      is_open: true,
      is_primary_storefront: true
    };

    if (!payload.name || !payload.address_line || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      toast.error('Location name, address, latitude, and longitude are required.');
      return;
    }

    setSaving(true);
    try {
      const saved = locationForm.location_id
        ? await updateTenantLocation(locationForm.location_id, payload)
        : await createTenantLocation(payload);
      const savedLocationId = saved?.location_id || locationForm.location_id || null;
      setPrimaryLocationId(savedLocationId);

      await saveOnboardingStep({
        stepKey: 'primary_location',
        payload: {
          location_id: savedLocationId,
          name: saved?.name || payload.name,
          is_primary_storefront: true
        }
      });
      await trackOnboardingEvent({
        eventKey: 'primary_location_saved',
        metadata: { surface: 'modal' }
      });
      toast.success('Primary storefront location saved.');
      await onRefreshUser?.();
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save storefront location.');
    } finally {
      setSaving(false);
    }
  };

  const handleLocationPinChange = ({ latitude, longitude }) => {
    setLocationForm((prev) => ({
      ...prev,
      latitude: String(latitude),
      longitude: String(longitude)
    }));
  };

  const updateItemRow = (clientRowId, patch) => {
    setItemRows((rows) => rows.map((row) => (
      row.client_row_id === clientRowId && !isCreatedRow(row) ? { ...row, ...patch } : row
    )));
  };

  const addItemRow = () => {
    setItemRows((rows) => [...rows, buildEmptyItemRow(normalizedWorkflowMode)]);
  };

  const removeItemRow = (clientRowId) => {
    setItemRows((rows) => rows.length === 1 ? rows : rows.filter((row) => (
      row.client_row_id !== clientRowId || isCreatedRow(row)
    )));
  };

  const handleSaveItems = async () => {
    setSaving(true);
    try {
      const rowsToSubmit = itemRows.filter((row) => !isCreatedRow(row));
      if (rowsToSubmit.length === 0) {
        toast.success('All onboarding item rows are already saved.');
        return;
      }

      const rowsForApi = rowsToSubmit.map((row) => ({
        client_row_id: row.client_row_id,
        mode_item_preset: row.mode_item_preset,
        name: row.name,
        default_sale_price: row.default_sale_price,
        cost_per_unit: row.cost_per_unit,
        current_stock: row.current_stock,
        location_id: primaryLocationId || undefined
      }));

      const result = await bulkCreateOnboardingItems({ rows: rowsForApi });
      const resultByRow = new Map((result?.results || []).map((row) => [row.client_row_id, row]));

      const nextRows = await Promise.all(itemRows.map(async (row) => {
        if (isCreatedRow(row)) return row;
        const rowResult = resultByRow.get(row.client_row_id);
        if (!rowResult || rowResult.status !== 'created') {
          return {
            ...row,
            status: 'failed',
            errors: rowResult?.errors || ['Unable to create this row.'],
            created_item: null
          };
        }

        const createdItem = rowResult.item || null;
        const itemId = createdItem?.item_id || createdItem?.id || null;
        const nextRow = {
          ...row,
          status: 'created',
          errors: [],
          created_item: createdItem
        };
        if (itemId && row.image_file) {
          try {
            await uploadStorefrontCatalogImage(itemId, row.image_file);
          } catch (error) {
            return {
              ...nextRow,
              status: 'created_with_image_error',
              errors: [error?.response?.data?.message || 'Item created, but image upload failed.']
            };
          }
        }
        return nextRow;
      }));

      setItemRows(nextRows);
      await saveOnboardingStep({
        stepKey: 'bulk_items',
        payload: {
          workflow_mode: result?.workflow_mode || normalizedWorkflowMode,
          summary: result?.summary || null,
          created_item_ids: nextRows
            .map((row) => row.created_item?.item_id || row.created_item?.id || null)
            .filter(Boolean)
        }
      });
      await trackOnboardingEvent({
        eventKey: 'bulk_items_saved',
        metadata: {
          surface: 'modal',
          created: result?.summary?.created || 0,
          failed: result?.summary?.failed || 0
        }
      });
      toast.success(`${result?.summary?.created || 0} onboarding item(s) created.`);
      await onRefreshUser?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to create onboarding items.');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryImageUpload = async (clientRowId) => {
    const row = itemRows.find((entry) => entry.client_row_id === clientRowId);
    const itemId = getCreatedItemId(row);
    if (!row?.image_file || !itemId) {
      toast.error('Choose an image before retrying upload.');
      return;
    }

    setSaving(true);
    try {
      await uploadStorefrontCatalogImage(itemId, row.image_file);
      setItemRows((rows) => rows.map((entry) => (
        entry.client_row_id === clientRowId
          ? { ...entry, status: 'created', errors: [] }
          : entry
      )));
      toast.success('Storefront image uploaded.');
    } catch (error) {
      setItemRows((rows) => rows.map((entry) => (
        entry.client_row_id === clientRowId
          ? { ...entry, errors: [error?.response?.data?.message || 'Image upload failed.'] }
          : entry
      )));
      toast.error(error?.response?.data?.message || 'Image upload failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setFinishing(true);
    try {
      await completeOnboarding();
      toast.success('Tenant onboarding completed.');
      await onRefreshUser?.();
      onClose?.();
    } catch (error) {
      const serverMissing = error?.response?.data?.errors?.missing_requirements;
      if (Array.isArray(serverMissing) && serverMissing.length > 0) {
        toast.error(`Missing requirements: ${serverMissing.map(formatRequirementLabel).join(', ')}`);
      } else {
        toast.error(error?.response?.data?.message || 'Unable to complete onboarding.');
      }
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Tenant Onboarding Setup</h2>
          <p className="mt-1 text-xs text-slate-600">
            Progress: {progress.completed_required_count}/{progress.required_total} required. Mode: {getWorkflowModeLabel(normalizedWorkflowMode)}.
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-700">
            Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
          </p>
        </div>

        <div className="space-y-5 px-5 py-5">
          {step === 'brand_assets' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">1) Profile and Cover</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Profile picture
                  <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                </label>
                <label className="text-xs text-slate-700">
                  Cover photo
                  <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => handleSaveBrandAssets()} disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Save and Continue
                </button>
                <button type="button" onClick={() => handleSaveBrandAssets({ skipped: true })} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60">
                  Skip for Now
                </button>
              </div>
            </section>
          )}

          {step === 'primary_location' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">2) Main Storefront Location</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Location name
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.name} onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))} disabled={locationsLoading} />
                </label>
                <label className="text-xs text-slate-700">
                  Delivery radius (km)
                  <input type="number" min={0} max={100} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.delivery_radius_km} onChange={(event) => setLocationForm((prev) => ({ ...prev, delivery_radius_km: event.target.value }))} disabled={locationsLoading} />
                </label>
                <label className="text-xs text-slate-700 sm:col-span-2">
                  Address
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.address_line} onChange={(event) => setLocationForm((prev) => ({ ...prev, address_line: event.target.value }))} disabled={locationsLoading} />
                </label>
                <div className="sm:col-span-2">
                  <MapPinPicker
                    latitude={locationForm.latitude}
                    longitude={locationForm.longitude}
                    deliveryRadiusKm={locationForm.delivery_radius_km}
                    onChange={handleLocationPinChange}
                  />
                </div>
                <label className="text-xs text-slate-700">
                  Latitude
                  <input type="number" step="any" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.latitude} onChange={(event) => setLocationForm((prev) => ({ ...prev, latitude: event.target.value }))} disabled={locationsLoading} />
                </label>
                <label className="text-xs text-slate-700">
                  Longitude
                  <input type="number" step="any" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.longitude} onChange={(event) => setLocationForm((prev) => ({ ...prev, longitude: event.target.value }))} disabled={locationsLoading} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleSaveLocation} disabled={saving || locationsLoading} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Save and Continue
                </button>
              </div>
            </section>
          )}

          {step === 'bulk_items' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">3) Starter Items</h3>
              <div className="mt-3 space-y-3">
                {itemRows.map((row, index) => (
                  <div key={row.client_row_id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-3 md:grid-cols-6">
                      <label className="text-xs text-slate-700 md:col-span-2">
                        Item type
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.mode_item_preset} onChange={(event) => updateItemRow(row.client_row_id, { mode_item_preset: event.target.value })} disabled={isCreatedRow(row) || saving}>
                          {presetOptions.map((preset) => (
                            <option key={preset.key} value={preset.key}>{preset.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-700 md:col-span-2">
                        Item name
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.name} onChange={(event) => updateItemRow(row.client_row_id, { name: event.target.value })} disabled={isCreatedRow(row) || saving} />
                      </label>
                      <label className="text-xs text-slate-700">
                        Selling price
                        <input type="number" min={0} step="0.01" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.default_sale_price} onChange={(event) => updateItemRow(row.client_row_id, { default_sale_price: event.target.value })} disabled={isCreatedRow(row) || saving} />
                      </label>
                      <div className="flex items-end justify-end">
                        <button type="button" onClick={() => removeItemRow(row.client_row_id)} disabled={itemRows.length === 1 || saving || isCreatedRow(row)} className="rounded-md border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                          Remove
                        </button>
                      </div>
                      <label className="text-xs text-slate-700">
                        Cost
                        <input type="number" min={0} step="0.01" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.cost_per_unit} onChange={(event) => updateItemRow(row.client_row_id, { cost_per_unit: event.target.value })} disabled={isCreatedRow(row) || saving} />
                      </label>
                      <label className="text-xs text-slate-700">
                        Current stock
                        <input type="number" min={0} step="0.01" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.current_stock} onChange={(event) => updateItemRow(row.client_row_id, { current_stock: event.target.value })} disabled={isCreatedRow(row) || saving} />
                      </label>
                      <label className="text-xs text-slate-700 md:col-span-3">
                        Storefront image
                        <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(event) => updateItemRow(row.client_row_id, { image_file: event.target.files?.[0] || null })} disabled={isCreatedRow(row) || saving} />
                      </label>
                      <div className="flex items-end text-xs text-slate-500">Row {index + 1}</div>
                    </div>
                    {row.status === 'created' && <p className="mt-2 text-xs font-semibold text-emerald-700">Created.</p>}
                    {row.status === 'created_with_image_error' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-amber-700">{row.errors.join(' ')}</p>
                        <button type="button" onClick={() => handleRetryImageUpload(row.client_row_id)} disabled={saving || !row.image_file} className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 disabled:opacity-50">
                          Retry Image Upload
                        </button>
                      </div>
                    )}
                    {row.status === 'failed' && row.errors.length > 0 && (
                      <p className="mt-2 text-xs font-semibold text-red-700">{row.errors.join(' ')}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={addItemRow} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60">
                  Add Row
                </button>
                <button type="button" onClick={handleSaveItems} disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Save Items
                </button>
                <button type="button" onClick={handleComplete} disabled={completionDisabled} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Complete Onboarding
                </button>
              </div>
              {completionBlockers.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  To complete onboarding, {completionBlockers.join(' and ')}.
                </p>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={goToPrevStep} disabled={!canGoBack} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            Previous
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Close (Soft Reminder)
          </button>
        </div>
      </div>
    </div>
  );
}
