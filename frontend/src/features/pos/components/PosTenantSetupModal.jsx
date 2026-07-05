import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Settings2, Store, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
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
import { provisionCashierFromGmail } from '@/services/userService.js';
import { createTenantLocation, updateTenantLocation } from '@/services/tenantLocationService.js';
import { bulkCreateOnboardingItems } from '@/services/onboardingService.js';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import UserInvitationModal from '@/Components/users/UserInvitationModal.jsx';
import { createSuggestedTerminalId, normalizeTerminalRegistry, sanitizeTerminalId } from '../utils/terminalIdentity.js';
import { POS_TERMINAL_SETUP_ORDER, POS_TERMINAL_SETUP_STEPS } from '../utils/setupFlow.js';
import { resolveModeItemTaxonomy } from '@/src/features/settings/modeItemTaxonomy.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';

const MapPinPicker = React.lazy(() => import('@/src/components/maps/MapPinPicker.jsx'));

const STEP_CONFIG = {
  [POS_TERMINAL_SETUP_STEPS.PROFILE]: {
    title: 'Profile Setting',
    icon: UserRound,
    summary: 'Confirm the registered business identity now used by this POS tenant.',
    description: 'The registered company details are reused from the business account created during registration.',
    actionLabel: 'Open Profile Setting'
  },
  [POS_TERMINAL_SETUP_STEPS.POS_SETUP]: {
    title: 'POS Setup',
    icon: Settings2,
    summary: 'Finish the POS setup required before this terminal can operate normally.',
    description: 'Assign cashier Gmail access, store locations, and register every counter against a canonical business location.',
    actionLabel: 'Open POS Setup'
  },
  [POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP]: {
    title: 'Storefront',
    icon: Store,
    summary: 'Complete the storefront branding required for this tenant.',
    description: 'Upload the company icon and cover image from the existing storefront fields in POS Settings.',
    actionLabel: 'Open Storefront'
  },
  [POS_TERMINAL_SETUP_STEPS.STARTER_ITEM]: {
    title: 'Starter Item',
    icon: Store,
    summary: 'Create one sellable starter item through the governed onboarding item contract.',
    description: 'This uses the existing onboarding bulk item API, shared mode taxonomy, row validation, and completion readiness.',
    actionLabel: 'Open Items'
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
  cashier_email: String(entry?.cashier_email || '').trim().toLowerCase(),
  cashier_password: '',
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

const ONBOARDING_CUSTOMER_FACING_PRESETS = Object.freeze({
  food_manufacturing: ['finished_product'],
  msme: ['product'],
  services: ['service', 'physical_add_on'],
  fnb: ['menu_item']
});

const fallbackStarterPreset = Object.freeze({
  key: 'product',
  label: 'Product Item'
});

const resolveStarterPresetOptions = (workflowMode = '') => {
  const taxonomy = resolveModeItemTaxonomy(workflowMode);
  const presets = Array.isArray(taxonomy?.presets) && taxonomy.presets.length > 0
    ? taxonomy.presets
    : [fallbackStarterPreset];
  const preferredKeys = ONBOARDING_CUSTOMER_FACING_PRESETS[normalizeWorkflowMode(workflowMode)] || [];
  const preferredPresets = presets.filter((preset) => preferredKeys.includes(preset.key));
  return preferredPresets.length > 0 ? preferredPresets : presets;
};

export default function PosTenantSetupModal({
  open = false,
  currentStep = POS_TERMINAL_SETUP_STEPS.PROFILE,
  companyName = '',
  profileData = {},
  posRequirements = {},
  storefrontRequirements = {},
  starterItemRequirements = {},
  workflowMode = '',
  terminalRegistry = [],
  terminalLocations = [],
  tenantUsers = [],
  onOpenSettingsStep = () => {},
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
  const [localStorefrontAssets, setLocalStorefrontAssets] = useState({ profile: '', cover: '' });
  const [locationSaving, setLocationSaving] = useState(false);
  const [starterItemSaving, setStarterItemSaving] = useState(false);
  const starterPresetOptions = useMemo(() => resolveStarterPresetOptions(workflowMode), [workflowMode]);
  const [starterItemForm, setStarterItemForm] = useState(() => ({
    mode_item_preset: starterPresetOptions[0]?.key || 'product',
    name: '',
    default_sale_price: '',
    cost_per_unit: '',
    current_stock: '0'
  }));
  const [cashierInvitationOpen, setCashierInvitationOpen] = useState(false);

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
  }, [companyName, open, terminalLocations]);

  useEffect(() => {
    if (!open) return;
    setStarterItemForm((current) => ({
      ...current,
      mode_item_preset: starterPresetOptions.some((preset) => preset.key === current.mode_item_preset)
        ? current.mode_item_preset
        : (starterPresetOptions[0]?.key || 'product')
    }));
  }, [open, starterPresetOptions]);

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

  const cashierUsers = useMemo(
    () => (Array.isArray(tenantUsers) ? tenantUsers : []).filter((user) => (
      String(user?.role || '').trim().toLowerCase() === 'cashier'
    )),
    [tenantUsers]
  );

  const activeCashiers = useMemo(
    () => cashierUsers.filter((user) => user?.is_active !== false),
    [cashierUsers]
  );

  const pendingCashiers = useMemo(
    () => cashierUsers.filter((user) => (
      user?.is_active === false
      || String(user?.invitation_status || '').trim().toLowerCase() === 'pending'
    )),
    [cashierUsers]
  );

  const locationNameById = useMemo(
    () => new Map(
      normalizedLocations.map((location) => [location.location_id, location.name])
    ),
    [normalizedLocations]
  );

  const effectiveStorefrontProfileImageUrl = localStorefrontAssets.profile || storefrontRequirements.profileImageUrl || '';
  const effectiveStorefrontCoverImageUrl = localStorefrontAssets.cover || storefrontRequirements.coverImageUrl || '';
  const effectiveProfileImageReady = Boolean(effectiveStorefrontProfileImageUrl) || storefrontRequirements.profileImageReady === true;
  const effectiveCoverImageReady = Boolean(effectiveStorefrontCoverImageUrl) || storefrontRequirements.coverImageReady === true;
  const effectiveStorefrontSetupReady = effectiveProfileImageReady && effectiveCoverImageReady && Boolean(locationDraft.location_id);

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
          cashier_email: String(entry?.cashier_email || '').trim().toLowerCase(),
          cashier_password: String(entry?.cashier_password || ''),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || ''),
          rotate_pairing: false
        }))
        .filter((entry) => entry.terminal_id || entry.label || entry.location_id || entry.cashier_email || entry.is_default || entry.is_active === false);

      if (preparedEntries.length === 0) {
        throw new Error('Add at least one terminal.');
      }

      const seenTerminalIds = new Set();
      let defaultCount = 0;
      const cashierAssignments = new Map();
      const nextFieldErrors = {};

      preparedEntries.forEach((entry, index) => {
        if (!entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id)) {
          nextFieldErrors[index] = {
            ...(nextFieldErrors[index] || {}),
            terminal_id: 'Enter a valid terminal ID.'
          };
          throw new Error(`Invalid terminal ID: ${entry.terminal_id || '(empty)'}`);
        }
        if (seenTerminalIds.has(entry.terminal_id)) {
          nextFieldErrors[index] = {
            ...(nextFieldErrors[index] || {}),
            terminal_id: 'This terminal ID is duplicated.'
          };
          throw new Error(`Duplicate terminal ID: ${entry.terminal_id}`);
        }
        seenTerminalIds.add(entry.terminal_id);

        if (entry.is_default === true) {
          defaultCount += 1;
        }

        if (entry.is_active !== false) {
          if (!entry.location_id) {
            nextFieldErrors[index] = {
              ...(nextFieldErrors[index] || {}),
              location_id: 'Select a store for this active terminal.'
            };
            setTerminalFieldErrors(nextFieldErrors);
            setTerminalSaveFeedback({ type: 'error', message: 'Select a store for each active terminal before saving.' });
            throw new Error(`Assign a store location for ${entry.terminal_id}.`);
          }
        }

        const hasCashierEmail = Boolean(entry.cashier_email);
        const hasCashierPassword = Boolean(entry.cashier_password);
        if (hasCashierEmail !== hasCashierPassword) {
          nextFieldErrors[index] = {
            ...(nextFieldErrors[index] || {}),
            cashier_email: 'Enter both cashier Gmail and password.',
            cashier_password: 'Enter both cashier Gmail and password.'
          };
          setTerminalFieldErrors(nextFieldErrors);
          setTerminalSaveFeedback({ type: 'error', message: 'Cashier Gmail and password must be entered together.' });
          throw new Error(`Enter both cashier Gmail and password for ${entry.terminal_id}.`);
        }
        if (!hasCashierEmail) return;

        if (!/^[A-Z0-9._%+-]+@gmail\.com$/i.test(entry.cashier_email)) {
          nextFieldErrors[index] = {
            ...(nextFieldErrors[index] || {}),
            cashier_email: 'Cashier email must be a valid Gmail address.'
          };
          setTerminalFieldErrors(nextFieldErrors);
          setTerminalSaveFeedback({ type: 'error', message: 'Use a valid Gmail address before saving terminal setup.' });
          throw new Error(`Cashier email must be a valid Gmail address: ${entry.cashier_email}.`);
        }
        if (entry.cashier_password.length < 8) {
          nextFieldErrors[index] = {
            ...(nextFieldErrors[index] || {}),
            cashier_password: 'Cashier password must be at least 8 characters.'
          };
          setTerminalFieldErrors(nextFieldErrors);
          setTerminalSaveFeedback({ type: 'error', message: 'Cashier passwords must be at least 8 characters.' });
          throw new Error(`Cashier password for ${entry.cashier_email} must be at least 8 characters.`);
        }
        cashierAssignments.set(entry.cashier_email, {
          password: entry.cashier_password,
          locationIds: entry.location_id ? [entry.location_id] : [],
          terminalLabel: entry.label || entry.terminal_id,
          storeName: locationNameById.get(entry.location_id) || 'Assigned store'
        });
      });

      if (defaultCount > 1) {
        throw new Error('Only one default terminal can be configured.');
      }

      const cashierEmailResults = [];
      for (const [cashierEmail, assignment] of cashierAssignments.entries()) {
        const result = await provisionCashierFromGmail({
          email: cashierEmail,
          password: assignment.password,
          locationIds: assignment.locationIds,
          terminalLabel: assignment.terminalLabel,
          storeName: assignment.storeName
        });
        cashierEmailResults.push({
          email: cashierEmail,
          sent: result?.credential_email_sent === true,
          status: result?.credential_email_status || 'skipped',
          error: result?.credential_email_error || ''
        });
      }

      const payload = preparedEntries.map((entry) => ({
        terminal_id: entry.terminal_id,
        label: entry.label,
        location_id: entry.location_id,
        cashier_email: entry.cashier_email,
        is_active: entry.is_active !== false,
        is_default: entry.is_default === true,
        pairing_version: entry.pairing_version,
        rotate_pairing: entry.rotate_pairing === true
      }));

      await updateSettings({
        pos_terminal_registry: payload
      });
      await onSetupDataChanged();
      setTerminalFieldErrors({});
      const undeliveredCount = cashierEmailResults.filter((entry) => entry.sent !== true).length;
      const emailDeliveryMessage = cashierAssignments.size > 0
        ? (undeliveredCount === 0
          ? ' Cashier login credentials were emailed successfully.'
          : ` ${undeliveredCount} cashier credential email${undeliveredCount === 1 ? ' was' : 's were'} not delivered. Configure SMTP or Brevo to enable automatic cashier emails.`)
        : '';
      setTerminalSaveFeedback({
        type: 'success',
        message: `${cashierAssignments.size > 0 ? 'Terminal setup and cashier access saved.' : 'Terminal setup saved.'}${emailDeliveryMessage}`.trim()
      });
      toast.success(`${cashierAssignments.size > 0 ? 'Terminal setup and cashier access saved.' : 'Terminal setup saved.'}${emailDeliveryMessage}`.trim());
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
    try {
      const result = await uploadStorefrontAsset(assetType, file);
      const uploadedUrl = result?.image_url || result?.url || result?.path || '';
      if (uploadedUrl) {
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
      toast.error(error?.response?.data?.message || 'Failed to upload storefront asset.');
    } finally {
      if (previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previewUrl);
        localPreviewUrlsRef.current.delete(previewUrl);
      }
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
        is_active: locationDraft.is_active !== false,
        is_open: true,
        is_primary_storefront: locationDraft.is_primary_storefront === true || normalizedLocations.length === 0,
        supports_delivery: locationDraft.supports_delivery !== false,
        supports_pickup: locationDraft.supports_pickup !== false
      };
      const savedLocation = locationDraft.location_id
        ? await updateTenantLocation(locationDraft.location_id, payload)
        : await createTenantLocation(payload);
      setLocationDraft(createLocationDraft(savedLocation, companyName));
      await onSetupDataChanged();
      toast.success('Business location saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save store location.');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleCreateStarterItem = async () => {
    const name = String(starterItemForm.name || '').trim();
    const salePrice = Number(String(starterItemForm.default_sale_price || '').trim());
    const cost = String(starterItemForm.cost_per_unit || '').trim();
    const stock = String(starterItemForm.current_stock || '0').trim();
    const parsedCost = cost === '' ? null : Number(cost);
    const parsedStock = stock === '' ? 0 : Number(stock);
    const presetKey = String(starterItemForm.mode_item_preset || starterPresetOptions[0]?.key || 'product').trim();

    if (!name) {
      toast.error('Starter item name is required.');
      return;
    }
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      toast.error('Starter item selling price must be greater than zero.');
      return;
    }
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      toast.error('Starter item cost cannot be negative.');
      return;
    }
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      toast.error('Starter item stock cannot be negative.');
      return;
    }

    setStarterItemSaving(true);
    try {
      const row = {
        client_row_id: `pos-starter-${Date.now()}`,
        mode_item_preset: presetKey,
        name,
        default_sale_price: salePrice,
        current_stock: parsedStock
      };
      if (parsedCost !== null) row.cost_per_unit = parsedCost;
      if (primaryLocationId) row.location_id = primaryLocationId;

      const result = await bulkCreateOnboardingItems({ rows: [row] });
      const failures = Array.isArray(result?.rows)
        ? result.rows.filter((entry) => entry?.status === 'failed')
        : [];
      if (failures.length > 0) {
        throw new Error(failures[0]?.message || 'Starter item was rejected by onboarding validation.');
      }
      await onSetupDataChanged();
      setStarterItemForm((current) => ({
        ...current,
        name: '',
        default_sale_price: '',
        cost_per_unit: '',
        current_stock: '0'
      }));
      toast.success('Starter item created.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to create starter item.');
    } finally {
      setStarterItemSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="border border-slate-200 bg-white shadow-2xl sm:max-w-[980px]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
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

              {currentStep === POS_TERMINAL_SETUP_STEPS.STARTER_ITEM ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    POS onboarding uses the existing starter-item API and shared mode taxonomy. Create one customer-facing item here, then configure richer catalog details from Items later.
                  </div>
                  {starterItemRequirements.starterItemReady ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      Starter item ready{starterItemRequirements.starterItemId ? `: item #${starterItemRequirements.starterItemId}` : ''}.
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label className="text-[12px] font-black text-[#0F172A]">Starter Type</Label>
                      <select
                        value={starterItemForm.mode_item_preset}
                        onChange={(event) => setStarterItemForm((current) => ({ ...current, mode_item_preset: event.target.value }))}
                        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
                      >
                        {starterPresetOptions.map((preset) => (
                          <option key={preset.key} value={preset.key}>{preset.label || preset.key}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-[12px] font-black text-[#0F172A]">Item Name</Label>
                      <Input
                        value={starterItemForm.name}
                        onChange={(event) => setStarterItemForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Starter menu item"
                        className="h-11 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A]"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-[12px] font-black text-[#0F172A]">Selling Price</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={starterItemForm.default_sale_price}
                        onChange={(event) => setStarterItemForm((current) => ({ ...current, default_sale_price: event.target.value }))}
                        placeholder="150.00"
                        className="h-11 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A]"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-[12px] font-black text-[#0F172A]">Initial Stock</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={starterItemForm.current_stock}
                        onChange={(event) => setStarterItemForm((current) => ({ ...current, current_stock: event.target.value }))}
                        placeholder="0"
                        className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-[12px] font-black text-[#0F172A]">Optional Cost</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={starterItemForm.cost_per_unit}
                        onChange={(event) => setStarterItemForm((current) => ({ ...current, cost_per_unit: event.target.value }))}
                        placeholder="Optional"
                        className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                      onClick={handleCreateStarterItem}
                      disabled={starterItemSaving}
                    >
                      {starterItemSaving ? 'Creating...' : 'Create Starter Item'}
                    </Button>
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
                          Invite an existing DGFY account as a cashier and assign its allowed store locations. Company founders are already POS-operator ready.
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[12px] font-black ${
                        posRequirements.cashierReady ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {posRequirements.cashierReady ? 'Cashier Ready' : 'Cashier Required'}
                      </span>
                    </div>

                    {activeCashiers.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        Active cashier: {activeCashiers.map((user) => user.email || user.username).filter(Boolean).join(', ')}
                      </div>
                    ) : null}

                    {pendingCashiers.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Pending cashier invitation: {pendingCashiers.map((user) => user.email || user.username).filter(Boolean).join(', ')}.
                        The cashier must accept from DGFY My Account &gt; Business before using POS.
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                      <p className="text-sm text-blue-900">You can still invite an existing DGFY cashier, or enter any cashier Gmail directly under the terminal setup below.</p>
                      <Button
                        type="button"
                        className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                        onClick={() => setCashierInvitationOpen(true)}
                        disabled={normalizedLocations.length === 0}
                      >
                        Invite DGFY Cashier
                      </Button>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Use a valid Gmail address under each terminal below. If the cashier does not exist yet, the system will still accept it, create the cashier access during save, and email the login credentials plus reset-password instructions automatically.
                    </div>
                  </div>

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
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label className="text-[12px] font-black text-[#0F172A]">Cashier Gmail</Label>
                          <Input
                            type="email"
                            value={terminal.cashier_email || ''}
                            onChange={(event) => handleTerminalDraftChange(index, 'cashier_email', event.target.value.toLowerCase())}
                            placeholder="cashier@gmail.com"
                            className={`h-11 rounded-lg text-[13px] font-medium text-[#0F172A] ${terminalFieldErrors[index]?.cashier_email ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                          />
                          {terminalFieldErrors[index]?.cashier_email ? (
                            <p className="text-xs font-semibold text-rose-600">{terminalFieldErrors[index].cashier_email}</p>
                          ) : null}
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-[12px] font-black text-[#0F172A]">Cashier Password</Label>
                          <Input
                            type="password"
                            value={terminal.cashier_password || ''}
                            onChange={(event) => handleTerminalDraftChange(index, 'cashier_password', event.target.value)}
                            placeholder="Minimum 8 characters"
                            className={`h-11 rounded-lg text-[13px] font-medium text-[#0F172A] ${terminalFieldErrors[index]?.cashier_password ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                          />
                          {terminalFieldErrors[index]?.cashier_password ? (
                            <p className="text-xs font-semibold text-rose-600">{terminalFieldErrors[index].cashier_password}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Create one logical terminal for each counter or station. Enter any cashier Gmail here to create or attach the cashier account, assign branch access, and email the login credentials plus reset-password instructions during onboarding.
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
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Company Icon</p>
                      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {effectiveStorefrontProfileImageUrl ? (
                          <img
                            src={resolveAssetUrl(effectiveStorefrontProfileImageUrl)}
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
                          onChange={(event) => {
                            handleUploadAsset('profile', event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Company Cover Image</p>
                      <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {effectiveStorefrontCoverImageUrl ? (
                          <img
                            src={resolveAssetUrl(effectiveStorefrontCoverImageUrl)}
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
                          onChange={(event) => {
                            handleUploadAsset('cover', event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">Business Locations</Label>
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
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <p className={effectiveProfileImageReady ? 'text-emerald-700' : 'text-rose-600'}>
                      {effectiveProfileImageReady ? 'Complete' : 'Required'}: company icon
                    </p>
                    <p className={`mt-2 ${effectiveCoverImageReady ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {effectiveCoverImageReady ? 'Complete' : 'Required'}: company cover image
                    </p>
                    <p className={`mt-2 ${locationDraft.location_id ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {locationDraft.location_id ? 'Complete' : 'Required'}: primary store location and map pin
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-100 pt-4 sm:justify-between">
          <div className="text-sm font-semibold text-slate-500">
            Finish all required steps, then click <span className="text-[#1A4E8D]">Finish Setup</span> to close onboarding.
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onBack} disabled={!hasPreviousStep}>
              Back
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenSettingsStep(currentStep)}>
              {stepConfig.actionLabel}
            </Button>
            <Button
              type="button"
              className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
              onClick={() => onContinue({
                storefrontSetupReady: effectiveStorefrontSetupReady
              })}
            >
              {continueLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <UserInvitationModal
      open={cashierInvitationOpen}
      onOpenChange={setCashierInvitationOpen}
      onSuccess={onSetupDataChanged}
      fixedRole="cashier"
      title="Invite DGFY Cashier"
      submitLabel="Send Cashier Invitation"
    />
    </>
  );
}
