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
    payment_mode: settings?.payment_mode === 'downpayment_required' ? 'downpayment_required' : 'full_payment',
    // Default the type selector to 'percentage' even when unset, so switching into
    // downpayment_required starts on a concrete, valid selection rather than an empty one.
    downpayment_type: settings?.downpayment_type === 'fixed' ? 'fixed' : 'percentage',
    downpayment_rate_percentage: percentFromBps(settings?.downpayment_rate_bps),
    downpayment_fixed_pesos: pesosFromCentavos(settings?.downpayment_fixed_centavos),
    min_downpayment_pesos: pesosFromCentavos(settings?.min_downpayment_centavos),
    downpayment_refundable: settings?.downpayment_refundable !== false
});

// Always emits the full six-field set -- the backend re-validates the whole *effective* (merged)
// row on every PUT, so a single dirty field can 422 an already-configured downpayment_required
// tenant (see downpaymentSettingsUseCases.js's own "deliberate fail-closed choice" comment). Never
// send a partial payload from this form.
export const formToPayload = (form) => {
    const isDownpaymentRequired = form.payment_mode === 'downpayment_required';
    const type = isDownpaymentRequired ? form.downpayment_type : null;

    return {
        payment_mode: form.payment_mode,
        downpayment_type: type,
        downpayment_rate_bps: type === 'percentage' ? bpsFromPercent(form.downpayment_rate_percentage) : null,
        downpayment_fixed_centavos: type === 'fixed' ? centavosFromPesos(form.downpayment_fixed_pesos) : null,
        min_downpayment_centavos: centavosFromPesos(form.min_downpayment_pesos) || 0,
        downpayment_refundable: form.downpayment_refundable === true
    };
};

// Mirrors the effective-row rules in downpaymentSettingsUseCases.js (lines ~119-142): when mode is
// downpayment_required, downpayment_type is required, the matching amount field is required, and
// min_downpayment_centavos must be > 0. Returns [] when the form is valid. This is an additive
// client-side mirror, not a replacement -- the server independently re-validates every write.
export const validateDownpaymentForm = (form) => {
    if (form.payment_mode !== 'downpayment_required') return [];

    const errors = [];
    const payload = formToPayload(form);

    if (!payload.downpayment_type) {
        errors.push({ field: 'downpayment_type', message: 'downpayment_type is required when payment_mode is downpayment_required.' });
    } else if (payload.downpayment_type === 'percentage' && !payload.downpayment_rate_bps) {
        errors.push({ field: 'downpayment_rate_bps', message: 'downpayment_rate_bps is required when downpayment_type is percentage.' });
    } else if (payload.downpayment_type === 'fixed' && !payload.downpayment_fixed_centavos) {
        errors.push({ field: 'downpayment_fixed_centavos', message: 'downpayment_fixed_centavos is required when downpayment_type is fixed.' });
    }

    if (!(payload.min_downpayment_centavos > 0)) {
        errors.push({ field: 'min_downpayment_centavos', message: 'min_downpayment_centavos must be greater than 0 when payment_mode is downpayment_required.' });
    }

    return errors;
};

// Mirrors apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js's resolveDownpaymentForTotal
// exactly (rounding, min floor, clamp to total) so the preview never drifts from what the server
// will actually compute. Pinned to that file the same way affiliatePricingPolicy.js is pinned to
// affiliateCommissionAccrual.js's roundBpsAmount -- if that module's math changes, this must too.
export const previewDownpaymentSplit = ({ form, sampleTotalPesos }) => {
    const totalCentavos = Math.round((Number(sampleTotalPesos) || 0) * 100);
    if (form.payment_mode !== 'downpayment_required' || totalCentavos <= 0) {
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
