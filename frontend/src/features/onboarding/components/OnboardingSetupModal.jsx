import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { completeOnboarding, saveOnboardingStep, trackOnboardingEvent } from '@/services/onboardingService.js';
import { updateSettings, uploadStorefrontAsset } from '@/services/settingsService.js';

const WIZARD_STEPS = Object.freeze([
  'business_profile',
  'brand_assets',
  'readiness'
]);

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

  const progress = useMemo(() => getProgress(onboarding), [onboarding]);
  const lastTrackedOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      lastTrackedOpenRef.current = false;
      return;
    }
    if (!lastTrackedOpenRef.current) {
      lastTrackedOpenRef.current = true;
      trackOnboardingEvent({
        eventKey: 'wizard_viewed',
        metadata: { surface: 'modal' }
      }).catch(() => {});
    }
    setDisplayName(deriveDisplayName({ onboarding, currentUser }));
    setCurrentStepIndex(0);
  }, [open, onboarding, currentUser]);

  if (!open) return null;

  const step = WIZARD_STEPS[currentStepIndex] || WIZARD_STEPS[0];
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
              <h3 className="text-sm font-semibold text-slate-900">3) Required Readiness Checks</h3>
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
