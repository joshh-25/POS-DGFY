import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { downpaymentSettingsRepository } from '../repositories/downpaymentSettingsRepository.js';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode, resolveWorkflowModeFamily } from '../../shared/constants/workflowModes.js';

// Duplicated locally on purpose, rather than importing menuExtractionService.js's exported
// resolveTenantWorkflowMode() -- that file's own comment documents this as the established
// convention here (keep each feature's workflow-mode lookup footprint isolated), so this module
// follows the same pattern instead of borrowing a menu-import-domain export.
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

const PAYMENT_MODE_VALUES = new Set(['full_payment', 'downpayment_required', 'customer_choice']);
const DOWNPAYMENT_TYPE_VALUES = new Set(['percentage', 'fixed']);
const MAX_RATE_BPS = 10000; // 100.00%

const mapError = (error, fallbackMessage) => {
    if (error instanceof DomainError) return error;
    return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, {
        statusCode: error?.statusCode || 500,
        details: error?.details || null
    });
};

const ensureTenantId = (tenantId) => {
    const value = String(tenantId || '').trim();
    if (!value) {
        throw new DomainError(DomainErrorCode.TENANT_CONTEXT_MISSING, 'Tenant context is required.', { statusCode: 400 });
    }
    return value;
};

const parseOptionalPositiveInt = (value, { field, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${field} must be an integer between ${min} and ${max}.`, { statusCode: 422 });
    }
    return parsed;
};

const resolveTenantWorkflowMode = async () => {
    const settings = unwrapApplicationResultOrThrow(
        await getAllSettingsUseCase(),
        'Failed to retrieve settings for workflow-mode validation'
    );
    return normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
};

export const buildGetDownpaymentSettingsUseCase = ({ repository = downpaymentSettingsRepository } = {}) => (
    async ({ tenantId }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            return ok({ settings: await repository.getSettings(tenant) });
        } catch (error) {
            return fail(mapError(error, 'Failed to load downpayment settings'));
        }
    }
);

export const buildUpdateDownpaymentSettingsUseCase = ({
    repository = downpaymentSettingsRepository,
    resolveWorkflowMode = resolveTenantWorkflowMode
} = {}) => (
    async ({ tenantId, body = {} }) => {
        try {
            const tenant = ensureTenantId(tenantId);
            const current = await repository.getSettings(tenant);
            const updates = {};

            if (body.payment_mode !== undefined) {
                const paymentMode = String(body.payment_mode || '').trim();
                if (!PAYMENT_MODE_VALUES.has(paymentMode)) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `payment_mode must be one of: ${[...PAYMENT_MODE_VALUES].join(', ')}.`, { statusCode: 422 });
                }
                updates.payment_mode = paymentMode;
            }
            if (body.downpayment_type !== undefined) {
                if (body.downpayment_type === null) {
                    updates.downpayment_type = null;
                } else {
                    const downpaymentType = String(body.downpayment_type || '').trim();
                    if (!DOWNPAYMENT_TYPE_VALUES.has(downpaymentType)) {
                        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `downpayment_type must be one of: ${[...DOWNPAYMENT_TYPE_VALUES].join(', ')}.`, { statusCode: 422 });
                    }
                    updates.downpayment_type = downpaymentType;
                }
            }
            if (body.downpayment_rate_bps !== undefined) {
                updates.downpayment_rate_bps = body.downpayment_rate_bps === null
                    ? null
                    : parseOptionalPositiveInt(body.downpayment_rate_bps, { field: 'downpayment_rate_bps', min: 1, max: MAX_RATE_BPS });
            }
            if (body.downpayment_fixed_centavos !== undefined) {
                updates.downpayment_fixed_centavos = body.downpayment_fixed_centavos === null
                    ? null
                    : parseOptionalPositiveInt(body.downpayment_fixed_centavos, { field: 'downpayment_fixed_centavos', min: 1 });
            }
            if (body.min_downpayment_centavos !== undefined) {
                updates.min_downpayment_centavos = parseOptionalPositiveInt(body.min_downpayment_centavos, { field: 'min_downpayment_centavos', min: 0 });
            }
            if (body.downpayment_refundable !== undefined) updates.downpayment_refundable = body.downpayment_refundable === true;
            if (body.allowed_capture_methods !== undefined) {
                if (body.allowed_capture_methods === null) {
                    updates.allowed_capture_methods = null;
                } else if (Array.isArray(body.allowed_capture_methods)) {
                    updates.allowed_capture_methods = body.allowed_capture_methods.map((method) => String(method).trim());
                } else {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'allowed_capture_methods must be an array or null.', { statusCode: 422 });
                }
            }

            // customer_choice is a real, schema-authorized literal (#820's own scope: "Schema
            // customer_choice now; server rejects it as unsupported in v1"), rejected only here --
            // never silently downgraded to something else -- since it isn't built yet.
            const effectivePaymentMode = updates.payment_mode ?? current.payment_mode;
            if (effectivePaymentMode === 'customer_choice') {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'payment_mode "customer_choice" is not supported yet.', {
                    statusCode: 422,
                    details: [{ field: 'payment_mode', message: 'customer_choice is reserved for a future phase and cannot be set yet.' }],
                    observabilityReasonCode: 'PAYMENT_MODE_NOT_SUPPORTED'
                });
            }

            // ADR 0069 clause 7 ([binding]): a non-Retail workflow_mode store must have
            // downpayment_required rejected, never silently honored. resolveStorefrontPaymentCapabilities
            // has no workflow_mode concept and won't catch this on its own -- this write path is
            // the enforcement point for Phase 138's own scope (checkout-read enforcement is
            // Phase 139/140's job).
            // Every write re-validates the *full effective* row when payment_mode is (or becomes)
            // downpayment_required -- not just the fields this particular request touches -- so a
            // partial update can never leave the row internally inconsistent (e.g. a lone
            // downpayment_refundable flip on a row whose type/rate never got fully configured).
            // Deliberate fail-closed choice, not an oversight: see the "effective state" test in
            // downpaymentSettingsUseCases.unit.test.js.
            if (effectivePaymentMode === 'downpayment_required') {
                const workflowMode = await resolveWorkflowMode();
                if (resolveWorkflowModeFamily(workflowMode) !== 'retail') {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Downpayment is only available for Retail workflow-mode businesses.', {
                        statusCode: 422,
                        details: [{ field: 'payment_mode', message: `This store's workflow mode (${workflowMode}) does not support downpayment_required.` }],
                        observabilityReasonCode: 'WORKFLOW_MODE_NOT_RETAIL'
                    });
                }

                const effectiveType = updates.downpayment_type !== undefined ? updates.downpayment_type : current.downpayment_type;
                if (!effectiveType) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'downpayment_type is required when payment_mode is downpayment_required.', { statusCode: 422 });
                }

                const effectiveRateBps = updates.downpayment_rate_bps !== undefined ? updates.downpayment_rate_bps : current.downpayment_rate_bps;
                if (effectiveType === 'percentage' && !effectiveRateBps) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'downpayment_rate_bps is required when downpayment_type is percentage.', { statusCode: 422 });
                }

                const effectiveFixedCentavos = updates.downpayment_fixed_centavos !== undefined ? updates.downpayment_fixed_centavos : current.downpayment_fixed_centavos;
                if (effectiveType === 'fixed' && !effectiveFixedCentavos) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'downpayment_fixed_centavos is required when downpayment_type is fixed.', { statusCode: 422 });
                }

                // #820's own scope: min_downpayment_centavos "required -- feeds Phase 140's fee
                // guard". DB NOT NULL DEFAULT 0 alone can't express "must be positive while
                // downpayment is actually active" -- that conditional lives here.
                const effectiveMinDownpaymentCentavos = updates.min_downpayment_centavos !== undefined ? updates.min_downpayment_centavos : current.min_downpayment_centavos;
                if (!effectiveMinDownpaymentCentavos || effectiveMinDownpaymentCentavos <= 0) {
                    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'min_downpayment_centavos must be greater than 0 when payment_mode is downpayment_required.', { statusCode: 422 });
                }
            }

            const settings = await repository.upsertSettings(tenant, updates);
            return ok({ settings });
        } catch (error) {
            return fail(mapError(error, 'Failed to update downpayment settings'));
        }
    }
);
