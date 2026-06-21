import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  bulkCreateOnboardingItems,
  completeOnboarding,
  saveOnboardingStep,
  trackOnboardingEvent
} from '../../../services/onboardingService.js';
import { getAllSettings, uploadStorefrontAsset } from '../../../services/settingsService.js';
import {
  createTenantLocation,
  listTenantLocations,
  updateTenantLocation
} from '../../../services/tenantLocationService.js';
import { uploadStorefrontCatalogImages } from '../../../services/storefrontCatalogService.js';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  isHospitalityWorkflowMode,
  normalizeWorkflowMode
} from '../../settings/workflowMode.js';
import {
  createDefaultStorefrontBusinessHours,
  normalizeStorefrontBusinessHours,
  serializeStorefrontBusinessHours
} from '../../settings/storefrontBusinessHours.js';
import StorefrontBusinessHoursScheduler from '../../settings/StorefrontBusinessHoursScheduler.jsx';
import {
  getDefaultItemPreset,
  resolveModeItemTaxonomy
} from '../../settings/modeItemTaxonomy.js';
import {
  createHospitalityRoom,
  createHospitalityRoomType
} from '../../hospitality/api/hospitalityApi.js';
import WizardStepNavigator from '../../../components/common/WizardStepNavigator.jsx';
import SelectedItemImageCarousel from '../../../../Components/items/SelectedItemImageCarousel.jsx';
import {
  getMerchantPinValidationError,
  parseMapCoordinate
} from '../../../components/maps/mapLibreShared.js';

const WIZARD_STEPS = Object.freeze(['brand_assets', 'primary_location', 'bulk_items']);
const HOSPITALITY_WIZARD_STEPS = Object.freeze(['brand_assets', 'primary_location', 'hospitality_rooms']);
const WIZARD_STEP_LABELS = Object.freeze({
  brand_assets: {
    name: 'Brand Assets',
    description: 'Profile image, cover image, and optional branding setup.'
  },
  primary_location: {
    name: 'Storefront Location',
    description: 'Public visibility, main location, map pin, and business hours.'
  },
  bulk_items: {
    name: 'Menu Item',
    description: 'Create a priced menu item and optional Storefront item images.'
  },
  hospitality_rooms: {
    name: 'Starter Rooms',
    description: 'Create the first room type and room records for Hospitality mode.'
  }
});
const MAX_ITEM_IMAGE_FILES = 5;
const MapPinPicker = React.lazy(() => import('../../../components/maps/MapPinPicker.jsx'));

const resolveInitialReachableStepIndex = (onboarding, wizardSteps) => {
  const payloads = onboarding?.tenant_onboarding_progress?.step_payloads || {};
  const hasChecklistSnapshot = Boolean(onboarding?.tenant_onboarding_progress?.checklist_snapshot);
  const missingRequirements = getProgress(onboarding).missing_requirements;
  let reachableIndex = 0;

  if (payloads.brand_assets) {
    reachableIndex = Math.max(reachableIndex, 1);
  }

  if (
    payloads.primary_location
    || (hasChecklistSnapshot && !missingRequirements.includes('has_primary_storefront_location'))
  ) {
    reachableIndex = Math.max(reachableIndex, 2);
  }

  if (
    payloads.bulk_items
    || payloads.hospitality_rooms
    || (hasChecklistSnapshot && !missingRequirements.includes('has_priced_starter_item'))
  ) {
    reachableIndex = Math.max(reachableIndex, wizardSteps.length - 1);
  }

  return Math.min(reachableIndex, wizardSteps.length - 1);
};

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
    has_priced_starter_item: 'At least one priced menu item or bookable room'
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

const ONBOARDING_CUSTOMER_FACING_PRESETS = Object.freeze({
  food_manufacturing: ['finished_product'],
  msme: ['product'],
  services: ['service', 'physical_add_on'],
  fnb: ['menu_item']
});

const resolveOnboardingPresetOptions = (workflowMode) => {
  const options = resolvePresetOptions(workflowMode);
  const normalizedMode = normalizeWorkflowMode(workflowMode);
  const preferredKeys = ONBOARDING_CUSTOMER_FACING_PRESETS[normalizedMode] || [];
  const preferredOptions = options.filter((preset) => preferredKeys.includes(preset.key));
  return preferredOptions.length > 0 ? preferredOptions : options;
};

const getDefaultOnboardingPreset = (workflowMode) => {
  const options = resolveOnboardingPresetOptions(workflowMode);
  return options[0]
    || getDefaultItemPreset(workflowMode)
    || fallbackPreset;
};

const getOnboardingPresetLabel = (workflowMode, preset) => {
  const normalizedMode = normalizeWorkflowMode(workflowMode);
  if (normalizedMode === 'fnb' && preset?.key === 'menu_item') return 'Menu Item';
  if (normalizedMode === 'food_manufacturing' && preset?.key === 'finished_product') return 'Menu Item';
  if (normalizedMode === 'msme' && preset?.key === 'product') return 'Product Item';
  return preset?.label || 'Product Item';
};

const buildEmptyItemRow = (workflowMode) => {
  const defaultPreset = getDefaultOnboardingPreset(workflowMode);
  return {
    client_row_id: makeRowId(),
    mode_item_preset: defaultPreset.key,
    name: '',
    default_sale_price: '',
    cost_per_unit: '',
    current_stock: '',
    image_file: null,
    image_files: [],
    status: 'idle',
    errors: [],
    created_item: null
  };
};

const buildEmptyHospitalityRoomRow = () => ({
  client_row_id: makeRowId(),
  room_number: '',
  floor: '',
  status: 'vacant_clean',
  errors: [],
  created_room: null
});

const normalizeLocationForm = (currentUser) => ({
  location_id: null,
  name: `${String(currentUser?.company?.name || 'Main').trim()} Main Branch`.trim(),
  address_line: '',
  latitude: '',
  longitude: '',
  delivery_radius_km: 5,
  business_hours: createDefaultStorefrontBusinessHours()
});

const isCreatedRow = (row) => ['created', 'created_with_image_error'].includes(row?.status);

const getCreatedItemId = (row) => row?.created_item?.item_id || row?.created_item?.id || null;

const getItemImageFiles = (row) => {
  if (Array.isArray(row?.image_files) && row.image_files.length > 0) {
    return row.image_files.filter(Boolean).slice(0, MAX_ITEM_IMAGE_FILES);
  }
  return row?.image_file ? [row.image_file] : [];
};

const uploadItemImages = async (itemId, imageFiles) => {
  if (!itemId || imageFiles.length === 0) return;
  await uploadStorefrontCatalogImages(itemId, imageFiles);
};

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
  const isHospitalityMode = isHospitalityWorkflowMode(normalizedWorkflowMode);
  const wizardSteps = isHospitalityMode ? HOSPITALITY_WIZARD_STEPS : WIZARD_STEPS;
  const presetOptions = useMemo(() => resolveOnboardingPresetOptions(normalizedWorkflowMode), [normalizedWorkflowMode]);
  const progress = useMemo(() => getProgress(onboarding), [onboarding]);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [assetPreviewUrls, setAssetPreviewUrls] = useState({ profile: '', cover: '' });
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationForm, setLocationForm] = useState(() => normalizeLocationForm(currentUser));
  const [publicStorefrontVisible, setPublicStorefrontVisible] = useState(false);
  const [storeHasNoLocation, setStoreHasNoLocation] = useState(false);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [itemRows, setItemRows] = useState(() => [buildEmptyItemRow(normalizedWorkflowMode)]);
  const [hospitalityRoomTypeForm, setHospitalityRoomTypeForm] = useState({
    code: 'STD',
    name: 'Standard Room',
    base_occupancy: 1,
    max_occupancy: 2,
    default_rate: '',
    currency: 'PHP',
    description: '',
    amenities_snapshot: 'Wi-Fi, Air conditioning'
  });
  const [hospitalityRoomTypeId, setHospitalityRoomTypeId] = useState(null);
  const [hospitalityRoomRows, setHospitalityRoomRows] = useState(() => [buildEmptyHospitalityRoomRow()]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [maxReachableStepIndex, setMaxReachableStepIndex] = useState(0);
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
      setMaxReachableStepIndex(resolveInitialReachableStepIndex(onboarding, wizardSteps));
      setLogoFile(null);
      setCoverFile(null);
      setItemRows([buildEmptyItemRow(normalizedWorkflowMode)]);
      setHospitalityRoomTypeForm({
        code: 'STD',
        name: 'Standard Room',
        base_occupancy: 1,
        max_occupancy: 2,
        default_rate: '',
        currency: 'PHP',
        description: '',
        amenities_snapshot: 'Wi-Fi, Air conditioning'
      });
      setHospitalityRoomTypeId(null);
      setHospitalityRoomRows([buildEmptyHospitalityRoomRow()]);
      const savedPrimaryLocationPayload = onboarding?.tenant_onboarding_progress?.step_payloads?.primary_location || {};
      const savedBusinessHours = savedPrimaryLocationPayload?.business_hours;
      setPublicStorefrontVisible(savedPrimaryLocationPayload?.public_storefront_visible === true);
      setStoreHasNoLocation(savedPrimaryLocationPayload?.store_has_no_location === true);
      setLocationForm({
        ...normalizeLocationForm(currentUser),
        business_hours: normalizeStorefrontBusinessHours(savedBusinessHours)
      });
      setPrimaryLocationId(null);
      setLocationsLoading(true);
      Promise.all([
        listTenantLocations({ include_inactive: true }),
        getAllSettings({ force: true }).catch(() => null)
      ])
        .then(([locations, settings]) => {
          if (settings?.store_is_visible) {
            setPublicStorefrontVisible(settings.store_is_visible.value === true);
          }
          if (settings?.store_has_no_location) {
            setStoreHasNoLocation(settings.store_has_no_location.value === true);
          }
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
            delivery_radius_km: primary.delivery_radius_km ?? 5,
            business_hours: normalizeStorefrontBusinessHours(savedBusinessHours)
          });
        })
        .catch(() => {
          toast.error('Failed to load saved locations.');
        })
        .finally(() => setLocationsLoading(false));
    }
  }, [currentUser, normalizedWorkflowMode, onboarding, open]);

  useEffect(() => {
    const canCreateUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    const profile = logoFile && canCreateUrl ? URL.createObjectURL(logoFile) : '';
    const cover = coverFile && canCreateUrl ? URL.createObjectURL(coverFile) : '';
    setAssetPreviewUrls({ profile, cover });

    return () => {
      if (profile && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(profile);
      if (cover && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(cover);
    };
  }, [logoFile, coverFile]);

  if (!open) return null;

  const step = wizardSteps[currentStepIndex] || wizardSteps[0];
  const navigatorSteps = wizardSteps.map((stepKey, index) => {
    const meta = WIZARD_STEP_LABELS[stepKey] || {};
    return {
      id: stepKey,
      number: index + 1,
      name: meta.name || `Step ${index + 1}`,
      description: meta.description || meta.name || `Step ${index + 1}`,
      disabled: index > maxReachableStepIndex,
      disabledReason: index === 1
        ? 'Save or skip brand assets before opening location setup.'
        : 'Save the previous setup step before opening this step.'
    };
  });
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < wizardSteps.length - 1;
  const missingRequirements = progress.missing_requirements;
  const serverHasPrimaryLocation = !missingRequirements.includes('has_primary_storefront_location');
  const serverHasPricedStarterItem = !missingRequirements.includes('has_priced_starter_item');
  const hasCompletionLocation = publicStorefrontVisible === false || storeHasNoLocation === true || Boolean(primaryLocationId) || serverHasPrimaryLocation;
  const hasCompletionStarterItem = isHospitalityMode
    ? Boolean(hospitalityRoomTypeId) && hospitalityRoomRows.some((row) => row.created_room)
    : itemRows.some((row) => (
    isCreatedRow(row) && Number(row.default_sale_price) > 0
  ));
  const hasCompletionStarterSetup = hasCompletionStarterItem || serverHasPricedStarterItem;
  const completionBlockers = [
    hasCompletionLocation ? null : 'save a primary storefront location',
    hasCompletionStarterSetup ? null : (isHospitalityMode ? 'save one bookable room type and room' : 'save one priced menu item')
  ].filter(Boolean);
  const completionDisabled = finishing || saving || completionBlockers.length > 0;
  const locationFieldsDisabled = locationsLoading || publicStorefrontVisible !== true || storeHasNoLocation === true;

  const goToNextStep = () => {
    if (!canGoNext) return;
    setCurrentStepIndex((prev) => Math.min(prev + 1, wizardSteps.length - 1));
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
      setMaxReachableStepIndex((prev) => Math.max(prev, 1));
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save branding.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocation = async () => {
    const parsedLatitude = parseMapCoordinate(locationForm.latitude);
    const parsedLongitude = parseMapCoordinate(locationForm.longitude);
    const payload = {
      name: String(locationForm.name || '').trim(),
      address_line: String(locationForm.address_line || '').trim(),
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      delivery_radius_km: Number(locationForm.delivery_radius_km || 5),
      is_active: true,
      is_open: true,
      is_primary_storefront: true
    };

    const shouldPublishMapPin = publicStorefrontVisible === true && storeHasNoLocation !== true;
    if (shouldPublishMapPin && (!payload.name || !payload.address_line)) {
      toast.error('Location name and address are required.');
      return;
    }
    const coordinateError = getMerchantPinValidationError({
      latitude: payload.latitude,
      longitude: payload.longitude
    });
    if (shouldPublishMapPin && coordinateError) {
      toast.error(coordinateError);
      return;
    }

    setSaving(true);
    try {
      let saved = null;
      if (shouldPublishMapPin) {
        saved = locationForm.location_id
          ? await updateTenantLocation(locationForm.location_id, payload)
          : await createTenantLocation(payload);
      }
      const savedLocationId = saved?.location_id || locationForm.location_id || null;
      if (savedLocationId) {
        setPrimaryLocationId(savedLocationId);
      }

      await saveOnboardingStep({
        stepKey: 'primary_location',
        payload: {
          location_id: shouldPublishMapPin ? savedLocationId : null,
          name: shouldPublishMapPin ? (saved?.name || payload.name) : '',
          is_primary_storefront: shouldPublishMapPin,
          public_storefront_visible: publicStorefrontVisible === true,
          store_has_no_location: publicStorefrontVisible === true && storeHasNoLocation === true,
          business_hours: serializeStorefrontBusinessHours(locationForm.business_hours)
        }
      });
      await trackOnboardingEvent({
        eventKey: 'primary_location_saved',
        metadata: { surface: 'modal' }
      });
      toast.success(publicStorefrontVisible
        ? (storeHasNoLocation ? 'Searchable storefront saved without a map pin.' : 'Primary storefront location saved.')
        : 'Public storefront hidden.');
      await onRefreshUser?.();
      setMaxReachableStepIndex((prev) => Math.max(prev, 2));
      goToNextStep();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save storefront location.');
    } finally {
      setSaving(false);
    }
  };

  const handleLocationPinChange = ({ latitude, longitude, address_line }) => {
    const nextAddress = String(address_line || '').trim();
    const parsedLatitude = parseMapCoordinate(latitude);
    const parsedLongitude = parseMapCoordinate(longitude);

    if (latitude === '' && longitude === '') {
      setLocationForm((prev) => ({
        ...prev,
        latitude: '',
        longitude: '',
        ...(nextAddress ? { address_line: nextAddress } : {})
      }));
      return;
    }

    if (getMerchantPinValidationError({ latitude: parsedLatitude, longitude: parsedLongitude })) {
      return;
    }

    setLocationForm((prev) => ({
      ...prev,
      latitude: parsedLatitude.toFixed(6),
      longitude: parsedLongitude.toFixed(6),
      ...(nextAddress ? { address_line: nextAddress } : {})
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

  const removeItemImageFile = (clientRowId, imageIndex) => {
    setItemRows((rows) => rows.map((row) => {
      if (row.client_row_id !== clientRowId || isCreatedRow(row)) return row;
      const nextFiles = getItemImageFiles(row).filter((_, index) => index !== imageIndex);
      return {
        ...row,
        image_file: nextFiles[0] || null,
        image_files: nextFiles
      };
    }));
  };

  const updateHospitalityRoomRow = (clientRowId, patch) => {
    setHospitalityRoomRows((rows) => rows.map((row) => (
      row.client_row_id === clientRowId && !row.created_room ? { ...row, ...patch } : row
    )));
  };

  const addHospitalityRoomRow = () => {
    setHospitalityRoomRows((rows) => [...rows, buildEmptyHospitalityRoomRow()]);
  };

  const removeHospitalityRoomRow = (clientRowId) => {
    setHospitalityRoomRows((rows) => rows.length === 1 ? rows : rows.filter((row) => row.client_row_id !== clientRowId || row.created_room));
  };

  const handleSaveHospitalityRooms = async () => {
    if (!primaryLocationId && !serverHasPrimaryLocation) {
      toast.error('Save a primary location before creating rooms.');
      return;
    }
    const rate = Number(hospitalityRoomTypeForm.default_rate || 0);
    if (!hospitalityRoomTypeForm.code.trim() || !hospitalityRoomTypeForm.name.trim() || !Number.isFinite(rate) || rate <= 0) {
      toast.error('Room type code, name, and positive selling rate are required.');
      return;
    }
    setSaving(true);
    try {
      const roomType = hospitalityRoomTypeId
        ? { room_type_id: hospitalityRoomTypeId }
        : await createHospitalityRoomType({
          ...hospitalityRoomTypeForm,
          location_id: primaryLocationId || null,
          base_occupancy: Number(hospitalityRoomTypeForm.base_occupancy || 1),
          max_occupancy: Number(hospitalityRoomTypeForm.max_occupancy || 2),
          default_rate: rate,
          amenities_snapshot: hospitalityRoomTypeForm.amenities_snapshot.split(',').map((entry) => entry.trim()).filter(Boolean)
        });
      const roomTypeId = roomType?.room_type_id || hospitalityRoomTypeId;
      setHospitalityRoomTypeId(roomTypeId);

      const nextRows = await Promise.all(hospitalityRoomRows.map(async (row) => {
        if (row.created_room) return row;
        if (!row.room_number.trim()) return { ...row, errors: ['Room number is required.'] };
        try {
          const room = await createHospitalityRoom({
            room_type_id: roomTypeId,
            location_id: primaryLocationId || null,
            room_number: row.room_number.trim(),
            floor: row.floor || null,
            status: row.status || 'vacant_clean'
          });
          return { ...row, created_room: room, errors: [] };
        } catch (error) {
          return { ...row, errors: [error?.response?.data?.message || 'Unable to create room.'] };
        }
      }));
      setHospitalityRoomRows(nextRows);
      setMaxReachableStepIndex((prev) => Math.max(prev, 2));
      await saveOnboardingStep({
        stepKey: 'hospitality_rooms',
        payload: {
          workflow_mode: normalizedWorkflowMode,
          room_type_id: roomTypeId,
          room_type_name: hospitalityRoomTypeForm.name,
          room_ids: nextRows.map((row) => row.created_room?.room_id).filter(Boolean)
        }
      });
      toast.success('Hospitality starter rooms saved.');
      await onRefreshUser?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save Hospitality starter setup.');
    } finally {
      setSaving(false);
    }
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

      const nextRows = [];
      for (const row of itemRows) {
        if (isCreatedRow(row)) {
          nextRows.push(row);
          continue;
        }
        const rowResult = resultByRow.get(row.client_row_id);
        if (!rowResult || rowResult.status !== 'created') {
          nextRows.push({
            ...row,
            status: 'failed',
            errors: rowResult?.errors || ['Unable to create this row.'],
            created_item: null
          });
          continue;
        }

        const createdItem = rowResult.item || null;
        const itemId = createdItem?.item_id || createdItem?.id || null;
        const nextRow = {
          ...row,
          status: 'created',
          errors: [],
          created_item: createdItem
        };
        const imageFiles = getItemImageFiles(row);
        if (itemId && imageFiles.length > 0) {
          try {
            await uploadItemImages(itemId, imageFiles);
          } catch (error) {
            nextRows.push({
              ...nextRow,
              status: 'created_with_image_error',
              errors: [error?.response?.data?.message || 'Item created, but image upload failed.']
            });
            continue;
          }
        }
        nextRows.push(nextRow);
      }

      setItemRows(nextRows);
      setMaxReachableStepIndex((prev) => Math.max(prev, 2));
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
    const imageFiles = getItemImageFiles(row);
    if (imageFiles.length === 0 || !itemId) {
      toast.error('Choose one or more images before retrying upload.');
      return;
    }

    setSaving(true);
    try {
      await uploadItemImages(itemId, imageFiles);
      setItemRows((rows) => rows.map((entry) => (
        entry.client_row_id === clientRowId
          ? { ...entry, status: 'created', errors: [] }
          : entry
      )));
      toast.success(imageFiles.length > 1 ? 'Item gallery uploaded.' : 'Item image uploaded.');
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
            Step {currentStepIndex + 1} of {wizardSteps.length}
          </p>
          <WizardStepNavigator
            steps={navigatorSteps}
            currentStep={currentStepIndex + 1}
            completedStep={currentStepIndex}
            onStepChange={(nextStep) => setCurrentStepIndex(nextStep - 1)}
            ariaLabel="Tenant onboarding setup steps"
            className="mt-2"
          />
        </div>

        <div className="space-y-5 px-5 py-5">
          {step === 'brand_assets' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">1) Profile and Cover</h3>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="relative h-32 bg-slate-100">
                  {assetPreviewUrls.cover ? (
                    <img src={assetPreviewUrls.cover} alt="Storefront cover preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                      Storefront cover preview
                    </div>
                  )}
                  <div className="absolute -bottom-8 left-4 h-16 w-16 overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow">
                    {assetPreviewUrls.profile ? (
                      <img src={assetPreviewUrls.profile} alt="Storefront profile preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">
                        Profile
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-3 pt-10">
                  <p className="text-sm font-semibold text-slate-900">{currentUser?.company?.name || 'Storefront preview'}</p>
                  <p className="mt-1 text-xs text-slate-500">Public storefront preview</p>
                </div>
              </div>
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
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-xs font-semibold text-slate-900">Make storefront searchable to customers</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      When off, shoppers cannot find this company in search and the public storefront page is hidden.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={publicStorefrontVisible === true}
                    disabled={locationsLoading}
                    onChange={(event) => setPublicStorefrontVisible(event.target.checked)}
                  />
                </label>
              </div>
              {publicStorefrontVisible === true && (
                <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                  <label className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-xs font-semibold text-slate-900">This Store Has No Location</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Customers can search for this store and open its public storefront, but it will not appear as a map pin until a location is published.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={storeHasNoLocation === true}
                      disabled={locationsLoading}
                      onChange={(event) => setStoreHasNoLocation(event.target.checked)}
                    />
                  </label>
                </div>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Location name
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.name} onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))} disabled={locationFieldsDisabled} />
                </label>
                <label className="text-xs text-slate-700">
                  Delivery radius (km)
                  <input type="number" min={0} max={100} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.delivery_radius_km} onChange={(event) => setLocationForm((prev) => ({ ...prev, delivery_radius_km: event.target.value }))} disabled={locationFieldsDisabled} />
                </label>
                <label className="text-xs text-slate-700 sm:col-span-2">
                  Address
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.address_line} onChange={(event) => setLocationForm((prev) => ({ ...prev, address_line: event.target.value }))} disabled={locationFieldsDisabled} />
                </label>
                {publicStorefrontVisible === true && storeHasNoLocation !== true ? (
                  <div className="sm:col-span-2">
                    <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500">Loading map picker...</div>}>
                      <MapPinPicker
                        latitude={locationForm.latitude}
                        longitude={locationForm.longitude}
                        deliveryRadiusKm={locationForm.delivery_radius_km}
                        onChange={handleLocationPinChange}
                      />
                    </Suspense>
                  </div>
                ) : publicStorefrontVisible !== true ? (
                  <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                    Turn on searchable storefront visibility to place a public storefront map pin.
                  </div>
                ) : null}
                <label className="text-xs text-slate-700">
                  Latitude
                  <input type="number" step="any" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.latitude} onChange={(event) => setLocationForm((prev) => ({ ...prev, latitude: event.target.value }))} disabled={locationFieldsDisabled} />
                </label>
                <label className="text-xs text-slate-700">
                  Longitude
                  <input type="number" step="any" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={locationForm.longitude} onChange={(event) => setLocationForm((prev) => ({ ...prev, longitude: event.target.value }))} disabled={locationFieldsDisabled} />
                </label>
                <div className="sm:col-span-2 rounded-md border border-slate-200 p-3">
                  <StorefrontBusinessHoursScheduler
                    value={locationForm.business_hours}
                    disabled={locationsLoading}
                    onChange={(nextHours) => setLocationForm((prev) => ({ ...prev, business_hours: nextHours }))}
                  />
                </div>
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
              <h3 className="text-sm font-semibold text-slate-900">3) Menu Item</h3>
              <div className="mt-3 space-y-3">
                {itemRows.map((row, index) => (
                  <div key={row.client_row_id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-3 md:grid-cols-6">
                      <label className="text-xs text-slate-700 md:col-span-2">
                        Item type
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.mode_item_preset} onChange={(event) => updateItemRow(row.client_row_id, { mode_item_preset: event.target.value })} disabled={isCreatedRow(row) || saving}>
                          {presetOptions.map((preset) => (
                            <option key={preset.key} value={preset.key}>{getOnboardingPresetLabel(normalizedWorkflowMode, preset)}</option>
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
                        Item image
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="mt-1 block w-full text-xs"
                          onChange={(event) => {
                            const selectedFiles = Array.from(event.target.files || []);
                            const existingFiles = getItemImageFiles(row);
                            const remainingSlots = Math.max(MAX_ITEM_IMAGE_FILES - existingFiles.length, 0);
                            const files = selectedFiles.slice(0, remainingSlots);
                            if (selectedFiles.length > files.length) {
                              toast.error(`Only ${remainingSlots} more item image${remainingSlots === 1 ? '' : 's'} can be selected. Galleries are limited to ${MAX_ITEM_IMAGE_FILES} images.`);
                            }
                            if (files.length === 0) {
                              event.target.value = '';
                              return;
                            }
                            const nextFiles = [...existingFiles, ...files].slice(0, MAX_ITEM_IMAGE_FILES);
                            updateItemRow(row.client_row_id, {
                              image_file: nextFiles[0] || null,
                              image_files: nextFiles
                            });
                            event.target.value = '';
                          }}
                          disabled={isCreatedRow(row) || saving}
                        />
                        <span className="mt-1 block text-[11px] text-slate-500">Up to {MAX_ITEM_IMAGE_FILES} images per item.</span>
                      </label>
                      <div className="flex items-end text-xs text-slate-500">Row {index + 1}</div>
                    </div>
                    <SelectedItemImageCarousel
                      files={getItemImageFiles(row)}
                      itemName={row.name || 'Menu item'}
                      disabled={isCreatedRow(row) || saving}
                      onRemove={(imageIndex) => removeItemImageFile(row.client_row_id, imageIndex)}
                    />
                    {row.status === 'created' && <p className="mt-2 text-xs font-semibold text-emerald-700">Created.</p>}
                    {row.status === 'created_with_image_error' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-amber-700">{row.errors.join(' ')}</p>
                        <button type="button" onClick={() => handleRetryImageUpload(row.client_row_id)} disabled={saving || !(row.image_file || row.image_files?.length)} className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 disabled:opacity-50">
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

          {step === 'hospitality_rooms' && (
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">3) Starter Room Type and Rooms</h3>
              <p className="mt-1 text-xs text-slate-500">Create the first customer-facing room type and at least one bookable room for direct booking.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-6">
                <label className="text-xs text-slate-700">
                  Code
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.code} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, code: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
                <label className="text-xs text-slate-700 md:col-span-2">
                  Room type name
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.name} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, name: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
                <label className="text-xs text-slate-700">
                  Base occupancy
                  <input type="number" min={1} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.base_occupancy} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, base_occupancy: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
                <label className="text-xs text-slate-700">
                  Max occupancy
                  <input type="number" min={1} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.max_occupancy} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, max_occupancy: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
                <label className="text-xs text-slate-700">
                  Nightly rate
                  <input type="number" min={0} step="0.01" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.default_rate} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, default_rate: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
                <label className="text-xs text-slate-700 md:col-span-3">
                  Amenities
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.amenities_snapshot} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, amenities_snapshot: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
                <label className="text-xs text-slate-700 md:col-span-3">
                  Description
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={hospitalityRoomTypeForm.description} onChange={(event) => setHospitalityRoomTypeForm((prev) => ({ ...prev, description: event.target.value }))} disabled={Boolean(hospitalityRoomTypeId) || saving} />
                </label>
              </div>
              <div className="mt-4 space-y-3">
                {hospitalityRoomRows.map((row, index) => (
                  <div key={row.client_row_id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-3 md:grid-cols-5">
                      <label className="text-xs text-slate-700">
                        Room number
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.room_number} onChange={(event) => updateHospitalityRoomRow(row.client_row_id, { room_number: event.target.value })} disabled={Boolean(row.created_room) || saving} />
                      </label>
                      <label className="text-xs text-slate-700">
                        Floor
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.floor} onChange={(event) => updateHospitalityRoomRow(row.client_row_id, { floor: event.target.value })} disabled={Boolean(row.created_room) || saving} />
                      </label>
                      <label className="text-xs text-slate-700">
                        Status
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" value={row.status} onChange={(event) => updateHospitalityRoomRow(row.client_row_id, { status: event.target.value })} disabled={Boolean(row.created_room) || saving}>
                          <option value="vacant_clean">Vacant clean</option>
                          <option value="vacant_dirty">Vacant dirty</option>
                          <option value="inspected">Inspected</option>
                        </select>
                      </label>
                      <div className="flex items-end text-xs text-slate-500">Room row {index + 1}</div>
                      <div className="flex items-end justify-end">
                        <button type="button" onClick={() => removeHospitalityRoomRow(row.client_row_id)} disabled={hospitalityRoomRows.length === 1 || saving || Boolean(row.created_room)} className="rounded-md border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                          Remove
                        </button>
                      </div>
                    </div>
                    {row.created_room && <p className="mt-2 text-xs font-semibold text-emerald-700">Room created.</p>}
                    {row.errors.length > 0 && <p className="mt-2 text-xs font-semibold text-red-700">{row.errors.join(' ')}</p>}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={addHospitalityRoomRow} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60">
                  Add Room
                </button>
                <button type="button" onClick={handleSaveHospitalityRooms} disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Save Starter Rooms
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
