import { useCallback, useMemo, useState } from 'react';
import { resolveStorefrontTenantUrl } from '@/src/features/dgfyRouteHelpers.js';
import { evaluateFulfillmentLeadTime } from '@/src/features/settings/fulfillmentLeadTime.js';
import { COVER_PHOTO_TRANSFORM_DEFAULT } from '@sieitzz/shared-constants/coverPhotoTransform';
import { createDefaultLocationForm, createDefaultStorefrontForm } from './posSettingsModels.js';

export default function useStorefrontSettingsController({ effectiveCustomerAccessMode = 'catalog', storefrontLocations = [] } = {}) {
  const [storefrontForm, setStorefrontForm] = useState(createDefaultStorefrontForm);
  const [storefrontAssets, setStorefrontAssets] = useState({ cover: '', profile: '', coverTransform: { ...COVER_PHOTO_TRANSFORM_DEFAULT } });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationForm, setLocationForm] = useState(createDefaultLocationForm);

  const storefrontPublicUrl = useMemo(() => resolveStorefrontTenantUrl({ slug: storefrontForm.storeTenantSlug }), [storefrontForm.storeTenantSlug]);
  const hasActivePrimaryStorefrontLocation = storefrontLocations.some((location) => location?.is_active === true && location?.is_primary_storefront === true);
  const storefrontLocationRequired = storefrontForm.storeIsVisible === true && storefrontForm.storeHasNoLocation !== true;
  const effectiveMode = String(storefrontForm.customerAccessEffectiveMode || effectiveCustomerAccessMode || 'catalog').trim().toLowerCase();
  const lastFulfillmentMethodLocked = effectiveMode === 'transaction'
    && locationForm.supports_delivery !== locationForm.supports_pickup;
  const { requiredMissing: leadTimeRequiredMissing, rangeInverted: leadTimeRangeInverted } = evaluateFulfillmentLeadTime(locationForm);

  const hydrateFromSettings = useCallback((nextForm, nextAssets = null) => {
    setStorefrontForm(nextForm);
    if (nextAssets) setStorefrontAssets(nextAssets);
  }, []);
  const handleStorefrontListChange = useCallback((field, index, value) => {
    setStorefrontForm((current) => {
      const next = Array.isArray(current[field]) ? [...current[field]] : [];
      next[index] = value;
      return { ...current, [field]: next };
    });
  }, []);
  const addStorefrontListRow = useCallback((field, fallback = '') => {
    setStorefrontForm((current) => ({ ...current, [field]: [...(Array.isArray(current[field]) ? current[field] : []), fallback] }));
  }, []);
  const removeStorefrontListRow = useCallback((field, index, fallback = '') => {
    setStorefrontForm((current) => {
      const next = (Array.isArray(current[field]) ? current[field] : []).filter((_, rowIndex) => rowIndex !== index);
      return { ...current, [field]: next.length > 0 ? next : [fallback] };
    });
  }, []);
  const handleStorefrontObjectRowChange = useCallback((field, index, key, value) => {
    setStorefrontForm((current) => {
      const next = Array.isArray(current[field]) ? [...current[field]] : [];
      next[index] = { ...(next[index] || {}), [key]: value };
      return { ...current, [field]: next };
    });
  }, []);
  const addStorefrontObjectRow = useCallback((field, fallback) => {
    setStorefrontForm((current) => ({ ...current, [field]: [...(Array.isArray(current[field]) ? current[field] : []), fallback] }));
  }, []);
  const removeStorefrontObjectRow = useCallback((field, index, fallback) => {
    setStorefrontForm((current) => {
      const next = (Array.isArray(current[field]) ? current[field] : []).filter((_, rowIndex) => rowIndex !== index);
      return { ...current, [field]: next.length > 0 ? next : [fallback] };
    });
  }, []);
  const resetLocationForm = useCallback(() => {
    setEditingLocationId(null);
    setLocationForm(createDefaultLocationForm());
  }, []);
  const handleEditLocation = useCallback((location) => {
    if (!location) return;
    setEditingLocationId(location.location_id);
    setLocationForm({
      name: String(location.name || ''), address_line: String(location.address_line || ''),
      latitude: String(location.latitude ?? ''), longitude: String(location.longitude ?? ''),
      location_version: String(location.updated_at || ''), delivery_radius_km: String(location.delivery_radius_km ?? '5'),
      current_wait_time_minutes: String(location.current_wait_time_minutes ?? '15'), is_open: location.is_open !== false,
      is_active: location.is_active !== false, is_primary_storefront: location.is_primary_storefront === true,
      allow_out_of_stock_sales: location.allow_out_of_stock_sales === true, supports_delivery: location.supports_delivery !== false,
      supports_pickup: location.supports_pickup !== false, supports_dine_in: location.supports_dine_in !== false,
      scheduling_enabled: location?.scheduling_enabled !== false, immediate_fulfillment_enabled: location?.immediate_fulfillment_enabled !== false,
      fulfillment_lead_time_min_days: location?.fulfillment_lead_time_min_days == null ? '' : String(location.fulfillment_lead_time_min_days),
      fulfillment_lead_time_max_days: location?.fulfillment_lead_time_max_days == null ? '' : String(location.fulfillment_lead_time_max_days)
    });
  }, []);
  const handleLocationPinChange = useCallback(({ latitude, longitude, address_line }) => {
    const formatCoordinate = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(6) : String(value || '');
    };
    const nextAddress = String(address_line || '').trim();
    setLocationForm((current) => ({
      ...current,
      latitude: formatCoordinate(latitude), longitude: formatCoordinate(longitude),
      ...(nextAddress ? { address_line: nextAddress } : {})
    }));
  }, []);

  return {
    storefrontForm,
    setStorefrontForm,
    storefrontAssets,
    setStorefrontAssets,
    editingLocationId,
    setEditingLocationId,
    locationForm,
    setLocationForm,
    storefrontPublicUrl,
    hasActivePrimaryStorefrontLocation,
    storefrontLocationRequired,
    lastFulfillmentMethodLocked,
    leadTimeRequiredMissing,
    leadTimeRangeInverted,
    hydrateFromSettings,
    handleStorefrontListChange,
    addStorefrontListRow,
    removeStorefrontListRow,
    handleStorefrontObjectRowChange,
    addStorefrontObjectRow,
    removeStorefrontObjectRow,
    resetLocationForm,
    handleEditLocation,
    handleLocationPinChange
  };
}
