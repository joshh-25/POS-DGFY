// Phase 235 (#1325, epic #1321 "Customer delivery pricing"). Pure calculated-delivery-fee math --
// zero I/O, zero production behavior change in this phase. Mirrors the sibling pure policy modules
// elsewhere in this codebase (modules/vouchers/domain/voucherBenefitPolicy.js,
// modules/shared/utils/affiliatePricingPolicy.js): one exported function, fully unit-testable
// standalone, zero imports -- nothing here reaches a database, a clock, a request, or even the
// sibling `deliveryFeeConfig.js` in this same module (matching how voucherBenefitPolicy.js does not
// import affiliatePricingPolicy.js). Every case is reproducible from a fixture file.
//
// Deliberately unreferenced as of this phase: no call site anywhere in the repo imports this file
// (verified in CI evidence, not just asserted here), and `modules/deliveryPricing/index.js` does
// not re-export it. Wiring a call site into `resolveStoreDeliveryFee`/`storeUseCases.js` is #237,
// a separate ticket -- this module ships in isolation on purpose.
//
// Governed by ADR 0066 Decision 2 `[binding]` (money is integer centavos, no floats leave a pricing
// module) and ADR 0078 Decision 2 (an out-of-range distance is a hard block one layer up, not a fee
// to display -- this module reports `outOfRange: true` and a zero fee, it does not itself decide
// what the caller does with that).
//
// Config shape: the `calc` object `resolveDeliveryFeeConfig()` (deliveryFeeConfig.js) already
// produces -- `{ min_fee, included_km, per_km_rate, increment_km, max_distance_km }` -- but note
// those fields arrive as DECIMAL PESOS and DECIMAL KILOMETERS, not centavos/meters. This module
// owns the peso->centavo and km->meter conversion on the way in, so a future #237 wiring is a
// straight passthrough of `resolveDeliveryFeeConfig().calc`.
//
// Rounding rule, stated once here rather than at each call site below: every peso/km value is
// converted to its integer centavo/meter unit with a SINGLE `Math.round` immediately after the
// `* 100` / `* 1000` multiply. An arbitrary tenant-configured value (e.g. 0.3 km, or PHP7.33/km) is
// not guaranteed to be an exact integer after that multiply -- `0.3 * 1000 === 299.99999999999994`
// in JS -- so rounding once immediately keeps every value downstream a clean integer. No other
// rounding happens on these converted values anywhere else in the module.

// Phase 237 (#1329, epic #1321). Versions the WHOLE delivery-fee resolution algorithm in
// storeUseCases.js's resolveStoreDeliveryFee -- not just this module's calculated-mode branch, so a
// fixed-mode order also persists calcVersion 1. A future phase that changes the formula bumps this,
// so historical pos_transactions rows stay interpretable without a backfill (ADR 0012's
// forward-only, no-historical-recompute posture, restated in this phase's ADR 0012 amendment).
export const DELIVERY_FEE_CALC_VERSION = 1;

export class DeliveryFeePolicyError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'DeliveryFeePolicyError';
        this.code = code;
        this.details = details;
    }
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const validateConfig = (config) => {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new DeliveryFeePolicyError(
            'INVALID_CONFIG',
            'config must be a non-null, non-array object',
            { config: config ?? null }
        );
    }

    if (!isFiniteNumber(config.min_fee) || config.min_fee < 0) {
        throw new DeliveryFeePolicyError('INVALID_CONFIG', 'config.min_fee must be a finite number >= 0', { field: 'min_fee', value: config.min_fee ?? null });
    }
    if (!isFiniteNumber(config.included_km) || config.included_km < 0) {
        throw new DeliveryFeePolicyError('INVALID_CONFIG', 'config.included_km must be a finite number >= 0', { field: 'included_km', value: config.included_km ?? null });
    }
    if (!isFiniteNumber(config.per_km_rate) || config.per_km_rate < 0) {
        throw new DeliveryFeePolicyError('INVALID_CONFIG', 'config.per_km_rate must be a finite number >= 0', { field: 'per_km_rate', value: config.per_km_rate ?? null });
    }
    // Zero or negative would divide-by-zero (or infinite-loop) the increment math below -- refused
    // outright rather than clamped to some default increment.
    if (!isFiniteNumber(config.increment_km) || config.increment_km <= 0) {
        throw new DeliveryFeePolicyError('INVALID_CONFIG', 'config.increment_km must be a finite number > 0', { field: 'increment_km', value: config.increment_km ?? null });
    }
    if (!isFiniteNumber(config.max_distance_km) || config.max_distance_km <= 0) {
        throw new DeliveryFeePolicyError('INVALID_CONFIG', 'config.max_distance_km must be a finite number > 0', { field: 'max_distance_km', value: config.max_distance_km ?? null });
    }
    // A cap smaller than the included distance is not a usable formula -- the per-km rate could
    // never actually be charged. Same guard `deliveryFeeConfig.js`'s `normalizeCalcBlob` applies,
    // enforced again here since this module never imports that one.
    if (config.max_distance_km < config.included_km) {
        throw new DeliveryFeePolicyError(
            'INVALID_CONFIG',
            'config.max_distance_km must be >= config.included_km',
            { field: 'max_distance_km', max_distance_km: config.max_distance_km, included_km: config.included_km }
        );
    }
};

const validateDistanceMeters = (distanceMeters) => {
    if (!isFiniteNumber(distanceMeters) || distanceMeters < 0) {
        throw new DeliveryFeePolicyError(
            'INVALID_DISTANCE_METERS',
            'distanceMeters must be a finite number >= 0',
            { distanceMeters: distanceMeters ?? null }
        );
    }
};

/**
 * Compute the calculated-mode delivery fee for a distance against a tenant's calc config.
 *
 * Throws rather than fails-safe on any malformed input (mirrors voucherBenefitPolicy.js's own
 * stance): a bad config or a non-finite/negative distance is a caller bug, never silently treated
 * as a zero fee or a zero distance. Fail-open-to-fixed is a use-case-layer concern (#237), not this
 * pure module's job.
 *
 * @param {object} [params]
 * @param {number} [params.distanceMeters] - delivery distance in whole or fractional meters.
 * @param {object} [params.config] - `{ min_fee, included_km, per_km_rate, increment_km,
 *   max_distance_km }`, pesos/kilometers -- the `calc` shape `resolveDeliveryFeeConfig()` produces.
 * @returns {{feeCentavos: number, billedKm: number, incrementsCharged: number, outOfRange: boolean}}
 *   Always all four keys. `feeCentavos`/`incrementsCharged` are non-negative integers. `billedKm` is
 *   display-only (never used for pricing), rounded to 2 decimal places. `outOfRange: true` pairs
 *   with `feeCentavos: 0`, `billedKm: 0`, `incrementsCharged: 0` -- a partial/would-be fee is never
 *   computed for a distance beyond `max_distance_km` (ADR 0078 Decision 2).
 */
export const computeCalculatedDeliveryFeeCentavos = ({ distanceMeters, config } = {}) => {
    validateConfig(config);
    validateDistanceMeters(distanceMeters);

    // Canonicalize everything to integers once, up front -- see the module-header rounding rule.
    const distanceMetersInt = Math.round(distanceMeters);
    const includedMeters = Math.round(config.included_km * 1000);
    const incrementMeters = Math.round(config.increment_km * 1000);
    const maxDistanceMeters = Math.round(config.max_distance_km * 1000);
    const minFeeCentavos = Math.round(config.min_fee * 100);
    const perKmRateCentavos = Math.round(config.per_km_rate * 100);

    // Strict `>`, not `>=` -- a distance exactly at max_distance_km is the in-range "at max
    // distance, capped" case, not out-of-range.
    const outOfRange = distanceMetersInt > maxDistanceMeters;
    if (outOfRange) {
        return { feeCentavos: 0, billedKm: 0, incrementsCharged: 0, outOfRange: true };
    }

    const extraMeters = Math.max(0, distanceMetersInt - includedMeters);

    // Pure-integer ceiling division rather than `Math.ceil(extraMeters / incrementMeters)`: a float
    // division exposes the boundary to precision failure (a ratio that should land exactly on 1.0
    // landing on 0.9999999999999999 or 1.0000000000000002 instead), which would silently charge one
    // increment too many or too few right at a boundary. The `(a + b - 1) / b` integer form never
    // touches float division and is exact.
    const incrementsCharged = extraMeters === 0
        ? 0
        : Math.floor((extraMeters + incrementMeters - 1) / incrementMeters);

    // Rounded once per config (not once per increment), then multiplied by the integer increment
    // count -- keeps the per-increment rate stable regardless of how many increments are charged.
    const perIncrementCentavos = Math.round((perKmRateCentavos * incrementMeters) / 1000);
    const feeCentavos = minFeeCentavos + incrementsCharged * perIncrementCentavos;

    // billedKm is display-only, never used for pricing. Within the included zone it's the actual
    // traveled distance; beyond it, it's the increment-rounded total (>= the actual distance) --
    // the distance the fee was actually computed against.
    const billedKmMeters = extraMeters === 0
        ? distanceMetersInt
        : includedMeters + incrementsCharged * incrementMeters;
    const billedKm = Math.round(billedKmMeters / 10) / 100;

    return { feeCentavos, billedKm, incrementsCharged, outOfRange: false };
};
