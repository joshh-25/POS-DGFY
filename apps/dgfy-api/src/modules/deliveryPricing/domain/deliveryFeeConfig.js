// Phase 233 (#1324, epic #1321 "Customer delivery pricing"). Pure config-normalization for the
// delivery-fee mode schema -- zero I/O, zero production behavior change in this phase. Normalizes
// the two EAV settings keys (`store_delivery_fee_mode`, `store_delivery_fee_calc`) into one frozen
// config object. Mirrors the sibling policy modules elsewhere in this codebase
// (modules/shared/utils/downpaymentPolicy.js, modules/vouchers/domain/voucherBenefitPolicy.js):
// one exported resolver, fully unit-testable standalone, no dependency on dbStore/Sequelize/the
// request lifecycle.
//
// Fail-safe by design (epic #1321 decision 4, and #1322's central open concern): absent or garbage
// input resolves to `mode: 'fixed'`, never throws. This phase does not compute a calculated-mode
// fee at all (#237, out of scope here) -- `resolveStoreDeliveryFee` in storeUseCases.js keeps
// returning today's flat `store_delivery_fee` value regardless of what mode this module resolves.
//
// Per-location override seam (epic #1321 decision 2; Wave 0a decision #1, settled as "one JSON
// blob, replaced wholesale, not merged field-by-field"): the resolver takes
// `{ tenantSettings, locationOverride }` from day one. `locationOverride`, when present, replaces
// `tenantSettings` WHOLESALE -- no field-by-field merge. No caller passes a non-null
// `locationOverride` yet; every call site hardwires it to `null` until a later phase resolves one
// from a real per-location settings source.
//
// `provider_quoted` is reserved in the epic's ADR-level enum (decision 1) for a future courier-API
// integration, but is deliberately NOT accepted here yet -- issue #1324's own scope is
// `fixed|calculated|free` only. The ADR (#1323, not yet landed as of this phase) that formalizes
// `provider_quoted` at the enforcement layer is later work; adding it to DELIVERY_FEE_MODES now
// would let a tenant select a mode with no defined behavior anywhere, which is worse than simply
// not offering it yet.

export const DELIVERY_FEE_MODES = Object.freeze(['fixed', 'calculated', 'free']);

const DEFAULT_MODE = 'fixed';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Normalize the `store_delivery_fee_calc` blob (min fee, included km, per-km rate, rounding
 * increment, max distance -- epic #1321's reference formula). Returns null for anything not a
 * well-formed, fully-populated object: a partially-filled or malformed blob is treated the same as
 * an absent one, never a half-applied formula.
 */
const normalizeCalcBlob = (rawCalc) => {
    if (!rawCalc || typeof rawCalc !== 'object' || Array.isArray(rawCalc)) return null;

    const minFee = Number(rawCalc.min_fee);
    const includedKm = Number(rawCalc.included_km);
    const perKmRate = Number(rawCalc.per_km_rate);
    const incrementKm = Number(rawCalc.increment_km);
    const maxDistanceKm = Number(rawCalc.max_distance_km);

    if (!isFiniteNumber(minFee) || minFee < 0) return null;
    if (!isFiniteNumber(includedKm) || includedKm < 0) return null;
    if (!isFiniteNumber(perKmRate) || perKmRate < 0) return null;
    if (!isFiniteNumber(incrementKm) || incrementKm <= 0) return null;
    if (!isFiniteNumber(maxDistanceKm) || maxDistanceKm <= 0) return null;
    // A cap smaller than the distance the minimum fee already covers is not a valid formula --
    // fail toward null (an unusable calc, same as absent) rather than accept a formula that can
    // never actually charge a per-km rate.
    if (maxDistanceKm < includedKm) return null;

    return Object.freeze({
        min_fee: minFee,
        included_km: includedKm,
        per_km_rate: perKmRate,
        increment_km: incrementKm,
        max_distance_km: maxDistanceKm
    });
};

const normalizeMode = (rawMode) => {
    const normalized = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : null;
    return DELIVERY_FEE_MODES.includes(normalized) ? normalized : DEFAULT_MODE;
};

/**
 * @param {object} [params]
 * @param {object|null} [params.tenantSettings] - already-unwrapped setting values, e.g.
 *   `{ store_delivery_fee_mode: 'fixed', store_delivery_fee_calc: {...} }`. Callers unwrap any EAV
 *   row shape (the `.value` wrapper storeUseCases.js's `mapSettings` produces) before calling --
 *   this module never reaches into a row wrapper itself, so it stays reusable from a non-EAV
 *   source (e.g. a future per-location override table) without change.
 * @param {object|null} [params.locationOverride] - same shape as tenantSettings; when present,
 *   replaces tenantSettings wholesale (Wave 0a decision #1). Always null today.
 * @returns {Readonly<{mode: 'fixed'|'calculated'|'free', calc: object|null}>} frozen. `calc` is
 *   non-null only when `mode === 'calculated'` AND the blob is well-formed; a `calculated`-mode
 *   config with a missing/garbage blob still resolves `calc: null` -- the caller is responsible for
 *   falling back to the fixed rate in that case (epic #1321 decision 4), this module only reports
 *   what it parsed, it does not itself decide a fallback fee.
 */
export const resolveDeliveryFeeConfig = ({ tenantSettings = null, locationOverride = null } = {}) => {
    const effective = locationOverride || tenantSettings || {};

    const mode = normalizeMode(effective.store_delivery_fee_mode);
    const calc = mode === 'calculated' ? normalizeCalcBlob(effective.store_delivery_fee_calc) : null;

    return Object.freeze({ mode, calc });
};
