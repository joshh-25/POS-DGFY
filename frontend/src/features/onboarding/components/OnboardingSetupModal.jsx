import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { completeOnboarding, saveOnboardingStep, trackOnboardingEvent } from '@/services/onboardingService.js';
import { updateSettings, uploadStorefrontAsset } from '@/services/settingsService.js';
import { WORKFLOW_MODE_LABELS } from '@/src/features/settings/workflowMode.js';

const WIZARD_STEPS = Object.freeze([
  'business_profile',
  'brand_assets',
  'business_classification',
  'readiness'
]);

const VISIBILITY_OPTIONS = Object.freeze([
  { value: 'ghost', label: 'Ghost (profile and contact only)' },
  { value: 'catalog', label: 'Catalog Only' },
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'transaction', label: 'Transaction' }
]);

const INVENTORY_DISPLAY_OPTIONS = Object.freeze([
  { value: 'hidden', label: 'Hidden' },
  { value: 'availability', label: 'Availability' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'exact_quantity', label: 'Exact Quantity' }
]);

const OFFERING_OPTIONS = Object.freeze([
  { value: 'physical_product', label: 'Physical products' },
  { value: 'time_service', label: 'Time-based services' },
  { value: 'ticketed_seat', label: 'Ticketed seats' },
  { value: 'capacity_slot', label: 'Capacity slots' },
  { value: 'rental', label: 'Rentals' }
]);

const ORDER_MODE_OPTIONS = Object.freeze([
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'pre_order', label: 'Pre-order' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'realtime', label: 'Real-time' }
]);

const FULFILLMENT_OPTIONS = Object.freeze([
  { value: 'pickup', label: 'Pickup' },
  { value: 'own_delivery', label: 'Own delivery' },
  { value: 'platform_delivery', label: 'Platform delivery' },
  { value: 'on_site_service', label: 'On-site service' }
]);

const tierLabelMap = Object.freeze({
  tier_0: 'Tier 0 (Ghost Listing)',
  tier_1: 'Tier 1 (Catalog Mode)',
  tier_2: 'Tier 2 (Inquiry Mode)',
  tier_3: 'Tier 3 (Transaction Mode)'
});

const workflowLabelMap = Object.freeze(Object.fromEntries(
  Object.entries(WORKFLOW_MODE_LABELS).map(([key, label]) => [key, `${label} template recommendation`])
));

const getProgress = (onboarding) => {
  const snapshot = onboarding?.tenant_onboarding_progress?.checklist_snapshot;
  if (!snapshot) {
    return {
      required_total: 4,
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
    has_active_location: 'At least one active location',
    has_primary_storefront_location: 'Primary storefront location set',
    has_sellable_item: 'At least one sellable POS item'
  };
  return labelMap[key] || key.replace(/_/g, ' ');
};

const deriveDisplayName = ({ onboarding, currentUser }) => {
  const payloadName = String(
    onboarding?.tenant_onboarding_progress?.step_payloads?.business_profile?.pos_business_name || ''
  ).trim();
  if (payloadName) return payloadName;
  return String(currentUser?.company?.name || '').trim();
};

const normalizeList = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

const deriveClassificationPayload = (onboarding) => {
  const existing = onboarding?.tenant_onboarding_progress?.step_payloads?.business_classification;
  if (!existing || typeof existing !== 'object') {
    return {
      identity: { industry_tags: [] },
      legitimacy: { registration_status: 'informal', requires_official_receipt: false },
      location_presence: { operation_type: 'fixed', branch_count: 1, radius_visibility: 'approximate' },
      operations_staff: { pos_user_count: 1, needs_rbac: false },
      product_service: { offering_types: [] },
      order_booking: { order_modes: ['walk_in'], fulfillment_methods: ['pickup'] },
      online_visibility: { mode: 'catalog' },
      inventory_display: { mode: 'availability', low_stock_threshold: 5 },
      payment_configuration: { accepted_in_store_payments: ['cash'], accepts_online_payments: false, payout_destination: 'bank_transfer', settlement_preference: 'daily' },
      branding: { branding_level: 'basic', has_custom_domain: false },
      customer_interaction: { preferred_channels: ['sms'], tracks_customer_data: false },
      growth_intent: { growth_goals: [], estimated_monthly_sales: 0 }
    };
  }

  return {
    identity: {
      official_name: String(existing?.identity?.official_name || '').trim(),
      display_name: String(existing?.identity?.display_name || '').trim(),
      industry_tags: normalizeList(existing?.identity?.industry_tags)
    },
    legitimacy: {
      registration_status: String(existing?.legitimacy?.registration_status || 'informal').trim().toLowerCase(),
      requires_official_receipt: Boolean(existing?.legitimacy?.requires_official_receipt)
    },
    location_presence: {
      operation_type: String(existing?.location_presence?.operation_type || 'fixed').trim().toLowerCase(),
      branch_count: Number(existing?.location_presence?.branch_count || 1),
      radius_visibility: String(existing?.location_presence?.radius_visibility || 'approximate').trim().toLowerCase()
    },
    operations_staff: {
      pos_user_count: Number(existing?.operations_staff?.pos_user_count || 1),
      needs_rbac: Boolean(existing?.operations_staff?.needs_rbac)
    },
    product_service: {
      offering_types: normalizeList(existing?.product_service?.offering_types)
    },
    order_booking: {
      order_modes: normalizeList(existing?.order_booking?.order_modes),
      fulfillment_methods: normalizeList(existing?.order_booking?.fulfillment_methods)
    },
    online_visibility: {
      mode: String(existing?.customer_access_mode || existing?.online_visibility?.mode || 'catalog').trim().toLowerCase()
    },
    inventory_display: {
      mode: String(existing?.inventory_display_mode || existing?.inventory_display?.mode || 'availability').trim().toLowerCase(),
      low_stock_threshold: Number(existing?.inventory_low_stock_display_threshold || existing?.inventory_display?.low_stock_threshold || 5)
    },
    payment_configuration: {
      accepted_in_store_payments: normalizeList(existing?.payment_configuration?.accepted_in_store_payments),
      accepts_online_payments: Boolean(existing?.payment_configuration?.accepts_online_payments),
      payout_destination: String(existing?.payment_configuration?.payout_destination || 'bank_transfer').trim().toLowerCase(),
      settlement_preference: String(existing?.payment_configuration?.settlement_preference || 'daily').trim().toLowerCase()
    },
    branding: {
      branding_level: String(existing?.branding?.branding_level || 'basic').trim().toLowerCase(),
      has_custom_domain: Boolean(existing?.branding?.has_custom_domain)
    },
    customer_interaction: {
      preferred_channels: normalizeList(existing?.customer_interaction?.preferred_channels),
      tracks_customer_data: Boolean(existing?.customer_interaction?.tracks_customer_data)
    },
    growth_intent: {
      growth_goals: normalizeList(existing?.growth_intent?.growth_goals),
      estimated_monthly_sales: Number(existing?.growth_intent?.estimated_monthly_sales || 0)
    }
  };
};

const deriveClassificationSnapshot = (onboarding) => (
  onboarding?.tenant_onboarding_progress?.classification_snapshot || null
);

const toggleListOption = (currentList, optionValue) => {
  const current = Array.isArray(currentList) ? currentList : [];
  if (current.includes(optionValue)) {
    return current.filter((entry) => entry !== optionValue);
  }
  return [...current, optionValue];
};

export function OnboardingReminderBanner({ onboarding, onOpenWizard }) {
  const progress = getProgress(onboarding);
  const state = String(onboarding?.tenant_onboarding_state || 'not_started').trim().toLowerCase();

  if (state === 'completed') return null;

  const done = progress.completed_required_count;
  const total = progress.required_total;

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Tenant onboarding is incomplete</p>
          <p className="text-xs text-amber-800">Completion progress: {done}/{total} required checks.</p>
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
  onRefreshUser
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [classificationForm, setClassificationForm] = useState(deriveClassificationPayload(onboarding));
  const [classificationSnapshot, setClassificationSnapshot] = useState(deriveClassificationSnapshot(onboarding));

  const progress = useMemo(() => getProgress(onboarding), [onboarding]);
  const lastTrackedOpenRef = useRef(false);
  const lastClassifierViewTrackedRef = useRef(false);
  const initializedForOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      lastTrackedOpenRef.current = false;
      lastClassifierViewTrackedRef.current = false;
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
      setDisplayName(deriveDisplayName({ onboarding, currentUser }));
      setClassificationForm(deriveClassificationPayload(onboarding));
      setClassificationSnapshot(deriveClassificationSnapshot(onboarding));
      setCurrentStepIndex(0);
      initializedForOpenRef.current = true;
    }
  }, [open, onboarding, currentUser]);

  const step = WIZARD_STEPS[currentStepIndex] || WIZARD_STEPS[0];

  useEffect(() => {
    if (step !== 'business_classification') return;
    if (lastClassifierViewTrackedRef.current) return;
    lastClassifierViewTrackedRef.current = true;
    trackOnboardingEvent({
      eventKey: 'classifier_viewed',
      metadata: { surface: 'modal' }
    }).catch(() => {});
  }, [step]);

  if (!open) return null;

  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < WIZARD_STEPS.length - 1;

  const goToNextStep = () => {
    if (!canGoNext) return;
    setCurrentStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const goToPrevStep = () => {
    if (!canGoBack) return;
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleSaveBusinessProfile = async () => {
    setSaving(true);
    try {
      const nameValue = String(displayName || '').trim();
      if (nameValue) {
        await updateSettings({ pos_business_name: nameValue });
      }
      await saveOnboardingStep({
        stepKey: 'business_profile',
        payload: {
          pos_business_name: nameValue || null
        }
      });
      toast.success('Business profile step saved.');
      await onRefreshUser?.();
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save business profile step.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBrandAssets = async () => {
    setSaving(true);
    try {
      if (logoFile) {
        await uploadStorefrontAsset('profile', logoFile);
      }
      if (coverFile) {
        await uploadStorefrontAsset('cover', coverFile);
      }
      await saveOnboardingStep({
        stepKey: 'brand_assets',
        payload: {
          uploaded_profile_asset: Boolean(logoFile),
          uploaded_cover_asset: Boolean(coverFile)
        }
      });
      toast.success('Branding assets step saved.');
      setLogoFile(null);
      setCoverFile(null);
      await onRefreshUser?.();
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save branding assets step.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipOptionalAssets = async () => {
    setSaving(true);
    try {
      await trackOnboardingEvent({
        eventKey: 'optional_asset_skipped',
        metadata: { surface: 'modal' }
      });
      toast.success('Optional branding assets skipped for now.');
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to record optional assets skip.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClassification = async () => {
    setSaving(true);
    try {
      const payload = {
        ...classificationForm,
        location_presence: {
          ...classificationForm.location_presence,
          branch_count: Number(classificationForm.location_presence?.branch_count || 0)
        },
        operations_staff: {
          ...classificationForm.operations_staff,
          pos_user_count: Number(classificationForm.operations_staff?.pos_user_count || 0)
        },
        customer_access_mode: String(classificationForm.online_visibility?.mode || 'catalog').trim().toLowerCase(),
        inventory_display_mode: String(classificationForm.inventory_display?.mode || 'availability').trim().toLowerCase(),
        inventory_low_stock_display_threshold: Number(classificationForm.inventory_display?.low_stock_threshold || 5),
        growth_intent: {
          ...classificationForm.growth_intent,
          estimated_monthly_sales: Number(classificationForm.growth_intent?.estimated_monthly_sales || 0)
        }
      };
      const data = await saveOnboardingStep({
        stepKey: 'business_classification',
        payload
      });
      await updateSettings({
        customer_access_mode: payload.customer_access_mode,
        inventory_display_mode: payload.inventory_display_mode,
        inventory_low_stock_display_threshold: payload.inventory_low_stock_display_threshold
      });
      setClassificationSnapshot(data?.tenant_onboarding_progress?.classification_snapshot || null);
      await trackOnboardingEvent({
        eventKey: 'classifier_saved',
        metadata: { surface: 'modal' }
      });
      toast.success('Business classification saved.');
      await onRefreshUser?.();
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save business classification step.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipClassification = async () => {
    setSaving(true);
    try {
      await trackOnboardingEvent({
        eventKey: 'classifier_skipped',
        metadata: { surface: 'modal' }
      });
      toast.success('Classification skipped for now.');
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to skip classification step.');
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

  const handleGoToLocations = () => {
    onClose?.();
    navigate('/settings?tab=profile#tab-profile');
  };

  const handleGoToItems = () => {
    onClose?.();
    navigate('/items');
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Tenant Onboarding Setup</h2>
          <p className="mt-1 text-xs text-slate-600">
            Complete setup for DGFY storefront, DGFY POS, and SKUpervisor. Progress: {progress.completed_required_count}/{progress.required_total} required.
          </p>
          {currentUser?.company?.name && (
            <p className="mt-1 text-xs text-slate-500">Tenant: {currentUser.company.name}</p>
          )}
          <p className="mt-2 text-xs font-semibold text-slate-700">
            Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
          </p>
        </div>

        <div className="space-y-5 px-5 py-5">
          {step === 'business_profile' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">1) Business Profile</h3>
              <p className="mt-1 text-xs text-slate-600">
                Store name from registration is prefilled as baseline. You can update POS business display name here.
              </p>
              <label htmlFor="onboarding-pos-business-name" className="mt-3 block text-xs font-medium text-slate-700">
                POS business display name
              </label>
              <input
                id="onboarding-pos-business-name"
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="POS business display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveBusinessProfile}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Save and Continue
                </button>
              </div>
            </section>
          )}

          {step === 'brand_assets' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">2) Optional Branding Assets</h3>
              <p className="mt-1 text-xs text-slate-600">
                Logo and cover are optional. Upload now using existing storefront asset endpoints or skip.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Logo / Profile image (optional)
                  <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                </label>
                <label className="text-xs text-slate-700">
                  Cover image (optional)
                  <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveBrandAssets}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Save and Continue
                </button>
                <button
                  type="button"
                  onClick={handleSkipOptionalAssets}
                  disabled={saving}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Skip for Now
                </button>
              </div>
            </section>
          )}

          {step === 'readiness' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">4) Required Readiness Checks</h3>
              {classificationSnapshot && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <p>
                    Advisory tier: <span className="font-semibold">{tierLabelMap[classificationSnapshot.monetization_tier] || classificationSnapshot.monetization_tier || 'Unknown'}</span>
                  </p>
                  <p className="mt-1">
                    Workflow recommendation: <span className="font-semibold">{workflowLabelMap[classificationSnapshot.business_mode_template_recommendation] || workflowLabelMap[classificationSnapshot.workflow_mode_recommendation] || classificationSnapshot.business_mode_template_recommendation || classificationSnapshot.workflow_mode_recommendation || 'Unknown'}</span>
                  </p>
                </div>
              )}
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {(progress.missing_requirements || []).length === 0 ? (
                  <li className="font-semibold text-emerald-700">All required checks are currently satisfied.</li>
                ) : (
                  progress.missing_requirements.map((key) => (
                    <li key={key}>- Missing: {formatRequirementLabel(key)}</li>
                  ))
                )}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleGoToLocations} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800">
                  Go to Locations
                </button>
                <button type="button" onClick={handleGoToItems} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800">
                  Go to Items
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={finishing}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Complete Onboarding
                </button>
              </div>
            </section>
          )}

          {step === 'business_classification' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">3) Business Classification</h3>
              <p className="mt-1 text-xs text-slate-600">
                Configure customer access, inventory display, tier, workflow, and compliance signals for this tenant.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Registration status
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.legitimacy.registration_status}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      legitimacy: {
                        ...prev.legitimacy,
                        registration_status: event.target.value
                      }
                    }))}
                  >
                    <option value="registered">Registered</option>
                    <option value="partial">Partially Registered</option>
                    <option value="informal">Informal</option>
                  </select>
                </label>

                <label className="text-xs text-slate-700">
                  Customer Access Mode
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.online_visibility.mode}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      online_visibility: {
                        ...prev.online_visibility,
                        mode: event.target.value
                      }
                    }))}
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-700">
                  Inventory Display
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.inventory_display?.mode || 'availability'}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      inventory_display: {
                        ...prev.inventory_display,
                        mode: event.target.value
                      }
                    }))}
                  >
                    {INVENTORY_DISPLAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-700">
                  Low stock display threshold
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.inventory_display?.low_stock_threshold ?? 5}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      inventory_display: {
                        ...prev.inventory_display,
                        low_stock_threshold: event.target.value
                      }
                    }))}
                  />
                </label>

                <label className="text-xs text-slate-700">
                  Number of branches
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.location_presence.branch_count}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      location_presence: {
                        ...prev.location_presence,
                        branch_count: event.target.value
                      }
                    }))}
                  />
                </label>

                <label className="text-xs text-slate-700">
                  POS users/staff count
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.operations_staff.pos_user_count}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      operations_staff: {
                        ...prev.operations_staff,
                        pos_user_count: event.target.value
                      }
                    }))}
                  />
                </label>

                <label className="text-xs text-slate-700">
                  Estimated monthly sales
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={classificationForm.growth_intent.estimated_monthly_sales}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      growth_intent: {
                        ...prev.growth_intent,
                        estimated_monthly_sales: event.target.value
                      }
                    }))}
                  />
                </label>

                <label className="mt-5 inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={classificationForm.legitimacy.requires_official_receipt}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      legitimacy: {
                        ...prev.legitimacy,
                        requires_official_receipt: event.target.checked
                      }
                    }))}
                  />
                  Requires official receipts
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={classificationForm.operations_staff.needs_rbac}
                    onChange={(event) => setClassificationForm((prev) => ({
                      ...prev,
                      operations_staff: {
                        ...prev.operations_staff,
                        needs_rbac: event.target.checked
                      }
                    }))}
                  />
                  Needs role-based access controls
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-700">Offering types</p>
                  <div className="mt-1 space-y-1">
                    {OFFERING_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={classificationForm.product_service.offering_types.includes(option.value)}
                          onChange={() => setClassificationForm((prev) => ({
                            ...prev,
                            product_service: {
                              ...prev.product_service,
                              offering_types: toggleListOption(prev.product_service.offering_types, option.value)
                            }
                          }))}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-700">Order modes</p>
                  <div className="mt-1 space-y-1">
                    {ORDER_MODE_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={classificationForm.order_booking.order_modes.includes(option.value)}
                          onChange={() => setClassificationForm((prev) => ({
                            ...prev,
                            order_booking: {
                              ...prev.order_booking,
                              order_modes: toggleListOption(prev.order_booking.order_modes, option.value)
                            }
                          }))}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-medium text-slate-700">Fulfillment methods</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {FULFILLMENT_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={classificationForm.order_booking.fulfillment_methods.includes(option.value)}
                        onChange={() => setClassificationForm((prev) => ({
                          ...prev,
                          order_booking: {
                            ...prev.order_booking,
                            fulfillment_methods: toggleListOption(prev.order_booking.fulfillment_methods, option.value)
                          }
                        }))}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              {classificationSnapshot && (
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p>
                    Current advisory tier: <span className="font-semibold">{tierLabelMap[classificationSnapshot.monetization_tier] || classificationSnapshot.monetization_tier}</span>
                  </p>
                  <p className="mt-1">
                    Customer access: <span className="font-semibold">{classificationSnapshot.customer_access_mode || classificationSnapshot.visibility_mode}</span>
                  </p>
                  <p className="mt-1">
                    Inventory display: <span className="font-semibold">{classificationSnapshot.inventory_display_mode || 'availability'}</span>
                  </p>
                  <p className="mt-1">
                    Workflow recommendation: <span className="font-semibold">{workflowLabelMap[classificationSnapshot.business_mode_template_recommendation] || workflowLabelMap[classificationSnapshot.workflow_mode_recommendation] || classificationSnapshot.business_mode_template_recommendation || classificationSnapshot.workflow_mode_recommendation}</span>
                  </p>
                  <p className="mt-1">
                    Compliance hint: <span className="font-semibold">{classificationSnapshot.compliance_path_hint}</span>
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveClassification}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Save and Continue
                </button>
                <button
                  type="button"
                  onClick={handleSkipClassification}
                  disabled={saving}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  Skip for Now
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={goToPrevStep}
            disabled={!canGoBack}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Close (Soft Reminder)
          </button>
        </div>
      </div>
    </div>
  );
}
