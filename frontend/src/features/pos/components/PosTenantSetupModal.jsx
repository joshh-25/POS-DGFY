import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Settings2, Store, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { createPosSetupCashier } from '../services/posService.js';
import { createSuggestedTerminalId, normalizeTerminalRegistry, sanitizeTerminalId } from '../utils/terminalIdentity.js';
import { POS_TERMINAL_SETUP_ORDER, POS_TERMINAL_SETUP_STEPS } from '../utils/setupFlow.js';

const MapPinPicker = React.lazy(() => import('@/src/components/maps/MapPinPicker.jsx'));

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
    description: 'Create at least one active cashier and one active terminal with an assigned store location.'
  },
  [POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP]: {
    title: 'Storefront',
    icon: Store,
    summary: 'Complete the storefront branding required for this tenant.',
    description: 'Upload the company icon and cover image from the existing storefront fields in POS Settings.'
  }
};

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
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
  is_default: entry?.is_default === true || (isFirst && entry?.is_default !== false)
});

const normalizeTerminalDrafts = (entries = []) => {
  const normalizedEntries = normalizeTerminalRegistry(entries);
  const normalized = normalizedEntries.map((entry, index) => createTerminalDraft(entry, index === 0, normalizedEntries));
  if (normalized.length === 0) {
    return [createTerminalDraft({ is_active: true, is_default: true }, true)];
  }
  return normalized;
};

const createLocationDraft = (location = {}, companyName = '') => ({
  location_id: toPositiveInt(location?.location_id),
  name: String(location?.name || companyName || 'Main Store').trim(),
  address_line: String(location?.address_line || '').trim(),
  latitude: location?.latitude ?? '',
  longitude: location?.longitude ?? '',
  delivery_radius_km: Number(location?.delivery_radius_km ?? 5),
  supports_delivery: location?.supports_delivery !== false,
  supports_pickup: location?.supports_pickup !== false
});

const RequiredMark = () => (
  <span className="ml-1 text-rose-600" aria-hidden="true">*</span>
);

const resolvePrimaryLocation = (locations = []) => {
  const activeLocations = (Array.isArray(locations) ? locations : []).filter((location) => location?.is_active !== false);
  return activeLocations.find((location) => location?.is_primary_storefront === true) || activeLocations[0] || null;
};

export default function PosTenantSetupModal({
  open = false,
  currentStep = POS_TERMINAL_SETUP_STEPS.PROFILE,
  companyName = '',
  profileData = {},
  posRequirements = {},
  storefrontRequirements = {},
  terminalRegistry = [],
  terminalLocations = [],
  tenantUsers = [],
  onStepSelect = () => {},
  onBack = () => {},
  onContinue = () => {},
  onSkip = () => {},
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
  const [assetUploadingType, setAssetUploadingType] = useState('');
  const [locationSaving, setLocationSaving] = useState(false);
  const [cashierDraft, setCashierDraft] = useState({
    username: '',
    email: '',
    phone_number: '',
    password: ''
  });
  const [cashierLocationIds, setCashierLocationIds] = useState([]);
  const [cashierCreating, setCashierCreating] = useState(false);
  const [locationDraft, setLocationDraft] = useState(() => createLocationDraft(
    resolvePrimaryLocation(terminalLocations),
    companyName
  ));

  useEffect(() => {
    if (!open) return;
    setTerminalDrafts(normalizeTerminalDrafts(terminalRegistry));
  }, [open, terminalRegistry]);

  useEffect(() => {
    if (!open) return;
    setLocationDraft(createLocationDraft(resolvePrimaryLocation(terminalLocations), companyName));
  }, [companyName, open, terminalLocations]);

  const normalizedLocations = useMemo(
    () => (Array.isArray(terminalLocations) ? terminalLocations : []).map((location) => ({
      location_id: Number(location?.location_id || 0),
      name: String(location?.name || '').trim()
    })).filter((location) => location.location_id > 0 && location.name),
    [terminalLocations]
  );

  const primaryLocationId = useMemo(
    () => toPositiveInt(resolvePrimaryLocation(terminalLocations)?.location_id),
    [terminalLocations]
  );

  const cashierUsers = useMemo(
    () => (Array.isArray(tenantUsers) ? tenantUsers : []).filter((user) => (
      String(user?.role || '').trim().toLowerCase() === 'cashier'
    )),
    [tenantUsers]
  );

  useEffect(() => {
    const fallbackLocationId = primaryLocationId || (normalizedLocations.length === 1 ? normalizedLocations[0].location_id : null);
    if (!fallbackLocationId) return;
    setCashierLocationIds((current) => (current.length > 0 ? current : [fallbackLocationId]));
  }, [normalizedLocations, primaryLocationId]);

  useEffect(() => {
    const fallbackLocationId = primaryLocationId || (normalizedLocations.length === 1 ? normalizedLocations[0].location_id : null);
    if (!fallbackLocationId) return;
    setTerminalDrafts((current) => current.map((entry) => (
      entry.location_id ? entry : { ...entry, location_id: fallbackLocationId }
    )));
  }, [normalizedLocations, primaryLocationId]);

  const handleTerminalDraftChange = (index, key, value) => {
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

  const handleToggleCashierLocation = (locationId) => {
    const normalizedId = toPositiveInt(locationId);
    if (!normalizedId) return;
    setCashierLocationIds((current) => (
      current.includes(normalizedId)
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId]
    ));
  };

  const handleCashierDraftChange = (key, value) => {
    setCashierDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleCreateCashier = async () => {
    const username = String(cashierDraft.username || '').trim();
    const email = String(cashierDraft.email || '').trim();
    const phoneNumber = String(cashierDraft.phone_number || '').trim();
    const password = String(cashierDraft.password || '');

    if (username.length < 2) {
      toast.error('Enter the cashier name.');
      return;
    }
    if (!email) {
      toast.error('Enter the cashier email.');
      return;
    }
    if (password.length < 8) {
      toast.error('Cashier password must be at least 8 characters.');
      return;
    }
    if (normalizedLocations.length > 0 && cashierLocationIds.length === 0) {
      toast.error('Assign at least one store to this cashier.');
      return;
    }

    setCashierCreating(true);
    try {
      await createPosSetupCashier({
        username,
        email,
        phone_number: phoneNumber || null,
        password,
        location_ids: cashierLocationIds
      });
      await onSetupDataChanged({
        silent: true,
        refreshTerminalMeta: false,
        refreshLocations: false,
        refreshUser: false
      });
      toast.success('Cashier created and assigned to the selected store.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to create cashier.');
    } finally {
      setCashierCreating(false);
    }
  };

  const handleSaveTerminals = async () => {
    setTerminalSaving(true);
    try {
      const preparedEntries = terminalDrafts
        .map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true
        }))
        .filter((entry) => entry.terminal_id || entry.label || entry.location_id || entry.is_default || entry.is_active === false);

      if (preparedEntries.length === 0) {
        throw new Error('Add at least one terminal.');
      }

      const seenTerminalIds = new Set();
      const activeLocationIds = new Set();
      let defaultCount = 0;

      preparedEntries.forEach((entry) => {
        if (!entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id)) {
          throw new Error(`Invalid terminal ID: ${entry.terminal_id || '(empty)'}`);
        }
        if (seenTerminalIds.has(entry.terminal_id)) {
          throw new Error(`Duplicate terminal ID: ${entry.terminal_id}`);
        }
        seenTerminalIds.add(entry.terminal_id);

        if (entry.is_default === true) {
          defaultCount += 1;
        }

        if (entry.is_active !== false) {
          if (!entry.location_id) {
            throw new Error(`Assign a store location for ${entry.terminal_id}.`);
          }
          if (activeLocationIds.has(entry.location_id)) {
            throw new Error('Only one active terminal is allowed per store location.');
          }
          activeLocationIds.add(entry.location_id);
        }
      });

      if (defaultCount > 1) {
        throw new Error('Only one default terminal can be configured.');
      }

      const payload = preparedEntries.map((entry) => ({
        terminal_id: entry.terminal_id,
        label: entry.label,
        location_id: entry.location_id,
        is_active: entry.is_active !== false,
        is_default: entry.is_default === true
      }));

      await updateSettings({
        pos_terminal_registry: payload
      });
      await onSetupDataChanged();
      toast.success('Terminal setup saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save terminal setup.');
    } finally {
      setTerminalSaving(false);
    }
  };

  const handleUploadAsset = async (assetType, file) => {
    if (!file) return;
    setAssetUploadingType(assetType);
    try {
      await uploadStorefrontAsset(assetType, file);
      await onSetupDataChanged();
      toast.success(assetType === 'profile' ? 'Company icon uploaded.' : 'Company cover image uploaded.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload storefront asset.');
    } finally {
      setAssetUploadingType('');
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
      toast.error('Search for an address or place the map pin before saving.');
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
        is_active: true,
        is_open: true,
        is_primary_storefront: true,
        supports_delivery: locationDraft.supports_delivery !== false,
        supports_pickup: locationDraft.supports_pickup !== false
      };
      const savedLocation = locationDraft.location_id
        ? await updateTenantLocation(locationDraft.location_id, payload)
        : await createTenantLocation(payload);
      setLocationDraft(createLocationDraft(savedLocation, companyName));
      await onSetupDataChanged();
      toast.success('Primary store location saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save store location.');
    } finally {
      setLocationSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="border border-slate-200 bg-white shadow-2xl sm:max-w-[980px]"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-slate-100 pb-4">
          <DialogTitle className="text-[20px] font-black text-[#0F172A]">Tenant Onboarding Setup</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Finish the required POS onboarding before the rest of the terminal becomes available.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
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
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[13px] font-black uppercase tracking-[0.14em] text-slate-500">Cashier Account</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Create one active cashier account and assign it to a store before terminal unlock can be used.
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[12px] font-black ${
                        posRequirements.cashierReady ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {posRequirements.cashierReady ? 'Cashier Ready' : 'Cashier Required'}
                      </span>
                    </div>

                      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
                      <div className="grid gap-2">
                        <Label className="text-[12px] font-black text-[#0F172A]">Cashier Username<RequiredMark /></Label>
                        <Input
                          value={cashierDraft.username}
                          onChange={(event) => handleCashierDraftChange('username', event.target.value)}
                          placeholder="john"
                          className="h-11 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A]"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-[12px] font-black text-[#0F172A]">Cashier Email<RequiredMark /></Label>
                        <Input
                          type="email"
                          value={cashierDraft.email}
                          onChange={(event) => handleCashierDraftChange('email', event.target.value)}
                          placeholder="cashier@email.com"
                          className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-[12px] font-black text-[#0F172A]">Cashier Phone</Label>
                        <Input
                          value={cashierDraft.phone_number}
                          onChange={(event) => handleCashierDraftChange('phone_number', event.target.value)}
                          placeholder="+63 900 000 0000"
                          autoComplete="off"
                          name="cashier_phone_dgfy"
                          data-form-type="other"
                          data-lpignore="true"
                          className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-[12px] font-black text-[#0F172A]">Assigned Store<RequiredMark /></Label>
                        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2">
                          {normalizedLocations.length > 0 ? normalizedLocations.map((location) => (
                            <label key={location.location_id} className="flex items-center gap-2 py-1 text-[13px] font-semibold text-[#0F172A]">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[#1A4E8D]"
                                checked={cashierLocationIds.includes(location.location_id)}
                                onChange={() => handleToggleCashierLocation(location.location_id)}
                              />
                              {location.name}
                            </label>
                          )) : (
                            <p className="text-[12px] text-amber-700">Create the store location first.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-[12px] font-black text-[#0F172A]">Cashier Password<RequiredMark /></Label>
                        <Input
                          type="password"
                          value={cashierDraft.password}
                          onChange={(event) => handleCashierDraftChange('password', event.target.value)}
                          placeholder="Minimum 8 characters"
                          autoComplete="new-password"
                          name="cashier_password_dgfy"
                          data-form-type="other"
                          data-lpignore="true"
                          className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                        />
                      </div>

                      <Button
                        type="button"
                        className="h-11 self-end bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                        onClick={handleCreateCashier}
                        disabled={cashierCreating || normalizedLocations.length === 0}
                      >
                        {cashierCreating ? 'Creating...' : 'Create Cashier'}
                      </Button>
                    </div>
                  </div>

                  {(Array.isArray(terminalDrafts) ? terminalDrafts : []).map((terminal, index) => (
                    <div key={terminal.draft_key || `terminal-${index}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_auto]">
                        <div className="grid gap-2">
                          <Label className="text-[12px] font-black text-[#0F172A]">Terminal ID<RequiredMark /></Label>
                          <Input
                            value={terminal.terminal_id}
                            onChange={(event) => handleTerminalDraftChange(index, 'terminal_id', event.target.value)}
                            placeholder="COUNTER-01"
                            className="h-11 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A]"
                          />
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
                          <Label className="text-[12px] font-black text-[#0F172A]">Store<RequiredMark /></Label>
                          <select
                            value={terminal.location_id || ''}
                            onChange={(event) => handleTerminalDraftChange(index, 'location_id', event.target.value)}
                            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
                          >
                            <option value="">Select store</option>
                            {normalizedLocations.map((location) => (
                              <option key={location.location_id} value={location.location_id}>{location.name}</option>
                            ))}
                          </select>
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
                      <div className="mt-3 grid gap-3 md:grid-cols-[auto_auto] md:justify-end md:items-end">
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
                </div>
              ) : null}

              {currentStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Company Icon<RequiredMark /></p>
                      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {storefrontRequirements.profileImageUrl ? (
                          <img
                            src={resolveAssetUrl(storefrontRequirements.profileImageUrl)}
                            alt="Company icon preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <ImagePlus className="h-4 w-4" />
                            No icon uploaded
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Input
                          type="file"
                          accept="image/*"
                          className="h-11 rounded-lg border-slate-200 text-[13px]"
                          disabled={assetUploadingType === 'profile'}
                          onChange={(event) => handleUploadAsset('profile', event.target.files?.[0])}
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Company Cover Image<RequiredMark /></p>
                      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {storefrontRequirements.coverImageUrl ? (
                          <img
                            src={resolveAssetUrl(storefrontRequirements.coverImageUrl)}
                            alt="Company cover preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <ImagePlus className="h-4 w-4" />
                            No cover uploaded
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Input
                          type="file"
                          accept="image/*"
                          className="h-11 rounded-lg border-slate-200 text-[13px]"
                          disabled={assetUploadingType === 'cover'}
                          onChange={(event) => handleUploadAsset('cover', event.target.files?.[0])}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="grid gap-2">
                      <Label className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Primary Store Location<RequiredMark /></Label>
                      <Input
                        value={locationDraft.name}
                        onChange={(event) => setLocationDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Main Store"
                        className="h-11 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A]"
                      />
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
                        {locationSaving ? 'Saving Location...' : 'Save Store Location'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-100 pt-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip for Now
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onBack} disabled={!hasPreviousStep}>
              Back
            </Button>
            <Button type="button" className="bg-[#1A4E8D] text-white hover:bg-[#143F73]" onClick={onContinue}>
              {continueLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
