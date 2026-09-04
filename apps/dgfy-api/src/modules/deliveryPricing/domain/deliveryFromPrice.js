// Phase 242 (#1333, epic #1321). The advertised discovery "from ₱X" price -- the price floor a
// customer could pay, per Wave 0 decision #3 (#1322): "show 'from ₱X' using the configured minimum
// fee ... honest as long as it's a genuine floor."
//
// Lives here, not in storeUseCases.js, for two reasons: (a) the discovery projection must not import
// the checkout use-case module (a landlord-side read-model reaching into the tenant checkout path is
// a boundary the architecture check would rightly object to), and (b) this is pure, zero-I/O,
// unit-testable standalone -- same shape as its two siblings in this directory.
//
// Every branch below mirrors an actual branch of resolveStoreDeliveryFee (storeUseCases.js:586-694),
// including the fail-open-to-fixed one. If that function's branching changes, this must change with
// it -- deliveryFromPrice.parity.unit.test.js exists to make that coupling loud.

import { resolveDeliveryFeeConfig } from './deliveryFeeConfig.js';

// Mirrors parseFixedDeliveryFee (storeUseCases.js:568-573) minus its round4 -- the discovery column
// is DECIMAL(10,2) and today's projection already writes the raw parsed value and lets MySQL round
// (storefrontDiscoveryIndexService.js:866). Not adding rounding here keeps that behavior unchanged
// for every fixed-mode store, which is the byte-identity property worth preserving.
const parseFixedFee = (rawFee) => {
    const parsed = Number(rawFee);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
};

/**
 * @param {object} [params]
 * @param {object|null} [params.tenantSettings] - already-unwrapped values:
 *   `{ store_delivery_fee, store_delivery_fee_mode, store_delivery_fee_calc }`. `store_delivery_fee_calc`
 *   MUST already be a parsed object, not a JSON string -- see this phase's plan §3.2.
 * @param {object|null} [params.locationOverride] - forwarded verbatim to resolveDeliveryFeeConfig.
 *   Always null today (ADR 0078 Decision 6 [binding]); this phase must not be the first caller to
 *   pass non-null.
 * @returns {Readonly<{mode: 'fixed'|'calculated'|'free', fromPrice: number}>}
 */
export const resolveAdvertisedDeliveryFromPrice = ({ tenantSettings = null, locationOverride = null } = {}) => {
    const { mode, calc } = resolveDeliveryFeeConfig({ tenantSettings, locationOverride });
    const fixedFee = parseFixedFee(tenantSettings?.store_delivery_fee);

    if (mode === 'free') {
        // baseFee is 0 on every free-mode order (storeUseCases.js:624-625). Floor and ceiling agree.
        return Object.freeze({ mode, fromPrice: 0 });
    }

    if (mode === 'calculated') {
        // calc non-null: feeCentavos = minFeeCentavos + increments*perIncrement, both non-negative
        // (deliveryFeePolicy.js:149) -- min_fee is a genuine floor, which is exactly what Wave 0
        // decision #3 conditioned the "from ₱X" convention on.
        //
        // calc null: checkout fails open to the flat fixed fee (ADR 0078 Decision 2 [binding],
        // storeUseCases.js:634-641). Advertising min_fee-of-nothing (or 0) would understate a price
        // the customer will actually be charged -- the one dishonest direction. Advertise the fixed
        // fee, and keep reporting mode 'calculated' (that IS the configured mode, and it is what
        // resolveStoreDeliveryFee reports and pos_transactions.delivery_fee_mode persists for the
        // same store).
        return Object.freeze({ mode, fromPrice: calc ? calc.min_fee : fixedFee });
    }

    return Object.freeze({ mode, fromPrice: fixedFee });
};
