import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Settings2, Store, Trash2, UserRound } from 'lucide-react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { updateSettings, uploadStorefrontAsset } from '@/services/settingsService.js';
import { createTenantLocation, updateTenantLocation } from '@/services/tenantLocationService.js';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { createSuggestedTerminalId, normalizeTerminalRegistry, sanitizeTerminalId } from '../utils/terminalIdentity.js';
import { POS_TERMINAL_SETUP_ORDER, POS_TERMINAL_SETUP_STEPS } from '../utils/setupFlow.js';
import {
  createDefaultStorefrontBusinessHours,
  normalizeStorefrontBusinessHours,
  serializeStorefrontBusinessHours
} from '@/src/features/settings/storefrontBusinessHours.js';
import StorefrontBusinessHoursScheduler from '@/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';

const MapPinPicker = lazyWithChunkRetry(() => import('@/src/components/maps/MapPinPicker.jsx'));

const STEP_CONFIG = {
  [POS_TERMINAL_SETUP_STEPS.PROFILE]: {
    title: 'Profile Setting',
    icon: UserRound,
    summary: 'Confirm the registered business identity now used by this POS tenant.',
    description: 'The registered company details are reused from the business account created during registration.'
  },
  [POS_TERMINAL_SETUP_STEPS.POS_SETUP]: {
    title: 'POS Setup',
    icon: Settings2,
    summary: 'Finish the POS setup required before this terminal can operate normally.',
    description: 'Register every counter against a canonical business location. Cashier access is managed separately in POS Settings.'
  },
  [POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP]: {
    title: 'Storefront',
    icon: Store,
    summary: 'Complete the storefront branding required for this tenant.',
    description: 'Upload the company icon and cover image from the existing storefront fields in POS Settings.'
  },
};

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const STOREFRONT_ASSET_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif';
const STOREFRONT_ASSET_MIME_TYPES = new Set(STOREFRONT_ASSET_ACCEPT.split(','));
const STOREFRONT_ASSET_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
let terminalDraftKeySequence = 0;

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const createTerminalDraftKey = () => {
  terminalDraftKeySequence += 1;
  return `terminal-draft-${terminalDraftKeySequence}`;
};

const createTerminalDraft = (entry = {}, isFirst = false, existingEntries = []) => ({
  draft_key: entry?.draft_key || createTerminalDraftKey(),
  terminal_id: sanitizeTerminalId(entry?.terminal_id) || createSuggestedTerminalId(existingEntries),
  label: String(entry?.label || '').trim(),
  location_id: toPositiveInt(entry?.location_id),
  is_active: entry?.is_active !== false,
  is_default: entry?.is_default === true || (isFirst && entry?.is_default !== false),
  pairing_version: String(entry?.pairing_version || '').trim(),
  paired_device_ready: entry?.paired_device_ready === true,
  rotate_pairing: false
});

const normalizeTerminalDrafts = (entries = []) => {
  const normalizedEntries = normalizeTerminalRegistry(entries);
  const normalized = normalizedEntries.map((entry, index) => createTerminalDraft(entry, index === 0, normalizedEntries));
  if (normalized.length === 0) {
    return [createTerminalDraft({ is_active: true, is_default: true }, true)];
  }
  return normalized;
};

const createLocationDraft = (location = {}, companyName = '', options = {}) => ({
  location_id: toPositiveInt(location?.location_id),
  name: String(location?.name || companyName || 'Main Store').trim(),
  address_line: String(location?.address_line || '').trim(),
  latitude: location?.latitude ?? '',
  longitude: location?.longitude ?? '',
  delivery_radius_km: Number(location?.delivery_radius_km ?? 5),
  supports_delivery: location?.supports_delivery !== false,
  supports_pickup: location?.supports_pickup !== false,
  is_primary_storefront: location?.is_primary_storefront === true || options.defaultPrimary === true,
  is_active: location?.is_active !== false
});

const resolvePrimaryLocation = (locations = []) => {
  const activeLocations = (Array.isArray(locations) ? locations : []).filter((location) => location?.is_active !== false);
  return activeLocations.find((location) => location?.is_primary_storefront === true) || activeLocations[0] || null;
};

export default function PosTenantSetupModal({
  open = false,
  finishing = false,
  currentStep = POS_TERMINAL_SETUP_STEPS.PROFILE,
  companyName = '',
  profileData = {},
  posRequirements = {},
  storefrontRequirements = {},
  terminalRegistry = [],
  terminalLocations = [],
  onStepSelect = () => {},
  onBack = () => {},
  onContinue = () => {},
  onSetupDataChanged = async () => {}
}) {
  const stepConfig = STEP_CONFIG[currentStep] || STEP_CONFIG[POS_TERMINAL_SETUP_STEPS.PROFILE];
  const Icon = stepConfig.icon;
  const activeStepIndex = Math.max(0, POS_TERMINAL_SETUP_ORDER.indexOf(currentStep));
  const hasPreviousStep = activeStepIndex > 0;
  const isLastStep = activeStepIndex === POS_TERMINAL_SETUP_ORDER.length - 1;
  const continueLabel = isLastStep ? 'Finish Setup' : 'Next Step';
  const [terminalDrafts, setTerminalDrafts] = useState(() => normalizeTerminalDrafts(terminalRegistry));
  const [terminalSaving, setTerminalSaving] = useState(false);
  const [terminalSaveFeedback, setTerminalSaveFeedback] = useState({ type: '', message: '' });
  const [terminalFieldErrors, setTerminalFieldErrors] = useState({});
  const [assetUploadingType, setAssetUploadingType] = useState('');
  const [assetUploadProgress, setAssetUploadProgress] = useState(0);
  const [localStorefrontAssets, setLocalStorefrontAssets] = useState({ profile: '', cover: '' });
  const [storefrontAssetPreviewErrors, setStorefrontAssetPreviewErrors] = useState({ profile: false, cover: false });
  const [locationSaving, setLocationSaving] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [storefrontContinueAttempted, setStorefrontContinueAttempted] = useState(false);
  const [storefrontHours, setStorefrontHours] = useState(() => normalizeStorefrontBusinessHours(
    storefrontRequirements.businessHours || createDefaultStorefrontBusinessHours()
  ));

  const localPreviewUrlsRef = useRef(new Set());

  const [locationDraft, setLocationDraft] = useState(() => createLocationDraft(
    resolvePrimaryLocation(terminalLocations),
    companyName,
    { defaultPrimary: resolvePrimaryLocation(terminalLocations) == null }
  ));

  useEffect(() => {
    if (!open) return;
    setTerminalDrafts(normalizeTerminalDrafts(terminalRegistry));
    setTerminalSaveFeedback({ type: '', message: '' });
    setTerminalFieldErrors({});
  }, [open, terminalRegistry]);

  useEffect(() => {
    if (!open) return;
    setLocalStorefrontAssets({
      profile: storefrontRequirements.profileImageUrl || '',
      cover: storefrontRequirements.coverImageUrl || ''
    });
    setStorefrontAssetPreviewErrors({ profile: false, cover: false });
    setStorefrontContinueAttempted(false);
  }, [open, storefrontRequirements.coverImageUrl, storefrontRequirements.profileImageUrl]);

  useEffect(() => () => {
    if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!open) return;
    const primaryLocation = resolvePrimaryLocation(terminalLocations);
    setLocationDraft(createLocationDraft(primaryLocation, companyName, { defaultPrimary: primaryLocation == null }));
    setStorefrontHours(normalizeStorefrontBusinessHours(
      storefrontRequirements.businessHours || createDefaultStorefrontBusinessHours()
    ));
  }, [companyName, open, storefrontRequirements.businessHours, terminalLocations]);

  const normalizedLocations = useMemo(
    () => (Array.isArray(terminalLocations) ? terminalLocations : []).map((location) => ({
      location_id: Number(location?.location_id || 0),
      name: String(location?.name || '').trim(),
      is_primary_storefront: location?.is_primary_storefront === true,
      is_active: location?.is_active !== false
    })).filter((location) => location.location_id > 0 && location.name),
    [terminalLocations]
  );

  const primaryLocationId = useMemo(
    () => toPositiveInt(resolvePrimaryLocation(terminalLocations)?.location_id),
    [terminalLocations]
  );

  const effectiveStorefrontProfileImageUrl = localStorefrontAssets.profile || storefrontRequirements.profileImageUrl || '';
  const effectiveStorefrontCoverImageUrl = localStorefrontAssets.cover || storefrontRequirements.coverImageUrl || '';
  const effectiveProfileImageReady = !storefrontAssetPreviewErrors.profile && (Boolean(effectiveStorefrontProfileImageUrl) || storefrontRequirements.profileImageReady === true);
  const effectiveCoverImageReady = !storefrontAssetPreviewErrors.cover && (Boolean(effectiveStorefrontCoverImageUrl) || storefrontRequirements.coverImageReady === true);
  const effectivePrimaryLocationReady = Boolean(toPositiveInt(locationDraft.location_id) || primaryLocationId);
  const effectiveStorefrontSetupReady = effectiveProfileImageReady && effectiveCoverImageReady && effectivePrimaryLocationReady;
  const highlightMissingStorefrontProfile = storefrontContinueAttempted && !effectiveProfileImageReady;
  const highlightMissingStorefrontCover = storefrontContinueAttempted && !effectiveCoverImageReady;
  const highlightMissingStorefrontLocation = storefrontContinueAttempted && !effectivePrimaryLocationReady;

  useEffect(() => {
    const fallbackLocationId = primaryLocationId || (normalizedLocations.length === 1 ? normalizedLocations[0].location_id : null);
    if (!fallbackLocationId) return;
    setTerminalDrafts((current) => current.map((entry) => (
      entry.location_id ? entry : { ...entry, location_id: fallbackLocationId }
    )));
  }, [normalizedLocations, primaryLocationId]);

  const handleTerminalDraftChange = (index, key, value) => {
    setTerminalSaveFeedback((current) => (current.type === 'error' ? { type: '', message: '' } : current));
    setTerminalFieldErrors((current) => {
      if (!current[index]?.[key]) return current;
      return {
        ...current,
        [index]: {
          ...current[index],
          [key]: ''
        }
      };
    });
    setTerminalDrafts((current) => {
      const next = current.map((entry) => ({ ...entry }));
      const entry = next[index] || createTerminalDraft({}, index === 0, next);
      entry[key] = key === 'terminal_id'
        ? sanitizeTerminalId(value)
        : (key === 'location_id' ? toPositiveInt(value) : value);

      if (key === 'is_default' && value === true) {
        next.forEach((candidate, candidateIndex) => {
          candidate.is_default = candidateIndex === index;
          if (candidateIndex === index) {
            candidate.is_active = true;
          }
        });
      } else {
        next[index] = entry;
      }

      if (key === 'is_active' && value === false && entry.is_default === true) {
        entry.is_default = false;
        const fallbackIndex = next.findIndex((candidate, candidateIndex) => candidateIndex !== index && candidate.is_active !== false);
        if (fallbackIndex >= 0) {
          next[fallbackIndex].is_default = true;
        }
      }

      next[index] = entry;
      return next;
    });
  };

  const handleAddTerminal = () => {
    setTerminalDrafts((current) => ([
      ...current,
      createTerminalDraft({}, current.length === 0, current)
    ]));
  };

  const handleRemoveTerminal = (index) => {
    setTerminalDrafts((current) => {
      const next = current.filter((_, candidateIndex) => candidateIndex !== index);
      if (next.length === 0) {
        return [createTerminalDraft({ is_active: true, is_default: true }, true)];
      }
      if (!next.some((entry) => entry.is_default === true && entry.is_active !== false)) {
        const firstActiveIndex = next.findIndex((entry) => entry.is_active !== false);
        if (firstActiveIndex >= 0) {
          next[firstActiveIndex].is_default = true;
        }
      }
      return next;
    });
  };

  const handleSaveTerminals = async () => {
    setTerminalSaving(true);
    try {
      setTerminalSaveFeedback({ type: '', message: '' });
      setTerminalFieldErrors({});
      const preparedEntries = terminalDrafts
        .map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || ''),
          rotate_pairing: false
        }))
        .filter((entry) => entry.terminal_id || entry.label || entry.location_id || entry.is_default || entry.is_active === false);

      if (preparedEntries.length === 0) throw new Error('Add at least one terminal.');

      const seenTerminalIds = new Set();
      let defaultCount = 0;
      const nextFieldErrors = {};
      preparedEntries.forEach((entry, index) => {
        if (!entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id)) {
          nextFieldErrors[index] = { terminal_id: 'Enter a valid terminal ID.' };
          throw new Error(`Invalid terminal ID: ${entry.terminal_id || '(empty)'}`);
        }
        if (seenTerminalIds.has(entry.terminal_id)) {
          nextFieldErrors[index] = { terminal_id: 'This terminal ID is duplicated.' };
          throw new Error(`Duplicate terminal ID: ${entry.terminal_id}`);
        }
        seenTerminalIds.add(entry.terminal_id);
        if (entry.is_default === true) defaultCount += 1;
        if (entry.is_active !== false && !entry.location_id) {
          nextFieldErrors[index] = { location_id: 'Select a store for this active terminal.' };
          setTerminalFieldErrors(nextFieldErrors);
          setTerminalSaveFeedback({ type: 'error', message: 'Select a store for each active terminal before saving.' });
          throw new Error(`Assign a store location for ${entry.terminal_id}.`);
        }
      });

      if (defaultCount > 1) throw new Error('Only one default terminal can be configured.');

      await updateSettings({ pos_terminal_registry: preparedEntries });
      await onSetupDataChanged({ source: 'terminal' });
      setTerminalFieldErrors({});
      setTerminalSaveFeedback({ type: 'success', message: 'Terminal setup saved.' });
      toast.success('Terminal setup saved.');
    } catch (error) {
      if (!terminalSaveFeedback.message) {
        setTerminalSaveFeedback({
          type: 'error',
          message: error?.response?.data?.message || error?.message || 'Failed to save terminal setup.'
        });
      }
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save terminal setup.');
    } finally {
      setTerminalSaving(false);
    }
  };

  const handleUploadAsset = async (assetType, file) => {
    if (!file) return;
    if (!STOREFRONT_ASSET_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      toast.error('Choose a PNG, JPEG, GIF, WebP, BMP, or AVIF image.');
      return;
    }
    if (file.size > STOREFRONT_ASSET_SOURCE_MAX_BYTES) {
      toast.error('Storefront source images must be 100 MB or smaller.');
      return;
    }
    const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : '';
    if (previewUrl) {
      localPreviewUrlsRef.current.add(previewUrl);
      setLocalStorefrontAssets((current) => ({
        ...current,
        [assetType]: previewUrl
      }));
    }
    setAssetUploadingType(assetType);
    setAssetUploadProgress(0);
    try {
      const result = await uploadStorefrontAsset(assetType, file, {
        onUploadProgress: ({ loaded = 0, total = 0 }) => {
          if (total > 0) {
            setAssetUploadProgress(Math.min(100, Math.round((loaded / total) * 100)));
          }
        }
      });
      const uploadedUrl = result?.image_url || result?.url || result?.path || '';
      if (uploadedUrl) {
        setStorefrontAssetPreviewErrors((current) => ({ ...current, [assetType]: false }));
        setLocalStorefrontAssets((current) => ({
          ...current,
          [assetType]: uploadedUrl
        }));
      }
      toast.success(assetType === 'profile' ? 'Company icon uploaded.' : 'Company cover image uploaded.');
    } catch (error) {
      setLocalStorefrontAssets((current) => ({
        ...current,
        [assetType]: storefrontRequirements[assetType === 'profile' ? 'profileImageUrl' : 'coverImageUrl'] || ''
      }));
      toast.error(error?.response?.data?.message || error?.message || 'Failed to upload storefront asset.');
    } finally {
      if (previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previewUrl);
        localPreviewUrlsRef.current.delete(previewUrl);
      }
      setAssetUploadingType('');
      setAssetUploadProgress(0);
    }
  };

  const handleLocationPinChange = (pin = {}) => {
    setLocationDraft((current) => ({
      ...current,
      latitude: pin.latitude ?? current.latitude,
      longitude: pin.longitude ?? current.longitude,
      address_line: pin.address_line ?? current.address_line
    }));
  };

  const handleStartNewLocation = () => {
    setLocationDraft(createLocationDraft({
      is_active: true,
      is_primary_storefront: normalizedLocations.length === 0
    }, ''));
  };

  const handleEditLocation = (locationId) => {
    const selected = (Array.isArray(terminalLocations) ? terminalLocations : [])
      .find((location) => Number(location?.location_id) === Number(locationId));
    if (selected) setLocationDraft(createLocationDraft(selected, companyName));
  };

  const handleSaveStorefrontHours = async () => {
    setHoursSaving(true);
    try {
      await updateSettings({
        storefront_hours: serializeStorefrontBusinessHours(storefrontHours)
      });
      await onSetupDataChanged({ source: 'storefront_hours' });
      toast.success('Business hours saved.');
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save business hours.');
      return false;
    } finally {
      setHoursSaving(false);
    }
  };

  const handleSaveLocation = async () => {
    const name = String(locationDraft.name || '').trim();
    const addressLine = String(locationDraft.address_line || '').trim();
    const latitude = String(locationDraft.latitude ?? '').trim() === '' ? Number.NaN : Number(locationDraft.latitude);
    const longitude = String(locationDraft.longitude ?? '').trim() === '' ? Number.NaN : Number(locationDraft.longitude);

    if (name.length < 2) {
      toast.error('Enter a store name.');
      return;
    }
    if (addressLine.length < 3 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast.error('Search for an address or place the map pin before saving. If the pin is selected, wait for its address to finish loading.');
      return;
    }

    setLocationSaving(true);
    try {
      const payload = {
        name,
        address_line: addressLine,
        latitude,
        longitude,
        delivery_radius_km: Number(locationDraft.delivery_radius_km) || 5,
        is_active: locationDraft.is_active !== false,
        is_open: true,
        is_primary_storefront: locationDraft.is_primary_storefront === true || normalizedLocations.length === 0,
        supports_delivery: locationDraft.supports_delivery !== false,
        supports_pickup: locationDraft.supports_pickup !== false
      };
      const savedLocation = locationDraft.location_id
        ? await updateTenantLocation(locationDraft.location_id, payload)
        : await createTenantLocation(payload);
      await updateSettings({
        storefront_hours: serializeStorefrontBusinessHours(storefrontHours)
      });
      setLocationDraft(createLocationDraft(savedLocation, companyName));
      await onSetupDataChanged({ source: 'location' });
      toast.success('Business location and hours saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save store location.');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleContinue = async () => {
    if (finishing) return;
    if (currentStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP) {
      setStorefrontContinueAttempted(true);
      // Business hours are persisted opportunistically and remain non-blocking
      // for onboarding completion, matching the shared Storefront contract.
      await handleSaveStorefrontHours();
    }
    onContinue({
      storefrontSetupReady: effectiveStorefrontSetupReady
    });
  };

  const handleDialogKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return;
    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
    if (target.tagName === 'INPUT' && ['checkbox', 'file', 'radio', 'hidden', 'button', 'submit'].includes(target.type)) return;

    const fields = Array.from(event.currentTarget.querySelectorAll('input, select, textarea'))
      .filter((field) => {
        if (typeof HTMLElement === 'undefined' || !(field instanceof HTMLElement) || field.hasAttribute('disabled')) return false;
        if (field.tagName === 'TEXTAREA') return false;
        if (field.tagName === 'SELECT') return true;
        return !['checkbox', 'file', 'radio', 'hidden', 'button', 'submit'].includes(field.type);
      });
    const currentIndex = fields.indexOf(target);
    const nextField = currentIndex >= 0 ? fields[currentIndex + 1] : null;
    if (!nextField) return;
    event.preventDefault();
    nextField.focus();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[980px] flex-col overflow-hidden border border-slate-200 bg-white px-0 shadow-2xl sm:w-[calc(100vw-2rem)] sm:max-w-[980px]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 pb-4">
          <DialogTitle className="text-[20px] font-black text-[#0F172A]">Tenant Onboarding Setup</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Finish the required POS onboarding before the rest of the terminal becomes available.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-5 py-2 sm:px-6">
          <div>
            <p className="text-sm font-semibold text-slate-600">
              Step {activeStepIndex + 1} of {POS_TERMINAL_SETUP_ORDER.length}
            </p>
            <div className="mt-4 flex items-center gap-3">
              {POS_TERMINAL_SETUP_ORDER.map((stepId, index) => {
                const isActive = stepId === currentStep;
                const isCompleted = index < activeStepIndex;
                const isSelectable = isCompleted || isActive;
                return (
                  <React.Fragment key={stepId}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isSelectable) return;
                        onStepSelect(stepId);
                      }}
                      disabled={!isSelectable}
                      aria-label={`Go to onboarding step ${index + 1}`}
                      className={`grid h-11 w-11 place-items-center rounded-full border text-sm font-black transition ${
                        isCompleted
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : (isActive
                            ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white hover:bg-[#143F73]'
                            : 'border-slate-200 bg-white text-slate-400')
                      } ${isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                    >
                      {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                    </button>
                    {index < POS_TERMINAL_SETUP_ORDER.length - 1 ? (
                      <div className={`h-px flex-1 ${index < activeStepIndex ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[#1A4E8D] shadow-sm">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[22px] font-black text-[#0F172A]">{stepConfig.title}</p>
                <p className="mt-1 text-sm text-slate-600">{stepConfig.summary}</p>
                <p className="mt-2 text-sm text-slate-500">{stepConfig.description}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              {currentStep === POS_TERMINAL_SETUP_STEPS.PROFILE ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 md:col-span-2">
                    <Label className="text-[12px] font-black text-[#0F172A]">Registered Business Name</Label>
                    <Input value={companyName || '-'} disabled className="h-11 rounded-lg border-slate-200 bg-slate-50 text-[13px] font-semibold text-[#0F172A]" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[12px] font-black text-[#0F172A]">Username</Label>
                    <Input value={String(profileData.username || '')} disabled className="h-11 rounded-lg border-slate-200 bg-slate-50 text-[13px] font-medium text-[#0F172A]" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[12px] font-black text-[#0F172A]">Email</Label>
                    <Input value={String(profileData.email || '')} disabled className="h-11 rounded-lg border-slate-200 bg-slate-50 text-[13px] font-medium text-[#0F172A]" />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label className="text-[12px] font-black text-[#0F172A]">Phone Number</Label>
                    <Input value={String(profileData.phoneNumber || '')} disabled className="h-11 rounded-lg border-slate-200 bg-slate-50 text-[13px] font-medium text-[#0F172A]" />
                    <p className="text-[12px] text-slate-500">
                      These values are reused from registration and the shared account profile.
                    </p>
                  </div>
                </div>
              ) : null}

              {currentStep === POS_TERMINAL_SETUP_STEPS.POS_SETUP ? (
                <div className="space-y-4">
                  {(Array.isArray(terminalDrafts) ? terminalDrafts : []).map((terminal, index) => (
                    <div
                      key={terminal.draft_key || `terminal-${index}`}
                      className={`rounded-2xl border p-4 ${Object.values(terminalFieldErrors[index] || {}).some(Boolean) ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'}`}
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_auto]">
                        <div className="grid gap-2">
                          <Label className="text-[12px] font-black text-[#0F172A]">Terminal ID</Label>
                          <Input
                            value={terminal.terminal_id}
                            onChange={(event) => handleTerminalDraftChange(index, 'terminal_id', event.target.value)}
                            placeholder="COUNTER-01"
                            className={`h-11 rounded-lg text-[13px] font-semibold text-[#0F172A] ${terminalFieldErrors[index]?.terminal_id ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                          />
                          {terminalFieldErrors[index]?.terminal_id ? (
                            <p className="text-xs font-semibold text-rose-600">{terminalFieldErrors[index].terminal_id}</p>
                          ) : null}
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-[12px] font-black text-[#0F172A]">Label</Label>
                          <Input
                            value={terminal.label}
                            onChange={(event) => handleTerminalDraftChange(index, 'label', event.target.value)}
                            placeholder="Front Counter"
                            className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-[12px] font-black text-[#0F172A]">Store</Label>
                          <select
                            value={terminal.location_id || ''}
                            onChange={(event) => handleTerminalDraftChange(index, 'location_id', event.target.value)}
                            className={`h-11 rounded-lg border bg-white px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#2563EB] ${terminalFieldErrors[index]?.location_id ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                          >
                            <option value="">Select store</option>
                            {normalizedLocations.map((location) => (
                              <option key={location.location_id} value={location.location_id}>{location.name}</option>
                            ))}
                          </select>
                          {terminalFieldErrors[index]?.location_id ? (
                            <p className="text-xs font-semibold text-rose-600">{terminalFieldErrors[index].location_id}</p>
                          ) : null}
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-lg border-rose-200 px-3 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleRemoveTerminal(index)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Create one logical terminal for each counter or station. Cashier invitations and location permissions are managed from POS Settings.
                        </div>
                        <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-[#0F172A]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#1A4E8D]"
                            checked={terminal.is_active !== false}
                            onChange={(event) => handleTerminalDraftChange(index, 'is_active', event.target.checked)}
                          />
                          Active
                        </label>
                        <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-[#0F172A]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#1A4E8D]"
                            checked={terminal.is_default === true}
                            onChange={(event) => handleTerminalDraftChange(index, 'is_default', event.target.checked)}
                          />
                          Default
                        </label>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button type="button" variant="outline" onClick={handleAddTerminal}>
                      Add Terminal
                    </Button>
                    <Button
                      type="button"
                      className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                      onClick={handleSaveTerminals}
                      disabled={terminalSaving}
                    >
                      {terminalSaving ? 'Saving...' : 'Save Terminal Setup'}
                    </Button>
                  </div>
                  {terminalSaveFeedback.message ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        terminalSaveFeedback.type === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {terminalSaveFeedback.type === 'success' ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <p>{terminalSaveFeedback.message}</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <p className={posRequirements.terminalRegistryReady ? 'text-emerald-700' : 'text-rose-600'}>
                      {posRequirements.terminalRegistryReady ? 'Complete' : 'Required'}: active terminal with store assignment
                    </p>
                    <p className={posRequirements.cashierReady ? 'text-emerald-700' : 'text-rose-600'}>
                      {posRequirements.cashierReady ? 'Complete' : 'Required'}: active cashier or company master admin
                    </p>
                  </div>
                </div>
              ) : null}

              {currentStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className={`rounded-2xl border p-4 ${highlightMissingStorefrontProfile ? 'border-red-500 bg-red-50/60' : 'border-slate-200'}`}>
                      <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Company Icon <span className="text-red-600">*</span></p>
                      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {effectiveStorefrontProfileImageUrl && !storefrontAssetPreviewErrors.profile ? (
                          <img
                            src={resolveAssetUrl(effectiveStorefrontProfileImageUrl)}
                            alt="Company icon preview"
                            className="h-full w-full object-cover"
                            onError={() => setStorefrontAssetPreviewErrors((current) => ({ ...current, profile: true }))}
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <ImagePlus className="h-4 w-4" />
                            {storefrontAssetPreviewErrors.profile ? 'Icon unavailable — upload a replacement' : 'No icon uploaded'}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Input
                          type="file"
                          accept={STOREFRONT_ASSET_ACCEPT}
                          className="h-11 rounded-lg border-slate-200 text-[13px]"
                          disabled={Boolean(assetUploadingType)}
                          onChange={(event) => {
                            handleUploadAsset('profile', event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </div>
                      {assetUploadingType === 'profile' ? (
                        <p className="mt-2 text-xs font-semibold text-blue-700" role="status">
                          Uploading and optimizing company icon{assetUploadProgress > 0 ? ` (${assetUploadProgress}%)` : '...'}
                        </p>
                      ) : null}
                    </div>
                    <div className={`rounded-2xl border p-4 ${highlightMissingStorefrontCover ? 'border-red-500 bg-red-50/60' : 'border-slate-200'}`}>
                      <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Company Cover Image <span className="text-red-600">*</span></p>
                      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {effectiveStorefrontCoverImageUrl && !storefrontAssetPreviewErrors.cover ? (
                          <img
                            src={resolveAssetUrl(effectiveStorefrontCoverImageUrl)}
                            alt="Company cover preview"
                            className="h-full w-full object-cover"
                            onError={() => setStorefrontAssetPreviewErrors((current) => ({ ...current, cover: true }))}
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <ImagePlus className="h-4 w-4" />
                            {storefrontAssetPreviewErrors.cover ? 'Cover unavailable — upload a replacement' : 'No cover uploaded'}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Input
                          type="file"
                          accept={STOREFRONT_ASSET_ACCEPT}
                          className="h-11 rounded-lg border-slate-200 text-[13px]"
                          disabled={Boolean(assetUploadingType)}
                          onChange={(event) => {
                            handleUploadAsset('cover', event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </div>
                      {assetUploadingType === 'cover' ? (
                        <p className="mt-2 text-xs font-semibold text-blue-700" role="status">
                          Uploading and optimizing cover image{assetUploadProgress > 0 ? ` (${assetUploadProgress}%)` : '...'}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Business Hours</p>
                        <p className="mt-1 text-xs text-slate-500">Set the weekly hours used by Storefront availability and checkout.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSaveStorefrontHours}
                        disabled={hoursSaving}
                      >
                        {hoursSaving ? 'Saving Hours...' : 'Save Business Hours'}
                      </Button>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <StorefrontBusinessHoursScheduler
                        value={storefrontHours}
                        disabled={hoursSaving || locationSaving}
                        onChange={setStorefrontHours}
                      />
                    </div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${highlightMissingStorefrontLocation ? 'border-red-500 bg-red-50/60' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Business Location <span className="text-red-600">*</span></Label>
                      <Button type="button" variant="outline" onClick={handleStartNewLocation}>Add Another Location</Button>
                    </div>
                    {normalizedLocations.length > 0 ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {normalizedLocations.map((location) => (
                          <button
                            key={location.location_id}
                            type="button"
                            onClick={() => handleEditLocation(location.location_id)}
                            className={`rounded-lg border px-3 py-2 text-left text-sm ${Number(locationDraft.location_id) === location.location_id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}
                          >
                            <span className="font-bold text-slate-900">{location.name}</span>
                            <span className="ml-2 text-xs text-slate-500">{location.is_primary_storefront ? 'Primary' : 'Secondary'}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-2">
                      <Label className="text-[12px] font-black text-[#0F172A]">Location Name</Label>
                      <Input
                        value={locationDraft.name}
                        onChange={(event) => setLocationDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Main Store"
                        className="h-11 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A]"
                      />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <Label>Primary Business Location</Label>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-600">
                          Use this location as the default storefront and POS setup location.
                        </span>
                        <Switch
                          checked={locationDraft.is_primary_storefront === true}
                          disabled={locationDraft.is_active === false}
                          onCheckedChange={(checked) => setLocationDraft((current) => ({
                            ...current,
                            is_primary_storefront: checked === true
                          }))}
                        />
                      </div>
                      {normalizedLocations.length === 0 ? (
                        <p className="text-xs text-slate-500">The first saved business location will be primary by default.</p>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <Label>Supports Delivery</Label>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-600">Enable delivery orders for this location.</span>
                        <Switch
                          checked={locationDraft.supports_delivery === true}
                          onCheckedChange={(checked) => setLocationDraft((current) => ({
                            ...current,
                            supports_delivery: checked === true
                          }))}
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <Label>Supports Pickup</Label>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-600">Enable pickup orders for this location.</span>
                        <Switch
                          checked={locationDraft.supports_pickup === true}
                          onCheckedChange={(checked) => setLocationDraft((current) => ({
                            ...current,
                            supports_pickup: checked === true
                          }))}
                        />
                      </div>
                    </div>
                    <React.Suspense fallback={<div className="mt-4 h-72 animate-pulse rounded-xl bg-slate-100" aria-label="Loading location map" />}>
                      <MapPinPicker
                        className="mt-4"
                        latitude={locationDraft.latitude}
                        longitude={locationDraft.longitude}
                        addressLine={locationDraft.address_line}
                        deliveryRadiusKm={locationDraft.delivery_radius_km}
                        onChange={handleLocationPinChange}
                      />
                    </React.Suspense>
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        className="bg-teal-700 text-white hover:bg-teal-800"
                        onClick={handleSaveLocation}
                        disabled={locationSaving}
                      >
                        {locationSaving ? 'Saving Location...' : (locationDraft.location_id ? 'Update Location' : 'Add Location')}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Complete the marked fields to continue: company icon, cover image, and primary business location.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 sm:justify-between sm:px-6">
          <div className="text-sm font-semibold text-slate-500">
            Finish all required steps, then click <span className="text-[#1A4E8D]">Finish Setup</span> to close onboarding.
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onBack} disabled={!hasPreviousStep}>
              Back
            </Button>
            <Button
              type="button"
              className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
              onClick={handleContinue}
              disabled={finishing}
            >
              {finishing ? 'Finishing...' : continueLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
