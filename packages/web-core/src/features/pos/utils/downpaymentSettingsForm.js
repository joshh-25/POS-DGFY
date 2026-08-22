// Phase 143 (#848). Pure, no React, no I/O -- form-string <-> wire-unit mapping, effective-row
// validation mirroring the backend, and a client-side split preview. Naming convention follows
// tenantRevenuePolicyForm.js: `_percentage`/`_pesos` on the form, `_bps`/`_centavos` on the wire.

// Real bug this guards against: the Joi validator on downpaymentSettingsValidator.js allows
// downpayment_rate_bps/downpayment_fixed_centavos/min_downpayment_centavos up to 999999999999, but
// the migration's columns are Sequelize.INTEGER (MySQL INT, max 2,147,483,647). A value between
// those two bounds passes validation and then fails or truncates at the DB. Clamp client-side so
// the UI never sends a value that 500s server-side.
export const MAX_SAFE_CENTAVOS = 2147483647;

const centavosFromPesos = (pesosString) => {
    const parsed = Number(pesosString);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(Math.round(parsed * 100), MAX_SAFE_CENTAVOS);
};

const pesosFromCentavos = (centavos) => (
    Number.isInteger(centavos) && centavos > 0 ? (centavos / 100).toFixed(2) : ''
);

const bpsFromPercent = (percentString) => {
    const parsed = Number(percentString);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(Math.round(parsed * 100), 10000);
};

const percentFromBps = (bps) => (
    Number.isInteger(bps) && bps > 0 ? (bps / 100).toFixed(2) : ''
);

// Phase 150 (#866): a store may now be configured to let the customer choose between paying in
// full and paying a downpayment, not just forced into one or the other. `customer_choice` is a
// third valid payment_mode alongside the original two -- everywhere this module used to branch on
// `payment_mode === 'downpayment_required'` to decide "does this row need a configured split",
// that condition is now `isSplitConfigurable(payment_mode)`, since customer_choice needs exactly
// the same type/amount/minimum configuration downpayment_required does (a customer who elects
// "downpayment" still needs a real split to resolve against).
export const isSplitConfigurable = (paymentMode) => paymentMode === 'downpayment_required' || paymentMode === 'customer_choice';

const VALID_PAYMENT_MODES = new Set(['full_payment', 'downpayment_required', 'customer_choice']);

export const createDefaultDownpaymentForm = () => ({
    payment_mode: 'full_payment',
    downpayment_type: 'percentage',
    downpayment_rate_percentage: '',
    downpayment_fixed_pesos: '',
    min_downpayment_pesos: '',
    downpayment_refundable: true
});

// settings: a GET /downpayment/settings result (or its synthesized full_payment default -- the
// repository never returns null). Never mutates `settings`.
export const settingsToForm = (settings) => ({
    payment_mode: VALID_PAYMENT_MODES.has(settings?.payment_mode) ? settings.payment_mode : 'full_payment',
    // Default the type selector to 'percentage' even when unset, so switching into a
    // split-configurable mode starts on a concrete, valid selection rather than an empty one.
    downpayment_type: settings?.downpayment_type === 'fixed' ? 'fixed' : 'percentage',
    downpayment_rate_percentage: percentFromBps(settings?.downpayment_rate_bps),
    downpayment_fixed_pesos: pesosFromCentavos(settings?.downpayment_fixed_centavos),
    min_downpayment_pesos: pesosFromCentavos(settings?.min_downpayment_centavos),
    downpayment_refundable: settings?.downpayment_refundable !== false
});

// Always emits the full six-field set -- the backend re-validates the whole *effective* (merged)
// row on every PUT, so a single dirty field can 422 an already-configured downpayment_required/
// customer_choice tenant (see downpaymentSettingsUseCases.js's own "deliberate fail-closed choice"
// comment). Never send a partial payload from this form.
export const formToPayload = (form) => {
    const splitConfigurable = isSplitConfigurable(form.payment_mode);
    const type = splitConfigurable ? form.downpayment_type : null;

    return {
        payment_mode: form.payment_mode,
        downpayment_type: type,
        downpayment_rate_bps: type === 'percentage' ? bpsFromPercent(form.downpayment_rate_percentage) : null,
        downpayment_fixed_centavos: type === 'fixed' ? centavosFromPesos(form.downpayment_fixed_pesos) : null,
        // Phase 150 (#865): the minimum is only ever meaningful in 'percentage' mode (see
        // validateDownpaymentForm's comment below) -- sent as 0 for every other type, which the
        // backend now accepts unconditionally outside 'percentage'.
        min_downpayment_centavos: type === 'percentage' ? (centavosFromPesos(form.min_downpayment_pesos) || 0) : 0,
        downpayment_refundable: form.downpayment_refundable === true
    };
};

// Mirrors the effective-row rules in downpaymentSettingsUseCases.js: when mode is
// downpayment_required or customer_choice, downpayment_type is required and the matching amount
// field is required. Returns [] when the form is valid. This is an additive client-side mirror,
// not a replacement -- the server independently re-validates every write.
export const validateDownpaymentForm = (form) => {
    if (!isSplitConfigurable(form.payment_mode)) return [];

    const errors = [];
    const payload = formToPayload(form);

    if (!payload.downpayment_type) {
        errors.push({ field: 'downpayment_type', message: `downpayment_type is required when payment_mode is ${form.payment_mode}.` });
    } else if (payload.downpayment_type === 'percentage' && !payload.downpayment_rate_bps) {
        errors.push({ field: 'downpayment_rate_bps', message: 'downpayment_rate_bps is required when downpayment_type is percentage.' });
    } else if (payload.downpayment_type === 'fixed' && !payload.downpayment_fixed_centavos) {
        errors.push({ field: 'downpayment_fixed_centavos', message: 'downpayment_fixed_centavos is required when downpayment_type is fixed.' });
    }

    // Phase 150 (#865): scoped to 'percentage' only -- in 'fixed' mode the fixed amount already IS
    // the floor, so a second, separate minimum was either a no-op or a silent override of the
    // amount the merchant just typed. The panel hides this field entirely outside 'percentage', so
    // this mirrors the backend's own type-branched rule rather than the form's dead field state.
    if (payload.downpayment_type === 'percentage' && !(payload.min_downpayment_centavos > 0)) {
        errors.push({ field: 'min_downpayment_centavos', message: 'min_downpayment_centavos must be greater than 0 when downpayment_type is percentage.' });
    }

    return errors;
};

// Mirrors apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js's resolveDownpaymentForTotal
// exactly (rounding, min floor, clamp to total) so the preview never drifts from what the server
// will actually compute. Pinned to that file the same way affiliatePricingPolicy.js is pinned to
// affiliateCommissionAccrual.js's roundBpsAmount -- if that module's math changes, this must too.
//
// Phase 150 (#866): under customer_choice this is the "if they pay a downpayment" branch of the
// preview -- the panel renders it alongside the plain sample total ("if they pay in full") for
// side-by-side comparison. No election parameter needed here: unlike a real checkout, a settings
// preview has no actual customer, so both branches are just shown together.
export const previewDownpaymentSplit = ({ form, sampleTotalPesos }) => {
    const totalCentavos = Math.round((Number(sampleTotalPesos) || 0) * 100);
    if (!isSplitConfigurable(form.payment_mode) || totalCentavos <= 0) {
        return { downpaymentAmountPesos: null, balanceDueAmountPesos: null };
    }

    const payload = formToPayload(form);
    let rawCentavos;
    if (payload.downpayment_type === 'percentage' && payload.downpayment_rate_bps > 0) {
        rawCentavos = Math.round((totalCentavos * payload.downpayment_rate_bps) / 10000);
    } else if (payload.downpayment_type === 'fixed' && payload.downpayment_fixed_centavos > 0) {
        rawCentavos = payload.downpayment_fixed_centavos;
    } else {
        return { downpaymentAmountPesos: null, balanceDueAmountPesos: null };
    }

    const minCentavos = payload.min_downpayment_centavos > 0 ? payload.min_downpayment_centavos : 0;
    const flooredCentavos = Math.max(rawCentavos, minCentavos);
    const downpaymentCentavos = Math.min(flooredCentavos, totalCentavos);
    const balanceCentavos = totalCentavos - downpaymentCentavos;

    return {
        downpaymentAmountPesos: (downpaymentCentavos / 100).toFixed(2),
        balanceDueAmountPesos: (balanceCentavos / 100).toFixed(2)
    };
};
