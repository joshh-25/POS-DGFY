// Phase 233b (#1341, epic #1321). Shared client-side normalize/serialize helpers for the
// `store_delivery_fee_mode` / `store_delivery_fee_calc` settings blob introduced by Phase 233
// (#1324, PR #1337). Extracted so the new POS-side Delivery Pricing screen (#1341) and IMS's own
// Settings.jsx (`apps/dgfy-ims/Pages/Settings.jsx`, which still carries its own pre-existing copy
// of this same logic) don't silently drift apart on the rules -- mirrors the extraction precedent
// already set by fulfillmentLeadTime.js in this same folder. Also mirrors the backend's canonical
// domain normalizer (apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeeConfig.js) and
// Joi schema (apps/dgfy-api/src/validators/settingsValidator.js's storeDeliveryFeeCalcSchema) --
// the backend is still the source of truth and re-validates on every write; this only avoids a
// round trip for an obviously-invalid form.

export const DELIVERY_FEE_MODE_OPTIONS = Object.freeze(['fixed', 'calculated', 'free']);

export const DEFAULT_DELIVERY_FEE_CALC = Object.freeze({
  min_fee: '',
  included_km: '',
  per_km_rate: '',
  increment_km: '',
  max_distance_km: ''
});

const parseNullableNumber = (value, { min = null, precision = null } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (min != null && parsed < min) return null;
  let normalized = parsed;
  if (typeof precision === 'number' && Number.isInteger(precision) && precision >= 0) {
    normalized = Number(normalized.toFixed(precision));
  }
  return normalized;
};

export const normalizeDeliveryFeeMode = (raw) => {
  const normalized = String(raw || '').trim().toLowerCase();
  return DELIVERY_FEE_MODE_OPTIONS.includes(normalized) ? normalized : 'fixed';
};

// Hydrates the store_delivery_fee_calc blob into form-friendly strings. Deliberately
// field-by-field rather than "all or nothing" -- a partially-filled saved blob (or one edited by
// hand via the API) still shows whatever fields it has instead of blanking the form. Save-time
// validation/normalization is a separate concern; see serializeDeliveryFeeCalcForSave below.
export const normalizeDeliveryFeeCalcSettings = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_DELIVERY_FEE_CALC };
  const toFieldString = (value) => (value == null || value === '' ? '' : String(value));
  return {
    min_fee: toFieldString(raw.min_fee),
    included_km: toFieldString(raw.included_km),
    per_km_rate: toFieldString(raw.per_km_rate),
    increment_km: toFieldString(raw.increment_km),
    max_distance_km: toFieldString(raw.max_distance_km)
  };
};

// Builds the save-time store_delivery_fee_calc value. The backend's Joi schema
// (storeDeliveryFeeCalcSchema) requires all five fields together when the blob is present at
// all -- mirrored here by returning undefined (omit the key entirely, leaving whatever is already
// stored untouched) for anything partial or invalid, rather than send a payload the backend would
// 422 on.
export const serializeDeliveryFeeCalcForSave = (calc) => {
  if (!calc || typeof calc !== 'object') return undefined;
  const minFee = parseNullableNumber(calc.min_fee, { min: 0, precision: 4 });
  const includedKm = parseNullableNumber(calc.included_km, { min: 0, precision: 4 });
  const perKmRate = parseNullableNumber(calc.per_km_rate, { min: 0, precision: 4 });
  const incrementKm = parseNullableNumber(calc.increment_km, { min: 0.0001, precision: 4 });
  const maxDistanceKm = parseNullableNumber(calc.max_distance_km, { min: 0.0001, precision: 4 });

  if ([minFee, includedKm, perKmRate, incrementKm, maxDistanceKm].some((value) => value == null)) {
    return undefined;
  }
  if (maxDistanceKm < includedKm) return undefined;

  return {
    min_fee: minFee,
    included_km: includedKm,
    per_km_rate: perKmRate,
    increment_km: incrementKm,
    max_distance_km: maxDistanceKm
  };
};

export default {
  DELIVERY_FEE_MODE_OPTIONS,
  DEFAULT_DELIVERY_FEE_CALC,
  normalizeDeliveryFeeMode,
  normalizeDeliveryFeeCalcSettings,
  serializeDeliveryFeeCalcForSave
};
