import crypto from 'crypto';
import fs from 'fs/promises';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import logger from '../../../config/logger.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import dbStore from '../../../utils/dbStore.js';
import { resolveMovementLocation } from '../../inventory/index.js';
import {
    accrueEarnedForInStoreSale,
    resolveActiveAffiliateEnrollment,
    resolveActiveAffiliateEnrollmentById,
    reverseAffiliateCommissionForOrder,
    settleAffiliateCommissionForOrder
} from '../../dgfy/utils/affiliateCommissionAccrual.js';
import {
    SAFE_IMAGE_MIME_TYPES,
    validateImageUploadFile
} from '../../shared/utils/imageUploadValidation.js';
import { resolveCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import { POS_ORDER_METHODS } from '../../shared/constants/orderMethods.js';
import {
    normalizeBarcodeValue,
    parseBarcodeStructuredPayload
} from '../../shared/utils/barcodePolicy.js';
import {
    isStockBearingItem,
    isStockExemptServiceItem,
    resolveStockBearingDescriptor,
    resolveStockExemptReason
} from '../../shared/utils/stockBearingPolicy.js';
import { requireExplicitSalePrice } from '../../shared/utils/itemFinancialPolicy.js';
import { buildFnbRecipeConsumptionPlan } from '../../shared/utils/fnbRecipeConsumption.js';
import {
    buildOnlineInventoryEffects,
    buildLineStockPolicySubject
} from '../../shared/utils/onlineInventoryEffects.js';
import { isCodDelivery } from '../../shared/utils/paymentTimingPolicy.js';
import { getDgfyLegacyLinkStatus } from '../../dgfy/index.js';
import { recordDgfyOrderActivity } from '../../dgfy/utils/customerActivityRecorder.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { calculatePosDiscount } from '../domain/posDiscountCalculator.js';
import { buildVoucherGovernedCalculation } from '../domain/posVoucherDiscountCalculator.js';
import { resolvePosGovernedDiscount } from '../domain/posDiscountPolicy.js';
// #712: direct ESM import of the singleton use case, matching the one existing cross-module
// precedent (storeUseCases.js imports the same set from '../../vouchers/index.js').
import {
    previewVoucherEligibilityUseCase,
    redeemVoucherUseCase,
    VoucherReasonCode
} from '../../vouchers/index.js';
import { calculatePosItemDiscounts } from '../domain/posItemDiscountCalculator.js';
import { resolvePosItemDiscount } from '../domain/posItemDiscountPolicy.js';
import { resolvePosVoidFinancialOutcome } from '../domain/posVoidFinancialOutcome.js';
import { verifyPosDiscountApprover } from '../domain/posDiscountApprovalPolicy.js';
import { verifyPosDayCloseOperator } from '../domain/posDayClosePinPolicy.js';
import { authorizePosShiftMutation } from '../domain/posShiftAuthorizationPolicy.js';
import {
    authorizePosStaleShiftRecovery,
    evaluatePosShiftStaleness,
    resolvePosStaleShiftHours
} from '../domain/posShiftRecoveryPolicy.js';
import {
    STOREFRONT_PROMO_SETTING_KEY,
    STOREFRONT_PROMOS_SETTING_KEY,
    buildCommercialPromoUsageUpdate
} from '../../shared/utils/commercialPromoPolicy.js';
import { getPosCashPaymentAmount, normalizePosPaymentBreakdown } from '../utils/paymentBreakdown.js';

const VAT_RATE = 0.12;
const INVOICE_COUNTER_KEY = 'POS_OR';
const NON_FISCAL_COUNTER_KEY = 'POS_NFS';
const FISCAL_LIFETIME_COUNTER_KEY = 'POS_FISCAL_LIFETIME_TOTAL_CENTS';
const Z_READING_COUNTER_KEY = 'POS_Z_READING_COUNTER';
const RESET_COUNTER_KEY = 'POS_RESET_COUNTER';
const FISCAL_DOCUMENT_TEMPLATE_VERSION = 'rmo-24-2023-prep-v1';
const ORDER_METHODS = POS_ORDER_METHODS;
const FNB_COURSES = new Set(['appetizer', 'main', 'dessert', 'drink', 'other']);
export const ONLINE_ORDER_SOURCE = 'online_store';
const ONLINE_FULFILLMENT_STATUSES = [
    'placed',
    'confirmed',
    'preparing',
    'packed',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'cancelled',
    'rejected'
];
const ONLINE_FULFILLMENT_TRANSITIONS = Object.freeze({
    placed: ['confirmed', 'rejected'],
    // Phase 210 (#1179). A merchant who has already accepted an order can still discover it is
    // out-of-route and must be able to reject it with a reason. A store-initiated reject ALWAYS
    // refunds (commerceOrderLifecycleUseCase.js:109-113, Phase 144/#824) -- widening this edge
    // does not widen forfeiture.
    confirmed: ['preparing', 'rejected'],
    preparing: ['packed', 'ready_for_pickup', 'out_for_delivery'],
    // Phase 211 (#1180). ADDITIVE and optional: `preparing` keeps both original onward edges, and
    // `packed` offers exactly the same two. F&B gains no mandatory step; an order that never
    // enters `packed` behaves identically to before this phase.
    packed: ['ready_for_pickup', 'out_for_delivery'],
    ready_for_pickup: ['completed'],
    out_for_delivery: ['completed'],
    completed: [],
    cancelled: [],
    rejected: []
});
// Phase 210 (#1179). Pat's confirmed decision: a staff delivery-address/pin edit is restricted to
// pre-dispatch statuses only. `out_for_delivery` is deliberately EXCLUDED -- once a delivery job has
// been dispatched the driver already holds the original address, so a silent server-side edit could
// diverge from what is physically in the driver's hand. Rejected the same way as a terminal state,
// with the same 409.
const DELIVERY_ADDRESS_EDITABLE_STATUSES = Object.freeze(['placed', 'confirmed', 'preparing']);
const DELIVERY_JOB_STATUS_VALUES = Object.freeze([
    'pending_dispatch',
    'assigned',
    'picked_up',
    'delivered',
    'failed',
    'cancelled'
]);
const DELIVERY_JOB_TRANSITIONS = Object.freeze({
    pending_dispatch: ['assigned'],
    assigned: ['picked_up'],
    picked_up: ['delivered'],
    delivered: [],
    failed: [],
    cancelled: []
});
const CASH_EVENT_EFFECT = Object.freeze({
    cash_in: 1,
    opening_adjustment: 1,
    cash_out: -1,
    closing_adjustment: -1
});
const POS_SHIFT_SALES_WINDOW_PRECISION_BUFFER_MS = 1000;
const PERMISSION_PRICE_OVERRIDE = 'pos:price_override';
const PERMISSION_EDIT_POS_CATALOG = 'items:edit';
const PERMISSION_SWITCH_LOCATION = 'pos:switch_location';
const POS_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
const POS_CATALOG_BULK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
// Phase 204 (#965): mirrors uploadConfig.js's PAYMENT_PROOF_SOURCE_MAX_BYTES -- kept as a local
// constant here rather than an import, matching this file's own convention for the catalog-image
// limit above.
const BALANCE_PROOF_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
const BULK_CATALOG_MAX_ITEM_IDS = 500;
const BULK_CATALOG_MAX_IMAGE_FILES = 50;
const RESET_COUNTER_CONFIRMATION_TEXT = 'INCREMENT RESET COUNTER';
const SPECIAL_DISCOUNT_BENEFICIARY_TYPES = new Set(['senior', 'pwd', 'national_athlete']);
const RECEIPT_CONTRACT_VERSION = '2026.04.08';
export const OPERATION_REPLAY_STATUS = Object.freeze({
    PROCESSED: 'processed',
    BLOCKED: 'blocked'
});
export const POS_OPERATION_KEYS = Object.freeze({
    SHIFT_OPEN: 'terminal.shift_open',
    SHIFT_SWITCH: 'terminal.shift_switch_location',
    CASH_EVENT: 'terminal.cash_event',
    SHIFT_CLOSE: 'terminal.shift_close',
    SHIFT_FORCE_CLOSE: 'terminal.shift_force_close',
    ORDER_STATUS_UPDATE: 'terminal.order_status_update',
    PICKUP_CASH_COLLECTION: 'terminal.pickup_cash_collection',
    DELIVERY_CASH_COLLECTION: 'terminal.delivery_cash_collection',
    DELIVERY_JOB_ASSIGNMENT: 'terminal.delivery_job_assignment',
    DELIVERY_JOB_STATUS_UPDATE: 'terminal.delivery_job_status_update',
    ORDER_BALANCE_SETTLEMENT: 'terminal.order_balance_settlement',
    ORDER_DELIVERY_ADDRESS_UPDATE: 'terminal.order_delivery_address_update',
    // Phase 225 (#1273/#1081): delivery run membership/personnel mutations. Distinct operation
    // keys from DELIVERY_JOB_ASSIGNMENT because these are batch/run-scoped idempotency fingerprints,
    // not per-job ones.
    DELIVERY_RUN_MEMBERSHIP: 'terminal.delivery_run_membership',
    DELIVERY_RUN_PERSONNEL: 'terminal.delivery_run_personnel',
    // Phase 228 (#1273/#1271): run-scoped, not per-order -- hashed on { delivery_run_id } only, so
    // a legitimate retry with a different (e.g. one member removed) member set still replays
    // correctly. See buildDispatchDeliveryRunUseCase's own idempotency comment for the full
    // two-layer design (durable replay + per-member ALREADY_DISPATCHED skip).
    DELIVERY_RUN_DISPATCH: 'terminal.delivery_run_dispatch'
});

// Phase 148 (#825): the methods staff may record a downpayment order's remaining balance with.
// This was ADR 0063 clause 4 [binding]'s V1 set verbatim -- cash plus the four store-owned digital
// tenders it classifies as `merchant_owned`. #825's own scope line named only "cash + gcash"; that
// reads as an example rather than an exhaustive list, since clause 5 (what an attestation must
// persist) and clause 6 (explicit confirmation) already govern all four identically and nothing
// per-method has to be invented. `card` here is a store-owned card terminal, never PayMongo card --
// no balance leg ever touches a provider (ADR 0069 clause 2 [binding], carried forward verbatim by
// ADR 0070; ADR 0063 clause 12 [binding]).
//
// Phase 202 (#1085) adds `cheque` as a sixth method. ADR 0063 clause 4 is `[binding]`, so widening
// it took a scoped-supersession ADR rather than an amendment: ADR 0077 supersedes clause 4 only,
// replacing the V1 five-tender enumeration with this six-tender set; every other clause of ADR 0063
// is unaffected. Cheque is merchant-owned by construction (no branch added below), and its number
// is `payment_reference` under this method -- no new column.
const BALANCE_SETTLEMENT_METHODS = Object.freeze(['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'cheque']);
const BALANCE_SETTLEMENT_HANDOVER_STATUS_BY_METHOD = Object.freeze({
    pickup: 'ready_for_pickup',
    delivery: 'out_for_delivery'
});
const TERMINAL_POLICY_MODES = new Set(['warn', 'enforce']);
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const TERMINAL_POLICY_REASON_CODES = Object.freeze({
    REGISTRY_REQUIRED: 'TERMINAL_REGISTRY_REQUIRED',
    TERMINAL_ID_REQUIRED: 'TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY',
    TERMINAL_NOT_REGISTERED: 'TERMINAL_ID_NOT_REGISTERED',
    WARN_MISSING_ID: 'TERMINAL_ID_MISSING_WARN',
    WARN_UNREGISTERED_ID: 'TERMINAL_ID_UNREGISTERED_WARN'
});
const TERMINAL_POLICY_ALLOWED_REASON_CODE = 'TERMINAL_ID_ALLOWED';
const ESALES_REPORT_STATUSES = new Set(['generated', 'submitted', 'accepted', 'rejected']);
const LOCATION_SCOPE_REASON_CODES = Object.freeze({
    LOCATION_CONTEXT_REQUIRED: 'POS_LOCATION_CONTEXT_REQUIRED',
    LOCATION_SCOPE_UNRESOLVED: 'POS_LOCATION_SCOPE_UNRESOLVED',
    LOCATION_ACCESS_DENIED: 'POS_LOCATION_ACCESS_DENIED',
    TERMINAL_HOME_LOCATION_MISMATCH: 'POS_TERMINAL_HOME_LOCATION_MISMATCH',
    TERMINAL_HOME_LOCATION_REQUIRED: 'POS_TERMINAL_HOME_LOCATION_REQUIRED',
    SHIFT_LOCATION_MISMATCH: 'POS_SHIFT_LOCATION_MISMATCH',
    TRANSACTION_LOCATION_MISMATCH: 'POS_TRANSACTION_LOCATION_MISMATCH'
});
const getTenantComplianceSnapshot = () => {
    const store = dbStore.getStore() || {};
    const tenantId = store.tenantId;
    if (!tenantId || tenantId === 'default') return null;

    return {
        id: tenantId,
        compliance_mode_state: store.tenantComplianceModeState || null,
        compliance_mode_choice_required: store.tenantComplianceModeChoiceRequired === true,
        compliance_profile: store.tenantComplianceProfile || null,
        compliance_policy_version: store.tenantCompliancePolicyVersion || null
    };
};

const assertPosComplianceAllowed = async ({ operation, context = {}, settings = {}, user = null }) => {
    const tenant = getTenantComplianceSnapshot();
    if (!tenant?.id) {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'Tenant compliance context is required',
            { statusCode: 400 }
        );
    }

    const hasSettings = settings && typeof settings === 'object' && Object.keys(settings).length > 0;
    const result = await assertComplianceOperationAllowed({
        tenantId: tenant.id,
        tenant,
        operation,
        context: hasSettings ? { ...context, settings } : { ...context },
        actorUser: user
    });

    if (!result.success) {
        throw result.error;
    }

    return result.data.decision;
};

export const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized <= 0) return null;
    return normalized;
};
const isSeniorPwdDiscountEligible = (value) => value === true || value === 1 || value === '1';

const nowInManilaBusinessDate = () => (
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
);

const normalizeBusinessDateInput = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const normalized = String(value || '').trim();
    const dateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return dateMatch ? dateMatch[1] : '';
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toCurrencyCents = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));
const fromCurrencyCents = (value) => round4((Number(value) || 0) / 100);
const normalizedEmail = (value) => String(value || '').trim().toLowerCase();

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalizeTrustedDiscountApproval = (approval = null) => {
    if (!isPlainObject(approval)) return null;
    const discountType = String(approval.discount_type || '').trim().toLowerCase();
    if (!['senior', 'pwd', 'employee', 'promo', 'manual', 'voucher'].includes(discountType)) return null;
    const approverUserId = parsePositiveInt(approval.approver_user_id);
    if (!approverUserId) return null;
    return {
        discount_type: discountType,
        approver_user_id: approverUserId,
        employee_user_id: discountType === 'employee' ? parsePositiveInt(approval.employee_user_id) : null,
        employee_directory_id: discountType === 'employee' ? parsePositiveInt(approval.employee_directory_id) : null,
        self_approved: approval.self_approved === true,
        approved_at: approval.approved_at || null,
        operator_user_id: parsePositiveInt(approval.operator_user_id)
    };
};

const trustedDiscountApprovalMatches = (approval, governedDraft, governedApplication) => {
    if (!approval || !governedDraft || !governedApplication) return false;
    if (approval.discount_type !== governedApplication.type) return false;
    if (approval.approver_user_id !== parsePositiveInt(governedDraft.approver_user_id)) return false;
    if (approval.discount_type === 'employee') {
        if (approval.employee_directory_id || parsePositiveInt(governedApplication.employee_directory_id)) {
            return approval.employee_directory_id === parsePositiveInt(governedApplication.employee_directory_id);
        }
        return approval.employee_user_id === parsePositiveInt(governedApplication.employee_id);
    }
    return true;
};
const normalizeTrustedItemDiscountApprovals = (approvals = null) => {
    if (!Array.isArray(approvals)) return new Map();
    return new Map(approvals.map((approval) => {
        if (!isPlainObject(approval)) return [null, null];
        const itemId = parsePositiveInt(approval.item_id);
        const discountType = String(approval.discount_type || '').trim().toLowerCase();
        const approverUserId = parsePositiveInt(approval.approver_user_id);
        if (!itemId || !['senior', 'pwd', 'employee', 'promo', 'manual'].includes(discountType) || !approverUserId) {
            return [null, null];
        }
        return [itemId, {
            item_id: itemId,
            discount_type: discountType,
            approver_user_id: approverUserId,
            employee_user_id: discountType === 'employee' ? parsePositiveInt(approval.employee_user_id) : null,
            employee_directory_id: discountType === 'employee' ? parsePositiveInt(approval.employee_directory_id) : null,
            self_approved: approval.self_approved === true,
            approved_at: approval.approved_at || null,
            operator_user_id: parsePositiveInt(approval.operator_user_id)
        }];
    }).filter(([itemId, approval]) => itemId && approval));
};
const trustedItemDiscountApprovalMatches = (approval, draft, application) => {
    if (!approval || !draft || !application) return false;
    if (approval.item_id !== parsePositiveInt(application.item_id)) return false;
    if (approval.discount_type !== application.discount_type) return false;
    if (approval.approver_user_id !== parsePositiveInt(draft.approver_user_id)) return false;
    if (approval.discount_type === 'employee') {
        return approval.employee_directory_id === parsePositiveInt(application.employee_directory_id);
    }
    return true;
};
const assertTrustedEmployeeApprovalIdentity = ({
    approval,
    application,
    approver,
    applyingUserId,
    allowSelfApproval
}) => {
    const approverUserId = parsePositiveInt(approver?.user_id);
    const applyingUserIdNormalized = parsePositiveInt(applyingUserId);
    const beneficiaryMatchesApprover = Boolean(
        (parsePositiveInt(application?.employee_user_id)
            && parsePositiveInt(application.employee_user_id) === approverUserId)
        || (normalizedEmail(application?.employee_email)
            && normalizedEmail(application.employee_email) === normalizedEmail(approver?.email))
    );
    if (parsePositiveInt(application?.employee_directory_id)
        && applyingUserIdNormalized === approverUserId
        && !normalizedEmail(application?.employee_email)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'The selected employee needs an email before self-approval can be verified.',
            { statusCode: 403, details: { reason_code: 'DISCOUNT_SELF_APPROVAL_IDENTITY_UNVERIFIED' } }
        );
    }
    if (beneficiaryMatchesApprover !== (approval?.self_approved === true)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'The saved discount approval no longer matches the employee identity.',
            { statusCode: 403, details: { reason_code: 'DISCOUNT_APPROVAL_IDENTITY_CHANGED' } }
        );
    }
    if (beneficiaryMatchesApprover && allowSelfApproval !== true) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Employees cannot approve their own discount.',
            { statusCode: 403, details: { reason_code: 'DISCOUNT_SELF_APPROVAL_BLOCKED' } }
        );
    }
    if (beneficiaryMatchesApprover && applyingUserIdNormalized !== approverUserId) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Self-approval must be completed by the authenticated cashier receiving the discount.',
            { statusCode: 403, details: { reason_code: 'DISCOUNT_SELF_APPROVAL_ACTOR_MISMATCH' } }
        );
    }
    if (approval?.operator_user_id && approval.operator_user_id !== applyingUserIdNormalized) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'The saved discount approval belongs to a different cashier session.',
            { statusCode: 403, details: { reason_code: 'DISCOUNT_APPROVAL_OPERATOR_MISMATCH' } }
        );
    }
};
const normalizeJsonObject = (value, fallback = {}) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return fallback;
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        return fallback;
    }
    return fallback;
};
const normalizeJsonArray = (value, fallback = []) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
};

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

export const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const settingString = (settings = {}, key) => String(settings?.[key]?.value ?? '').trim();

const settingBoolean = (settings = {}, key) => {
    const value = settings?.[key]?.value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export const normalizeOptionalIdempotencyKey = (value) => {
    const normalized = String(value || '').trim();
    return normalized.length >= 8 ? normalized : null;
};

const buildOperationReplayConflictError = () => new DomainError(
    DomainErrorCode.CONFLICT,
    'idempotency_key was already used with a different payload',
    {
        statusCode: 409,
        details: {
            idempotency: {
                outcome: 'conflict',
                idempotent_replay: true
            }
        }
    }
);

export const serializeReplayFailure = (error) => ({
    message: error?.message || 'Operation blocked',
    error_code: error?.code || DomainErrorCode.VALIDATION_FAILED,
    status_code: Number.parseInt(error?.statusCode || 422, 10) || 422,
    details: error?.details || null
});

const buildReplayBlockedError = (payload = {}) => new DomainError(
    payload.error_code || DomainErrorCode.VALIDATION_FAILED,
    payload.message || 'Operation is blocked',
    {
        statusCode: Number.parseInt(payload.status_code || 422, 10) || 422,
        details: {
            ...(payload.details && typeof payload.details === 'object' ? payload.details : {}),
            idempotency: {
                outcome: 'blocked',
                idempotent_replay: true
            }
        }
    }
);

export const findOperationReplayEntry = async ({
    posRepository,
    operationKey,
    idempotencyKey,
    requestHash,
    transaction = null
}) => {
    if (!idempotencyKey) return null;

    const existing = toSerializable(await posRepository.findOperationReplayByKey({
        operationKey,
        idempotencyKey
    }, transaction ? { transaction, lock: true } : {}));
    if (!existing) return null;

    if (String(existing.request_hash || '') !== String(requestHash || '')) {
        throw buildOperationReplayConflictError();
    }

    if (existing.replay_status === OPERATION_REPLAY_STATUS.BLOCKED) {
        throw buildReplayBlockedError(existing.response_payload || {});
    }

    const responsePayload = existing.response_payload && typeof existing.response_payload === 'object'
        ? existing.response_payload
        : {};
    const existingIdempotency = responsePayload.idempotency && typeof responsePayload.idempotency === 'object'
        ? responsePayload.idempotency
        : {};

    return {
        ...responsePayload,
        idempotency: {
            ...existingIdempotency,
            outcome: 'idempotent_replay',
            idempotent_replay: true
        },
        idempotent_replay: true,
        replay_outcome: 'idempotent_replay'
    };
};

export const persistOperationReplay = async ({
    posRepository,
    operationKey,
    idempotencyKey,
    requestHash,
    replayStatus,
    responsePayload,
    createdBy,
    transaction = null
}) => {
    if (!idempotencyKey) return null;

    return posRepository.createOperationReplay({
        operation_key: operationKey,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        replay_status: replayStatus,
        response_payload: responsePayload || {},
        created_by: createdBy || null
    }, transaction ? { transaction } : {});
};

const createShiftAuditLog = async ({
    posRepository,
    actorUserId,
    shiftId,
    action = 'UPDATE',
    event,
    changes = {},
    transaction
}) => posRepository.createAuditLog({
    user_id: parsePositiveInt(actorUserId) || null,
    entity_type: 'pos_terminal_shift',
    entity_id: parsePositiveInt(shiftId) || null,
    action,
    changes: {
        event,
        ...changes
    }
}, { transaction });

const buildBusinessDateRange = (dateInput) => {
    const dateString = dateInput instanceof Date
        ? dateInput.toISOString().slice(0, 10)
        : String(dateInput).slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'business date must be in YYYY-MM-DD format',
            { statusCode: 400 }
        );
    }

    const startAt = new Date(`${dateString}T00:00:00+08:00`);
    const endAt = new Date(startAt.getTime() + (24 * 60 * 60 * 1000));

    return {
        businessDate: dateString,
        startAt,
        endAt
    };
};

export const toSerializable = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const toPublicPosTransactionAdjustment = (value) => {
    const serialized = toSerializable(value) || {};
    const metadata = normalizeJsonObject(serialized.metadata);
    return {
        pos_transaction_adjustment_id: serialized.pos_transaction_adjustment_id || null,
        adjustment_reference: serialized.adjustment_reference || null,
        pos_transaction_id: serialized.pos_transaction_id || null,
        pos_payment_allocation_id: serialized.pos_payment_allocation_id || null,
        original_cashier_id: serialized.original_cashier_id || null,
        original_cashier_name: serialized.originalCashier?.username || null,
        original_shift_id: serialized.original_shift_id || null,
        original_terminal_id: serialized.original_terminal_id || null,
        original_location_id: serialized.original_location_id || null,
        actor_user_id: serialized.actor_user_id || null,
        actor_name: serialized.actorUser?.username || null,
        actor_shift_id: serialized.actor_shift_id || null,
        actor_terminal_id: serialized.actor_terminal_id || null,
        actor_location_id: serialized.actor_location_id || null,
        adjustment_type: serialized.adjustment_type || null,
        tender_type: serialized.tender_type || null,
        amount: serialized.amount ?? null,
        currency: serialized.currency || 'PHP',
        status: serialized.status || null,
        reason: serialized.reason || null,
        approved_by: serialized.approved_by || null,
        approved_by_name: serialized.approvedByUser?.username || null,
        approved_at: serialized.approved_at || null,
        external_reference: serialized.external_reference || null,
        provider: serialized.provider || null,
        provider_reference: serialized.provider_reference || null,
        provider_event_id: serialized.provider_event_id || null,
        cash_drawer_event_id: serialized.cash_drawer_event_id || null,
        failure_code: serialized.failure_code || null,
        failure_reason: serialized.failure_reason || null,
        retry_count: serialized.retry_count || 0,
        last_retry_at: serialized.last_retry_at || null,
        completed_at: serialized.completed_at || null,
        failed_at: serialized.failed_at || null,
        cancelled_at: serialized.cancelled_at || null,
        created_at: serialized.created_at || null,
        updated_at: serialized.updated_at || null,
        financial_outcome: metadata.financial_outcome || null
    };
};

const scopePosReportQueryToActor = ({ query = {}, user = {} } = {}) => {
    const role = String(user?.role || '').trim().toLowerCase();
    if (role !== 'cashier') return query;

    const actorId = parsePositiveInt(user?.user_id);
    const requestedCashierId = parsePositiveInt(query?.cashier_id);
    if (!actorId) {
        throw new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'Authenticated cashier is required to view POS reports',
            { statusCode: 401 }
        );
    }
    if (requestedCashierId && requestedCashierId !== actorId) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Cashiers may only view their own POS report',
            { statusCode: 403 }
        );
    }

    return {
        ...query,
        cashier_id: actorId
    };
};

export const buildGetPosReportsOverviewUseCase = ({ posRepository }) => {
    const baseUseCase = buildReadScopedPosReportUseCase({
        posRepository,
        repositoryMethod: posRepository.getReportsOverview,
        failureMessage: 'Failed to load POS reports overview'
    });
    return async ({ query = {}, user } = {}) => {
        try {
            if (!isPlainObject(query)) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Report query must be an object',
                    { statusCode: 400 }
                );
            }
            const dateFrom = normalizeBusinessDateInput(query.date_from) || nowInManilaBusinessDate();
            const dateTo = normalizeBusinessDateInput(query.date_to) || dateFrom;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Report dates must use YYYY-MM-DD format', { statusCode: 400 });
            }
            if (dateFrom > dateTo) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'date_from must not be after date_to', { statusCode: 400 });
            }
            const rangeDays = Math.round((new Date(`${dateTo}T00:00:00.000Z`) - new Date(`${dateFrom}T00:00:00.000Z`)) / 86400000) + 1;
            if (rangeDays > 366) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'POS report range cannot exceed 366 days', { statusCode: 422 });
            }
            return baseUseCase({
                query: {
                    ...scopePosReportQueryToActor({ query, user }),
                    date_from: dateFrom,
                    date_to: dateTo
                },
                user
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS reports'));
        }
    };
};

const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildExportPosReportsUseCase = ({ posRepository }) => async ({ query = {}, user } = {}) => {
    try {
        const overviewResult = await buildGetPosReportsOverviewUseCase({ posRepository })({ query, user });
        if (!overviewResult.success) return overviewResult;
        const summary = overviewResult.data?.daily_report?.summary || {};
        const discountRows = overviewResult.data?.daily_report?.discount_breakdown || [];
        const cashierRows = overviewResult.data?.daily_report?.cashier_summary || [];
        const transactionRows = overviewResult.data?.daily_report?.transaction_rows || [];
        const lifecycle = overviewResult.data?.cashier_lifecycle || {};
        const section = String(query.section || 'daily').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'daily';
        const lifecycleRows = section === 'attendance'
            ? [
                ['Cashier', 'Duty Type', 'Status', 'Started At', 'Ended At', 'Break Minutes', 'Worked Minutes', 'Location'],
                ...(lifecycle.attendance?.rows || []).map((row) => [row.cashier_name, row.duty_type, row.status, row.started_at, row.ended_at, row.break_minutes, row.worked_minutes, row.location_id])
            ]
            : section === 'cashiers'
                ? [
                    ['Cashier', 'Transactions', 'Gross Sales', 'Net Sales', 'Operator Attribution'],
                    ...cashierRows.map((row) => [row.cashier_name, row.summary?.total_transactions, row.summary?.gross_sales, row.summary?.net_sales, 'Authenticated operator where operator_session_id exists; otherwise legacy cashier snapshot'])
                ]
                : section === 'registers'
                    ? [
                        ['Opening Cashier', 'Shift IDs', 'Opening Float', 'Cash Sales', 'Cash In', 'Cash Out', 'Expected Cash', 'Closing Cash', 'Variance', 'Notice'],
                        ...(lifecycle.registers || []).map((row) => [row.opening_cashier_name, (row.shift_ids || []).join('|'), row.opening_float_amount, row.cash_sales_amount, row.cash_in_total, row.cash_out_total, row.expected_cash_amount, row.closing_cash_amount, row.variance_amount, row.attribution_notice])
                    ]
                    : section === 'handoffs'
                        ? [
                            ['Event At', 'Terminal', 'Shift', 'Type', 'Custody Mode', 'Outgoing', 'Incoming', 'Expected Cash', 'Counted Cash', 'Variance', 'Attribution'],
                            ...(lifecycle.handoffs?.rows || []).map((row) => [row.event_at, row.terminal_id, row.shift_id, row.event_type, row.custody_mode, row.outgoing_operator_name, row.incoming_operator_name, row.expected_cash_amount, row.counted_cash_amount, row.variance_amount, row.variance_attribution])
                        ]
                        : null;
        const rows = lifecycleRows || [
            ['Metric', 'Value'],
            ['Gross Sales', summary.gross_sales || 0],
            ['Net Sales', summary.net_sales || 0],
            ['All Discounts', summary.discounts || 0],
            ['Transactions', summary.total_transactions || 0],
            [],
            ['Discount', 'Type', 'Transactions', 'Discount Total', 'VAT Removed'],
            ...discountRows.map((row) => [row.discount_label, row.discount_type, row.transaction_count, row.discount_amount, row.vat_removed]),
            [],
            ['Cashier', 'Shift Count', 'Closed Shifts', 'Opening Float', 'Cash Sales', 'Cash In', 'Cash Out', 'Expected Cash', 'Cash After Shift', 'Variance'],
            ...cashierRows.map((row) => [
                row.cashier_name,
                row.shift_money?.shift_count,
                row.shift_money?.closed_shift_count,
                row.shift_money?.opening_float_amount,
                row.shift_money?.cash_sales_amount,
                row.shift_money?.cash_in_total,
                row.shift_money?.cash_out_total,
                row.shift_money?.expected_cash_amount,
                row.shift_money?.closing_cash_amount,
                row.shift_money?.cash_variance_amount
            ]),
            [],
            ['Invoice', 'Datetime', 'Cashier', 'Payment', 'Status', 'Total', 'Reported Net Sales'],
            ...transactionRows.map((row) => [
                row.invoice_number || row.pos_transaction_id,
                row.created_at || '',
                row.cashier_name || '',
                row.payment_type || '',
                row.status || '',
                row.total_amount || 0,
                row.net_sales || 0
            ])
        ];
        return ok({
            filename: `pos-${section}-report.csv`,
            content_type: 'text/csv; charset=utf-8',
            content: rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
        });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to export POS reports'));
    }
};

// Phase 261 (#1488, RF-1 fix per #1504 review): pre-run procurement CSV export. Deliberately
// reuses posRepository.listIncomingOnlineOrders() directly rather than
// buildListIncomingOnlineOrdersUseCase -- this list must be usable before a run is built (no
// open shift required). It is NOT aggregated across all locations, though -- like the other
// shift-independent read path (buildListOnlineOrderHistoryUseCase), it resolves the caller's
// authorized location via resolvePosReadLocationScope so a VIEW_POS user can only ever export
// pending-order PII (customer name, phone, delivery address) for a location they're actually
// granted access to. See the implementation plan's section 1 for the reuse reasoning, and PR
// #1504's review (RF-1) for the location-scope fix.
export const buildExportProcurementCsvUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => async ({ query = {}, user } = {}) => {
    try {
        if (query !== undefined && !isPlainObject(query)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'query must be an object', { statusCode: 400 });
        }
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated user is required to export procurement data', { statusCode: 401 });
        }
        if (query?.location_id != null && !parsePositiveInt(query.location_id)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'location_id must be a positive integer', { statusCode: 422 });
        }

        const locationScope = await resolveLocationScope({
            requestedLocationId: query?.location_id,
            userId: normalizedUserId,
            operationLabel: 'POS procurement export read'
        });

        const orders = await posRepository.listIncomingOnlineOrders({ locationId: locationScope.location_id, limit: 500 });

        const rows = [
            ['Order #', 'Order Date', 'Location', 'Status', 'Customer Name', 'Customer Phone', 'Delivery Address', 'SKU', 'Item Name', 'Quantity', 'Unit'],
            ...orders.flatMap((order) => (order.lines || []).map((line) => [
                order.invoice_number || order.pos_transaction_id,
                order.created_at || '',
                order.location?.name || '',
                order.fulfillment_status || '',
                order.customer_name || 'Guest Buyer',
                order.customer_phone || '',
                order.delivery_address || '',
                line.item?.sku_code || '',
                line.item?.name || '',
                line.quantity,
                line.item?.unit_of_measure || ''
            ]))
        ];

        return ok({
            filename: `pos-procurement-export-${nowInManilaBusinessDate()}.csv`,
            content_type: 'text/csv; charset=utf-8',
            content: rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
        });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to export procurement data'));
    }
};

const buildZReadingIdentifier = ({ businessDate, zCounterValue }) => (
    `ZR-${String(businessDate || '').replace(/-/g, '')}-${String(zCounterValue || 0).padStart(8, '0')}`
);

const buildXReadingIdentifier = ({ businessDate, generatedAt = new Date() }) => {
    const dateToken = String(businessDate || '').replace(/-/g, '');
    const isoToken = generatedAt.toISOString().replace(/\D/g, '').slice(8, 14);
    return `XR-${dateToken}-${isoToken}`;
};

const normalizeZReadingSummary = (summary = {}) => ({
    transaction_count: Number.parseInt(summary?.transaction_count || 0, 10),
    subtotal_amount: round4(summary?.subtotal_amount),
    discount_amount: round4(summary?.discount_amount),
    service_fee_total: round4(summary?.service_fee_total),
    restaurant_service_charge_total: round4(summary?.restaurant_service_charge_total),
    vatable_sales: round4(summary?.vatable_sales),
    vat_amount: round4(summary?.vat_amount),
    vat_exempt_sales: round4(summary?.vat_exempt_sales),
    zero_rated_sales: round4(summary?.zero_rated_sales),
    total_amount: round4(summary?.total_amount),
    item_count: round4(summary?.item_count),
    discount_item_count: round4(summary?.discount_item_count),
    total_cost: round4(summary?.total_cost),
    void_transaction_count: Number.parseInt(summary?.void_transaction_count || 0, 10),
    void_amount: round4(summary?.void_amount),
    voided_item_count: round4(summary?.voided_item_count),
    post_close_void_transaction_count: Number.parseInt(summary?.post_close_void_transaction_count || 0, 10),
    post_close_void_amount: round4(summary?.post_close_void_amount),
    post_close_voided_item_count: round4(summary?.post_close_voided_item_count),
    refund_amount: round4(summary?.refund_amount),
    refunded_item_count: round4(summary?.refunded_item_count),
    provider_refunds_included: summary?.provider_refunds_included === true,
    net_profit: round4(summary?.net_profit),
    daily_totals: Array.isArray(summary?.daily_totals)
        ? summary.daily_totals.map((entry) => ({
            business_date: entry?.business_date || null,
            transaction_count: Number.parseInt(entry?.transaction_count || 0, 10),
            total_amount: round4(entry?.total_amount),
            discount_amount: round4(entry?.discount_amount),
            item_count: round4(entry?.item_count),
            discount_item_count: round4(entry?.discount_item_count),
            total_cost: round4(entry?.total_cost),
            void_transaction_count: Number.parseInt(entry?.void_transaction_count || 0, 10),
            void_amount: round4(entry?.void_amount),
            voided_item_count: round4(entry?.voided_item_count),
            refund_amount: round4(entry?.refund_amount),
            refunded_item_count: round4(entry?.refunded_item_count),
            provider_refunds_included: entry?.provider_refunds_included === true,
            net_profit: round4(entry?.net_profit)
        }))
        : [],
    popular_items: Array.isArray(summary?.popular_items)
        ? summary.popular_items.map((entry) => ({
            item_id: parsePositiveInt(entry?.item_id),
            item_name: String(entry?.item_name || '').trim() || null,
            sku_code: entry?.sku_code || null,
            quantity: round4(entry?.quantity),
            amount: round4(entry?.amount),
            cost: round4(entry?.cost),
            net_profit: round4(entry?.net_profit)
        }))
        : [],
    payment_breakdown: normalizePosPaymentBreakdown(summary?.payment_breakdown),
    order_method_breakdown: Array.isArray(summary?.order_method_breakdown)
        ? summary.order_method_breakdown.map((entry) => ({
            order_method: entry?.order_method || null,
            count: Number.parseInt(entry?.count || 0, 10),
            amount: round4(entry?.amount)
        }))
        : []
});

const createCatalogAuditLog = async ({
    posRepository,
    user,
    item,
    eventType,
    action = 'UPDATE',
    changes = {}
}) => posRepository.createAuditLog({
    user_id: parsePositiveInt(user?.user_id),
    actor_username: String(user?.username || '').trim() || null,
    entity_type: eventType.includes('image') ? 'item_catalog_image' : 'pos_catalog_override',
    entity_id: parsePositiveInt(item?.item_id || changes.item_id),
    action,
    event_type: eventType,
    changes: {
        event: eventType,
        item_id: parsePositiveInt(item?.item_id || changes.item_id),
        item_name: String(item?.name || '').trim() || null,
        surface: 'pos',
        ...changes
    }
});

const buildPersistedZReadingData = ({
    snapshot,
    businessDate,
    locationId,
    snapshotReused = false
}) => {
    const normalizedSummary = normalizeZReadingSummary(
        normalizeJsonObject(snapshot?.summary, {})
    );
    const zCounterValue = Number.parseInt(snapshot?.z_counter_value || 0, 10);
    const resetCounterValue = Number.parseInt(snapshot?.reset_counter_value || 0, 10);
    const lifetimeGrandTotalCents = Number.parseInt(snapshot?.lifetime_grand_total_cents || 0, 10);

    return {
        business_date: businessDate,
        location_id: parsePositiveInt(snapshot?.location_id) || parsePositiveInt(locationId) || null,
        generated_at: snapshot?.generated_at || snapshot?.created_at || new Date().toISOString(),
        summary: normalizedSummary,
        snapshot_persisted: true,
        reading_identifier: snapshot?.reading_identifier || null,
        snapshot_reused: snapshotReused,
        idempotent_replay: snapshotReused,
        replay_outcome: snapshotReused ? 'existing_snapshot' : 'new_snapshot',
        closed_by_user_id: parsePositiveInt(snapshot?.closed_by_user_id),
        closed_from_terminal_id: String(snapshot?.closed_from_terminal_id || '').trim() || null,
        day_close_pin_confirmed_at: snapshot?.day_close_pin_confirmed_at || null,
        counters: {
            z_counter: zCounterValue,
            reset_counter: resetCounterValue,
            lifetime_grand_total_cents: lifetimeGrandTotalCents,
            lifetime_grand_total: fromCurrencyCents(lifetimeGrandTotalCents)
        }
    };
};

const serializeOpenDayCloseShifts = (openShifts = []) => (
    Array.isArray(openShifts)
        ? openShifts.map((shift) => ({
            shift_id: parsePositiveInt(shift?.pos_terminal_shift_id),
            terminal_id: String(shift?.terminal_id || '').trim() || null,
            cashier_name: String(shift?.cashier?.username || shift?.cashier?.email || '').trim() || null,
            opened_at: shift?.opened_at || null
        }))
        : []
);

const buildDayCloseReadinessData = ({
    businessDate,
    locationId,
    openShifts = [],
    existingSnapshot = null
}) => {
    const serializedOpenShifts = serializeOpenDayCloseShifts(openShifts);
    const alreadyClosed = Boolean(existingSnapshot);
    return {
        business_date: businessDate,
        location_id: parsePositiveInt(locationId),
        ready: alreadyClosed || serializedOpenShifts.length === 0,
        already_closed: alreadyClosed,
        open_shift_count: serializedOpenShifts.length,
        open_shifts: serializedOpenShifts,
        reading_identifier: existingSnapshot?.reading_identifier || null,
        generated_at: existingSnapshot?.generated_at || existingSnapshot?.created_at || null
    };
};

const isUniqueConstraintError = (error) => (
    error?.name === 'SequelizeUniqueConstraintError'
    || error?.original?.code === 'ER_DUP_ENTRY'
    || error?.parent?.code === 'ER_DUP_ENTRY'
);

const parseBooleanSetting = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0' || normalized === '') return false;
    }
    return false;
};

const sanitizeTerminalId = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return '';
    return TERMINAL_ID_PATTERN.test(normalized) ? normalized : '';
};

const parseTerminalRegistryFromSettings = (settings = {}) => {
    let rawRegistry = settings?.pos_terminal_registry?.value;
    if (typeof rawRegistry === 'string') {
        try {
            rawRegistry = JSON.parse(rawRegistry);
        } catch {
            rawRegistry = [];
        }
    }
    if (!Array.isArray(rawRegistry)) return [];

    const seen = new Set();
    const normalized = [];
    for (const entry of rawRegistry) {
        const terminalId = sanitizeTerminalId(entry?.terminal_id);
        if (!terminalId || seen.has(terminalId)) continue;
        if (entry?.is_active === false) continue;
        seen.add(terminalId);
        normalized.push({
            terminal_id: terminalId,
            label: String(entry?.label || '').trim(),
            location_id: parsePositiveInt(entry?.location_id)
        });
    }
    return normalized;
};

const resolveTerminalPolicyModeFromSettings = (settings = {}) => {
    const rawMode = String(settings?.pos_terminal_registry_mode?.value || '')
        .trim()
        .toLowerCase();
    return TERMINAL_POLICY_MODES.has(rawMode) ? rawMode : 'warn';
};

const resolveTerminalIdentityPolicySettings = async ({ posRepository, settings = {}, options = {} }) => {
    if (typeof posRepository?.getTerminalIdentityPolicySettings === 'function') {
        const resolved = await posRepository.getTerminalIdentityPolicySettings(options);
        const mode = TERMINAL_POLICY_MODES.has(String(resolved?.mode || '').trim().toLowerCase())
            ? String(resolved.mode).trim().toLowerCase()
            : 'warn';
        const activeRegistry = Array.isArray(resolved?.active_registry)
            ? resolved.active_registry
                .map((entry) => ({
                    terminal_id: sanitizeTerminalId(entry?.terminal_id),
                    label: String(entry?.label || '').trim(),
                    location_id: parsePositiveInt(entry?.location_id)
                }))
                .filter((entry) => entry.terminal_id)
            : [];

        return {
            mode,
            active_registry: activeRegistry,
            binding_enforced: resolved?.binding_enforced === true
        };
    }

    return {
        mode: resolveTerminalPolicyModeFromSettings(settings),
        active_registry: parseTerminalRegistryFromSettings(settings),
        binding_enforced: parseBooleanSetting(
            settings?.pos_terminal_location_binding_enforced?.value
        )
    };
};

const evaluateTerminalIdentityPolicy = ({ terminalId, policy = {}, operation }) => {
    const sanitizedTerminalId = sanitizeTerminalId(terminalId);
    const mode = TERMINAL_POLICY_MODES.has(String(policy?.mode || '').trim().toLowerCase())
        ? String(policy.mode).trim().toLowerCase()
        : 'warn';
    const activeRegistry = Array.isArray(policy?.active_registry)
        ? policy.active_registry
            .map((entry) => ({
                terminal_id: sanitizeTerminalId(entry?.terminal_id),
                label: String(entry?.label || '').trim(),
                location_id: parsePositiveInt(entry?.location_id)
            }))
            .filter((entry) => entry.terminal_id)
        : [];
    const registryByTerminalId = new Map(activeRegistry.map((entry) => [entry.terminal_id, entry]));
    const allowedTerminalIds = new Set(Array.from(registryByTerminalId.keys()));
    const context = {
        operation: String(operation || '').trim() || null,
        mode,
        terminal_id: sanitizedTerminalId || null,
        registry_size: activeRegistry.length,
        reason_code: TERMINAL_POLICY_ALLOWED_REASON_CODE,
        warning: null,
        registry_entry: sanitizedTerminalId ? (registryByTerminalId.get(sanitizedTerminalId) || null) : null
    };

    if (mode === 'enforce') {
        if (activeRegistry.length === 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Terminal registry enforcement is active, but no active terminal entries are configured.',
                {
                    statusCode: 422,
                    details: {
                        terminal_identity_policy: {
                            ...context,
                            reason_code: TERMINAL_POLICY_REASON_CODES.REGISTRY_REQUIRED
                        }
                    }
                }
            );
        }
        if (!sanitizedTerminalId) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'terminal_id is required when terminal registry enforcement is active.',
                {
                    statusCode: 422,
                    details: {
                        terminal_identity_policy: {
                            ...context,
                            reason_code: TERMINAL_POLICY_REASON_CODES.TERMINAL_ID_REQUIRED
                        }
                    }
                }
            );
        }
        if (!allowedTerminalIds.has(sanitizedTerminalId)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `terminal_id "${sanitizedTerminalId}" is not an active registry terminal.`,
                {
                    statusCode: 422,
                    details: {
                        terminal_identity_policy: {
                            ...context,
                            reason_code: TERMINAL_POLICY_REASON_CODES.TERMINAL_NOT_REGISTERED
                        }
                    }
                }
            );
        }
        return context;
    }

    if (!sanitizedTerminalId) {
        return {
            ...context,
            reason_code: TERMINAL_POLICY_REASON_CODES.WARN_MISSING_ID,
            warning: {
                reason_code: TERMINAL_POLICY_REASON_CODES.WARN_MISSING_ID,
                message: 'terminal_id is missing; operations continue in warn mode.'
            }
        };
    }

    if (activeRegistry.length > 0 && !allowedTerminalIds.has(sanitizedTerminalId)) {
        return {
            ...context,
            reason_code: TERMINAL_POLICY_REASON_CODES.WARN_UNREGISTERED_ID,
            warning: {
                reason_code: TERMINAL_POLICY_REASON_CODES.WARN_UNREGISTERED_ID,
                message: `terminal_id "${sanitizedTerminalId}" is not an active registry terminal; operation allowed in warn mode.`
            }
        };
    }

    return context;
};

const parseUserPermissions = (user) => {
    if (!user) return [];
    if (Array.isArray(user.permissions)) return user.permissions;
    if (typeof user.permissions === 'string') {
        try {
            const parsed = JSON.parse(user.permissions);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const hasPermission = (user, permission) => {
    if (!user) return false;
    if (user.is_master_admin) return true;
    return parseUserPermissions(user).includes(permission);
};

const isPosAdminOperator = (user = {}) => (
    user?.is_master_admin === true
    || user?.is_master_admin === 1
    || user?.is_master_admin === '1'
    || String(user?.role || '').trim().toLowerCase() === 'admin'
);

const buildLocationScopeDeniedError = ({ message, reasonCode, statusCode = 403, details = {} }) => (
    new DomainError(
        statusCode === 403 ? DomainErrorCode.AUTHORIZATION_FAILED : DomainErrorCode.VALIDATION_FAILED,
        message,
        {
            statusCode,
            details: {
                reason_code: reasonCode,
                ...details
            }
        }
    )
);

const mapLocationScopeResolutionError = (error, { requestedLocationId = null, operationLabel = 'POS read operation' } = {}) => {
    const statusCode = Number.parseInt(error?.statusCode || 0, 10);
    if (statusCode === 403 || statusCode === 404) {
        logger.warn('[POS][LocationScope] Access denied during scope resolution', {
            operation_label: operationLabel,
            requested_location_id: requestedLocationId || null,
            status_code: statusCode
        });
        throw buildLocationScopeDeniedError({
            message: `Access denied for ${operationLabel} location scope.`,
            reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_ACCESS_DENIED,
            statusCode: 403,
            details: {
                location_id: requestedLocationId || null
            }
        });
    }
    if (statusCode === 422) {
        logger.warn('[POS][LocationScope] Explicit location context required', {
            operation_label: operationLabel,
            requested_location_id: requestedLocationId || null,
            status_code: statusCode
        });
        throw buildLocationScopeDeniedError({
            message: `${operationLabel} requires an explicit location context.`,
            reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_CONTEXT_REQUIRED,
            statusCode: 422,
            details: {
                location_id: requestedLocationId || null
            }
        });
    }
    throw error;
};

const resolvePosReadLocationScope = async ({
    requestedLocationId = null,
    userId = null,
    transaction = null,
    operationLabel = 'POS read operation',
    allowNullWhenUnresolved = false
} = {}) => {
    const normalizedRequestedLocationId = requestedLocationId == null
        ? null
        : parsePositiveInt(requestedLocationId);

    if (requestedLocationId != null && !normalizedRequestedLocationId) {
        throw buildLocationScopeDeniedError({
            message: 'location_id must be a positive integer',
            reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_CONTEXT_REQUIRED,
            statusCode: 422
        });
    }

    let resolvedLocation = null;
    try {
        resolvedLocation = await resolveMovementLocation({
            requestedLocationId: normalizedRequestedLocationId,
            userId,
            transaction,
            lock: Boolean(transaction),
            operationLabel
        });
    } catch (error) {
        if (allowNullWhenUnresolved && normalizedRequestedLocationId == null) {
            return {
                location_id: null,
                location: null
            };
        }
        mapLocationScopeResolutionError(error, {
            requestedLocationId: normalizedRequestedLocationId,
            operationLabel
        });
    }

    const resolvedLocationId = parsePositiveInt(resolvedLocation?.location_id);
    if (!resolvedLocationId) {
        logger.warn('[POS][LocationScope] Unable to resolve location scope', {
            operation_label: operationLabel,
            requested_location_id: normalizedRequestedLocationId || null
        });
        throw buildLocationScopeDeniedError({
            message: `${operationLabel} could not resolve a location scope.`,
            reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
            statusCode: 422
        });
    }

    return {
        location_id: resolvedLocationId,
        location: resolvedLocation ? toSerializable(resolvedLocation) : null
    };
};

export const resolvePosOperationalLocationScope = async ({
    requestedLocationId = null,
    userId = null,
    transaction = null,
    operationLabel = 'POS operation',
    allowNullWhenUnresolved = false
} = {}) => {
    const normalizedRequestedLocationId = requestedLocationId == null
        ? null
        : parsePositiveInt(requestedLocationId);

    if (requestedLocationId != null && !normalizedRequestedLocationId) {
        throw buildLocationScopeDeniedError({
            message: 'location_id must be a positive integer',
            reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_CONTEXT_REQUIRED,
            statusCode: 422
        });
    }

    let resolvedLocation = null;
    try {
        resolvedLocation = await resolveMovementLocation({
            requestedLocationId: normalizedRequestedLocationId,
            userId,
            transaction,
            lock: Boolean(transaction),
            operationLabel
        });
    } catch (error) {
        if (allowNullWhenUnresolved && normalizedRequestedLocationId == null) {
            return {
                location_id: null,
                location: null
            };
        }
        mapLocationScopeResolutionError(error, {
            requestedLocationId: normalizedRequestedLocationId,
            operationLabel
        });
    }

    const resolvedLocationId = parsePositiveInt(resolvedLocation?.location_id);
    if (!resolvedLocationId && !allowNullWhenUnresolved) {
        logger.warn('[POS][LocationScope] Unable to resolve operational location scope', {
            operation_label: operationLabel,
            requested_location_id: normalizedRequestedLocationId || null
        });
        throw buildLocationScopeDeniedError({
            message: `${operationLabel} could not resolve a location scope.`,
            reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
            statusCode: 422
        });
    }

    return {
        location_id: resolvedLocationId || null,
        location: resolvedLocation ? toSerializable(resolvedLocation) : null
    };
};

const enforceTerminalHomeLocationPolicy = ({
    bindingEnforced = false,
    terminalPolicyContext = {},
    targetLocationId = null
} = {}) => {
    const normalizedTargetLocationId = parsePositiveInt(targetLocationId);
    const terminalHomeLocationId = parsePositiveInt(terminalPolicyContext?.registry_entry?.location_id);

    if (!normalizedTargetLocationId) return null;
    if (!bindingEnforced) return normalizedTargetLocationId;

    if (!terminalHomeLocationId) {
        throw buildLocationScopeDeniedError({
            message: 'Terminal home location is not configured for enforced location binding.',
            reasonCode: LOCATION_SCOPE_REASON_CODES.TERMINAL_HOME_LOCATION_REQUIRED,
            statusCode: 422,
            details: {
                terminal_id: terminalPolicyContext?.terminal_id || null
            }
        });
    }
    if (normalizedTargetLocationId !== terminalHomeLocationId) {
        throw buildLocationScopeDeniedError({
            message: 'Target location does not match terminal home location policy.',
            reasonCode: LOCATION_SCOPE_REASON_CODES.TERMINAL_HOME_LOCATION_MISMATCH,
            statusCode: 403,
            details: {
                terminal_id: terminalPolicyContext?.terminal_id || null,
                terminal_home_location_id: terminalHomeLocationId,
                target_location_id: normalizedTargetLocationId
            }
        });
    }

    return normalizedTargetLocationId;
};

// Phase 228 (#1273/#1271): exported (no behavior change) so
// buildDispatchDeliveryRunUseCase (deliveryRunUseCases.js) can reuse the same per-order
// fulfillment-status guard chain the per-order online-order status endpoint uses, rather than
// forking a second copy of ONLINE_FULFILLMENT_TRANSITIONS.
export const normalizeOnlineFulfillmentStatus = (value) => {
    const status = String(value || '').trim();
    return ONLINE_FULFILLMENT_STATUSES.includes(status) ? status : null;
};

export const validateOnlineOrderTransition = ({ currentStatus, nextStatus, orderMethod }) => {
    if (currentStatus === nextStatus) {
        return;
    }

    const allowedStatuses = ONLINE_FULFILLMENT_TRANSITIONS[currentStatus] || [];
    if (!allowedStatuses.includes(nextStatus)) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Invalid fulfillment transition: ${currentStatus} -> ${nextStatus}`,
            {
                statusCode: 409,
                details: {
                    order_lifecycle: {
                        reason_code: 'ORDER_STATUS_TRANSITION_INVALID',
                        current_status: currentStatus,
                        requested_status: nextStatus,
                        allowed_next_statuses: allowedStatuses
                    }
                }
            }
        );
    }

    if (nextStatus === 'out_for_delivery' && orderMethod !== 'delivery') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Only delivery orders can transition to out_for_delivery',
            {
                statusCode: 409,
                details: {
                    order_lifecycle: {
                        reason_code: 'ORDER_METHOD_DELIVERY_REQUIRED',
                        current_status: currentStatus,
                        requested_status: nextStatus,
                        order_method: orderMethod
                    }
                }
            }
        );
    }

    if (nextStatus === 'ready_for_pickup' && orderMethod === 'delivery') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Delivery orders must transition to out_for_delivery instead of ready_for_pickup',
            {
                statusCode: 409,
                details: {
                    order_lifecycle: {
                        reason_code: 'ORDER_METHOD_PICKUP_REQUIRED',
                        current_status: currentStatus,
                        requested_status: nextStatus,
                        order_method: orderMethod
                    }
                }
            }
        );
    }
};

const assertDeliveryCompletionReadiness = (order) => {
    const deliveryJob = order?.deliveryJob || {};
    const deliveryJobStatus = String(deliveryJob.status || '').trim().toLowerCase();
    if (deliveryJobStatus !== 'delivered') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Delivery orders can be completed only after the delivery job is marked delivered.',
            {
                statusCode: 409,
                details: {
                    order_lifecycle: {
                        reason_code: 'DELIVERY_JOB_NOT_DELIVERED',
                        delivery_job_status: deliveryJobStatus || null
                    }
                }
            }
        );
    }

    const deliveryProvider = String(deliveryJob.provider || 'manual').trim().toLowerCase();
    if (deliveryProvider === 'manual') {
        const hasPersonnel = Boolean(
            parsePositiveInt(deliveryJob.delivery_personnel_id)
            || String(deliveryJob.delivery_personnel_name || '').trim()
        );
        const hasAssignment = Boolean(
            hasPersonnel
            && parsePositiveInt(deliveryJob.assigned_by)
            && parsePositiveInt(deliveryJob.assigned_shift_id)
            && deliveryJob.assigned_at
        );
        if (!hasAssignment) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Manual delivery orders require a delivery-person assignment before completion.',
                {
                    statusCode: 409,
                    details: {
                        order_lifecycle: {
                            reason_code: 'DELIVERY_ASSIGNMENT_REQUIRED'
                        }
                    }
                }
            );
        }
    }

    const paymentStatus = String(order?.payment_status || '').trim().toLowerCase();

    // Phase 148 (#825): completion requires a zero balance, not merely a `paid` label. Before this
    // there was no way to reach `paid` on a downpayment order at all, so `paid` and "fully settled"
    // were the same thing by construction; now that staff can settle a balance, the two can
    // disagree if anything ever writes one without the other, and completion must follow the money.
    const outstandingBalance = round4(order?.balance_due);
    if (outstandingBalance > 0) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Delivery orders must have a fully settled balance before completion.',
            {
                statusCode: 409,
                details: {
                    order_lifecycle: {
                        reason_code: 'DELIVERY_BALANCE_DUE_OUTSTANDING',
                        balance_due: outstandingBalance,
                        payment_status: paymentStatus || null
                    }
                }
            }
        );
    }

    if (!isCodDelivery({
        orderMethod: order?.order_method,
        paymentType: order?.payment_type,
        paymentTiming: order?.payment_timing
    })) {
        if (paymentStatus !== 'paid') {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Delivery orders must have verified payment before completion.',
                {
                    statusCode: 409,
                    details: {
                        order_lifecycle: {
                            reason_code: 'DELIVERY_PAYMENT_REQUIRED',
                            payment_status: paymentStatus || null
                        }
                    }
                }
            );
        }
        return;
    }

    // Phase 148 (#825): a downpayment order is persisted as COD (payment_type forced to 'cash' by
    // Phase 141, because the balance IS collected in person), so it lands in this branch too -- but
    // its balance may have been settled by a merchant-owned digital tender, which legitimately has
    // no cash_received/change_amount to show (ADR 0063 clause 5 [binding]: never claim what didn't
    // happen). Discriminate on amount_paid: only an order that captured money online carries a
    // nonzero amount_paid, since resolveStorefrontPaymentSnapshot's non-capture branch never sets
    // it and the column defaults to 0. A plain COD order therefore keeps the original, unchanged
    // rule -- pinned by test, so this discriminator cannot rot silently.
    const settledFromDownpayment = round4(order?.amount_paid) > 0;
    const hasStaffCollectionAttribution = Boolean(order?.payment_collected_at
        && parsePositiveInt(order?.payment_collected_by)
        && parsePositiveInt(order?.payment_collected_shift_id)
        && String(order?.payment_collected_terminal_id || '').trim());
    const hasCollectionEvidence = Boolean(paymentStatus === 'paid'
        && hasStaffCollectionAttribution
        && (settledFromDownpayment || (order?.cash_received != null && order?.change_amount != null)));

    if (!hasCollectionEvidence) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'COD delivery orders must have server-recorded cash payment before completion.',
            {
                statusCode: 409,
                details: {
                    order_lifecycle: {
                        reason_code: 'DELIVERY_COD_PAYMENT_REQUIRED',
                        payment_status: paymentStatus || null
                    }
                }
            }
        );
    }
};

const buildShiftClosedError = () => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    'You cannot use the POS because the shift is closed.',
    {
        statusCode: 422,
        details: {
            reason_code: 'POS_SHIFT_CLOSED'
        }
    }
);
const resolvePairingIdentityStatus = async ({ tenantId, user }) => {
    const status = await getDgfyLegacyLinkStatus({ tenantId, user });
    if (status.dgfy_link_status === 'linked') {
        const { DgfyAccount } = await import('../../../models/index.js');
        const account = status.dgfy_account_id
            ? await DgfyAccount.findByPk(status.dgfy_account_id)
            : null;
        if (!account || account.is_active !== true || account.deleted_at) {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'The linked DGFY account is inactive or unavailable.',
                { statusCode: 403, details: { reason_code: 'POS_PAIRING_DGFY_ACCOUNT_INACTIVE' } }
            );
        }
        return {
            identity_mode: 'dgfy_membership',
            membership_id: status.dgfy_membership_id
        };
    }
    if (status.can_legacy_login === true) {
        return {
            identity_mode: 'legacy_grace',
            membership_id: null
        };
    }
    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'A current DGFY membership or active legacy-grace identity is required for POS pairing.',
        { statusCode: 403, details: { reason_code: 'POS_PAIRING_IDENTITY_INVALID' } }
    );
};

const resolvePosOperatorIdentityStatus = async ({ tenantId, user }) => {
    try {
        return await resolvePairingIdentityStatus({ tenantId, user });
    } catch (error) {
        if (error instanceof DomainError && error?.details?.reason_code === 'POS_PAIRING_IDENTITY_INVALID') {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'A current DGFY membership or active legacy-grace identity is required for POS terminal use.',
                { statusCode: 403, details: { reason_code: 'POS_OPERATOR_IDENTITY_INVALID' } }
            );
        }
        throw error;
    }
};

const assertPosOperatorIdentity = async ({ tenantId, user, resolveIdentityStatus = resolvePosOperatorIdentityStatus }) => {
    const userId = parsePositiveInt(user?.user_id);
    if (!userId || !tenantId || tenantId === 'default') {
        throw new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'Authenticated tenant user is required for POS terminal use.',
            { statusCode: 401 }
        );
    }
    if (user?.is_active === false || user?.deleted_at) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Active tenant user profile is required for POS terminal use.',
            { statusCode: 403, details: { reason_code: 'POS_OPERATOR_PROFILE_INACTIVE' } }
        );
    }
    return resolveIdentityStatus({ tenantId, user });
};

const requireRegisteredTerminalContext = ({ terminalId, policy = {}, operation }) => {
    const context = evaluateTerminalIdentityPolicy({ terminalId, policy, operation });
    if (!Array.isArray(policy?.active_registry) || policy.active_registry.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'At least one active terminal must be configured before POS terminal use.',
            {
                statusCode: 422,
                details: {
                    terminal_identity_policy: {
                        ...context,
                        reason_code: TERMINAL_POLICY_REASON_CODES.REGISTRY_REQUIRED
                    }
                }
            }
        );
    }
    if (!context.terminal_id) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'terminal_id is required for POS terminal use.',
            {
                statusCode: 422,
                details: {
                    terminal_identity_policy: {
                        ...context,
                        reason_code: TERMINAL_POLICY_REASON_CODES.TERMINAL_ID_REQUIRED
                    }
                }
            }
        );
    }
    if (!context.registry_entry) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `terminal_id "${context.terminal_id}" is not an active registry terminal.`,
            {
                statusCode: 422,
                details: {
                    terminal_identity_policy: {
                        ...context,
                        reason_code: TERMINAL_POLICY_REASON_CODES.TERMINAL_NOT_REGISTERED
                    }
                }
            }
        );
    }
    if (!parsePositiveInt(context.registry_entry.location_id)) {
        throw buildLocationScopeDeniedError({
            message: 'Terminal home location is not configured.',
            reasonCode: LOCATION_SCOPE_REASON_CODES.TERMINAL_HOME_LOCATION_REQUIRED,
            statusCode: 422,
            details: {
                terminal_id: context.terminal_id
            }
        });
    }
    return {
        ...context,
        reason_code: TERMINAL_POLICY_ALLOWED_REASON_CODE,
        warning: null
    };
};

const requirePosPermissionForPairing = (user) => {
    if (user?.is_master_admin === true) return;
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    if (permissions.includes('pos:view') || permissions.includes('pos:transact')) return;
    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'POS permission is required for terminal pairing.',
        { statusCode: 403, details: { reason_code: 'POS_PAIRING_PERMISSION_DENIED' } }
    );
};

export const buildVerifyPosTerminalUseCase = ({
    posRepository,
    terminalPairingService,
    resolveIdentityStatus = resolvePairingIdentityStatus,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ payload = {}, user = null } = {}) => {
        try {
            const userId = parsePositiveInt(user?.user_id);
            const tenantId = String(dbStore.getStore()?.tenantId || '').trim();
            const terminalId = sanitizeTerminalId(payload.terminal_id);
            if (!userId || !tenantId || tenantId === 'default') {
                throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated tenant user is required.', { statusCode: 401 });
            }
            if (!terminalId) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Terminal ID is required.', { statusCode: 422 });
            }
            if (user?.is_master_admin !== true) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Only the company master admin can pair a POS device.', {
                    statusCode: 403,
                    details: { reason_code: 'POS_TERMINAL_PAIRING_ADMIN_REQUIRED' }
                });
            }
            requirePosPermissionForPairing(user);

            const policy = await posRepository.getTerminalPairingPolicySettings();
            const entry = (policy.active_registry || []).find((candidate) => candidate.terminal_id === terminalId);
            if (!entry || entry.is_active === false) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The selected terminal is not active.', {
                    statusCode: 403,
                    details: { reason_code: 'POS_TERMINAL_INACTIVE_OR_UNKNOWN' }
                });
            }
            if (!parsePositiveInt(entry.location_id)) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The selected terminal has no assigned location.', {
                    statusCode: 422,
                    details: { reason_code: 'POS_TERMINAL_LOCATION_REQUIRED' }
                });
            }
            if (!entry.pairing_version) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Save the terminal registry before pairing this device.', {
                    statusCode: 422,
                    details: { reason_code: 'POS_TERMINAL_PAIRING_VERSION_REQUIRED' }
                });
            }

            await resolveLocationScope({
                requestedLocationId: entry.location_id,
                userId,
                operationLabel: 'POS terminal pairing'
            });
            const identity = await resolveIdentityStatus({ tenantId, user });
            const pairingToken = terminalPairingService.issue({
                tenantId,
                terminalId,
                pairingVersion: entry.pairing_version,
                locationId: entry.location_id
            });

            return ok({
                pairing_token: pairingToken,
                paired: true,
                terminal_id: terminalId,
                location_id: entry.location_id,
                terminal_label: entry.label || terminalId,
                identity_mode: identity.identity_mode
            }, 'Terminal paired');
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to pair POS terminal'));
        }
    };
};

export const buildGetPairedPosTerminalUseCase = ({
    posRepository,
    resolveIdentityStatus = resolvePairingIdentityStatus,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ terminalId = '', user = null } = {}) => {
        try {
            const userId = parsePositiveInt(user?.user_id);
            const tenantId = String(dbStore.getStore()?.tenantId || '').trim();
            if (!userId || !tenantId || tenantId === 'default') {
                throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated tenant user is required.', { statusCode: 401 });
            }
            requirePosPermissionForPairing(user);
            const normalizedTerminalId = sanitizeTerminalId(terminalId);
            if (!normalizedTerminalId) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A registered terminal ID is required.', {
                    statusCode: 422,
                    details: { reason_code: 'POS_TERMINAL_ID_REQUIRED' }
                });
            }
            const policy = await posRepository.getTerminalPairingPolicySettings();
            const entry = (policy.active_registry || []).find((candidate) => candidate.terminal_id === normalizedTerminalId);
            if (!entry || entry.is_active === false || !parsePositiveInt(entry.location_id)) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The selected terminal is not active or registered for this business.', {
                    statusCode: 403,
                    details: { reason_code: 'POS_TERMINAL_INACTIVE_OR_UNKNOWN' }
                });
            }

            const identity = await resolveIdentityStatus({ tenantId, user });
            await resolveLocationScope({
                requestedLocationId: entry.location_id,
                userId,
                operationLabel: 'registered POS terminal use'
            });

            return ok({
                registered: true,
                terminal_id: entry.terminal_id,
                location_id: entry.location_id,
                terminal_label: entry.label || entry.terminal_id,
                identity_mode: identity.identity_mode
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to verify registered POS terminal'));
        }
    };
};

export const assertOpenShiftForPosMutation = async ({
    posRepository,
    cashierId,
    shiftId = null,
    terminalId = null,
    locationId = null,
    authorizedOperatorUserId = null,
    shiftOwnerCashierId = null,
    transaction = null,
    lock = true
} = {}) => {
    const normalizedCashierId = parsePositiveInt(cashierId);
    if (!normalizedCashierId) {
        throw new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'Authenticated POS user is required',
            { statusCode: 401 }
        );
    }

    const normalizedShiftId = parsePositiveInt(shiftId);
    const normalizedShiftOwnerCashierId = parsePositiveInt(shiftOwnerCashierId) || normalizedCashierId;
    if (shiftId != null && !normalizedShiftId) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'shift_id must be a positive integer when provided',
            { statusCode: 422 }
        );
    }

    const options = transaction ? { transaction, lock } : {};
    const shift = normalizedShiftId
        ? await posRepository.getTerminalShiftById(normalizedShiftId, options)
        : await posRepository.findOpenTerminalShift({
            terminalId: terminalId || null,
            cashierId: normalizedShiftOwnerCashierId,
            locationId: locationId || null
        }, options);

    if (!shift || shift.status !== 'open') {
        throw buildShiftClosedError();
    }
    const normalizedAuthorizedOperatorUserId = parsePositiveInt(authorizedOperatorUserId);
    if (Number(shift.cashier_id) !== normalizedShiftOwnerCashierId
        && normalizedAuthorizedOperatorUserId !== normalizedCashierId) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Shift does not belong to the authenticated cashier.',
            { statusCode: 403 }
        );
    }
    if (terminalId && String(shift.terminal_id) !== String(terminalId)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Shift terminal_id does not match POS terminal_id.',
            { statusCode: 422 }
        );
    }
    const shiftLocationId = parsePositiveInt(shift.location_id);
    if (locationId && shiftLocationId && shiftLocationId !== Number(locationId)) {
        throw buildLocationScopeDeniedError({
            message: 'POS location must match active shift location.',
            reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
            statusCode: 422,
            details: {
                shift_id: shift.pos_terminal_shift_id,
                shift_location_id: shiftLocationId,
                pos_location_id: Number(locationId)
            }
        });
    }

    return toSerializable(shift);
};

// Phase 228 (#1273/#1271): exported (no behavior change) -- see normalizeOnlineFulfillmentStatus's
// own comment above for why.
export const buildOnlineOrderShiftAttributionPayload = ({ order = {}, activeShift = {} } = {}) => {
    const activeShiftId = parsePositiveInt(activeShift?.pos_terminal_shift_id);
    if (parsePositiveInt(order?.shift_id) || !activeShiftId) return {};

    // Storefront creates online orders outside POS, so they have no register
    // shift at creation time. The first POS handling action claims the order
    // for the active shift; later actions and payment collection preserve their
    // established accountability instead of moving the sale between shifts.
    return { shift_id: activeShiftId };
};

const buildOnlineOrderStockMovements = async ({ order = {}, posRepository, options = {} } = {}) => {
    const orderId = parsePositiveInt(order?.pos_transaction_id);
    if (!orderId) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Online order is missing a valid transaction identifier',
            { statusCode: 409 }
        );
    }

    const lines = Array.isArray(order?.lines) ? order.lines : [];
    if (lines.length === 0) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Online order is missing checkout lines for inventory deduction',
            { statusCode: 409 }
        );
    }

    const itemMap = new Map(lines
        .map((line) => {
            const itemId = parsePositiveInt(line?.item_id);
            return itemId
                ? [itemId, buildLineStockPolicySubject(line)]
                : null;
        })
        .filter(Boolean));
    const itemIds = [...itemMap.keys()];
    const productCompositions = itemIds.length > 0
        && typeof posRepository?.listProductCompositionsForItems === 'function'
        ? await posRepository.listProductCompositionsForItems(itemIds, {
            ...options,
            locationId: order.location_id || null
        })
        : [];
    const recipePlan = buildFnbRecipeConsumptionPlan({
        lines,
        itemMap,
        compositions: productCompositions,
        locationId: order.location_id || null
    });
    const effects = buildOnlineInventoryEffects({
        lines,
        itemMap,
        recipePlan,
        locationId: order.location_id || null,
        orderId,
        invoiceNumber: order.invoice_number || null,
        trackingPin: order.tracking_pin || null,
        strict: true
    });
    return effects.map((effect) => ({
        item_id: effect.item_id,
        quantity: effect.quantity,
        movement_type: 'goods_issue',
        location_id: effect.location_id || order.location_id || null,
        reference_type: 'POS',
        reference_id: effect.reference_id,
        notes: effect.notes
    }));
};

const executeInventoryStockCommand = async ({
    inventoryCommandService,
    command,
    movementData,
    userId,
    transaction
}) => {
    const commandFn = inventoryCommandService?.[command] || inventoryCommandService?.createStockMovement;
    if (typeof commandFn !== 'function') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Inventory stock command is unavailable: ${command}`,
            { statusCode: 409 }
        );
    }
    return commandFn(movementData, userId, transaction);
};

const getPosSettings = async () => unwrapApplicationResultOrThrow(
    await getAllSettingsUseCase(),
    'Failed to retrieve POS setup settings'
);

const POS_EMPLOYEE_DISCOUNT_SELF_APPROVAL_SETTING = 'pos_employee_discount_self_approval_enabled';

export const buildListPosDiscountEmployeesUseCase = ({ posRepository }) => {
    return async () => {
        try {
            const rows = await posRepository.listActiveDiscountEmployees();
            return ok({
                employees: rows.map((row) => ({
                    employee_id: Number(row.employee_id),
                    employee_code: String(row.employee_code || '').trim(),
                    full_name: String(row.full_name || '').trim(),
                    location_id: parsePositiveInt(row.location_id),
                    location_name: String(row.location?.name || '').trim() || 'All branches / unassigned'
                }))
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS discount employees'));
        }
    };
};

export const buildListPosDiscountApproversUseCase = ({ posRepository }) => {
    return async () => {
        try {
            const rows = await posRepository.listActiveDiscountApprovers();
            return ok({
                approvers: rows.map((row) => ({
                    user_id: Number(row.user_id),
                    username: String(row.username || '').trim(),
                    role: String(row.role || '').trim().toLowerCase(),
                    is_master_admin: row.is_master_admin === true,
                    can_authorize_discounts: row.can_authorize_discounts === true,
                    pos_approval_pin_configured: row.pos_approval_pin_configured === true
                }))
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS discount approvers'));
        }
    };
};

export const buildVerifyPosDiscountApprovalUseCase = ({ posRepository }) => {
    return async ({ payload = {}, user = null } = {}) => {
        try {
            const approverId = parsePositiveInt(payload.approver_user_id);
            if (!approverId) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'approver_user_id is required', { statusCode: 422 });
            }
            const discountType = String(payload.discount_type || '').trim().toLowerCase();
            const employeeDirectoryId = parsePositiveInt(payload.employee_directory_id);
            const employee = employeeDirectoryId
                ? await posRepository.findActiveDiscountEmployeeById(employeeDirectoryId)
                : null;
            if (employeeDirectoryId && !employee) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Employee does not match an active registered employee.', {
                    statusCode: 422,
                    details: { reason_code: 'EMPLOYEE_DIRECTORY_NOT_FOUND' }
                });
            }
            const settings = await getPosSettings();
            const approver = await posRepository.findActiveDiscountApproverById(approverId);
            const verified = await verifyPosDiscountApprover({
                approver,
                pin: payload.manager_pin,
                employeeUserId: parsePositiveInt(payload.employee_user_id),
                employeeDirectoryId,
                employeeEmail: employee?.email,
                allowSelfApproval: discountType === 'employee'
                    && settingBoolean(settings, POS_EMPLOYEE_DISCOUNT_SELF_APPROVAL_SETTING),
                applyingUserId: parsePositiveInt(user?.user_id)
            });
            return ok({ approver: verified });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'POS discount approval failed'));
        }
    };
};

const enforcePosComplianceReadiness = (settings = {}) => {
    // Legacy strict toggle is retired. Dual-mode compliance policy is now the
    // single source of truth for fiscal and non-fiscal runtime enforcement.
    void settings;
};

const parseDiscountProfiles = (settings = {}) => {
    let profiles = settings?.pos_discount_profiles?.value;
    if (typeof profiles === 'string') {
        try {
            profiles = JSON.parse(profiles);
        } catch {
            profiles = [];
        }
    }
    if (!Array.isArray(profiles)) return [];
    return profiles
        .map((profile) => ({
            name: String(profile?.name || '').trim(),
            percentage: round4(Number(profile?.percentage || 0)),
            active: profile?.active !== false
        }))
        .filter((profile) => profile.active && profile.name.length > 0);
};

const resolveCheckoutServiceFee = () => {
    // POS checkout is always in-store. DGFY convenience fees are calculated only
    // by the Storefront online-order flow, never from a cashier transaction.
    return {
        serviceFeeAmount: 0,
        serviceFeeLabelSnapshot: null,
        serviceFeeMethodSnapshot: null,
        serviceFeeOverridden: false
    };
};

const parseSettingJsonValue = (settings = {}, key, fallback = null) => {
    const raw = settings?.[key]?.value;
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const normalizeFnbCourse = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return FNB_COURSES.has(normalized) ? normalized : null;
};

const normalizeFnbModifiersSnapshot = (value) => {
    if (!Array.isArray(value)) return null;
    return value
        .map((modifier) => {
            if (!isPlainObject(modifier)) return null;
            const optionName = String(modifier.option_name || modifier.name || '').trim();
            const groupName = String(modifier.group_name || modifier.group || '').trim();
            return {
                modifier_group_id: parsePositiveInt(modifier.modifier_group_id),
                modifier_option_id: parsePositiveInt(modifier.modifier_option_id),
                group_name: groupName || null,
                option_name: optionName || null,
                price_delta: round4(modifier.price_delta || 0),
                quantity: Math.min(99, Math.max(1, Number.parseInt(modifier.quantity || 1, 10) || 1)),
                sku_item_id: parsePositiveInt(modifier.sku_item_id),
                location_id: parsePositiveInt(modifier.location_id),
                allergen_notes: Array.isArray(modifier.allergen_notes) ? modifier.allergen_notes : null
            };
        })
        .filter((modifier) => (
            modifier
            && (
                modifier.modifier_group_id
                || modifier.modifier_option_id
                || modifier.group_name
                || modifier.option_name
                || modifier.price_delta
                || modifier.sku_item_id
            )
        ));
};

const normalizeServiceOptionIds = (value) => (
    [...new Set((Array.isArray(value) ? value : [])
        .map((optionId) => parsePositiveInt(optionId))
        .filter(Boolean))]
);

const buildServiceOptionsSnapshot = (selectedOptions = []) => (
    (Array.isArray(selectedOptions) ? selectedOptions : [])
        .map((option) => ({
            service_option_id: parsePositiveInt(option?.option_id),
            service_option_group_id: parsePositiveInt(option?.group_id),
            group_name: String(option?.group_name || '').trim() || null,
            option_name: String(option?.name || '').trim() || null,
            price_delta: round4((Number(option?.price_adjustment_centavos) || 0) / 100),
            duration_delta_minutes: Number.parseInt(option?.duration_adjustment_minutes || 0, 10) || 0
        }))
        .filter((option) => option.service_option_id && option.option_name)
);

const findModifierLocationOverride = (entry, locationId) => {
    const normalizedLocationId = parsePositiveInt(locationId);
    if (!normalizedLocationId) return null;
    const rows = Array.isArray(entry?.locationAvailability) ? entry.locationAvailability : [];
    return rows.find((row) => parsePositiveInt(row?.location_id) === normalizedLocationId) || null;
};

const resolveFnbLineModifiers = ({ item, line, hasFnbCheckoutContext, locationId }) => {
    const requestedModifiers = normalizeFnbModifiersSnapshot(line.line_modifiers || line.modifiers) || [];
    const groups = Array.isArray(item.fnbModifierGroups) ? item.fnbModifierGroups : [];
    if (!hasFnbCheckoutContext && requestedModifiers.length === 0) {
        return {
            modifiersSnapshot: null,
            modifierPriceDelta: 0
        };
    }
    if (groups.length === 0) {
        if (requestedModifiers.length > 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Item "${item.name}" does not have configured F&B modifier groups`,
                { statusCode: 422, details: { item_id: item.item_id } }
            );
        }
        return {
            modifiersSnapshot: null,
            modifierPriceDelta: 0
        };
    }

    const requestedByGroup = new Map();
    for (const modifier of requestedModifiers) {
        const groupId = parsePositiveInt(modifier.modifier_group_id);
        const optionId = parsePositiveInt(modifier.modifier_option_id);
        if (!groupId || !optionId) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier selections for "${item.name}" must include modifier_group_id and modifier_option_id`,
                { statusCode: 422, details: { item_id: item.item_id } }
            );
        }
        const entries = requestedByGroup.get(groupId) || [];
        if (entries.includes(optionId)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier option ${optionId} was selected more than once for "${item.name}"`,
                { statusCode: 422, details: { item_id: item.item_id, modifier_group_id: groupId, modifier_option_id: optionId } }
            );
        }
        entries.push(optionId);
        requestedByGroup.set(groupId, entries);
    }

    const snapshots = [];
    let modifierPriceDelta = 0;
    const requestedOptionIds = new Set(requestedModifiers.map((entry) => parsePositiveInt(entry.modifier_option_id)).filter(Boolean));
    for (const group of groups) {
        const groupId = parsePositiveInt(group.modifier_group_id);
        const parentOptionId = parsePositiveInt(group.parent_modifier_option_id);
        if (parentOptionId && !requestedOptionIds.has(parentOptionId)) {
            if ((requestedByGroup.get(groupId) || []).length > 0) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Modifier group "${group.display_name || group.name}" requires its parent option`, { statusCode: 422, details: { item_id: item.item_id, modifier_group_id: groupId, parent_modifier_option_id: parentOptionId } });
            requestedByGroup.delete(groupId);
            continue;
        }
        const groupLocation = findModifierLocationOverride(group, locationId);
        if (group.is_active === false || group.visible_in_pos === false || groupLocation?.is_available === false) {
            if ((requestedByGroup.get(groupId) || []).length > 0) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Modifier group "${group.display_name || group.name}" is unavailable at this POS location`, {
                    statusCode: 422,
                    details: { item_id: item.item_id, modifier_group_id: groupId, location_id: parsePositiveInt(locationId) }
                });
            }
            requestedByGroup.delete(groupId);
            continue;
        }
        const through = group.FnbItemModifierGroup || group.fnbItemModifierGroup || {};
        const required = through.is_required_override == null
            ? group.required === true
            : through.is_required_override === true;
        const minSelect = required ? Math.max(1, Number.parseInt(group.min_select || 0, 10) || 0) : 0;
        const maxSelect = Math.max(1, Number.parseInt(group.max_select || 1, 10) || 1);
        const selectedOptionIds = requestedByGroup.get(groupId) || [];
        if (selectedOptionIds.length < minSelect || selectedOptionIds.length > maxSelect) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier group "${group.display_name || group.name}" requires ${minSelect}-${maxSelect} selections`,
                {
                    statusCode: 422,
                    details: {
                        item_id: item.item_id,
                        modifier_group_id: groupId,
                        selected_count: selectedOptionIds.length,
                        min_select: minSelect,
                        max_select: maxSelect
                    }
                }
            );
        }
        const options = Array.isArray(group.options) ? group.options : [];
        for (const optionId of selectedOptionIds) {
            const option = options.find((entry) => Number(entry.modifier_option_id) === Number(optionId));
            const optionLocation = findModifierLocationOverride(option, locationId);
            if (!option || option.is_active === false || option.visible_in_pos === false || option.is_sold_out === true
                || optionLocation?.is_available === false || optionLocation?.is_sold_out === true) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Selected modifier option is not active for "${item.name}"`,
                    {
                        statusCode: 422,
                        details: { item_id: item.item_id, modifier_group_id: groupId, modifier_option_id: optionId }
                    }
                );
            }
            const priceDelta = round4(option.price_delta || 0);
            const requestedQuantity = requestedModifiers.find((entry) => parsePositiveInt(entry.modifier_option_id) === optionId)?.quantity;
            const selectedQuantity = Math.min(99, Math.max(1, Number.parseInt(requestedQuantity || 1, 10) || 1));
            modifierPriceDelta = round4(modifierPriceDelta + (priceDelta * selectedQuantity));
            snapshots.push({
                modifier_group_id: groupId,
                modifier_option_id: optionId,
                group_name: group.display_name || group.name || null,
                group_kind: group.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
                parent_modifier_option_id: parentOptionId,
                option_name: option.name || null,
                price_delta: priceDelta,
                quantity: selectedQuantity,
                extended_price_delta: round4(priceDelta * selectedQuantity),
                sku_item_id: parsePositiveInt(option.sku_item_id),
                location_id: parsePositiveInt(locationId),
                allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null
            });
        }
        requestedByGroup.delete(groupId);
    }

    if (requestedByGroup.size > 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `One or more modifier groups are not configured for "${item.name}"`,
            { statusCode: 422, details: { item_id: item.item_id, modifier_group_ids: Array.from(requestedByGroup.keys()) } }
        );
    }

    return {
        modifiersSnapshot: snapshots.length > 0 ? snapshots : null,
        modifierPriceDelta
    };
};

const normalizeRestaurantServiceChargeInput = ({ payload = {}, settings = {}, useSettings = true } = {}) => {
    const fromPayload = isPlainObject(payload.restaurant_service_charge)
        ? payload.restaurant_service_charge
        : null;
    const fromSettings = useSettings ? parseSettingJsonValue(settings, 'fnb_restaurant_service_charge', {}) : {};
    const source = fromPayload || fromSettings || {};
    const enabled = source.enabled === true;
    const rate = Math.min(100, Math.max(0, round4(source.rate || 0)));
    const amount = source.amount == null ? null : Math.max(0, round4(source.amount));
    const label = String(source.label || 'Restaurant service charge').trim().slice(0, 120) || 'Restaurant service charge';
    return {
        enabled,
        amount,
        label,
        rate,
        taxable: source.taxable === true,
        source: fromPayload ? 'payload' : 'settings'
    };
};

const resolveRestaurantServiceCharge = ({
    payload = {},
    settings = {},
    netItemsTotal = 0,
    useSettings = true
} = {}) => {
    const normalized = normalizeRestaurantServiceChargeInput({ payload, settings, useSettings });
    if (!normalized.enabled) {
        return {
            restaurantServiceChargeAmount: 0,
            restaurantServiceChargeLabelSnapshot: null,
            restaurantServiceChargeRateSnapshot: null,
            restaurantServiceChargeTaxable: false,
            restaurantServiceChargeSnapshot: null
        };
    }

    const amount = normalized.amount == null
        ? round4(netItemsTotal * (normalized.rate / 100))
        : round4(normalized.amount);

    return {
        restaurantServiceChargeAmount: amount,
        restaurantServiceChargeLabelSnapshot: amount > 0 ? normalized.label : null,
        restaurantServiceChargeRateSnapshot: amount > 0 ? normalized.rate : null,
        restaurantServiceChargeTaxable: normalized.taxable,
        restaurantServiceChargeSnapshot: amount > 0
            ? {
                enabled: true,
                label: normalized.label,
                rate: normalized.rate,
                taxable: normalized.taxable,
                source: normalized.source
            }
            : null
    };
};

const resolveCheckoutDiscount = ({ payload, subtotalAmount, settings }) => {
    const profileName = String(payload?.discount_profile_name || '').trim();
    const requestedDiscount = round4(payload?.discount_amount || 0);
    const requestedRate = payload?.discount_rate;
    const explicitDiscountMode = String(payload?.discount_mode || '').trim().toLowerCase();

    if (!profileName) {
        if (explicitDiscountMode === 'none') {
            if (requestedDiscount > 0 || requestedRate != null) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'discount_mode none cannot include discount values.',
                    { statusCode: 422 }
                );
            }
            return {
                discountAmount: 0,
                discountLabelSnapshot: null,
                discountRateSnapshot: null
            };
        }

        if (explicitDiscountMode === 'amount') {
            if (requestedRate != null) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'discount_mode amount cannot include discount_rate.',
                    { statusCode: 422 }
                );
            }
            return {
                discountAmount: Math.min(requestedDiscount, subtotalAmount),
                discountLabelSnapshot: requestedDiscount > 0 ? 'Other Discount' : null,
                discountRateSnapshot: null
            };
        }

        if (explicitDiscountMode === 'percentage') {
            if (requestedRate == null) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'discount_mode percentage requires discount_rate.',
                    { statusCode: 422 }
                );
            }
            const manualRate = round4(requestedRate);
            return {
                discountAmount: Math.min(round4(subtotalAmount * (manualRate / 100)), subtotalAmount),
                discountLabelSnapshot: manualRate > 0 ? 'Other Discount' : null,
                discountRateSnapshot: manualRate
            };
        }

        if (requestedDiscount > 0) {
            const manualRate = requestedRate == null ? null : round4(requestedRate);
            const manualDiscountAmount = manualRate == null
                ? requestedDiscount
                : round4(subtotalAmount * (manualRate / 100));
            return {
                discountAmount: Math.min(manualDiscountAmount, subtotalAmount),
                discountLabelSnapshot: 'Other Discount',
                discountRateSnapshot: manualRate
            };
        }
        if (requestedRate != null) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'manual discount_rate requires discount_amount.',
                { statusCode: 422 }
            );
        }
        return {
            discountAmount: 0,
            discountLabelSnapshot: null,
            discountRateSnapshot: null
        };
    }

    if (explicitDiscountMode && explicitDiscountMode !== 'preset') {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'discount_mode preset is required when discount_profile_name is provided.',
            { statusCode: 422 }
        );
    }

    const profiles = parseDiscountProfiles(settings);
    const selected = profiles.find((profile) => profile.name.toLowerCase() === profileName.toLowerCase());
    if (!selected) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Unknown or inactive discount profile: ${profileName}`,
            { statusCode: 422 }
        );
    }

    if (requestedRate != null) {
        const normalizedRate = round4(requestedRate);
        const expectedRate = round4(selected.percentage);
        if (Math.abs(normalizedRate - expectedRate) > 0.0001) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Discount rate mismatch for profile: ${selected.name}`,
                { statusCode: 422 }
            );
        }
    }

    return {
        discountAmount: Math.min(round4(subtotalAmount * (selected.percentage / 100)), subtotalAmount),
        discountLabelSnapshot: selected.name,
        discountRateSnapshot: round4(selected.percentage)
    };
};

const inferSpecialDiscountBeneficiaryCategory = (discountLabelSnapshot) => {
    const normalizedLabel = String(discountLabelSnapshot || '').trim().toLowerCase();
    if (!normalizedLabel) return null;

    if (normalizedLabel.includes('national') && normalizedLabel.includes('athlete')) {
        return 'national_athlete';
    }
    if (normalizedLabel.includes('senior')) {
        return 'senior';
    }
    if (normalizedLabel.includes('pwd')) {
        return 'pwd';
    }

    return null;
};

const normalizeDiscountBeneficiary = ({ payload = {}, discountLabelSnapshot = null }) => {
    const inferredCategory = inferSpecialDiscountBeneficiaryCategory(discountLabelSnapshot);
    const raw = payload?.discount_beneficiary;

    if (!raw || !isPlainObject(raw)) {
        if (inferredCategory) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Special discount profiles require discount beneficiary details',
                { statusCode: 422 }
            );
        }
        return null;
    }

    const category = String(raw.category || inferredCategory || '').trim().toLowerCase();
    const name = String(raw.name || '').trim();
    const idNumber = String(raw.id_number || '').trim();

    if (!SPECIAL_DISCOUNT_BENEFICIARY_TYPES.has(category)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'discount_beneficiary.category must be senior, pwd, or national_athlete',
            { statusCode: 422 }
        );
    }
    if (name.length < 2) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'discount_beneficiary.name is required for special discount reporting',
            { statusCode: 422 }
        );
    }
    if (idNumber.length < 2) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'discount_beneficiary.id_number is required for special discount reporting',
            { statusCode: 422 }
        );
    }

    return {
        category,
        name,
        id_number: idNumber
    };
};

const buildTransactionSpecialInstructions = ({
    rawSpecialInstructions = null,
    discountBeneficiary = null,
    discountBeneficiaries = [],
    receiptContract = null
}) => {
    const note = String(rawSpecialInstructions || '').trim() || null;
    const normalizedReceiptContract = receiptContract && typeof receiptContract === 'object'
        ? {
            version: RECEIPT_CONTRACT_VERSION,
            document_type: String(receiptContract.document_type || '').trim() || null,
            document_context: String(receiptContract.document_context || '').trim() || null
        }
        : null;

    if (!note && !discountBeneficiary && discountBeneficiaries.length === 0 && !normalizedReceiptContract) {
        return null;
    }

    const payload = {
        note,
        discount_beneficiary: discountBeneficiary || null,
        discount_beneficiaries: discountBeneficiaries,
        receipt_contract: normalizedReceiptContract
    };

    return JSON.stringify(payload);
};

const normalizeBuyerFiscalDetails = (payload = {}) => ({
    name: String(payload.buyer_name || payload.customer_name || '').trim() || null,
    tin: String(payload.buyer_tin || '').trim() || null,
    business_style: String(payload.buyer_business_style || '').trim() || null,
    address: String(payload.buyer_address || '').trim() || null
});

const assertBuyerFiscalDetailsReady = ({ buyer, settings, isFiscal }) => {
    if (!isFiscal || !settingBoolean(settings, 'pos_fiscal_buyer_details_required')) return;

    const missing = [];
    if (!buyer.name) missing.push('buyer_name');
    if (!buyer.tin) missing.push('buyer_tin');
    if (!buyer.business_style) missing.push('buyer_business_style');
    if (!buyer.address) missing.push('buyer_address');
    if (missing.length === 0) return;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Fiscal checkout requires buyer details: ${missing.join(', ')}`,
        {
            statusCode: 422,
            details: { missing_fields: missing }
        }
    );
};

const resolveVerifiedFiscalTerminalRegistration = async ({ posRepository, terminalId, transaction }) => {
    if (typeof posRepository.getVerifiedFiscalTerminalRegistration !== 'function') return null;

    return posRepository.getVerifiedFiscalTerminalRegistration({
        terminal_id: terminalId || null
    }, { transaction, lock: true });
};

const buildFiscalDocumentSnapshot = ({
    invoiceNumber,
    receiptContract,
    settings,
    terminalRegistration,
    buyer,
    lines,
    totals,
    paymentType
}) => ({
    template_version: FISCAL_DOCUMENT_TEMPLATE_VERSION,
    document: {
        invoice_number: invoiceNumber,
        document_type: receiptContract.document_type,
        document_context: receiptContract.document_context
    },
    seller: {
        registered_name: settingString(settings, 'pos_registered_name'),
        business_name: settingString(settings, 'pos_business_name'),
        business_style: settingString(settings, 'pos_business_style'),
        taxpayer_type: settingString(settings, 'pos_taxpayer_type'),
        tin_branch: settingString(settings, 'pos_tin_branch'),
        address: settingString(settings, 'pos_address'),
        ptu_number: settingString(settings, 'pos_ptu_number') || String(terminalRegistration?.ptu_number || '').trim(),
        min_number: settingString(settings, 'pos_min_number') || String(terminalRegistration?.min_number || '').trim(),
        accreditation_number: settingString(settings, 'pos_accreditation_number'),
        software_name: settingString(settings, 'pos_software_name'),
        software_version: settingString(settings, 'pos_software_version') || String(terminalRegistration?.software_version || '').trim(),
        software_serial_number: settingString(settings, 'pos_software_serial_number') || String(terminalRegistration?.software_serial_number || '').trim()
    },
    terminal: {
        terminal_id: String(terminalRegistration?.terminal_id || '').trim() || null,
        min_number: String(terminalRegistration?.min_number || '').trim() || null,
        machine_serial_number: String(terminalRegistration?.machine_serial_number || '').trim() || null,
        ptu_number: String(terminalRegistration?.ptu_number || '').trim() || null,
        software_version: String(terminalRegistration?.software_version || '').trim() || null,
        software_serial_number: String(terminalRegistration?.software_serial_number || '').trim() || null
    },
    buyer: {
        name: buyer.name,
        tin: buyer.tin,
        business_style: buyer.business_style,
        address: buyer.address
    },
    totals: {
        subtotal_amount: totals.subtotalAmount,
        vatable_sales: totals.vatableSales,
        vat_amount: totals.vatAmount,
        vat_exempt_sales: totals.vatExemptSales,
        zero_rated_sales: totals.zeroRatedSales,
        discount_amount: totals.discountAmount,
        service_fee_amount: totals.serviceFeeAmount,
        restaurant_service_charge_amount: totals.restaurantServiceChargeAmount,
        total_amount: totals.totalAmount,
        payment_type: paymentType
    },
    lines: lines.map((line, index) => ({
        sequence: index + 1,
        item_id: line.item_id,
        item_name: line.item_name,
        quantity: line.quantity,
        unit_of_measure: line.unit_of_measure,
        sale_price: line.sale_price,
        line_subtotal: line.line_subtotal,
        vat_type: line.vat_type_snapshot,
        vat_rate: line.vat_rate_snapshot
    }))
});

export const buildCheckoutPosUseCase = ({
    posRepository,
    inventoryCommandService,
    employeeCreditService,
    calculateServiceQuoteUseCase = null,
    completeClaimedPosParkedSaleUseCase = null,
    resolveIdentityStatus = resolvePosOperatorIdentityStatus,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    // Phase 9: no `|| stockMovementService` fallback here anymore - a
    // mis-wired container (inventoryCommandService missing) must fail loudly
    // via executeInventoryStockCommand's own check below, not silently pick
    // up a differently-named legacy dependency that happens to also expose
    // createStockMovement. Falling back would risk bypassing whatever a
    // properly-wired port does for a tenant that has delegated inventory
    // authority to an external system.
    const stockCommands = inventoryCommandService;
    return async ({
        payload,
        userId,
        user,
        operatorSessionId = null,
        transaction: providedTransaction = null,
        beforeCommit = null,
        quoteOnly = false,
        discountApproval = null,
        trustedDiscountApproval = null,
        trustedOfflineStatutoryPolicy = null,
        itemDiscountApprovals = null,
        trustedItemDiscountApprovals = null
    }) => {
        const normalizedUserId = parsePositiveInt(userId);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'userId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        const normalizedOperatorSessionId = operatorSessionId == null
            ? null
            : parsePositiveInt(operatorSessionId);
        if (operatorSessionId != null && !normalizedOperatorSessionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'operatorSessionId must be a positive integer when provided',
                { statusCode: 400 }
            ));
        }

        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        const itemDiscountApprovalByItemId = new Map(
            lines
                .map((line) => [
                    Number.parseInt(line?.item_id, 10),
                    isPlainObject(line?.item_discount_approval) ? line.item_discount_approval : null
                ])
                .filter(([itemId]) => Number.isInteger(itemId) && itemId > 0)
        );
        if (Array.isArray(itemDiscountApprovals)) {
            itemDiscountApprovals.forEach((approval) => {
                const itemId = parsePositiveInt(approval?.item_id);
                if (itemId && isPlainObject(approval)) {
                    itemDiscountApprovalByItemId.set(itemId, approval);
                }
            });
        }
        const trustedItemDiscountApprovalByItemId = normalizeTrustedItemDiscountApprovals(
            trustedItemDiscountApprovals
        );
        if (lines.length === 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'At least one checkout line is required',
                { statusCode: 400 }
            ));
        }

        const idempotencyKey = payload.idempotency_key;
        if (!idempotencyKey || typeof idempotencyKey !== 'string') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required',
                { statusCode: 400 }
            ));
        }
        const normalizedOrderMethod = String(payload.order_method || 'dine_in').trim();
        if (!ORDER_METHODS.includes(normalizedOrderMethod)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `order_method must be one of: ${ORDER_METHODS.join(', ')}`,
                { statusCode: 422 }
            ));
        }
        const requestedLocationId = payload.location_id == null
            ? null
            : parsePositiveInt(payload.location_id);
        if (payload.location_id != null && !requestedLocationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer when provided',
                { statusCode: 422 }
            ));
        }

        const requestedTerminalId = sanitizeTerminalId(payload.terminal_id);
        const parkedSaleId = payload.parked_sale_id == null ? null : parsePositiveInt(payload.parked_sale_id);
        if (payload.parked_sale_id != null && !parkedSaleId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'parked_sale_id must be a positive integer when provided',
                { statusCode: 422 }
            ));
        }
        const fnbCheckId = parsePositiveInt(payload.fnb_check_id || payload.check_id);
        const fnbTableId = parsePositiveInt(payload.fnb_table_id || payload.table_id);
        const fnbGuestCount = parsePositiveInt(payload.fnb_guest_count || payload.guest_count);
        const fnbServerId = parsePositiveInt(payload.fnb_server_id || payload.server_id);
        const fnbTableLabelSnapshot = String(payload.fnb_table_label_snapshot || payload.table_label_snapshot || '').trim().slice(0, 120) || null;
        const buyerFiscalDetails = normalizeBuyerFiscalDetails(payload);
        const hasFnbLineContext = lines.some((line) => (
            normalizeFnbCourse(line?.course)
            || Array.isArray(line?.line_modifiers)
            || Array.isArray(line?.modifiers)
            || parsePositiveInt(line?.kitchen_station_id)
            || String(line?.special_instructions || '').trim()
        ));
        const hasFnbCheckoutContext = Boolean(
            fnbCheckId
            || fnbTableId
            || fnbGuestCount
            || fnbServerId
            || fnbTableLabelSnapshot
            || hasFnbLineContext
        );
        const normalizedRequestPayload = {
            terminal_id: requestedTerminalId || null,
            location_id: requestedLocationId,
            ...(parkedSaleId ? { parked_sale_id: parkedSaleId } : {}),
            order_method: normalizedOrderMethod,
            payment_type: payload.payment_type || 'cash',
            ...(String(payload.payment_type || 'cash').trim().toLowerCase() === 'employee_credit'
                ? {
                    employee_credit: {
                        account_code: String(payload.employee_credit?.account_code || '').trim().toUpperCase()
                    }
                }
                : {}),
            service_fee_amount: null,
            fnb_check_id: fnbCheckId,
            fnb_table_id: fnbTableId,
            fnb_table_label_snapshot: fnbTableLabelSnapshot,
            fnb_guest_count: fnbGuestCount,
            fnb_server_id: fnbServerId,
            restaurant_service_charge: normalizeRestaurantServiceChargeInput({ payload, useSettings: false }),
            discount_profile_name: String(payload.discount_profile_name || '').trim() || null,
            discount_rate: payload.discount_rate == null ? null : round4(payload.discount_rate),
            discount_amount: round4(payload.discount_amount || 0),
            customer_name: String(payload.customer_name || '').trim() || null,
            customer_email: String(payload.customer_email || '').trim().toLowerCase() || null,
            customer_phone: String(payload.customer_phone || '').trim() || null,
            buyer_name: buyerFiscalDetails.name,
            buyer_tin: buyerFiscalDetails.tin,
            buyer_business_style: buyerFiscalDetails.business_style,
            buyer_address: buyerFiscalDetails.address,
            special_instructions: String(payload.special_instructions || '').trim() || null,
            // Only present when supplied so request hashes of payloads without a
            // schedule stay identical to pre-scheduled_for clients.
            ...(payload.scheduled_for
                ? { scheduled_for: new Date(payload.scheduled_for).toISOString() }
                : {}),
            discount_beneficiary: isPlainObject(payload.discount_beneficiary)
                ? {
                    category: String(payload.discount_beneficiary.category || '').trim().toLowerCase() || null,
                    name: String(payload.discount_beneficiary.name || '').trim() || null,
                    id_number: String(payload.discount_beneficiary.id_number || '').trim() || null
                }
                : null,
            governed_discount: isPlainObject(payload.governed_discount)
                ? {
                    type: String(payload.governed_discount.type || '').trim().toLowerCase(),
                    method: String(payload.governed_discount.method || '').trim().toLowerCase(),
                    rate: payload.governed_discount.rate == null ? null : round4(payload.governed_discount.rate),
                    amount: payload.governed_discount.amount == null ? null : round4(payload.governed_discount.amount),
                    customer_name: String(payload.governed_discount.customer_name || '').trim() || null,
                    id_number: String(payload.governed_discount.id_number || '').trim() || null,
                    employee_name: String(payload.governed_discount.employee_name || '').trim() || null,
                    employee_id: String(payload.governed_discount.employee_id || '').trim() || null,
                    employee_directory_id: parsePositiveInt(payload.governed_discount.employee_directory_id),
                    approver_user_id: parsePositiveInt(payload.governed_discount.approver_user_id),
                    reason: String(payload.governed_discount.reason || '').trim() || null,
                    promo_code: String(payload.governed_discount.promo_code || '').trim().toUpperCase() || null,
                    // #712: must be in the idempotency request hash -- without it, two checkouts
                    // differing only by voucher code would hash identically and the second would be
                    // served as a false idempotent replay.
                    voucher_code: String(payload.governed_discount.voucher_code || '').trim().toUpperCase() || null,
                    eligible_item_ids: [...new Set((payload.governed_discount.eligible_item_ids || [])
                        .map((itemId) => parsePositiveInt(itemId))
                        .filter(Boolean))],
                    eligible_items: (payload.governed_discount.eligible_items || [])
                        .map((entry) => ({
                            line_ref: String(entry?.line_ref || '').trim() || null,
                            item_id: parsePositiveInt(entry?.item_id),
                            eligible_quantity: round4(entry?.eligible_quantity)
                        }))
                        .filter((entry) => entry.item_id && entry.eligible_quantity > 0),
                    beneficiaries: (payload.governed_discount.beneficiaries || []).map((beneficiary) => ({
                        category: String(beneficiary?.category || '').trim().toLowerCase(),
                        name: String(beneficiary?.name || '').trim() || null,
                        id_number: String(beneficiary?.id_number || '').trim() || null,
                        eligible_items: (beneficiary?.eligible_items || []).map((entry) => ({
                            line_ref: String(entry?.line_ref || '').trim() || null,
                            item_id: parsePositiveInt(entry?.item_id),
                            eligible_quantity: round4(entry?.eligible_quantity)
                        })).filter((entry) => entry.item_id && entry.eligible_quantity > 0)
                    }))
                }
                : null,
            lines: lines
                .map((line, index) => ({
                    sequence: index,
                    line_ref: String(line.line_ref || '').trim() || null,
                    item_id: Number.parseInt(line.item_id, 10),
                    quantity: round4(line.quantity),
                    sale_price: line.sale_price == null ? null : round4(line.sale_price),
                    price_override_reason: String(line.price_override_reason || '').trim() || null,
                    course: normalizeFnbCourse(line.course),
                    line_modifiers: normalizeFnbModifiersSnapshot(line.line_modifiers || line.modifiers) || [],
                    special_instructions: String(line.special_instructions || '').trim() || null,
                    kitchen_station_id: parsePositiveInt(line.kitchen_station_id),
                    ...(normalizeServiceOptionIds(line.selected_option_ids).length > 0
                        ? { selected_option_ids: normalizeServiceOptionIds(line.selected_option_ids) }
                        : {}),
                    scan_metadata: isPlainObject(line.scan_metadata) ? line.scan_metadata : null,
                    ...(isPlainObject(line.item_discount)
                        ? {
                            item_discount: {
                                discount_type: String(line.item_discount.discount_type || line.item_discount.type || 'manual').trim().toLowerCase(),
                                label: String(line.item_discount.label || '').trim() || 'Item Discount',
                                method: String(line.item_discount.method || '').trim().toLowerCase(),
                                rate: line.item_discount.rate == null ? null : round4(line.item_discount.rate),
                                amount: line.item_discount.amount == null ? null : round4(line.item_discount.amount),
                                customer_name: String(line.item_discount.customer_name || '').trim() || null,
                                id_number: String(line.item_discount.id_number || '').trim() || null,
                                employee_name: String(line.item_discount.employee_name || '').trim() || null,
                                employee_id: String(line.item_discount.employee_id || '').trim() || null,
                                employee_directory_id: parsePositiveInt(line.item_discount.employee_directory_id),
                                promo_code: String(line.item_discount.promo_code || '').trim().toUpperCase() || null,
                                reason: String(line.item_discount.reason || '').trim().slice(0, 500) || null,
                                approver_user_id: parsePositiveInt(line.item_discount.approver_user_id)
                            }
                        }
                        : {})
                }))
                .sort((a, b) => a.item_id - b.item_id)
        };

        const ownsTransaction = !providedTransaction;
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = providedTransaction || await sequelize.transaction();

        try {
            const tenantId = String(dbStore.getStore()?.tenantId || '').trim();
            await assertPosOperatorIdentity({ tenantId, user, resolveIdentityStatus });

            // Affiliate attribution: resolved (and validated) before any write so an invalid code
            // rejects the checkout with clear feedback instead of silently losing the commission -
            // the money-side accrual itself still happens post-commit, best-effort (see below).
            const affiliateCodeInput = String(payload.affiliate_code || '').trim();
            const affiliateEnrollment = affiliateCodeInput
                ? await resolveActiveAffiliateEnrollment({ tenantId, affiliateCode: affiliateCodeInput })
                : null;
            if (affiliateCodeInput && !affiliateEnrollment) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Affiliate code is invalid or the affiliate program is not enabled for this store',
                    { statusCode: 422, details: { reason_code: 'AFFILIATE_CODE_INVALID' } }
                );
            }

            const settings = await getPosSettings();
            const governedDraft = isPlainObject(payload.governed_discount) ? payload.governed_discount : null;
            const hasItemPromo = lines.some((line) => String(line?.item_discount?.discount_type || '').trim().toLowerCase() === 'promo');
            let discountSettings = settings;
            if (governedDraft?.type === 'promo' || hasItemPromo) {
                const promoSetting = await posRepository.findSystemSettingByKey(
                    STOREFRONT_PROMO_SETTING_KEY,
                    { transaction, lock: true }
                );
                const promosSetting = await posRepository.findSystemSettingByKey(
                    STOREFRONT_PROMOS_SETTING_KEY,
                    { transaction, lock: true }
                );
                discountSettings = {
                    ...settings,
                    [STOREFRONT_PROMO_SETTING_KEY]: {
                        ...(settings?.[STOREFRONT_PROMO_SETTING_KEY] || {}),
                        value: normalizeJsonObject(promoSetting?.setting_value, {})
                    },
                    [STOREFRONT_PROMOS_SETTING_KEY]: {
                        ...(settings?.[STOREFRONT_PROMOS_SETTING_KEY] || {}),
                        value: normalizeJsonArray(promosSetting?.setting_value, [])
                    }
                };
            }
            const resolvedCheckoutLocation = await resolveLocationScope({
                requestedLocationId,
                userId: normalizedUserId,
                transaction,
                operationLabel: 'POS checkout',
                allowNullWhenUnresolved: true
            });
            const scopedCheckoutLocationId = parsePositiveInt(resolvedCheckoutLocation?.location_id);
            const terminalPolicySettings = await resolveTerminalIdentityPolicySettings({
                posRepository,
                settings,
                options: { transaction }
            });
            const terminalPolicyContext = requireRegisteredTerminalContext({
                terminalId: requestedTerminalId,
                policy: terminalPolicySettings,
                operation: 'checkout'
            });
            const normalizedTerminalId = terminalPolicyContext.terminal_id;
            const enforcedCheckoutLocationId = enforceTerminalHomeLocationPolicy({
                bindingEnforced: true,
                terminalPolicyContext,
                targetLocationId: scopedCheckoutLocationId || terminalPolicyContext.registry_entry?.location_id
            });
            if (!enforcedCheckoutLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'POS checkout requires a valid terminal location scope.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
                    statusCode: 422
                });
            }
            const runCheckoutBeforeCommit = async ({ transactionId, idempotentReplay }) => {
                if (parkedSaleId) {
                    if (typeof completeClaimedPosParkedSaleUseCase !== 'function') {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'Parked-sale checkout completion is unavailable.',
                            { statusCode: 503, details: { reason_code: 'PARKED_SALE_COMPLETION_UNAVAILABLE' } }
                        );
                    }
                    await completeClaimedPosParkedSaleUseCase({
                        parkedSaleId,
                        payload: {
                            shift_id: payload.shift_id,
                            terminal_id: normalizedTerminalId,
                            location_id: enforcedCheckoutLocationId
                        },
                        user,
                        transactionId,
                        transaction
                    });
                }
                if (typeof beforeCommit === 'function') {
                    await beforeCommit({ transaction, transactionId, idempotentReplay });
                }
            };
            const requestHash = hashPayload({
                ...normalizedRequestPayload,
                operator_session_id: normalizedOperatorSessionId,
                terminal_id: normalizedTerminalId || null,
                location_id: enforcedCheckoutLocationId,
                restaurant_service_charge: normalizeRestaurantServiceChargeInput({
                    payload,
                    settings: discountSettings,
                    useSettings: hasFnbCheckoutContext
                })
            });
            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
                context: {
                    terminal_id: normalizedTerminalId || null,
                    requested_document_context: payload.document_context || null,
                    payment_type: payload.payment_type || 'cash',
                    payment_handoff_mode: payload.payment_handoff_mode
                        || (String(payload.payment_type || 'cash').trim().toLowerCase() === 'cash' ? 'internal' : 'external')
                },
                settings,
                user
            });
            enforcePosComplianceReadiness(settings);
            const receiptContract = complianceDecision?.receipt_contract || {
                document_type: 'non_fiscal_slip',
                label: 'NON-FISCAL SLIP',
                document_context: 'non_fiscal'
            };

            const requestedDocumentContext = String(payload.document_context || '').trim().toLowerCase() || null;
            const defaultDocumentContext = String(
                receiptContract.document_context
                || (receiptContract.document_type === 'fiscal_invoice' ? 'fiscal' : 'non_fiscal')
            ).trim().toLowerCase();
            const resolvedDocumentContext = requestedDocumentContext || defaultDocumentContext;

            if (
                receiptContract.document_type === 'fiscal_invoice'
                && resolvedDocumentContext !== 'fiscal'
            ) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'fiscal invoices require document_context=fiscal',
                    { statusCode: 422 }
                );
            }
            if (
                receiptContract.document_type !== 'fiscal_invoice'
                && !['non_fiscal', 'training_test'].includes(resolvedDocumentContext)
            ) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'non-fiscal documents require document_context=non_fiscal or training_test',
                    { statusCode: 422 }
                );
            }

            const resolvedReceiptContract = {
                ...receiptContract,
                document_context: resolvedDocumentContext
            };
            const isFiscalReceipt = resolvedReceiptContract.document_type === 'fiscal_invoice';
            assertBuyerFiscalDetailsReady({
                buyer: buyerFiscalDetails,
                settings,
                isFiscal: isFiscalReceipt
            });

            const existing = await posRepository.findTransactionByIdempotencyKey(
                idempotencyKey,
                { transaction, lock: true }
            );

            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key was already used with a different payload',
                        {
                            statusCode: 409,
                            details: {
                                existing_request_hash: existing.request_hash,
                                received_request_hash: requestHash
                            }
                        }
                    );
                }

                await runCheckoutBeforeCommit({
                    transactionId: existing.pos_transaction_id,
                    idempotentReplay: true
                });
                if (ownsTransaction) await transaction.commit();
                const replayDocumentType = String(existing.document_type || '').trim().toLowerCase() === 'fiscal_invoice'
                    ? 'fiscal_invoice'
                    : 'non_fiscal_slip';
                const replayDocumentContext = String(existing.document_context || '').trim().toLowerCase()
                    || (replayDocumentType === 'fiscal_invoice' ? 'fiscal' : 'non_fiscal');
                return ok({
                    idempotent_replay: true,
                    compliance_decision: complianceDecision,
                    terminal_identity_policy: terminalPolicyContext,
                    receipt_contract: {
                        version: RECEIPT_CONTRACT_VERSION,
                        document_type: replayDocumentType,
                        document_context: replayDocumentContext,
                        label: replayDocumentType === 'fiscal_invoice' ? 'FISCAL INVOICE' : 'NON-FISCAL SLIP'
                    },
                    transaction: toSerializable(existing)
                });
            }

            let operatorSession = null;
            if (normalizedOperatorSessionId) {
                if (typeof posRepository.getTerminalOperatorSessionById !== 'function') {
                    throw new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        'POS operator-session persistence is unavailable.',
                        { statusCode: 500 }
                    );
                }
                operatorSession = await posRepository.getTerminalOperatorSessionById(normalizedOperatorSessionId, {
                    transaction,
                    lock: true
                });
                const operatorExpired = operatorSession?.authority_expires_at
                    && new Date(operatorSession.authority_expires_at).getTime() <= Date.now();
                if (!operatorSession
                    || operatorSession.status !== 'active'
                    || operatorSession.revoked_at
                    || operatorExpired
                    || Number(operatorSession.user_id) !== normalizedUserId
                    || (normalizedTerminalId && String(operatorSession.terminal_id) !== String(normalizedTerminalId))
                    || (enforcedCheckoutLocationId && Number(operatorSession.location_id) !== Number(enforcedCheckoutLocationId))) {
                    throw new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'The active cashier authority is no longer valid for this checkout.',
                        { statusCode: 403, details: { reason_code: 'POS_OPERATOR_AUTHORITY_INVALID' } }
                    );
                }
            }

            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId: normalizedUserId,
                shiftId: payload.shift_id || operatorSession?.pos_terminal_shift_id,
                terminalId: normalizedTerminalId || null,
                locationId: enforcedCheckoutLocationId || null,
                authorizedOperatorUserId: operatorSession?.user_id || null,
                transaction,
                lock: true
            });
            if (operatorSession
                && Number(operatorSession.pos_terminal_shift_id) !== Number(activeShift.pos_terminal_shift_id)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'The active cashier authority does not match this register shift.',
                    { statusCode: 403, details: { reason_code: 'POS_OPERATOR_SHIFT_MISMATCH' } }
                );
            }
            const normalizedShiftId = parsePositiveInt(activeShift?.pos_terminal_shift_id);
            const shiftLocationId = parsePositiveInt(activeShift?.location_id);
            if (!shiftLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'Active shift is missing location binding.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
                    statusCode: 422,
                    details: {
                        shift_id: normalizedShiftId
                    }
                });
            }

            const itemIds = [...new Set(lines.map((line) => Number.parseInt(line.item_id, 10)))];
            const items = await posRepository.findSellableItemsByIds(itemIds, {
                transaction,
                lock: true,
                locationId: enforcedCheckoutLocationId
            });
            const itemMap = new Map(items.map((item) => [item.item_id, item]));
            const compositionItemIds = items
                .filter((item) => isStockBearingItem(item))
                .map((item) => Number.parseInt(item.item_id, 10))
                .filter((itemId) => Number.isInteger(itemId) && itemId > 0);
            const productCompositions = hasFnbCheckoutContext
                && compositionItemIds.length > 0
                && typeof posRepository.listProductCompositionsForItems === 'function'
                ? await posRepository.listProductCompositionsForItems(compositionItemIds, {
                    transaction,
                    lock: true,
                    locationId: enforcedCheckoutLocationId
                })
                : [];
            const recipePlan = buildFnbRecipeConsumptionPlan({
                lines,
                itemMap,
                compositions: productCompositions,
                locationId: enforcedCheckoutLocationId
            });

            if (itemMap.size !== itemIds.length) {
                const missingIds = itemIds.filter((itemId) => !itemMap.has(itemId));
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Some POS-visible active items were not found: ${missingIds.join(', ')}`,
                    {
                        statusCode: 404,
                        details: { missing_item_ids: missingIds }
                    }
                );
            }

            let subtotalAmount = 0;
            const preparedLines = [];
            const recipeMovementPlanByPreparedLine = [];

            for (const line of lines) {
                const itemId = Number.parseInt(line.item_id, 10);
                const quantity = Number(line.quantity);
                const item = itemMap.get(itemId);

                if (line.scan_metadata?.code) {
                    const replayScan = await posRepository.resolveCatalogScan({
                        code: line.scan_metadata.code,
                        location_id: enforcedCheckoutLocationId
                    });
                    const replayBlocked = resolvePosScanBlockedReason({ scanResult: replayScan });
                    const replayBarcodeId = Number(replayScan?.barcode?.item_barcode_id || 0);
                    const expectedBarcodeId = Number(line.scan_metadata?.barcode_id || 0);
                    if (
                        replayBlocked
                        || replayScan?.status !== 'resolved'
                        || Number(replayScan?.item?.item_id) !== itemId
                        || (expectedBarcodeId > 0 && replayBarcodeId !== expectedBarcodeId)
                    ) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'Queued barcode scan must be revalidated before checkout',
                            {
                                statusCode: 409,
                                details: {
                                    reason_code: replayBlocked?.reason_code || 'BARCODE_REPLAY_REVALIDATION_FAILED',
                                    item_id: itemId,
                                    expected_barcode_id: expectedBarcodeId || null,
                                    resolved_barcode_id: replayBarcodeId || null
                                }
                            }
                        );
                    }
                }

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid quantity for item ${itemId}`,
                        { statusCode: 400 }
                    );
                }

                const descriptor = resolveStockBearingDescriptor(item);
                const isStockExemptLine = !descriptor.tracks_quantity;
                if (descriptor.is_toggle_available === false) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `"${item.name}" is currently marked unavailable`,
                        { statusCode: 400 }
                    );
                }
                const currentStock = Number(item.current_stock) || 0;
                const lineRecipeMovements = recipePlan.movementsByLineIndex[preparedLines.length] || [];
                if (descriptor.blocks_on_shortfall && lineRecipeMovements.length === 0 && currentStock + 0.000001 < quantity) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${quantity}`,
                        { statusCode: 400 }
                    );
                }

                const modifierResolution = resolveFnbLineModifiers({
                    item,
                    line,
                    hasFnbCheckoutContext,
                    locationId: enforcedCheckoutLocationId
                });
                const selectedServiceOptionIds = normalizeServiceOptionIds(line.selected_option_ids);
                let serviceOptionResolution = {
                    priceDelta: 0,
                    snapshot: null
                };
                const isServiceLine = isStockExemptServiceItem(item);
                if (selectedServiceOptionIds.length > 0 && !isServiceLine) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Service options can only be selected for service item ${item.item_id}`,
                        { statusCode: 422, details: { item_id: item.item_id } }
                    );
                }
                if (isServiceLine && typeof calculateServiceQuoteUseCase?.calculateQuote === 'function') {
                    const quoteResult = await calculateServiceQuoteUseCase.calculateQuote({
                        serviceItemId: item.item_id,
                        selectedOptionIds: selectedServiceOptionIds,
                        quantity,
                        tenantId,
                        transaction
                    });
                    if (!quoteResult?.success) {
                        throw quoteResult?.error || new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            `Unable to validate service options for "${item.name}"`,
                            { statusCode: 422 }
                        );
                    }
                    const quote = quoteResult.data?.quote || {};
                    serviceOptionResolution = {
                        priceDelta: round4((Number(quote.options_price_adjustment_centavos) || 0) / 100),
                        snapshot: buildServiceOptionsSnapshot(quote.selected_options)
                    };
                }
                const baseSalePrice = requireExplicitSalePrice(item, 'POS checkout');
                const defaultSalePrice = round4(
                    baseSalePrice
                    + modifierResolution.modifierPriceDelta
                    + serviceOptionResolution.priceDelta
                );
                const resolvedPrice = line.sale_price == null
                    ? defaultSalePrice
                    : Number(line.sale_price);

                if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid sale price for item ${item.item_id}`,
                        { statusCode: 400 }
                    );
                }

                const salePriceOverridden = line.sale_price != null
                    && Math.abs(round4(resolvedPrice) - round4(defaultSalePrice)) > 0.0001;
                const priceOverrideReason = String(line.price_override_reason || '').trim();
                if (salePriceOverridden) {
                    if (!hasPermission(user, PERMISSION_PRICE_OVERRIDE)) {
                        throw new DomainError(
                            DomainErrorCode.AUTHORIZATION_FAILED,
                            'You do not have permission to override line-item sale prices.',
                            { statusCode: 403 }
                        );
                    }
                    if (priceOverrideReason.length < 3) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            `Price override reason is required for item ${item.item_id}`,
                            { statusCode: 422 }
                        );
                    }
                }

                const lineSubtotal = round4(quantity * resolvedPrice);
                subtotalAmount += lineSubtotal;

                preparedLines.push({
                    line_ref: String(line.line_ref || '').trim() || null,
                    item_id: item.item_id,
                    // #448 (Phase 209) - snapshotted so post-commit affiliate accrual can resolve
                    // a per-category commission rate without re-querying the item. Nullable:
                    // an uncategorized item matches no category rate and falls to the tenant
                    // default, which is correct, not an error.
                    folder_id_snapshot: Number.isInteger(item.folder_id) ? item.folder_id : null,
                    item_name: item.name,
                    item_name_snapshot: item.name || null,
                    sku_snapshot: item.sku_code || null,
                    quantity: round4(quantity),
                    unit_of_measure: item.unit_of_measure,
                    // Only a true service has no cost to report; an untracked/toggle
                    // physical item is movement-exempt but still carries a real cost
                    // (resolveStockBearingDescriptor's carries_cost).
                    cost_snapshot: descriptor.carries_cost ? (item.cost_per_unit != null ? round4(item.cost_per_unit) : null) : null,
                    stock_effect_type: isStockExemptLine ? 'stock_exempt' : 'inventory_issue',
                    stock_exempt_reason: resolveStockExemptReason(item, descriptor),
                    sale_price: round4(resolvedPrice),
                    sale_price_overridden: salePriceOverridden,
                    price_override_reason: salePriceOverridden ? priceOverrideReason : null,
                    line_subtotal: lineSubtotal,
                    vat_type_snapshot: item.vat_type || 'vatable',
                    vat_rate_snapshot: VAT_RATE,
                    senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible),
                    fnb_course_snapshot: normalizeFnbCourse(line.course),
                    fnb_modifiers_snapshot: serviceOptionResolution.snapshot?.length > 0
                        ? serviceOptionResolution.snapshot
                        : modifierResolution.modifiersSnapshot,
                    fnb_special_instructions: String(line.special_instructions || '').trim().slice(0, 1000) || null,
                    fnb_kitchen_station_snapshot: parsePositiveInt(line.kitchen_station_id)
                        ? { kitchen_station_id: parsePositiveInt(line.kitchen_station_id) }
                        : null,
                    item_discount_draft: line.item_discount || null,
                    item_discount_snapshot: null
                });
                recipeMovementPlanByPreparedLine.push(lineRecipeMovements);
            }

            subtotalAmount = round4(subtotalAmount);
            const itemDiscountApplications = [];
            let itemPromoResolution = null;
            const employeeDiscountSelfApprovalEnabled = settingBoolean(
                discountSettings,
                POS_EMPLOYEE_DISCOUNT_SELF_APPROVAL_SETTING
            );
            for (const line of preparedLines) {
                if (!line.item_discount_draft) continue;
                const approval = itemDiscountApprovalByItemId.get(Number(line.item_id));
                const itemApplication = await resolvePosItemDiscount({
                    draft: line.item_discount_draft,
                    itemId: line.item_id,
                    itemName: line.item_name,
                    preparedLine: line,
                    settings: discountSettings,
                    orderMethod: normalizedOrderMethod,
                    findActiveRule: (type) => posRepository.findActiveDiscountRuleByType(type, { transaction, lock: true }),
                    findActiveEmployee: (employeeId) => posRepository.findActiveEmployeeById(employeeId, { transaction }),
                    findActiveEmployeeDirectory: (employeeId) => posRepository.findActiveDiscountEmployeeById(employeeId, { transaction })
                });
                const trustedApproval = trustedItemDiscountApprovalByItemId.get(Number(line.item_id));
                const trustedApprovalMatches = trustedItemDiscountApprovalMatches(
                    trustedApproval,
                    line.item_discount_draft,
                    itemApplication
                );
                if (trustedApprovalMatches) {
                    const activeApprover = await posRepository.findActiveDiscountApproverById(
                        trustedApproval.approver_user_id,
                        { transaction }
                    );
                    const activeApproverRole = String(activeApprover?.role || '').trim().toLowerCase();
                    const activeApproverAuthorized = activeApprover?.can_authorize_discounts === true
                        || activeApprover?.is_master_admin === true
                        || ['admin', 'manager'].includes(activeApproverRole);
                    if (!activeApprover || activeApproverAuthorized !== true) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            'The saved item discount approver is no longer active.',
                            { statusCode: 422, details: { reason_code: 'DISCOUNT_APPROVER_INACTIVE', item_id: line.item_id } }
                        );
                    }
                    if (itemApplication.discount_type === 'employee') {
                        assertTrustedEmployeeApprovalIdentity({
                            approval: trustedApproval,
                            application: itemApplication,
                            approver: activeApprover,
                            applyingUserId: normalizedUserId,
                            allowSelfApproval: employeeDiscountSelfApprovalEnabled
                        });
                    } else if (parsePositiveInt(activeApprover.user_id) === normalizedUserId) {
                        throw new DomainError(
                            DomainErrorCode.AUTHORIZATION_FAILED,
                            'Employees cannot approve their own discount.',
                            { statusCode: 403, details: { reason_code: 'DISCOUNT_SELF_APPROVAL_BLOCKED' } }
                        );
                    }
                    itemApplication.manager_approval_id = activeApprover.user_id;
                    itemApplication.manager_approval_name = String(activeApprover.username || '').trim() || null;
                    const approvedAt = trustedApproval.approved_at ? new Date(trustedApproval.approved_at) : null;
                    itemApplication.manager_approved_at = approvedAt && !Number.isNaN(approvedAt.getTime())
                        ? approvedAt
                        : new Date();
                    itemApplication.self_approved = trustedApproval.self_approved === true;
                } else {
                    const approverId = parsePositiveInt(
                        line.item_discount_draft.approver_user_id
                        || approval?.approver_user_id
                    );
                    if (!approverId) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            'An authorized employee PIN is required for every item discount.',
                            { statusCode: 422, details: { reason_code: 'ITEM_DISCOUNT_APPROVER_REQUIRED', item_id: line.item_id } }
                        );
                    }
                    const approver = await posRepository.findActiveDiscountApproverById(approverId, { transaction });
                    const verifiedApprover = await verifyPosDiscountApprover({
                        approver,
                        pin: approval?.manager_pin,
                        employeeUserId: itemApplication.discount_type === 'employee'
                            ? itemApplication.employee_user_id
                            : normalizedUserId,
                        employeeDirectoryId: itemApplication.employee_directory_id,
                        employeeEmail: itemApplication.employee_email,
                        allowSelfApproval: itemApplication.discount_type === 'employee'
                            && employeeDiscountSelfApprovalEnabled,
                        applyingUserId: normalizedUserId
                    });
                    itemApplication.manager_approval_id = verifiedApprover.user_id;
                    itemApplication.manager_approval_name = verifiedApprover.username || null;
                    itemApplication.manager_approved_at = new Date();
                    itemApplication.self_approved = verifiedApprover.self_approved === true;
                }
                if (!itemPromoResolution && itemApplication.promo_application?.applied) {
                    itemPromoResolution = itemApplication.promo_application;
                }
                itemDiscountApplications.push(itemApplication);
            }
            const itemDiscountCalculation = calculatePosItemDiscounts({
                lines: preparedLines,
                applications: itemDiscountApplications
            });
            preparedLines.forEach((line, index) => {
                line.global_discount_base_amount = itemDiscountCalculation.lines[index].global_discount_base_amount;
                line.item_discount_snapshot = itemDiscountCalculation.lines[index].item_discount_snapshot;
                delete line.item_discount_draft;
            });
            // #712: bound with the checkout's own transaction/idempotency key/channel so
            // posDiscountPolicy.js stays DB-agnostic -- same shape as findActiveRule/
            // findActiveEmployee just above. `quoteOnly` is the only discriminator POS has for
            // preview-vs-redeem (storefront uses `options?.transaction` presence instead, but POS
            // always has an open transaction) -- a mis-wired quote path would otherwise burn a real
            // redemption on every price check.
            const redeemVoucher = governedDraft?.type === 'voucher'
                ? async ({ code, lines: voucherLines }) => {
                    const resolve = quoteOnly ? previewVoucherEligibilityUseCase : redeemVoucherUseCase;
                    const context = {
                        channel: 'pos',
                        fulfillmentMethod: null,
                        orderTiming: 'asap',
                        subtotalCentavos: toCurrencyCents(itemDiscountCalculation.total_amount),
                        quantity: preparedLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
                    };
                    if (quoteOnly) {
                        return resolve({ code, context, lines: voucherLines });
                    }
                    return resolve({
                        code,
                        context,
                        lines: voucherLines,
                        idempotencyKey,
                        channel: 'pos',
                        storeCustomerId: null,
                        locationId: requestedLocationId,
                        transaction
                    });
                }
                : null;
            const governedResolution = governedDraft
                ? await resolvePosGovernedDiscount({
                    draft: governedDraft,
                    preparedLines,
                    subtotalAmount: itemDiscountCalculation.total_amount,
                    settings: discountSettings,
                    orderMethod: normalizedOrderMethod,
                    findActiveRule: (type) => posRepository.findActiveDiscountRuleByType(type, { transaction, lock: true }),
                    findActiveEmployeeDirectory: (employeeId) => posRepository.findActiveDiscountEmployeeById(employeeId, { transaction }),
                    redeemVoucher
                })
                : null;
            const governedApplication = governedResolution?.application || null;
            const governedVoucher = governedResolution?.voucher || null;
            if ((governedResolution?.promo?.applied || governedVoucher?.applied) && itemPromoResolution?.applied) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only one promo code can be applied to a sale.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: governedVoucher?.applied
                                ? VoucherReasonCode.VOUCHER_DISCOUNT_SLOT_OCCUPIED
                                : 'MULTIPLE_PROMO_CODES_NOT_ALLOWED'
                        }
                    }
                );
            }
            const normalizedTrustedDiscountApproval = normalizeTrustedDiscountApproval(trustedDiscountApproval);
            const normalizedDiscountApproval = isPlainObject(discountApproval)
                ? {
                    approver_user_id: parsePositiveInt(discountApproval.approver_user_id),
                    manager_pin: String(discountApproval.manager_pin || '').trim(),
                    employee_user_id: parsePositiveInt(discountApproval.employee_user_id),
                    employee_directory_id: parsePositiveInt(discountApproval.employee_directory_id),
                    discount_type: String(discountApproval.discount_type || '').trim().toLowerCase()
                }
                : (isPlainObject(payload.discount_approval)
                    ? {
                        approver_user_id: parsePositiveInt(payload.discount_approval.approver_user_id),
                        manager_pin: String(payload.discount_approval.manager_pin || '').trim(),
                        employee_user_id: parsePositiveInt(payload.discount_approval.employee_user_id),
                        employee_directory_id: parsePositiveInt(payload.discount_approval.employee_directory_id),
                        discount_type: String(payload.discount_approval.discount_type || '').trim().toLowerCase()
                    }
                    : null);
            // #712: voucher requires a manager PIN, parity with ADR 0033 Decision 7 (Pat's call,
            // 2026-08-20) -- the amount is merchant-set and server-enforced, not cashier-chosen, but
            // the same approval discipline applies to every governed discount type without
            // exception today. See the follow-up issue filed against this decision.
            if (governedApplication && ['senior', 'pwd', 'employee', 'promo', 'manual', 'voucher'].includes(governedApplication.type)) {
                if (normalizedDiscountApproval?.discount_type
                    && normalizedDiscountApproval.discount_type !== governedApplication.type) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'The discount approval type does not match the applied discount.',
                        { statusCode: 422, details: { reason_code: 'DISCOUNT_APPROVAL_TYPE_MISMATCH' } }
                    );
                }
                if (normalizedDiscountApproval?.approver_user_id
                    && governedDraft?.approver_user_id
                    && normalizedDiscountApproval.approver_user_id !== parsePositiveInt(governedDraft.approver_user_id)) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'The discount approval employee does not match the applied discount.',
                        { statusCode: 422, details: { reason_code: 'DISCOUNT_APPROVER_MISMATCH' } }
                    );
                }
                const trustedApprovalMatches = trustedDiscountApprovalMatches(
                    normalizedTrustedDiscountApproval,
                    governedDraft,
                    governedApplication
                );
                const offlineStatutoryPolicyMatches = isPlainObject(trustedOfflineStatutoryPolicy)
                    && ['senior', 'pwd'].includes(governedApplication.type)
                    && trustedOfflineStatutoryPolicy.discountType === governedApplication.type
                    && String(trustedOfflineStatutoryPolicy.version || '').trim();
                if (offlineStatutoryPolicyMatches) {
                    const policyVersion = String(trustedOfflineStatutoryPolicy.version).trim();
                    governedApplication.manager_approval_id = null;
                    governedApplication.manager_approval_name = `Verified mobile policy ${policyVersion.slice(0, 12)}`;
                    governedApplication.manager_approved_at = new Date(trustedOfflineStatutoryPolicy.verifiedAt || Date.now());
                    governedApplication.self_approved = false;
                    governedApplication.reason = [
                        String(governedApplication.reason || '').trim(),
                        `Offline statutory policy ${policyVersion}`
                    ].filter(Boolean).join(' · ').slice(0, 500);
                } else if (trustedApprovalMatches) {
                    if (governedApplication.type === 'employee'
                        && normalizedTrustedDiscountApproval.self_approved === true
                        && employeeDiscountSelfApprovalEnabled !== true) {
                        throw new DomainError(
                            DomainErrorCode.AUTHORIZATION_FAILED,
                            'Employees cannot approve their own discount.',
                            { statusCode: 403, details: { reason_code: 'DISCOUNT_SELF_APPROVAL_BLOCKED' } }
                        );
                    }
                    const activeApprover = await posRepository.findActiveDiscountApproverById(
                        normalizedTrustedDiscountApproval.approver_user_id,
                        { transaction }
                    );
                    const activeApproverRole = String(activeApprover?.role || '').trim().toLowerCase();
                    const activeApproverAuthorized = activeApprover?.can_authorize_discounts === true
                        || activeApprover?.is_master_admin === true
                        || ['admin', 'manager'].includes(activeApproverRole);
                    if (!activeApprover || activeApproverAuthorized !== true) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            'The saved discount approver is no longer active.',
                            { statusCode: 422, details: { reason_code: 'DISCOUNT_APPROVER_INACTIVE' } }
                        );
                    }
                    if (governedApplication.type === 'employee') {
                        assertTrustedEmployeeApprovalIdentity({
                            approval: normalizedTrustedDiscountApproval,
                            application: governedApplication,
                            approver: activeApprover,
                            applyingUserId: normalizedUserId,
                            allowSelfApproval: employeeDiscountSelfApprovalEnabled
                        });
                    }
                    governedApplication.manager_approval_id = activeApprover.user_id;
                    governedApplication.manager_approval_name = String(activeApprover.username || '').trim() || null;
                    const approvedAt = normalizedTrustedDiscountApproval.approved_at
                        ? new Date(normalizedTrustedDiscountApproval.approved_at)
                        : null;
                    governedApplication.manager_approved_at = approvedAt && !Number.isNaN(approvedAt.getTime())
                        ? approvedAt
                        : new Date();
                    governedApplication.self_approved = normalizedTrustedDiscountApproval.self_approved === true;
                } else {
                    const approverId = parsePositiveInt(
                        governedDraft.approver_user_id
                        || normalizedDiscountApproval?.approver_user_id
                    );
                    if (!approverId) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            'An authorized employee PIN is required for every POS discount.',
                            { statusCode: 422, details: { reason_code: 'DISCOUNT_APPROVER_REQUIRED' } }
                        );
                    }
                    const approver = await posRepository.findActiveDiscountApproverById(approverId, { transaction });
                    const verifiedApprover = await verifyPosDiscountApprover({
                        approver,
                        pin: normalizedDiscountApproval?.manager_pin || governedDraft.manager_pin,
                        employeeUserId: governedApplication.type === 'employee' ? governedApplication.employee_user_id : null,
                        employeeDirectoryId: governedApplication.type === 'employee'
                            ? governedApplication.employee_directory_id
                            : null,
                        employeeEmail: governedApplication.type === 'employee' ? governedApplication.employee_email : null,
                        allowSelfApproval: governedApplication.type === 'employee'
                            && employeeDiscountSelfApprovalEnabled,
                        applyingUserId: normalizedUserId
                    });
                    governedApplication.manager_approval_id = verifiedApprover.user_id;
                    governedApplication.manager_approval_name = verifiedApprover.username || null;
                    governedApplication.manager_approved_at = new Date();
                    governedApplication.self_approved = verifiedApprover.self_approved === true;
                }
            }
            // #712: a voucher's per-line discounts are already authoritative (computed once inside
            // redeemVoucher, above) -- calculatePosDiscount's generic rate/amount redistribution
            // must never re-derive them. See posVoucherDiscountCalculator.js's header comment for
            // why the two are not interchangeable, especially for fixed_price.
            const governedDiscountLines = preparedLines.map((line, index) => ({
                ...line,
                global_discount_base_amount: itemDiscountCalculation.lines[index].global_discount_base_amount
            }));
            const governedCalculation = governedApplication
                ? (governedApplication.type === 'voucher'
                    ? buildVoucherGovernedCalculation({ lines: governedDiscountLines, voucher: governedVoucher })
                    : calculatePosDiscount({
                        lines: governedDiscountLines,
                        application: {
                            type: governedApplication.type,
                            method: governedApplication.method,
                            rate: governedApplication.rate,
                            amount: governedApplication.amount,
                            max_discount_amount: governedApplication.max_discount_amount,
                            lines: governedApplication.lines || [],
                            beneficiaries: governedApplication.beneficiaries || []
                        }
                    }))
                : null;
            const itemDiscountAmount = itemDiscountCalculation.discount_amount;
            const globalDiscountResolution = governedCalculation ? {
                discountAmount: governedCalculation.discount_amount,
                discountLabelSnapshot: governedApplication.label,
                discountRateSnapshot: governedCalculation.rate
            } : resolveCheckoutDiscount({
                payload: {
                    ...payload,
                    discount_amount: round4(Math.max(0, Number(payload.discount_amount || 0) - itemDiscountAmount))
                },
                subtotalAmount: itemDiscountCalculation.total_amount,
                settings
            });
            const globalDiscountAmount = round4(globalDiscountResolution.discountAmount);
            const discountAmount = round4(itemDiscountAmount + globalDiscountAmount);
            const hasLegacyDiscount = !governedApplication && (
                globalDiscountAmount > 0
                || globalDiscountResolution.discountRateSnapshot != null
            );
            if (hasLegacyDiscount) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Every POS discount must be authorized with an employee PIN.',
                    { statusCode: 403, details: { reason_code: 'DISCOUNT_APPROVAL_REQUIRED' } }
                );
            }
            const primaryGovernedBeneficiary = governedApplication?.beneficiaries?.[0];
            const discountBeneficiary = primaryGovernedBeneficiary
                ? { category: primaryGovernedBeneficiary.category, name: primaryGovernedBeneficiary.name, id_number: primaryGovernedBeneficiary.id_number }
                : normalizeDiscountBeneficiary({
                    payload,
                    discountLabelSnapshot: globalDiscountResolution.discountLabelSnapshot
                });
            const discountBeneficiaries = governedApplication?.beneficiaries?.map((beneficiary, index) => ({
                category: beneficiary.category,
                name: beneficiary.name,
                id_number: beneficiary.id_number,
                discount_amount: governedCalculation?.beneficiaries?.[index]?.calculation?.discount_amount || 0,
                vat_removed: governedCalculation?.beneficiaries?.[index]?.calculation?.vat_removed || 0,
                vat_exempt_amount: governedCalculation?.beneficiaries?.[index]?.calculation?.vat_exempt_amount || 0
            })) || [];
            const transactionSpecialInstructions = buildTransactionSpecialInstructions({
                rawSpecialInstructions: payload.special_instructions,
                discountBeneficiary,
                discountBeneficiaries,
                receiptContract: resolvedReceiptContract
            });
            const netItemsTotal = governedCalculation
                ? round4(itemDiscountCalculation.total_amount - governedCalculation.vat_removed - governedCalculation.discount_amount)
                : round4(itemDiscountCalculation.total_amount - globalDiscountAmount);
            const serviceFeeResolution = resolveCheckoutServiceFee({
                payload: { ...payload, order_method: normalizedOrderMethod },
                grossSubtotal: subtotalAmount
            });
            const serviceFeeAmount = round4(serviceFeeResolution.serviceFeeAmount);
            const restaurantServiceChargeResolution = resolveRestaurantServiceCharge({
                payload,
                settings,
                netItemsTotal,
                useSettings: hasFnbCheckoutContext
            });
            const restaurantServiceChargeAmount = round4(restaurantServiceChargeResolution.restaurantServiceChargeAmount);
            const totalAmount = round4(netItemsTotal + serviceFeeAmount + restaurantServiceChargeAmount);

            if (quoteOnly) {
                if (ownsTransaction) await transaction.commit();
                return ok({
                    quote: {
                        subtotal_amount: subtotalAmount,
                        discount_amount: discountAmount,
                        service_fee_amount: serviceFeeAmount,
                        restaurant_service_charge_amount: restaurantServiceChargeAmount,
                        total_amount: totalAmount,
                        discount_approval: governedApplication ? {
                            discount_type: governedApplication.type,
                            approver_user_id: governedApplication.manager_approval_id || null,
                            employee_user_id: governedApplication.employee_user_id || null,
                            employee_directory_id: governedApplication.employee_directory_id || null,
                            self_approved: governedApplication.self_approved === true,
                            approved_at: governedApplication.manager_approved_at || null,
                            operator_user_id: normalizedUserId
                        } : null,
                        item_discount_approvals: itemDiscountApplications.map((application) => ({
                            item_id: application.item_id,
                            discount_type: application.discount_type,
                            approver_user_id: application.manager_approval_id || null,
                            employee_user_id: application.employee_user_id || null,
                            employee_directory_id: application.employee_directory_id || null,
                            self_approved: application.self_approved === true,
                            approved_at: application.manager_approved_at || null,
                            operator_user_id: normalizedUserId
                        }))
                    }
                });
            }

            const normalizedPaymentType = String(payload.payment_type || 'cash').trim().toLowerCase();
            const paymentBreakdown = normalizePosPaymentBreakdown(
                String(payload.payment_session_reference || '').trim() && Array.isArray(payload.payment_breakdown)
                    ? payload.payment_breakdown
                    : [{ payment_type: normalizedPaymentType, count: 1, amount: totalAmount }]
            );
            let preparedEmployeeCreditDebit = null;
            if (normalizedPaymentType === 'employee_credit') {
                if (!employeeCreditService) {
                    throw new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        'Employee Credit service is not configured',
                        { statusCode: 500 }
                    );
                }
                preparedEmployeeCreditDebit = await employeeCreditService.prepareDebit({
                    accountCode: payload.employee_credit?.account_code,
                    amount: totalAmount,
                    transaction
                });
            }
            for (const [index, line] of preparedLines.entries()) {
                line.line_subtotal = governedCalculation
                    ? round4(governedCalculation.lines[index].final_line_amount)
                    : round4(itemDiscountCalculation.lines[index].global_discount_base_amount);
            }

            const adjustedSubtotal = round4(
                preparedLines.reduce((sum, line) => sum + line.line_subtotal, 0)
            );
            const lineDiff = round4(netItemsTotal - adjustedSubtotal);
            if (preparedLines.length > 0 && Math.abs(lineDiff) > 0) {
                const lastLine = preparedLines[preparedLines.length - 1];
                lastLine.line_subtotal = round4(lastLine.line_subtotal + lineDiff);
            }

            let vatableGross = 0;
            let vatExemptSales = 0;
            let zeroRatedSales = 0;

            for (const [index, line] of preparedLines.entries()) {
                const governedLine = governedCalculation?.lines?.[index];
                if (governedLine && Number(governedLine.vat_exempt_amount || 0) > 0) {
                    vatExemptSales += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'vatable') {
                    vatableGross += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'vat_exempt') {
                    vatExemptSales += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'zero_rated') {
                    zeroRatedSales += line.line_subtotal;
                }
            }

            vatableGross = round4(vatableGross);
            vatExemptSales = round4(vatExemptSales);
            zeroRatedSales = round4(zeroRatedSales);
            if (
                restaurantServiceChargeAmount > 0
                && restaurantServiceChargeResolution.restaurantServiceChargeTaxable === true
            ) {
                vatableGross = round4(vatableGross + restaurantServiceChargeAmount);
            }

            const vatableSales = round4(vatableGross / (1 + VAT_RATE));
            const vatAmount = round4(vatableGross - vatableSales);

            const invoiceCounterKey = resolvedReceiptContract.document_type === 'fiscal_invoice'
                ? INVOICE_COUNTER_KEY
                : NON_FISCAL_COUNTER_KEY;
            const invoicePrefix = resolvedReceiptContract.document_type === 'fiscal_invoice'
                ? 'INV'
                : 'NFS';
            const invoiceNumber = await posRepository.nextInvoiceNumber(
                invoiceCounterKey,
                { transaction, prefix: invoicePrefix }
            );
            const fiscalTerminalRegistration = isFiscalReceipt
                ? await resolveVerifiedFiscalTerminalRegistration({
                    posRepository,
                    terminalId: normalizedTerminalId,
                    transaction
                })
                : null;
            if (isFiscalReceipt && typeof posRepository.getVerifiedFiscalTerminalRegistration === 'function' && !fiscalTerminalRegistration) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Verified fiscal terminal registration is required for fiscal checkout',
                    {
                        statusCode: 422,
                        details: { reason_code: 'FISCAL_TERMINAL_REGISTRATION_REQUIRED' }
                    }
                );
            }
            const fnbTableSnapshot = fnbTableId
                ? await posRepository.getFnbTableById(fnbTableId, { transaction })
                : null;
            if (fnbTableId && !fnbTableSnapshot) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'F&B dining table not found',
                    { statusCode: 404 }
                );
            }
            const resolvedFnbTableLabel = fnbTableSnapshot
                ? String(fnbTableSnapshot.label || fnbTableSnapshot.table_number || '').trim().slice(0, 120) || fnbTableLabelSnapshot
                : fnbTableLabelSnapshot;
            const fiscalDocumentSnapshot = isFiscalReceipt
                ? buildFiscalDocumentSnapshot({
                    invoiceNumber,
                    receiptContract: resolvedReceiptContract,
                    settings,
                    terminalRegistration: fiscalTerminalRegistration,
                    buyer: buyerFiscalDetails,
                    lines: preparedLines,
                    totals: {
                        subtotalAmount,
                        vatableSales,
                        vatAmount,
                        vatExemptSales,
                        zeroRatedSales,
                        discountAmount,
                        serviceFeeAmount,
                        restaurantServiceChargeAmount,
                        totalAmount
                    },
                    paymentType: payload.payment_type || 'cash'
                })
                : null;
            const fiscalDocumentHash = fiscalDocumentSnapshot ? hashPayload(fiscalDocumentSnapshot) : null;

            const posTransactionId = await posRepository.createTransactionWithLines({
                header: {
                    invoice_number: invoiceNumber,
                    document_type: resolvedReceiptContract.document_type === 'fiscal_invoice' ? 'fiscal_invoice' : 'non_fiscal_slip',
                    document_context: resolvedReceiptContract.document_context,
                    idempotency_key: idempotencyKey,
                    request_hash: requestHash,
                    cashier_id: normalizedUserId,
                    operator_session_id: normalizedOperatorSessionId,
                    shift_id: normalizedShiftId || null,
                    terminal_id: normalizedTerminalId || null,
                    order_source: 'in_store',
                    order_method: normalizedOrderMethod,
                    fulfillment_status: 'completed',
                    location_id: enforcedCheckoutLocationId,
                    customer_name: String(payload.customer_name || '').trim() || null,
                    customer_email: String(payload.customer_email || '').trim().toLowerCase() || null,
                    customer_phone: String(payload.customer_phone || '').trim() || null,
                    buyer_tin: isFiscalReceipt ? buyerFiscalDetails.tin : null,
                    buyer_business_style: isFiscalReceipt ? buyerFiscalDetails.business_style : null,
                    buyer_address: isFiscalReceipt ? buyerFiscalDetails.address : null,
                    special_instructions: transactionSpecialInstructions,
                    scheduled_for: payload.scheduled_for ? new Date(payload.scheduled_for) : null,
                    payment_type: normalizedPaymentType,
                    payment_status: 'paid',
                    payment_collected_at: preparedEmployeeCreditDebit ? new Date() : null,
                    payment_collected_by: preparedEmployeeCreditDebit ? normalizedUserId : null,
                    payment_collected_shift_id: preparedEmployeeCreditDebit ? (normalizedShiftId || null) : null,
                    payment_collected_terminal_id: preparedEmployeeCreditDebit ? (normalizedTerminalId || null) : null,
                    payment_reference: String(payload.payment_reference || '').trim() || null,
                    payment_provider: String(payload.payment_provider || '').trim() || null,
                    payment_session_reference: String(payload.payment_session_reference || '').trim() || null,
                    payment_breakdown: paymentBreakdown,
                    cash_received: normalizedPaymentType === 'cash' && payload.cash_received != null
                        ? round4(payload.cash_received)
                        : null,
                    change_amount: normalizedPaymentType === 'cash' && payload.change_amount != null
                        ? round4(payload.change_amount)
                        : null,
                    employee_credit_account_id: preparedEmployeeCreditDebit?.accountId || null,
                    employee_credit_user_id: preparedEmployeeCreditDebit?.userId || null,
                    employee_credit_employee_id: preparedEmployeeCreditDebit?.employeeId || null,
                    employee_credit_employee_name_snapshot: preparedEmployeeCreditDebit?.employeeName || null,
                    employee_credit_account_code_snapshot: preparedEmployeeCreditDebit?.maskedAccountCode || null,
                    employee_credit_amount: preparedEmployeeCreditDebit?.amount || null,
                    // Legacy funded balance remains nullable for historical records.
                    employee_credit_balance_after: null,
                    employee_credit_outstanding_after: preparedEmployeeCreditDebit?.outstandingAfter ?? null,
                    employee_credit_authorization_reference: preparedEmployeeCreditDebit?.authorizationReference || null,
                    subtotal_amount: subtotalAmount,
                    vatable_sales: vatableSales,
                    vat_amount: vatAmount,
                    vat_exempt_sales: vatExemptSales,
                    zero_rated_sales: zeroRatedSales,
                    discount_amount: discountAmount,
                    discount_label_snapshot: [
                        itemDiscountAmount > 0 ? 'Item Discount' : null,
                        globalDiscountAmount > 0 ? globalDiscountResolution.discountLabelSnapshot : null
                    ].filter(Boolean).join(' + ') || null,
                    discount_rate_snapshot: itemDiscountAmount > 0 && globalDiscountAmount > 0
                        ? null
                        : (globalDiscountAmount > 0
                            ? globalDiscountResolution.discountRateSnapshot
                            : (itemDiscountApplications.length === 1 && itemDiscountApplications[0].method === 'percentage'
                                ? itemDiscountApplications[0].rate
                                : null)),
                    service_fee_amount: serviceFeeAmount,
                    service_fee_label_snapshot: serviceFeeResolution.serviceFeeLabelSnapshot,
                    service_fee_method_snapshot: serviceFeeResolution.serviceFeeMethodSnapshot,
                    service_fee_overridden: serviceFeeResolution.serviceFeeOverridden,
                    fnb_check_id: fnbCheckId,
                    fnb_table_id: fnbTableId,
                    fnb_table_label_snapshot: resolvedFnbTableLabel,
                    fnb_guest_count: fnbGuestCount,
                    fnb_server_id: fnbServerId,
                    restaurant_service_charge_amount: restaurantServiceChargeAmount,
                    restaurant_service_charge_label_snapshot: restaurantServiceChargeResolution.restaurantServiceChargeLabelSnapshot,
                    restaurant_service_charge_rate_snapshot: restaurantServiceChargeResolution.restaurantServiceChargeRateSnapshot,
                    restaurant_service_charge_taxable: restaurantServiceChargeResolution.restaurantServiceChargeTaxable,
                    fnb_metadata: (
                        fnbCheckId
                        || fnbTableId
                        || fnbGuestCount
                        || fnbServerId
                        || restaurantServiceChargeAmount > 0
                    )
                        ? {
                            check_id: fnbCheckId,
                            table_id: fnbTableId,
                            table_label: resolvedFnbTableLabel,
                            guest_count: fnbGuestCount,
                            server_id: fnbServerId,
                            restaurant_service_charge: restaurantServiceChargeResolution.restaurantServiceChargeSnapshot
                        }
                        : null,
                    total_amount: totalAmount,
                    delivery_fee: 0,
                    status: 'completed',
                    fiscal_document_template_version: isFiscalReceipt ? FISCAL_DOCUMENT_TEMPLATE_VERSION : null,
                    fiscal_document_hash: fiscalDocumentHash,
                    fiscal_document_snapshot: fiscalDocumentSnapshot
                },
                lines: preparedLines
            }, { transaction });
            if (preparedEmployeeCreditDebit) {
                await employeeCreditService.finalizeDebit({
                    prepared: preparedEmployeeCreditDebit,
                    posTransactionId,
                    actorUserId: normalizedUserId,
                    shiftId: normalizedShiftId,
                    terminalId: normalizedTerminalId,
                    locationId: enforcedCheckoutLocationId,
                    idempotencyKey,
                    transaction
                });
            }
            if (governedCalculation && typeof posRepository.createGovernedTransactionDiscount === 'function') {
                await posRepository.createGovernedTransactionDiscount({
                    transactionId: posTransactionId,
                    application: governedApplication,
                    calculation: governedCalculation
                }, { transaction });
                await posRepository.createAuditLog({
                    user_id: normalizedUserId,
                    entity_type: 'pos_discount',
                    entity_id: posTransactionId,
                    action: 'CREATE',
                    event_type: 'pos_discount_applied',
                    shift_id: normalizedShiftId,
                    terminal_id: normalizedTerminalId,
                    location_id: enforcedCheckoutLocationId,
                    changes: {
                        event: 'pos_discount_applied',
                        transaction_id: posTransactionId,
                        invoice_number: invoiceNumber,
                        discount_type: governedApplication.type,
                        discount_method: governedCalculation.method,
                        discount_rate: governedCalculation.rate,
                        discount_amount: governedCalculation.discount_amount,
                        original_total: subtotalAmount,
                        final_total: totalAmount,
                        selected_employee_id: governedApplication.type === 'employee'
                            ? governedApplication.employee_id || null
                            : null,
                        selected_employee_directory_id: governedApplication.type === 'employee'
                            ? governedApplication.employee_directory_id || null
                            : null,
                        selected_employee_name: governedApplication.type === 'employee'
                            ? governedApplication.employee_name || null
                            : null,
                        applied_by_user_id: normalizedUserId,
                        applied_by_name: String(user?.username || '').trim() || null,
                        cashier_user_id: normalizedUserId,
                        cashier_name: String(user?.username || '').trim() || null,
                        authorized_by_user_id: governedApplication.manager_approval_id || null,
                        authorized_by_name: governedApplication.manager_approval_name || null,
                        authorized_at: governedApplication.manager_approved_at || null,
                        approved_by_user_id: governedApplication.manager_approval_id || null,
                        approved_by_name: governedApplication.manager_approval_name || null,
                        approved_at: governedApplication.manager_approved_at || null,
                        self_approved: governedApplication.self_approved === true,
                        beneficiary_count: governedApplication.beneficiaries?.length || 0
                    }
                }, { transaction });
            }
            if (itemDiscountAmount > 0 && typeof posRepository.createAuditLog === 'function') {
                for (const line of preparedLines) {
                    const snapshot = line.item_discount_snapshot;
                    const lineDiscountAmount = round4(snapshot?.discount_amount || 0);
                    if (!snapshot || lineDiscountAmount <= 0) continue;
                    await posRepository.createAuditLog({
                        user_id: normalizedUserId,
                        entity_type: 'pos_item_discount',
                        entity_id: posTransactionId,
                        action: 'CREATE',
                        event_type: 'pos_item_discount_applied',
                        shift_id: normalizedShiftId,
                        terminal_id: normalizedTerminalId,
                        location_id: enforcedCheckoutLocationId,
                        changes: {
                            event: 'pos_item_discount_applied',
                            transaction_id: posTransactionId,
                            invoice_number: invoiceNumber,
                            item_id: line.item_id,
                            item_name: line.item_name,
                            discount_type: snapshot.discount_type || 'manual',
                            discount_method: snapshot.method || null,
                            discount_rate: snapshot.rate ?? null,
                            discount_amount: lineDiscountAmount,
                            original_line_total: round4(Number(line.quantity || 0) * Number(line.sale_price || 0)),
                            final_line_total: round4(line.global_discount_base_amount || 0),
                            selected_employee_id: snapshot.employee_id || null,
                            selected_employee_directory_id: snapshot.employee_directory_id || null,
                            selected_employee_name: snapshot.employee_name || null,
                            applied_by_user_id: normalizedUserId,
                            applied_by_name: String(user?.username || '').trim() || null,
                            cashier_user_id: normalizedUserId,
                            cashier_name: String(user?.username || '').trim() || null,
                            authorized_by_user_id: snapshot.approver_user_id || null,
                            authorized_by_name: snapshot.approver_name || null,
                            authorized_at: snapshot.approved_at || null,
                            approved_by_user_id: snapshot.approver_user_id || null,
                            approved_by_name: snapshot.approver_name || null,
                            approved_at: snapshot.approved_at || null,
                            self_approved: snapshot.self_approved === true
                        }
                    }, { transaction });
                }
            }
            if (governedResolution?.promo?.applied) {
                const promoUsageUpdate = buildCommercialPromoUsageUpdate({
                    settings: discountSettings,
                    promoApplication: governedResolution.promo
                });
                if (promoUsageUpdate) {
                    await posRepository.updateSystemSettingValueByKey(
                        promoUsageUpdate.key,
                        promoUsageUpdate.value,
                        { transaction, lock: true }
                    );
                }
            } else if (itemPromoResolution?.applied) {
                const promoUsageUpdate = buildCommercialPromoUsageUpdate({
                    settings: discountSettings,
                    promoApplication: itemPromoResolution
                });
                if (promoUsageUpdate) {
                    await posRepository.updateSystemSettingValueByKey(
                        promoUsageUpdate.key,
                        promoUsageUpdate.value,
                        { transaction, lock: true }
                    );
                }
            }

            if (isFiscalReceipt && typeof posRepository.createFiscalEvent === 'function') {
                await posRepository.createFiscalEvent({
                    pos_transaction_id: posTransactionId,
                    event_type: 'checkout_issued',
                    document_type: resolvedReceiptContract.document_type,
                    invoice_number: invoiceNumber,
                    terminal_id: normalizedTerminalId || fiscalTerminalRegistration?.terminal_id || null,
                    fiscal_document_hash: fiscalDocumentHash,
                    payload: {
                        receipt_contract: resolvedReceiptContract,
                        fiscal_document_hash: fiscalDocumentHash,
                        fiscal_document_template_version: FISCAL_DOCUMENT_TEMPLATE_VERSION
                    },
                    actor_user_id: normalizedUserId
                }, { transaction });
            }

            if (restaurantServiceChargeAmount > 0) {
                await posRepository.createFnbServiceChargeSnapshot({
                    pos_transaction_id: posTransactionId,
                    check_id: fnbCheckId,
                    label_snapshot: restaurantServiceChargeResolution.restaurantServiceChargeLabelSnapshot,
                    amount: restaurantServiceChargeAmount,
                    rate_snapshot: restaurantServiceChargeResolution.restaurantServiceChargeRateSnapshot,
                    taxable: restaurantServiceChargeResolution.restaurantServiceChargeTaxable,
                    settings_snapshot: restaurantServiceChargeResolution.restaurantServiceChargeSnapshot
                }, { transaction });
            }

            if (
                hasFnbCheckoutContext
            ) {
                if (typeof posRepository.createFnbKitchenOrderForTransaction !== 'function') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'F&B kitchen order persistence is unavailable for POS checkout',
                        {
                            statusCode: 409,
                            details: { reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE' }
                        }
                    );
                }
                const kitchenOrder = await posRepository.createFnbKitchenOrderForTransaction({
                    pos_transaction_id: posTransactionId,
                    check_id: fnbCheckId,
                    table_id: fnbTableId,
                    order_notes: String(payload.special_instructions || '').trim() || null,
                    server_id: fnbServerId,
                    guest_count: fnbGuestCount,
                    order_method: normalizedOrderMethod,
                    lines: preparedLines,
                    recipe_movements: recipeMovementPlanByPreparedLine.flat()
                }, { transaction });
                if (!kitchenOrder) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'F&B kitchen order could not be created for POS checkout',
                        {
                            statusCode: 409,
                            details: { reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE' }
                        }
                    );
                }
            }

            if (fnbCheckId) {
                await posRepository.settleFnbCheck({
                    checkId: fnbCheckId,
                    posTransactionId
                }, { transaction, lock: true });
            }

            for (let lineIndex = 0; lineIndex < preparedLines.length; lineIndex += 1) {
                const line = preparedLines[lineIndex];
                // Recipe consumption always fires when the line has one, regardless
                // of the finished item's own stock_effect_type: an untracked/toggle/
                // service dish still physically consumes real ingredients. Only the
                // finished item's own (movement-exempt) stock effect is skipped below.
                const recipeMovements = recipeMovementPlanByPreparedLine[lineIndex] || [];
                if (recipeMovements.length > 0) {
                    for (const movement of recipeMovements) {
                        await executeInventoryStockCommand({
                            inventoryCommandService: stockCommands,
                            command: 'issueStockForPosSale',
                            movementData: {
                                item_id: movement.ingredient_item_id,
                                quantity: Number(movement.quantity),
                                movement_type: 'goods_issue',
                                location_id: enforcedCheckoutLocationId,
                                reference_type: 'POS',
                                reference_id: String(posTransactionId),
                                notes: `F&B recipe consumption for ${movement.product_name} on POS checkout ${invoiceNumber}`
                            },
                            userId: normalizedUserId,
                            transaction
                        });
                    }
                } else if (line.stock_effect_type !== 'stock_exempt') {
                    await executeInventoryStockCommand({
                        inventoryCommandService: stockCommands,
                        command: 'issueStockForPosSale',
                        movementData: {
                            item_id: line.item_id,
                            quantity: Number(line.quantity),
                            movement_type: 'goods_issue',
                            location_id: enforcedCheckoutLocationId,
                            reference_type: 'POS',
                            reference_id: String(posTransactionId),
                            notes: `POS checkout ${invoiceNumber}`
                        },
                        userId: normalizedUserId,
                        transaction
                    });
                }

                for (const modifier of line.fnb_modifiers_snapshot || []) {
                    const linkedItemId = parsePositiveInt(modifier?.sku_item_id);
                    if (!linkedItemId) continue;
                    await executeInventoryStockCommand({
                        inventoryCommandService: stockCommands,
                        command: 'issueStockForPosSale',
                        movementData: {
                            item_id: linkedItemId,
                            quantity: Number(line.quantity) * Math.min(99, Math.max(1, Number.parseInt(modifier?.quantity || 1, 10) || 1)),
                            movement_type: 'goods_issue',
                            location_id: parsePositiveInt(modifier?.location_id) || enforcedCheckoutLocationId,
                            reference_type: 'POS',
                            reference_id: String(posTransactionId),
                            notes: `F&B modifier consumption for ${modifier.option_name || `item ${linkedItemId}`} on POS checkout ${invoiceNumber}`
                        },
                        userId: normalizedUserId,
                        transaction
                    });
                }
            }

            const totalAmountCents = toCurrencyCents(totalAmount);
            if (totalAmountCents > 0) {
                await posRepository.incrementPersistentCounter(
                    FISCAL_LIFETIME_COUNTER_KEY,
                    totalAmountCents,
                    { transaction }
                );
            }

            const created = await posRepository.getTransactionById(
                posTransactionId,
                { transaction }
            );

            await runCheckoutBeforeCommit({
                transactionId: posTransactionId,
                idempotentReplay: false
            });
            if (ownsTransaction) await transaction.commit();

            // Best-effort, post-commit: the enrollment was already validated pre-commit above, so
            // this only writes bookkeeping (attribution + earned commission) and must never fail
            // the sale that already succeeded - mirrors recordDgfyOrderActivity's convention.
            if (affiliateEnrollment) {
                try {
                    // #1199 (Phase 220, decided 2026-08-31): re-verify the enrollment against the
                    // database at commit time rather than trusting the pre-commit resolve above.
                    // affiliateEnrollment is a snapshot taken before the transaction ran; a checkout
                    // can span real work in between (inventory movements, discount approval, the
                    // commit itself), and if the affiliate was revoked/suspended - or the tenant's
                    // program disabled - inside that window, the cached object is stale. This is
                    // the same by-id re-verify Phase 206 (#450 D2) already applies on the storefront
                    // checkout path, extended to in-store. Plain, non-locking read on the default
                    // connection - no lock, no FOR UPDATE, no transaction handle needed or wanted
                    // here (accrual is already idempotent on (tenant_id, order_reference)).
                    const verifiedEnrollment = await resolveActiveAffiliateEnrollmentById({
                        tenantId,
                        enrollmentId: affiliateEnrollment.enrollment_id
                    });
                    if (verifiedEnrollment) {
                        await accrueEarnedForInStoreSale({
                            tenantId,
                            enrollment: verifiedEnrollment,
                            orderReference: String(posTransactionId),
                            posTransactionId,
                            commissionableBaseCentavos: Math.max(0, toCurrencyCents(subtotalAmount) - toCurrencyCents(discountAmount)),
                            // #448 (Phase 209): per-line weights ONLY - the commissionable base above is
                            // unchanged and stays the single source of the total. line_subtotal here is
                            // already discount-allocated (see the rewrite ~:3877) but its SUM is
                            // netItemsTotal, which subtracts vat_removed on the governed senior/PWD
                            // branch - so these are relative weights, never absolute bases.
                            commissionLines: preparedLines.map((line) => ({
                                folderId: line.folder_id_snapshot ?? null,
                                weightCentavos: Math.max(0, toCurrencyCents(line.line_subtotal))
                            }))
                        });
                    } else {
                        // In-flight attribution drop (#1199 D2, mirroring #450 D2 on storefront):
                        // the entry-time 422 gate (~:2984) already hard-rejects an unresolvable code
                        // before any write, so on POS - unlike storefront - a null re-check here is
                        // always the in-flight case, never an already-stale one. A bare else, not
                        // else-if. The sale stands; only the commission is withheld. Logged (never
                        // thrown) so the drop is attributable later - same non-blocking convention
                        // as the catch block below.
                        logger.warn('[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit', {
                            tenantId,
                            posTransactionId,
                            enrollment_id: affiliateEnrollment.enrollment_id
                        });
                    }
                } catch (accrualError) {
                    logger.warn('[PosUseCases] Failed to accrue affiliate commission for in-store sale', {
                        tenantId,
                        posTransactionId,
                        error: accrualError?.message
                    });
                }
            }

            return ok({
                idempotent_replay: false,
                compliance_decision: complianceDecision,
                terminal_identity_policy: terminalPolicyContext,
                receipt_contract: resolvedReceiptContract,
                transaction: toSerializable(created)
            });
        } catch (error) {
            if (ownsTransaction && !transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to complete POS checkout'));
        }
    };
};

export const buildRecordFiscalPrintEventUseCase = ({ posRepository }) => {
    return async ({ posTransactionId, payload = {}, user = {} } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        if (!normalizedTransactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const existing = await posRepository.getTransactionById(normalizedTransactionId, { transaction, lock: true });
            if (!existing || existing.document_type !== 'fiscal_invoice') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Fiscal print evidence can only be recorded for fiscal invoices',
                    { statusCode: 422 }
                );
            }

            const existingPrintCount = typeof posRepository.countFiscalPrintEvents === 'function'
                ? await posRepository.countFiscalPrintEvents(normalizedTransactionId, { transaction })
                : 0;
            const printSequence = existingPrintCount + 1;
            const printType = printSequence === 1 ? 'original' : 'reprint';
            const reason = String(payload.reason || '').trim() || null;
            if (printType === 'reprint' && (!reason || reason.length < 3)) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Reprint reason is required',
                    { statusCode: 422 }
                );
            }

            const printEvent = await posRepository.createFiscalPrintEvent({
                pos_transaction_id: normalizedTransactionId,
                print_type: printType,
                print_sequence: printSequence,
                reason,
                fiscal_document_hash: existing.fiscal_document_hash || null,
                actor_user_id: actorUserId
            }, { transaction });
            const fiscalEvent = typeof posRepository.createFiscalEvent === 'function'
                ? await posRepository.createFiscalEvent({
                    pos_transaction_id: normalizedTransactionId,
                    event_type: printType === 'original' ? 'print_original' : 'print_reprint',
                    document_type: existing.document_type,
                    invoice_number: existing.invoice_number,
                    terminal_id: existing.terminal_id || null,
                    fiscal_document_hash: existing.fiscal_document_hash || null,
                    payload: {
                        print_type: printType,
                        print_sequence: printSequence,
                        reason,
                        fiscal_document_hash: existing.fiscal_document_hash || null
                    },
                    actor_user_id: actorUserId
                }, { transaction })
                : null;
            if (printType === 'reprint' && typeof posRepository.updateTransactionLifecycle === 'function') {
                await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                    fiscal_reprint_count: Math.max(0, printSequence - 1)
                }, { transaction });
            }

            await transaction.commit();
            return ok({
                ...toSerializable(printEvent),
                print_type: printType,
                fiscal_event_hash: fiscalEvent?.event_hash || null
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to record fiscal print event'));
        }
    };
};

export const buildVoidPosTransactionUseCase = ({ posRepository, inventoryCommandService, employeeCreditService }) => {
    // Phase 9: see buildCheckoutPosUseCase's comment above - no
    // `|| stockMovementService` silent fallback.
    const stockCommands = inventoryCommandService;
    return async ({ posTransactionId, payload = {}, user = {}, trustedMobileReplay = false } = {}) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        const actorUserId = parsePositiveInt(user?.user_id);
        const operatorSessionId = parsePositiveInt(user?.operator_session_id);
        const reason = String(payload.reason || '').trim();
        const hasShiftIdPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'shift_id')
            && payload.shift_id != null
            && String(payload.shift_id).trim() !== '';
        const activeShiftId = parsePositiveInt(payload.shift_id);
        const activeTerminalId = sanitizeTerminalId(payload.terminal_id) || null;
        const terminalLocationId = parsePositiveInt(payload.terminal_location_id);
        const requestedVoidIdempotencyKey = String(payload.idempotency_key || '').trim();
        const expectedStatus = String(payload.expected_status || '').trim().toLowerCase() || null;
        const expectedServerVersion = String(payload.expected_server_version || '').trim() || null;
        const adminShiftBypass = isPosAdminOperator(user) && !activeShiftId;
        if (!normalizedTransactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (reason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Void reason is required',
                { statusCode: 422 }
            ));
        }
        if (!actorUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required to void a POS transaction',
                { statusCode: 401 }
            ));
        }
        if (hasShiftIdPayload && !activeShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'shift_id must be a positive integer when provided',
                { statusCode: 422 }
            ));
        }
        if (!activeShiftId && !adminShiftBypass && !trustedMobileReplay) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'An active shift is required to void a POS transaction',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const existing = await posRepository.getTransactionById(normalizedTransactionId, { transaction, lock: true });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'POS transaction was not found',
                    { statusCode: 404 }
                );
            }

            if (activeShiftId && !trustedMobileReplay) {
                await assertOpenShiftForPosMutation({
                    posRepository,
                    cashierId: actorUserId,
                    shiftId: activeShiftId,
                    terminalId: activeTerminalId,
                    locationId: terminalLocationId,
                    shiftOwnerCashierId: user?.register_shift_owner_user_id || null,
                    authorizedOperatorUserId: user?.register_shift_owner_user_id ? actorUserId : null,
                    transaction,
                    lock: true
                });
            }

            const transactionShiftId = parsePositiveInt(existing.shift_id);
            const transactionLocationId = parsePositiveInt(existing.location_id);
            if (terminalLocationId && transactionLocationId !== terminalLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'POS transaction location does not match the registered terminal location.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.TRANSACTION_LOCATION_MISMATCH,
                    statusCode: 403,
                    details: {
                        transaction_id: normalizedTransactionId,
                        transaction_location_id: transactionLocationId,
                        terminal_location_id: terminalLocationId
                    }
                });
            }
            const auditShiftId = transactionShiftId || activeShiftId || null;
            const authorizationMode = trustedMobileReplay
                ? 'mobile_offline_replay'
                : (adminShiftBypass ? 'admin_shift_bypass' : 'cashier_shift');
            const originalCashierId = parsePositiveInt(existing.cashier_id);
            const tenderType = String(existing.payment_type || 'unknown').trim().toLowerCase() || 'unknown';
            const paymentStatusBeforeVoid = String(existing.payment_status || 'unknown').trim().toLowerCase() || 'unknown';
            const financialOutcome = resolvePosVoidFinancialOutcome(existing);
            const voidAdjustmentIdempotencyKey = requestedVoidIdempotencyKey || `pos-void:${normalizedTransactionId}`;
            const voidAdjustmentPayload = {
                pos_transaction_id: normalizedTransactionId,
                reason,
                actor_user_id: actorUserId,
                actor_shift_id: activeShiftId || null,
                actor_terminal_id: activeTerminalId || null,
                actor_location_id: terminalLocationId || null,
                original_cashier_id: originalCashierId,
                original_shift_id: transactionShiftId,
                original_terminal_id: existing.terminal_id || null,
                original_location_id: transactionLocationId,
                tender_type: tenderType,
                payment_status: paymentStatusBeforeVoid,
                amount: round4(Number(existing.total_amount || 0)),
                authorization_mode: authorizationMode,
                financial_outcome: financialOutcome
            };
            const voidAdjustmentRequestHash = hashPayload(voidAdjustmentPayload);
            const existingVoidAdjustment = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(
                normalizedTransactionId,
                voidAdjustmentIdempotencyKey,
                { transaction, lock: true }
            );
            if (existingVoidAdjustment) {
                if (String(existingVoidAdjustment.request_hash || '') !== voidAdjustmentRequestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'POS void evidence already exists for a different request',
                        { statusCode: 409 }
                    );
                }
                await transaction.commit();
                return ok({
                    transaction: toSerializable(existing),
                    stock_reversals: [],
                    authorization_mode: authorizationMode,
                    transaction_shift_id: transactionShiftId,
                    financial_outcome: financialOutcome,
                    idempotent_replay: true,
                    replay_outcome: 'idempotent_replay'
                });
            }
            if (existing.status === 'voided') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'POS transaction is not available for voiding',
                    { statusCode: 409, details: { reason_code: 'POS_TRANSACTION_ALREADY_VOIDED' } }
                );
            }
            if (expectedStatus && String(existing.status || '').trim().toLowerCase() !== expectedStatus) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'POS transaction status changed before the offline void was applied',
                    { statusCode: 409, details: { reason_code: 'MOBILE_VOID_STATUS_CONFLICT', expected_status: expectedStatus, actual_status: existing.status } }
                );
            }
            const actualServerVersion = existing.updated_at instanceof Date
                ? existing.updated_at.toISOString()
                : String(existing.updated_at || '').trim();
            if (expectedServerVersion && actualServerVersion && expectedServerVersion !== actualServerVersion) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'POS transaction changed before the offline void was applied',
                    { statusCode: 409, details: { reason_code: 'MOBILE_VOID_VERSION_CONFLICT', expected_server_version: expectedServerVersion, actual_server_version: actualServerVersion } }
                );
            }

            const stockMovements = typeof posRepository.listStockMovementsForPosTransaction === 'function'
                ? await posRepository.listStockMovementsForPosTransaction(normalizedTransactionId, { transaction })
                : [];
            const stockReversals = [];
            for (const movement of stockMovements || []) {
                const quantity = Math.abs(Number(movement.quantity || 0));
                if (quantity <= 0) continue;
                const reversal = await executeInventoryStockCommand({
                    inventoryCommandService: stockCommands,
                    command: 'returnStockForVoidedSale',
                    movementData: {
                        item_id: movement.item_id,
                        quantity,
                        movement_type: 'return',
                        location_id: movement.location_id || existing.location_id || null,
                        reference_type: 'POS',
                        reference_id: String(normalizedTransactionId),
                        notes: `POS void reversal for ${existing.invoice_number}`
                    },
                    userId: actorUserId,
                    transaction
                });
                stockReversals.push({
                    original_movement_id: movement.movement_id || null,
                    reversal_movement_id: reversal?.movement_id || null
                });
            }

            const fiscalEvent = existing.document_type === 'fiscal_invoice' && typeof posRepository.createFiscalEvent === 'function'
                ? await posRepository.createFiscalEvent({
                    pos_transaction_id: normalizedTransactionId,
                    event_type: 'void',
                    document_type: existing.document_type,
                    invoice_number: existing.invoice_number,
                    terminal_id: existing.terminal_id || null,
                    fiscal_document_hash: existing.fiscal_document_hash || null,
                    payload: {
                        reason,
                        fiscal_document_hash: existing.fiscal_document_hash || null
                    },
                    actor_user_id: actorUserId
                }, { transaction })
                : null;
            if (String(existing.payment_type || '').trim().toLowerCase() === 'employee_credit') {
                if (!employeeCreditService) {
                    throw new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        'Employee Credit service is not configured',
                        { statusCode: 500 }
                    );
                }
                await employeeCreditService.reverseForVoid({
                    posTransaction: existing,
                    actorUserId,
                    reason,
                    transaction
                });
            }
            const voidedAt = new Date();
            const updated = await posRepository.updateTransactionLifecycle(normalizedTransactionId, {
                status: 'voided',
                voided_at: voidedAt,
                voided_by: actorUserId,
                void_reason: reason,
                fiscal_lifecycle_state: existing.document_type === 'fiscal_invoice' ? 'voided' : existing.fiscal_lifecycle_state,
                fiscal_void_event_hash: fiscalEvent?.event_hash || existing.fiscal_void_event_hash || null
            }, { transaction });

            const voidAdjustment = await posRepository.createPosTransactionAdjustment({
                adjustment_reference: `POS-VOID-${normalizedTransactionId}`,
                pos_transaction_id: normalizedTransactionId,
                original_cashier_id: originalCashierId,
                original_shift_id: transactionShiftId,
                original_terminal_id: existing.terminal_id || null,
                original_location_id: transactionLocationId,
                actor_user_id: actorUserId,
                actor_shift_id: activeShiftId || null,
                actor_terminal_id: activeTerminalId || null,
                actor_location_id: terminalLocationId || null,
                adjustment_type: 'void',
                tender_type: tenderType,
                amount: round4(Number(existing.total_amount || 0)),
                currency: 'PHP',
                status: 'succeeded',
                reason,
                idempotency_key: voidAdjustmentIdempotencyKey,
                request_hash: voidAdjustmentRequestHash,
                completed_at: voidedAt,
                metadata: {
                    evidence_scope: 'internal_void_only',
                    operator_session_id: operatorSessionId,
                    authorization_mode: authorizationMode,
                    payment_status_before_void: paymentStatusBeforeVoid,
                    transaction_shift_id: transactionShiftId,
                    actor_shift_id: activeShiftId || null,
                    financial_outcome: financialOutcome
                }
            }, { transaction });
            if (!voidAdjustment || String(voidAdjustment.request_hash || '') !== voidAdjustmentRequestHash) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'POS void evidence could not be recorded consistently',
                    { statusCode: 409 }
                );
            }

            await posRepository.createAuditLog({
                user_id: actorUserId,
                entity_type: 'pos_transaction',
                entity_id: normalizedTransactionId,
                action: 'UPDATE',
                event_type: 'pos_transaction_voided',
                terminal_id: activeTerminalId || existing.terminal_id || null,
                shift_id: auditShiftId,
                location_id: existing.location_id || null,
                reason,
                changes: {
                    event: 'pos_transaction_voided',
                    operator_session_id: operatorSessionId,
                    status: 'voided',
                    reason,
                    invoice_number: existing.invoice_number || null,
                    total_amount: Number(existing.total_amount || 0),
                    shift_id: auditShiftId,
                    transaction_shift_id: transactionShiftId,
                    actor_shift_id: activeShiftId || null,
                    original_cashier_id: originalCashierId,
                    voided_by: actorUserId,
                    authorization_mode: authorizationMode,
                    terminal_id: activeTerminalId || existing.terminal_id || null,
                    location_id: existing.location_id || null,
                        stock_reversals: stockReversals,
                        fiscal_event_hash: fiscalEvent?.event_hash || null,
                        adjustment_reference: voidAdjustment.adjustment_reference,
                        financial_outcome: financialOutcome
                }
            }, { transaction });

            await transaction.commit();

            // Best-effort, post-commit reversal of any in-store affiliate commission tied to this
            // sale - must never fail the void that already succeeded.
            try {
                const voidTenantId = String(dbStore.getStore()?.tenantId || '').trim();
                await reverseAffiliateCommissionForOrder({
                    tenantId: voidTenantId,
                    orderReference: String(normalizedTransactionId)
                });
            } catch (reversalError) {
                logger.warn('[PosUseCases] Failed to reverse affiliate commission for voided transaction', {
                    posTransactionId: normalizedTransactionId,
                    error: reversalError?.message
                });
            }

            return ok({
                transaction: toSerializable(updated),
                stock_reversals: stockReversals,
                authorization_mode: authorizationMode,
                transaction_shift_id: transactionShiftId,
                financial_outcome: financialOutcome
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to void POS transaction'));
        }
    };
};

export const buildGenerateESalesReportUseCase = ({ posRepository }) => {
    return async ({ payload = {}, user = {} } = {}) => {
        const reportMonth = String(payload.report_month || '').trim();
        const actorUserId = parsePositiveInt(user?.user_id);
        if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'report_month must use YYYY-MM format',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const rows = await posRepository.listFiscalTransactionsForMonth(reportMonth, { transaction });
            const transactions = (Array.isArray(rows) ? rows : []).map(toSerializable);
            const completed = transactions.filter((row) => row.status !== 'voided');
            const voided = transactions.filter((row) => row.status === 'voided');
            const sum = (list, key) => round4(list.reduce((total, row) => total + Number(row?.[key] || 0), 0));
            const reportPayload = {
                report_month: reportMonth,
                generated_at: new Date().toISOString(),
                summary: {
                    transaction_count: completed.length,
                    voided_transaction_count: voided.length,
                    gross_total_amount: sum(transactions, 'total_amount'),
                    voided_total_amount: sum(voided, 'total_amount'),
                    net_total_amount: sum(completed, 'total_amount'),
                    vatable_sales: sum(completed, 'vatable_sales'),
                    vat_amount: sum(completed, 'vat_amount'),
                    vat_exempt_sales: sum(completed, 'vat_exempt_sales'),
                    zero_rated_sales: sum(completed, 'zero_rated_sales')
                },
                transactions: transactions.map((row) => ({
                    pos_transaction_id: row.pos_transaction_id,
                    invoice_number: row.invoice_number,
                    created_at: row.created_at,
                    terminal_id: row.terminal_id,
                    buyer_tin: row.buyer_tin || null,
                    vatable_sales: Number(row.vatable_sales || 0),
                    vat_amount: Number(row.vat_amount || 0),
                    vat_exempt_sales: Number(row.vat_exempt_sales || 0),
                    zero_rated_sales: Number(row.zero_rated_sales || 0),
                    total_amount: Number(row.total_amount || 0),
                    status: row.status,
                    fiscal_document_hash: row.fiscal_document_hash || null,
                    fiscal_document_snapshot: row.fiscal_document_snapshot || null
                }))
            };
            const payloadHash = hashPayload(reportPayload);
            const report = await posRepository.upsertESalesReport({
                report_month: reportMonth,
                status: 'generated',
                payload: reportPayload,
                payload_hash: payloadHash,
                generated_by: actorUserId
            }, { transaction });
            if (typeof posRepository.createFiscalEvent === 'function') {
                await posRepository.createFiscalEvent({
                    event_type: 'esales_export',
                    payload: {
                        report_month: reportMonth,
                        payload_hash: payloadHash,
                        status: 'generated'
                    },
                    actor_user_id: actorUserId
                }, { transaction });
            }

            await transaction.commit();
            return ok({ report: toSerializable(report) });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to generate eSales report'));
        }
    };
};

export const buildListESalesReportsUseCase = ({ posRepository }) => {
    return async () => {
        try {
            const reports = typeof posRepository.listESalesReports === 'function'
                ? await posRepository.listESalesReports()
                : [];
            return ok({ reports: (reports || []).map(toSerializable) });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list eSales reports'));
        }
    };
};

export const buildUpdateESalesReportStatusUseCase = ({ posRepository }) => {
    return async ({ reportId, payload = {}, user = {} } = {}) => {
        const normalizedReportId = parsePositiveInt(reportId);
        const status = String(payload.status || '').trim().toLowerCase();
        const actorUserId = parsePositiveInt(user?.user_id);
        if (!normalizedReportId || !ESALES_REPORT_STATUSES.has(status) || status === 'generated') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid report id and status are required',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const existing = await posRepository.findESalesReportById(normalizedReportId, { transaction, lock: true });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'eSales report not found',
                    { statusCode: 404 }
                );
            }
            const updatePayload = {
                status,
                status_evidence_ref: String(payload.status_evidence_ref || '').trim() || null,
                status_note: String(payload.status_note || '').trim() || null
            };
            if (status === 'submitted') {
                updatePayload.submitted_by = actorUserId;
                updatePayload.submitted_at = new Date();
            }
            const report = await posRepository.updateESalesReportStatus(normalizedReportId, updatePayload, { transaction });
            if (typeof posRepository.createFiscalEvent === 'function') {
                await posRepository.createFiscalEvent({
                    event_type: 'esales_export',
                    payload: {
                        report_id: normalizedReportId,
                        report_month: existing.report_month,
                        payload_hash: existing.payload_hash || null,
                        status,
                        status_evidence_ref: updatePayload.status_evidence_ref,
                        status_note: updatePayload.status_note
                    },
                    actor_user_id: actorUserId
                }, { transaction });
            }

            await transaction.commit();
            return ok({ report: toSerializable(report) });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to update eSales report status'));
        }
    };
};

export const buildUpsertFiscalTerminalRegistrationUseCase = ({ posRepository }) => {
    return async ({ payload = {}, user = {} } = {}) => {
        const terminalId = String(payload.terminal_id || '').trim().toUpperCase();
        const status = String(payload.accreditation_status || 'draft').trim().toLowerCase();
        const actorUserId = parsePositiveInt(user?.user_id);
        if (!terminalId || !TERMINAL_ID_PATTERN.test(terminalId)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'terminal_id is required',
                { statusCode: 422 }
            ));
        }
        if (status === 'verified') {
            const missing = [
                ['min_number', payload.min_number],
                ['machine_serial_number', payload.machine_serial_number],
                ['software_serial_number', payload.software_serial_number],
                ['ptu_number', payload.ptu_number]
            ].filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
            if (missing.length) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Fiscal terminal verification is incomplete',
                    {
                        statusCode: 422,
                        details: {
                            reason_code: 'FISCAL_TERMINAL_VERIFICATION_INCOMPLETE',
                            missing_fields: missing
                        }
                    }
                ));
            }
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        try {
            const registration = await posRepository.upsertFiscalTerminalRegistration({
                terminal_id: terminalId,
                location_id: parsePositiveInt(payload.location_id),
                min_number: String(payload.min_number || '').trim() || null,
                machine_serial_number: String(payload.machine_serial_number || '').trim() || null,
                software_version: String(payload.software_version || '').trim() || null,
                software_serial_number: String(payload.software_serial_number || '').trim() || null,
                ptu_number: String(payload.ptu_number || '').trim() || null,
                receipt_printer_binding: String(payload.receipt_printer_binding || '').trim() || null,
                cash_drawer_binding: String(payload.cash_drawer_binding || '').trim() || null,
                accreditation_status: status,
                evidence_ref: String(payload.evidence_ref || '').trim() || null,
                registered_by: actorUserId,
                verified_by: status === 'verified' ? actorUserId : null,
                verified_at: status === 'verified' ? new Date() : null
            }, { transaction });
            if (typeof posRepository.createFiscalEvent === 'function') {
                await posRepository.createFiscalEvent({
                    event_type: 'terminal_registration',
                    terminal_id: terminalId,
                    payload: {
                        terminal_id: terminalId,
                        accreditation_status: status
                    },
                    actor_user_id: actorUserId
                }, { transaction });
            }

            await transaction.commit();
            return ok({ registration: toSerializable(registration) });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to save fiscal terminal registration'));
        }
    };
};

export const buildListFiscalTerminalRegistrationsUseCase = ({ posRepository }) => {
    return async () => {
        try {
            const registrations = typeof posRepository.listFiscalTerminalRegistrations === 'function'
                ? await posRepository.listFiscalTerminalRegistrations()
                : [];
            return ok({ registrations: (registrations || []).map(toSerializable) });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list fiscal terminal registrations'));
        }
    };
};

export const buildVerifyFiscalEventLedgerUseCase = ({ posRepository }) => {
    return async () => {
        try {
            const events = (await posRepository.listFiscalEvents()) || [];
            const issues = [];
            let previousHash = null;
            let expectedSequence = 1;
            for (const rawEvent of events.map(toSerializable)) {
                const sequence = Number.parseInt(rawEvent.event_sequence, 10);
                if (sequence !== expectedSequence) {
                    issues.push({
                        code: 'FISCAL_EVENT_SEQUENCE_GAP',
                        event_id: rawEvent.pos_fiscal_event_id || null,
                        expected_sequence: expectedSequence,
                        actual_sequence: sequence
                    });
                    expectedSequence = sequence;
                }
                if ((rawEvent.previous_event_hash || null) !== previousHash) {
                    issues.push({
                        code: 'FISCAL_EVENT_PREVIOUS_HASH_MISMATCH',
                        event_id: rawEvent.pos_fiscal_event_id || null,
                        expected_previous_hash: previousHash,
                        actual_previous_hash: rawEvent.previous_event_hash || null
                    });
                }
                const recomputedHash = hashPayload({
                    event_sequence: sequence,
                    previous_event_hash: rawEvent.previous_event_hash || null,
                    event_type: rawEvent.event_type,
                    pos_transaction_id: rawEvent.pos_transaction_id || null,
                    document_type: rawEvent.document_type || null,
                    invoice_number: rawEvent.invoice_number || null,
                    terminal_id: rawEvent.terminal_id || null,
                    payload: rawEvent.payload || {},
                    actor_user_id: rawEvent.actor_user_id || null
                });
                if (rawEvent.event_hash !== recomputedHash) {
                    issues.push({
                        code: 'FISCAL_EVENT_HASH_MISMATCH',
                        event_id: rawEvent.pos_fiscal_event_id || null,
                        expected_hash: recomputedHash,
                        actual_hash: rawEvent.event_hash || null
                    });
                }
                previousHash = rawEvent.event_hash || null;
                expectedSequence += 1;
            }

            return ok({
                ready: issues.length === 0,
                checked_event_count: events.length,
                issues
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to verify fiscal event ledger'));
        }
    };
};

export const buildCreatePosSetupCashierUseCase = () => {
    return async () => fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Local cashier creation is retired. Invite an existing DGFY account as cashier and assign its store locations.',
        { statusCode: 410, details: { reason_code: 'POS_LOCAL_CASHIER_CREATION_RETIRED' } }
    ));
};

export const buildListPosSetupCashiersUseCase = ({ userService }) => {
    if (!userService || typeof userService.listLocalCashiers !== 'function') {
        throw new Error('buildListPosSetupCashiersUseCase requires userService.listLocalCashiers');
    }

    return async ({ user = null } = {}) => {
        try {
            const actorUserId = parsePositiveInt(user?.user_id);
            if (!actorUserId) {
                throw new DomainError(
                    DomainErrorCode.AUTHENTICATION_FAILED,
                    'Authenticated user is required',
                    { statusCode: 401 }
                );
            }

            const cashiers = await userService.listLocalCashiers(actorUserId);
            return ok({ cashiers }, 'Cashiers retrieved');
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS cashiers'));
        }
    };
};

export const buildLoginPosCashierUseCase = ({ authService }) => {
    if (!authService || typeof authService.loginUser !== 'function') {
        throw new Error('buildLoginPosCashierUseCase requires authService.loginUser');
    }

    return async ({ payload = {} } = {}) => {
        try {
            const session = await authService.loginUser(
                payload.identifier,
                payload.password,
                { allowUsername: true, requiredRole: 'cashier' }
            );
            return ok(session, 'Cashier login successful');
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Cashier login failed'));
        }
    };
};

// #1492: which voucher (if any) a transaction row redeemed, projected from the
// posRepository.listTransactions() voucherRedemptions include (already scoped to
// entry_type: 'redemption' at the query level) into the same shape
// storeUseCases.js's serializeAppliedVoucher produces, for one consistent frontend contract across
// both the authenticated storefront order history and this POS/IMS transaction history.
const serializeAppliedVouchers = (row) => (
    Array.isArray(row?.voucherRedemptions)
        ? row.voucherRedemptions.map((redemption) => ({
            voucher_id: redemption?.voucher_id ?? null,
            code: redemption?.code_snapshot ?? null,
            benefit_target: redemption?.benefit_config_snapshot?.benefit_target === 'delivery' ? 'delivery' : 'items',
            discount_amount: redemption?.discount_centavos != null ? fromCurrencyCents(redemption.discount_centavos) : null
        }))
        : []
);

export const buildListPosTransactionsUseCase = ({ posRepository }) => {
    return async ({ query, user }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view POS transactions',
                { statusCode: 401 }
            ));
        }

        try {
            const locationScope = await resolvePosReadLocationScope({
                requestedLocationId: query?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS history read'
            });
            const data = await posRepository.listTransactions({
                ...(query || {}),
                location_id: locationScope.location_id
            });
            const printStatuses = typeof posRepository?.getReceiptPrintStatuses === 'function'
                ? await posRepository.getReceiptPrintStatuses((data?.transactions || []).map((row) => row?.pos_transaction_id))
                : {};
            return ok({
                ...data,
                transactions: (data?.transactions || []).map((row) => {
                    const status = printStatuses?.[row?.pos_transaction_id];
                    return {
                        ...row,
                        receipt_print_status: status?.status || 'pending',
                        receipt_printed_at: status?.printed_at || null,
                        receipt_print_failure_reason: status?.reason_code || null,
                        applied_vouchers: serializeAppliedVouchers(row)
                    };
                })
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS transactions'));
        }
    };
};

const buildReadScopedPosReportUseCase = ({ posRepository, repositoryMethod, failureMessage }) => {
    return async ({ query, user }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view POS reports',
                { statusCode: 401 }
            ));
        }

        try {
            const locationScope = await resolvePosReadLocationScope({
                requestedLocationId: query?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS reports read'
            });
            const data = await repositoryMethod.call(posRepository, {
                ...(query || {}),
                location_id: locationScope.location_id
            });
            return ok(data);
        } catch (error) {
            return fail(mapPosUseCaseError(error, failureMessage));
        }
    };
};


const resolvePosScanBlockedReason = ({ scanResult, complianceError = null } = {}) => {
    if (complianceError) {
        return {
            reason_code: 'COMPLIANCE_BLOCKED',
            message: complianceError.message || 'Compliance readiness blocked this scan'
        };
    }

    if (!scanResult || scanResult.status === 'not_found') {
        return {
            reason_code: scanResult?.reason_code || 'BARCODE_NOT_FOUND',
            message: 'Barcode was not found'
        };
    }
    if (scanResult.status === 'conflict') {
        return {
            reason_code: 'BARCODE_CONFLICT',
            message: 'Barcode maps to more than one active record'
        };
    }
    if (scanResult.status === 'blocked') {
        const blockedScopes = Array.isArray(scanResult.blocked_scopes)
            ? scanResult.blocked_scopes.map((scope) => String(scope || '').trim().toLowerCase())
            : [];
        if (blockedScopes.includes('ticket')) {
            return {
                reason_code: 'TICKET_SCAN_NOT_CARTABLE',
                message: 'Ticket or booking scans must be handled through the Services booking flow, not POS cart entry'
            };
        }
        return {
            reason_code: scanResult.reason_code || 'BARCODE_BLOCKED',
            message: scanResult.reason_code === 'BARCODE_SCOPE_NOT_POS'
                ? 'Barcode is not configured for POS scanning'
                : 'Barcode is blocked for this POS action'
        };
    }

    const item = scanResult.item || {};
    const readiness = item.pos_readiness || {};
    const missing = Array.isArray(readiness.missing_requirements) ? readiness.missing_requirements : [];
    const hasMissing = (code) => missing.some((entry) => entry?.code === code);
    const status = String(item.status || '').trim().toLowerCase();
    const isServiceItem = isStockExemptServiceItem(item);
    const descriptor = resolveStockBearingDescriptor(item);
    const stock = Number(item.current_stock || 0);

    if (status !== 'active') {
        return { reason_code: 'ITEM_INACTIVE', message: 'Item is inactive, draft, or deleted' };
    }
    if (item.pos_visible === false || hasMissing('POS_VISIBILITY_DISABLED')) {
        return { reason_code: 'NOT_POS_VISIBLE', message: 'Item is not visible in POS' };
    }
    if (hasMissing('SALE_PRICE_MISSING') || Number(item.default_sale_price || 0) <= 0) {
        return { reason_code: 'MISSING_PRICE', message: 'Item is missing a sale price' };
    }
    if (descriptor.is_toggle_available === false) {
        return { reason_code: 'OUT_OF_STOCK', message: 'Item is currently marked unavailable' };
    }
    if (descriptor.tracks_quantity && stock <= 0) {
        return { reason_code: 'OUT_OF_STOCK', message: 'Item is out of stock at this location' };
    }
    if (isServiceItem && item.serviceDetail?.visible_in_pos === false) {
        return { reason_code: 'SERVICE_UNAVAILABLE', message: 'Service is unavailable in POS' };
    }

    return null;
};

const resolveServiceBookingTicketScan = (code) => {
    const structured = parseBarcodeStructuredPayload(code);
    const normalized = normalizeBarcodeValue(code);
    const structuredType = String(structured?.type || '').trim().toLowerCase();
    const structuredReference = String(structured?.reference || '').trim();
    if (structuredType === 'service_booking' && structuredReference) {
        return {
            reference: structuredReference.toUpperCase(),
            code: normalized || `SERVICE_BOOKING:${structuredReference.toUpperCase()}`
        };
    }
    const match = String(normalized || '').match(/^SERVICE_BOOKING[:|](.+)$/i);
    if (match?.[1]) {
        return {
            reference: match[1].trim().toUpperCase(),
            code: normalized
        };
    }
    return null;
};

export const buildScanPosBarcodeUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ payload = {}, user }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        const code = String(payload.code || '').trim();
        if (!code) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'barcode code is required',
                { statusCode: 422 }
            ));
        }

        try {
            const serviceBookingTicket = resolveServiceBookingTicketScan(code);
            if (serviceBookingTicket) {
                return ok({
                    status: 'routed',
                    kind: 'service_booking',
                    reason_code: 'SERVICE_BOOKING_SCAN_ROUTED',
                    message: 'Service booking ticket scan recognized. Open Services > Bookings to check in or update this booking.',
                    booking_reference: serviceBookingTicket.reference,
                    scan_metadata: {
                        code: serviceBookingTicket.code,
                        reference: serviceBookingTicket.reference,
                        cart_allowed: false,
                        stock_movement_allowed: false,
                        routed_at: new Date().toISOString()
                    }
                });
            }
            let locationScope;
            try {
                locationScope = await resolveLocationScope({
                    requestedLocationId: payload.location_id,
                    userId: normalizedUserId,
                    operationLabel: 'POS barcode scan'
                });
            } catch (error) {
                if (error instanceof DomainError) {
                    const locationReason = error?.details?.reason_code;
                    if (
                        locationReason === LOCATION_SCOPE_REASON_CODES.LOCATION_ACCESS_DENIED
                        || locationReason === LOCATION_SCOPE_REASON_CODES.LOCATION_CONTEXT_REQUIRED
                        || locationReason === LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED
                    ) {
                        return ok({
                            status: 'blocked',
                            reason_code: locationReason === LOCATION_SCOPE_REASON_CODES.LOCATION_ACCESS_DENIED
                                ? 'UNAUTHORIZED_LOCATION'
                                : 'LOCATION_CONTEXT_REQUIRED',
                            message: error.message || 'POS barcode scan requires an authorized location',
                            location_scope: null
                        });
                    }
                }
                throw error;
            }
            let complianceError = null;
            try {
                await assertPosComplianceAllowed({
                    operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                    context: {
                        terminal_id: String(payload.terminal_id || '').trim() || null,
                        terminal_action: 'barcode_scan',
                        location_id: locationScope.location_id
                    },
                    user
                });
            } catch (error) {
                complianceError = error;
            }

            const scanResult = await posRepository.resolveCatalogScan({
                code,
                location_id: locationScope.location_id
            });
            const blocked = resolvePosScanBlockedReason({ scanResult, complianceError });
            if (blocked) {
                return ok({
                    status: 'blocked',
                    ...blocked,
                    scan: scanResult,
                    location_scope: locationScope
                });
            }

            const quantityMultiplier = Number(scanResult.barcode?.quantity_multiplier || 1);
            const requestedQuantity = Number(payload.quantity || 1);
            const quantity = Math.max(0.0001, Math.round(quantityMultiplier * requestedQuantity * 10000) / 10000);

            return ok({
                status: 'resolved',
                reason_code: null,
                barcode: scanResult.barcode,
                item: scanResult.item,
                suggested_line: {
                    item_id: scanResult.item.item_id,
                    quantity,
                    unit_price: Number(scanResult.item.default_sale_price || 0),
                    source: 'barcode_scan',
                    scan_metadata: {
                        barcode_id: scanResult.barcode.item_barcode_id,
                        code: scanResult.barcode.code,
                        normalized_code: scanResult.barcode.normalized_code,
                        scope: scanResult.barcode.scope,
                        packaging_level: scanResult.barcode.packaging_level,
                        quantity_multiplier: quantityMultiplier,
                        location_id: locationScope.location_id,
                        resolved_at: new Date().toISOString()
                    }
                },
                location_scope: locationScope
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to resolve POS barcode scan'));
        }
    };
};

export const buildGetPosTransactionByIdUseCase = ({ posRepository }) => {
    return async ({ posTransactionId }) => {
        const normalizedId = parsePositiveInt(posTransactionId);
        if (!normalizedId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.getTransactionById(normalizedId);
            if (!data) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'POS transaction not found',
                    { statusCode: 404 }
                ));
            }
            const serialized = toSerializable(data);
            const adjustments = typeof posRepository?.listPosTransactionAdjustmentsForTransaction === 'function'
                ? await posRepository.listPosTransactionAdjustmentsForTransaction(normalizedId)
                : [];
            const adjustmentEvidence = (Array.isArray(adjustments) ? adjustments : [])
                .map(toPublicPosTransactionAdjustment);
            const latestFinancialOutcome = [...adjustmentEvidence]
                .reverse()
                .find((adjustment) => adjustment.financial_outcome)?.financial_outcome || null;
            const paymentSession = typeof posRepository?.findPosPaymentSessionByCompletedTransactionId === 'function'
                ? await posRepository.findPosPaymentSessionByCompletedTransactionId(normalizedId)
                : null;
            const paymentAllocations = paymentSession && typeof posRepository?.listPosPaymentAllocationsForSession === 'function'
                ? await posRepository.listPosPaymentAllocationsForSession(paymentSession.pos_payment_session_id)
                : [];
            const printStatuses = typeof posRepository?.getReceiptPrintStatuses === 'function'
                ? await posRepository.getReceiptPrintStatuses([normalizedId])
                : {};
            return ok({
                ...serialized,
                adjustments: adjustmentEvidence,
                payment_session: paymentSession ? {
                    pos_payment_session_id: paymentSession.pos_payment_session_id,
                    session_reference: paymentSession.session_reference || null,
                    status: paymentSession.status || null,
                    total_amount: paymentSession.total_amount ?? null,
                    paid_amount: paymentSession.paid_amount ?? null
                } : null,
                payment_allocations: (Array.isArray(paymentAllocations) ? paymentAllocations : []).map((allocation) => ({
                    pos_payment_allocation_id: allocation.pos_payment_allocation_id,
                    allocation_reference: allocation.allocation_reference || null,
                    status: allocation.status || null,
                    payment_method: allocation.payment_method || null,
                    payment_handoff_mode: allocation.payment_handoff_mode || null,
                    applied_amount: allocation.applied_amount ?? null,
                    payment_reference: allocation.payment_reference || null,
                    payment_provider: allocation.payment_provider || null,
                    reversed_amount: allocation.reversed_amount ?? 0,
                    reversal_status: allocation.reversal_status || 'none',
                    reversed_at: allocation.reversed_at || null,
                    reversal_reason: allocation.reversal_reason || null
                })),
                financial_outcome: latestFinancialOutcome,
                receipt_print_status: printStatuses?.[normalizedId]?.status || 'pending',
                receipt_printed_at: printStatuses?.[normalizedId]?.printed_at || null,
                receipt_print_failure_reason: printStatuses?.[normalizedId]?.reason_code || null
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS transaction'));
        }
    };
};

export const buildGetDayCloseReadinessUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ businessDateInput, user = null, locationId = null }) => {
        const userId = parsePositiveInt(user?.user_id);
        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to check POS day-close readiness',
                { statusCode: 401 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId: locationId,
                userId,
                operationLabel: 'POS day-close readiness'
            });
            const resolvedLocationId = parsePositiveInt(locationScope?.location_id);
            if (!resolvedLocationId) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'POS day-close readiness requires a resolved location scope.',
                    { statusCode: 422 }
                );
            }

            const { businessDate } = buildBusinessDateRange(businessDateInput || new Date());
            const [openShifts, existingSnapshot] = await Promise.all([
                posRepository.listOpenTerminalShiftsForLocation({ locationId: resolvedLocationId }),
                posRepository.getLatestZReadingSnapshotByBusinessDate(
                    businessDate,
                    { locationId: resolvedLocationId }
                )
            ]);

            return ok(buildDayCloseReadinessData({
                businessDate,
                locationId: resolvedLocationId,
                openShifts,
                existingSnapshot
            }));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to check POS day-close readiness'));
        }
    };
};

export const buildCloseDayZReadingUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosOperationalLocationScope,
    verifyDayCloseOperator = verifyPosDayCloseOperator
}) => {
    return async ({ businessDateInput, dayClosePin = '', terminalId = null, user = null, locationId = null }) => {
        const userId = parsePositiveInt(user?.user_id);
        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to close the POS day',
                { statusCode: 401 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;
        let businessDate = null;
        let resolvedLocationId = null;

        try {
            transaction = await sequelize.transaction();
            const locationScope = await resolveLocationScope({
                requestedLocationId: locationId,
                userId,
                transaction,
                operationLabel: 'POS close-day Z-reading'
            });
            resolvedLocationId = parsePositiveInt(locationScope?.location_id);
            if (!resolvedLocationId) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'POS close-day Z-reading requires a resolved location scope.',
                    { statusCode: 422 }
                );
            }

            const dateRange = buildBusinessDateRange(
                businessDateInput || new Date()
            );
            businessDate = dateRange.businessDate;

            const operator = await posRepository.findActiveDayCloseOperatorById(userId, {
                transaction,
                lock: true
            });
            await verifyDayCloseOperator({ operator, pin: dayClosePin });

            const existingSnapshot = await posRepository.getLatestZReadingSnapshotByBusinessDate(
                businessDate,
                {
                    transaction,
                    locationId: resolvedLocationId,
                    lock: true
                }
            );
            if (existingSnapshot) {
                await posRepository.createAuditLog({
                    user_id: userId,
                    entity_type: 'pos_z_reading',
                    entity_id: existingSnapshot?.pos_z_reading_snapshot_id || null,
                    action: 'VIEW',
                    changes: {
                        operation: 'reprint_close_day_z_reading',
                        business_date: businessDate,
                        location_id: resolvedLocationId,
                        terminal_id: String(terminalId || '').trim().toUpperCase() || null,
                        day_close_pin_confirmed: true
                    }
                }, { transaction });
                await transaction.commit();
                return ok(buildPersistedZReadingData({
                    snapshot: existingSnapshot,
                    businessDate,
                    locationId: resolvedLocationId,
                    snapshotReused: true
                }));
            }

            const openShifts = await posRepository.listOpenTerminalShiftsForLocation({
                locationId: resolvedLocationId
            }, {
                transaction,
                lock: true
            });
            if (Array.isArray(openShifts) && openShifts.length > 0) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Close every cashier shift in this branch before generating the Z-reading.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'Z_READING_OPEN_SHIFTS',
                            open_shift_count: openShifts.length,
                            open_shifts: openShifts.map((shift) => ({
                                shift_id: parsePositiveInt(shift?.pos_terminal_shift_id),
                                terminal_id: String(shift?.terminal_id || '').trim() || null,
                                cashier_name: String(shift?.cashier?.username || shift?.cashier?.email || '').trim() || null
                            }))
                        }
                    }
                );
            }

            const summary = normalizeZReadingSummary(
                await posRepository.getZReadingSummary({
                    startAt: dateRange.startAt,
                    endAt: dateRange.endAt,
                    locationId: resolvedLocationId
                }, { transaction })
            );

            const zCounterValue = await posRepository.incrementPersistentCounter(
                Z_READING_COUNTER_KEY,
                1,
                { transaction }
            );
            const resetCounterValue = await posRepository.incrementPersistentCounter(
                RESET_COUNTER_KEY,
                1,
                { transaction }
            );
            const lifetimeGrandTotalCents = await posRepository.getPersistentCounterValue(
                FISCAL_LIFETIME_COUNTER_KEY,
                { transaction }
            );

            const readingIdentifier = buildZReadingIdentifier({
                businessDate,
                zCounterValue
            });
            const snapshot = await posRepository.createZReadingSnapshot({
                business_date: businessDate,
                location_id: resolvedLocationId,
                reading_identifier: readingIdentifier,
                z_counter_value: zCounterValue,
                reset_counter_value: resetCounterValue,
                lifetime_grand_total_cents: lifetimeGrandTotalCents,
                summary,
                closed_by_user_id: userId,
                closed_from_terminal_id: String(terminalId || '').trim().toUpperCase() || null,
                day_close_pin_confirmed_at: new Date()
            }, { transaction });

            await posRepository.createAuditLog({
                user_id: userId,
                entity_type: 'pos_z_reading',
                entity_id: snapshot?.pos_z_reading_snapshot_id || null,
                action: 'CREATE',
                changes: {
                    operation: 'close_day_z_reading',
                    business_date: businessDate,
                    location_id: resolvedLocationId,
                    terminal_id: String(terminalId || '').trim().toUpperCase() || null,
                    day_close_pin_confirmed: true
                }
            }, { transaction });

            await transaction.commit();

            return ok(buildPersistedZReadingData({
                snapshot: {
                    ...snapshot,
                    summary
                },
                businessDate,
                locationId: resolvedLocationId
            }));
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }

            if (isUniqueConstraintError(error) && businessDate && resolvedLocationId) {
                const existingSnapshot = await posRepository.getLatestZReadingSnapshotByBusinessDate(
                    businessDate,
                    { locationId: resolvedLocationId }
                );
                if (existingSnapshot) {
                    return ok(buildPersistedZReadingData({
                        snapshot: existingSnapshot,
                        businessDate,
                        locationId: resolvedLocationId,
                        snapshotReused: true
                    }));
                }
            }

            return fail(mapPosUseCaseError(error, 'Failed to generate daily Z-reading'));
        }
    };
};

export const buildGetDailyZReadingUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ businessDateInput, user = null, locationId = null }) => {
        const userId = parsePositiveInt(user?.user_id);
        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view the POS Z-reading',
                { statusCode: 401 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId: locationId,
                userId,
                operationLabel: 'POS Z-reading read'
            });
            const resolvedLocationId = parsePositiveInt(locationScope?.location_id);
            if (!resolvedLocationId) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'POS Z-reading requires a resolved location scope.',
                    { statusCode: 422 }
                );
            }

            const { businessDate, startAt, endAt } = buildBusinessDateRange(businessDateInput);
            const snapshot = await posRepository.getLatestZReadingSnapshotByBusinessDate(
                businessDate,
                { locationId: resolvedLocationId }
            );
            if (snapshot) {
                return ok(buildPersistedZReadingData({
                    snapshot,
                    businessDate,
                    locationId: resolvedLocationId
                }));
            }

            const summary = normalizeZReadingSummary(
                await posRepository.getZReadingSummary({
                    startAt,
                    endAt,
                    locationId: resolvedLocationId
                })
            );
            const [zCounterValue, resetCounterValue, lifetimeGrandTotalCents] = await Promise.all([
                posRepository.getPersistentCounterValue(Z_READING_COUNTER_KEY),
                posRepository.getPersistentCounterValue(RESET_COUNTER_KEY),
                posRepository.getPersistentCounterValue(FISCAL_LIFETIME_COUNTER_KEY)
            ]);

            return ok({
                business_date: businessDate,
                location_id: resolvedLocationId,
                generated_at: new Date().toISOString(),
                summary,
                snapshot_persisted: false,
                reading_identifier: null,
                snapshot_reused: false,
                idempotent_replay: false,
                replay_outcome: 'computed_on_demand',
                counters: {
                    z_counter: zCounterValue,
                    reset_counter: resetCounterValue,
                    lifetime_grand_total_cents: lifetimeGrandTotalCents,
                    lifetime_grand_total: fromCurrencyCents(lifetimeGrandTotalCents)
                }
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve daily Z-reading'));
        }
    };
};

export const buildGetCurrentXReadingUseCase = ({ posRepository }) => {
    return async ({ query = {} }) => {
        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(
                query?.business_date || new Date()
            );
            const terminalId = String(query?.terminal_id || '').trim() || null;
            const summary = normalizeZReadingSummary(
                await posRepository.getZReadingSummary({ startAt, endAt, terminalId })
            );
            const [zCounterValue, resetCounterValue, lifetimeGrandTotalCents] = await Promise.all([
                posRepository.getPersistentCounterValue(Z_READING_COUNTER_KEY),
                posRepository.getPersistentCounterValue(RESET_COUNTER_KEY),
                posRepository.getPersistentCounterValue(FISCAL_LIFETIME_COUNTER_KEY)
            ]);
            const generatedAt = new Date();

            return ok({
                business_date: businessDate,
                terminal_id: terminalId,
                generated_at: generatedAt.toISOString(),
                summary,
                snapshot_persisted: false,
                reading_identifier: buildXReadingIdentifier({
                    businessDate,
                    generatedAt
                }),
                counters: {
                    z_counter: zCounterValue,
                    reset_counter: resetCounterValue,
                    lifetime_grand_total_cents: lifetimeGrandTotalCents,
                    lifetime_grand_total: fromCurrencyCents(lifetimeGrandTotalCents)
                }
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve current X-reading'));
        }
    };
};

export const buildIncrementGovernedResetCounterUseCase = ({ posRepository }) => {
    return async ({ payload = {}, user = null }) => {
        const reason = String(payload?.reason || '').trim();
        const evidenceRef = String(payload?.evidence_ref || '').trim() || null;
        const confirmationText = String(payload?.confirmation_text || '').trim();
        const actorUserId = parsePositiveInt(user?.user_id);

        if (!reason || reason.length < 8) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 8 characters',
                { statusCode: 422 }
            ));
        }
        if (confirmationText !== RESET_COUNTER_CONFIRMATION_TEXT) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `confirmation_text must exactly match ${RESET_COUNTER_CONFIRMATION_TEXT}`,
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;

        try {
            transaction = await sequelize.transaction();

            const businessDate = nowInManilaBusinessDate();
            const [zCounterValue, resetCounterValue, lifetimeGrandTotalCents] = await Promise.all([
                posRepository.getPersistentCounterValue(Z_READING_COUNTER_KEY, { transaction }),
                posRepository.incrementPersistentCounter(RESET_COUNTER_KEY, 1, { transaction }),
                posRepository.getPersistentCounterValue(FISCAL_LIFETIME_COUNTER_KEY, { transaction })
            ]);
            const readingIdentifier = `RST-${businessDate.replace(/-/g, '')}-${String(resetCounterValue).padStart(8, '0')}`;
            const recordedAt = new Date();

            await posRepository.createZReadingSnapshot({
                business_date: businessDate,
                reading_identifier: readingIdentifier,
                z_counter_value: zCounterValue,
                reset_counter_value: resetCounterValue,
                lifetime_grand_total_cents: lifetimeGrandTotalCents,
                summary: {
                    event_type: 'governed_reset_counter_increment',
                    reason,
                    evidence_ref: evidenceRef,
                    actor_user_id: actorUserId,
                    recorded_at: recordedAt.toISOString()
                }
            }, { transaction });

            await transaction.commit();

            return ok({
                business_date: businessDate,
                recorded_at: recordedAt.toISOString(),
                reset_event_identifier: readingIdentifier,
                reason,
                evidence_ref: evidenceRef,
                counters: {
                    z_counter: zCounterValue,
                    reset_counter: resetCounterValue,
                    lifetime_grand_total_cents: lifetimeGrandTotalCents,
                    lifetime_grand_total: fromCurrencyCents(lifetimeGrandTotalCents)
                }
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to increment governed reset counter'));
        }
    };
};

export const buildListPosCatalogUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ query, user }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view POS catalog',
                { statusCode: 401 }
            ));
        }

        try {
            let locationScope;
            try {
                locationScope = await resolveLocationScope({
                    requestedLocationId: query?.location_id,
                    userId: normalizedUserId,
                    operationLabel: 'POS catalog read'
                });
            } catch (error) {
                if (error instanceof DomainError && error?.details?.reason_code === LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED) {
                    locationScope = { location_id: null, location: null };
                } else {
                    throw error;
                }
            }
            const catalogQuery = {
                search: query?.search || '',
                limit: query?.limit || 100,
                folder_id: query?.folder_id,
                location_id: locationScope.location_id
            };
            if (query?.paginate === true) {
                const data = await posRepository.listCatalogPage({
                    search: catalogQuery.search,
                    page: query?.page,
                    page_size: query?.page_size,
                    category_filter: query?.category_filter,
                    stock_filter: query?.stock_filter,
                    location_id: catalogQuery.location_id
                });
                return ok({
                    ...data,
                    items: data.items.map((item) => toSerializable(item))
                });
            }
            const data = await posRepository.listCatalog(catalogQuery);
            const filtered = (Array.isArray(data) ? data : []).filter((item) => (
                item?.pos_visible !== false
            ));
            return ok(filtered.map((item) => toSerializable(item)));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS catalog'));
        }
    };
};

export const buildListPosCatalogOverridesUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.listCatalogOverrides({
                search: query?.search || '',
                limit: query?.limit || 200
            });
            return ok(data.map((item) => toSerializable(item)));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS catalog overrides'));
        }
    };
};

export const buildUpdatePosCatalogOverrideUseCase = ({ posRepository }) => {
    return async ({ itemId, payload, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
        if (!normalizedItemId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'itemId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to modify POS catalog overrides.',
                    { statusCode: 403 }
                );
            }

            const item = await posRepository.getItemById(normalizedItemId);
            if (!item) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Item ${normalizedItemId} was not found`,
                    { statusCode: 404 }
                );
            }

            if (payload.pos_visible === true && typeof posRepository.getCatalogReadinessByItemId === 'function') {
                const readinessEnvelope = await posRepository.getCatalogReadinessByItemId(normalizedItemId, {
                    forcedPosVisible: true
                });
                const readiness = readinessEnvelope?.pos_readiness || null;
                if (readiness?.ready !== true) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Cannot enable POS visibility until readiness requirements are completed.',
                        {
                            statusCode: 422,
                            details: {
                                reason_code: 'POS_READINESS_INCOMPLETE',
                                missing_requirements: Array.isArray(readiness?.missing_requirements)
                                    ? readiness.missing_requirements
                                    : [],
                                readiness_snapshot: readiness || null
                            }
                        }
                    );
                }
            }

            const data = await posRepository.upsertCatalogOverride(normalizedItemId, {
                ...(Object.prototype.hasOwnProperty.call(payload, 'pos_visible')
                    ? { pos_visible: payload.pos_visible }
                    : {}),
                ...(Object.prototype.hasOwnProperty.call(payload, 'pos_always_available')
                    ? { pos_always_available: payload.pos_always_available === true }
                    : {}),
                ...(Object.prototype.hasOwnProperty.call(payload, 'pos_best_seller_mode')
                    ? { pos_best_seller_mode: payload.pos_best_seller_mode }
                    : {})
            });
            await createCatalogAuditLog({
                posRepository,
                user,
                item,
                eventType: 'pos_catalog_override_updated',
                changes: {
                    ...(Object.prototype.hasOwnProperty.call(payload, 'pos_visible')
                        ? { pos_visible: payload.pos_visible }
                        : {}),
                    ...(Object.prototype.hasOwnProperty.call(payload, 'pos_always_available')
                        ? { pos_always_available: payload.pos_always_available === true }
                        : {}),
                    ...(Object.prototype.hasOwnProperty.call(payload, 'pos_best_seller_mode')
                        ? { pos_best_seller_mode: payload.pos_best_seller_mode }
                        : {})
                }
            });
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to update POS catalog override'));
        }
    };
};

const normalizeBulkItemIds = (itemIds) => {
    if (!Array.isArray(itemIds)) return null;
    return [...new Set(itemIds.map((itemId) => parsePositiveInt(itemId)).filter(Boolean))];
};

const getSkuStem = (file = {}) => {
    const originalName = String(file?.originalname || '').trim();
    const lastDot = originalName.lastIndexOf('.');
    const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
    return stem.trim();
};

const cleanupTempFile = async (file) => {
    if (!file?.path) return;
    try {
        await fs.unlink(file.path);
    } catch {
        // Best-effort temp cleanup.
    }
};

const createBulkImageSummary = () => ({
    uploaded: 0,
    failed: 0,
    unmatched: 0,
    duplicate_filename: 0,
    blocked_readiness: 0
});

export const buildUpdateBulkPosCatalogOverridesUseCase = ({ posRepository }) => {
    return async ({ payload, user }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const itemIds = normalizeBulkItemIds(payload.item_ids);
        if (!itemIds || itemIds.length === 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'item_ids must contain at least one positive integer',
                { statusCode: 400 }
            ));
        }
        if (itemIds.length > BULK_CATALOG_MAX_ITEM_IDS) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `item_ids cannot exceed ${BULK_CATALOG_MAX_ITEM_IDS} entries`,
                { statusCode: 400 }
            ));
        }

        // Both fields are optional individually (a caller may only want to
        // flip visibility, or only want to mark items always-available — the
        // batch menu import "make everything sellable immediately" step is
        // exactly the latter, with no opinion on pos_visible at all), but at
        // least one must be present or the call is a no-op.
        const hasPosVisible = Object.prototype.hasOwnProperty.call(payload, 'pos_visible');
        const hasPosAlwaysAvailable = Object.prototype.hasOwnProperty.call(payload, 'pos_always_available');
        if (hasPosVisible && typeof payload.pos_visible !== 'boolean') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'pos_visible must be a boolean',
                { statusCode: 400 }
            ));
        }
        if (hasPosAlwaysAvailable && typeof payload.pos_always_available !== 'boolean') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'pos_always_available must be a boolean',
                { statusCode: 400 }
            ));
        }
        if (!hasPosVisible && !hasPosAlwaysAvailable) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'At least one of pos_visible or pos_always_available must be provided',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to modify POS catalog overrides.',
                    { statusCode: 403 }
                );
            }

            const results = [];
            for (const itemId of itemIds) {
                try {
                    const readinessEnvelope = await posRepository.getCatalogReadinessByItemId(itemId, {
                        forcedPosVisible: payload.pos_visible === true ? true : null
                    });
                    if (!readinessEnvelope) {
                        results.push({ item_id: itemId, status: 'not_found', errors: ['Item was not found'] });
                        continue;
                    }

                    if (payload.pos_visible === true && readinessEnvelope.pos_readiness?.ready !== true) {
                        results.push({
                            item_id: itemId,
                            status: 'blocked',
                            errors: ['POS readiness is incomplete'],
                            readiness_snapshot: readinessEnvelope.pos_readiness
                        });
                        continue;
                    }

                    const updated = await posRepository.upsertCatalogOverride(itemId, {
                        ...(hasPosVisible ? { pos_visible: payload.pos_visible } : {}),
                        ...(hasPosAlwaysAvailable ? { pos_always_available: payload.pos_always_available } : {})
                    });
                    await createCatalogAuditLog({
                        posRepository,
                        user,
                        item: readinessEnvelope,
                        eventType: 'pos_catalog_override_updated',
                        changes: {
                            item_id: itemId,
                            ...(hasPosVisible ? { pos_visible: payload.pos_visible } : {}),
                            ...(hasPosAlwaysAvailable ? { pos_always_available: payload.pos_always_available } : {}),
                            bulk_update: true
                        }
                    });
                    results.push({
                        item_id: itemId,
                        status: 'updated',
                        data: toSerializable(updated)
                    });
                } catch (error) {
                    results.push({
                        item_id: itemId,
                        status: 'failed',
                        errors: [error?.message || 'Failed to update item']
                    });
                }
            }

            return ok({
                summary: {
                    updated: results.filter((entry) => entry.status === 'updated').length,
                    blocked: results.filter((entry) => entry.status === 'blocked').length,
                    not_found: results.filter((entry) => entry.status === 'not_found').length,
                    failed: results.filter((entry) => entry.status === 'failed').length
                },
                results
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to update POS catalog overrides in bulk'));
        }
    };
};

export const buildUploadPosCatalogImageUseCase = ({ posRepository, imageStorage }) => {
    return async ({ itemId, file, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
        let stored = null;
        let storedCommitted = false;
        if (!normalizedItemId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'itemId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!file) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'image file is required',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to upload POS catalog images.',
                    { statusCode: 403 }
                );
            }

            const fileValidation = await validateImageUploadFile({
                file,
                allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
                maxBytes: POS_CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES
            });
            if (!fileValidation.ok) {
                logger.warn('[PosUseCases] Rejected POS catalog image upload due to file validation failure', {
                    event_type: 'security_signal',
                    signal_code: 'pos_catalog_image_upload_rejected',
                    reason: fileValidation.reason,
                    reported_mime: String(file?.mimetype || '').trim().toLowerCase() || null,
                    original_name: String(file?.originalname || '').slice(0, 180) || null
                });
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only image files are allowed for POS catalog uploads.',
                    { statusCode: 422 }
                );
            }

            const item = await posRepository.getItemById(normalizedItemId);
            if (!item) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Item ${normalizedItemId} was not found`,
                    { statusCode: 404 }
                );
            }

            const existing = await posRepository.findCatalogOverrideByItemId(normalizedItemId);
            const keepVisible = resolveCatalogVisibility({
                item,
                override: existing || null,
                surface: 'pos'
            }) !== false;

            stored = await imageStorage.store({
                itemId: normalizedItemId,
                originalName: file.originalname,
                reportedMime: file.mimetype,
                tempPath: file.path
            });

            const data = await posRepository.updateCatalogImage(normalizedItemId, {
                path: stored.path,
                url: stored.url
            }, {
                keepVisible
            });
            storedCommitted = true;

            if (existing?.pos_image_path && existing.pos_image_path !== stored.path) {
                try {
                    await imageStorage.remove({ path: existing.pos_image_path });
                } catch (cleanupError) {
                    logger.warn('[PosUseCases] Failed to remove previous POS catalog image after replacement', {
                        event_type: 'pos_catalog_image_cleanup_failed',
                        item_id: normalizedItemId,
                        reason: cleanupError?.message || 'unknown'
                    });
                }
            }

            const response = toSerializable(data);
            response.pos_image_variants = stored.image_variants || null;
            response.pos_image_original_path = stored.original?.path || null;
            response.pos_image_classification = stored.classification || null;
            await createCatalogAuditLog({
                posRepository,
                user,
                item,
                eventType: 'pos_catalog_image_uploaded',
                action: 'CREATE',
                changes: {
                    original_filename: String(file.originalname || '').slice(0, 180) || null,
                    replaced_existing_image: Boolean(existing?.pos_image_path)
                }
            });
            return ok(response);
        } catch (error) {
            if (stored && !storedCommitted) {
                try {
                    await imageStorage.remove({ path: stored.path });
                } catch {
                    // ignore cleanup errors for stored uploads
                }
            }
            if (file?.path) {
                try {
                    await fs.unlink(file.path);
                } catch {
                    // ignore cleanup errors for temp uploads
                }
            }
            return fail(mapPosUseCaseError(error, 'Failed to upload POS catalog image'));
        }
    };
};

export const buildUploadBulkPosCatalogImagesUseCase = ({ posRepository, imageStorage }) => {
    return async ({ files = [], user }) => {
        const normalizedFiles = Array.isArray(files) ? files : [];
        if (normalizedFiles.length === 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'images must contain at least one file',
                { statusCode: 400 }
            ));
        }
        if (normalizedFiles.length > BULK_CATALOG_MAX_IMAGE_FILES) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `images cannot exceed ${BULK_CATALOG_MAX_IMAGE_FILES} files`,
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to upload POS catalog images.',
                    { statusCode: 403 }
                );
            }

            const duplicateStems = new Set();
            const seenStems = new Set();
            normalizedFiles.forEach((file) => {
                const stem = getSkuStem(file).toUpperCase();
                if (!stem) return;
                if (seenStems.has(stem)) duplicateStems.add(stem);
                seenStems.add(stem);
            });

            const skuCodes = [...seenStems].filter((stem) => !duplicateStems.has(stem));
            const items = await posRepository.findItemsBySkuCodes(skuCodes);
            const itemBySku = new Map((items || []).map((item) => {
                const payload = toSerializable(item);
                return [String(payload?.sku_code || '').trim().toUpperCase(), payload];
            }));
            const summary = createBulkImageSummary();
            const results = [];

            for (const file of normalizedFiles) {
                const skuCode = getSkuStem(file);
                const skuKey = skuCode.toUpperCase();
                let stored = null;
                let storedCommitted = false;
                try {
                    if (duplicateStems.has(skuKey)) {
                        await cleanupTempFile(file);
                        summary.duplicate_filename += 1;
                        results.push({
                            filename: file.originalname,
                            sku_code: skuCode || null,
                            item_id: null,
                            surface: 'pos',
                            status: 'duplicate_filename',
                            image_url: null,
                            errors: ['Duplicate SKU filename in upload batch'],
                            readiness_snapshot: null
                        });
                        continue;
                    }

                    const item = itemBySku.get(skuKey);
                    if (!item) {
                        await cleanupTempFile(file);
                        summary.unmatched += 1;
                        results.push({
                            filename: file.originalname,
                            sku_code: skuCode || null,
                            item_id: null,
                            surface: 'pos',
                            status: 'unmatched',
                            image_url: null,
                            errors: ['No item matched this SKU filename'],
                            readiness_snapshot: null
                        });
                        continue;
                    }

                    const fileValidation = await validateImageUploadFile({
                        file,
                        allowedMimeTypes: SAFE_IMAGE_MIME_TYPES,
                        maxBytes: POS_CATALOG_BULK_IMAGE_MAX_BYTES
                    });
                    if (!fileValidation.ok) {
                        await cleanupTempFile(file);
                        summary.failed += 1;
                        results.push({
                            filename: file.originalname,
                            sku_code: skuCode,
                            item_id: item.item_id,
                            surface: 'pos',
                            status: 'failed',
                            image_url: null,
                            errors: ['Only image files are allowed for POS catalog uploads.'],
                            readiness_snapshot: null
                        });
                        continue;
                    }

                    const existing = await posRepository.findCatalogOverrideByItemId(item.item_id);
                    const keepVisible = resolveCatalogVisibility({
                        item,
                        override: existing || null,
                        surface: 'pos'
                    }) !== false;
                    const readinessEnvelope = await posRepository.getCatalogReadinessByItemId(item.item_id);

                    stored = await imageStorage.store({
                        itemId: item.item_id,
                        originalName: file.originalname,
                        reportedMime: file.mimetype,
                        tempPath: file.path
                    });
                    const updated = await posRepository.updateCatalogImage(item.item_id, {
                        path: stored.path,
                        url: stored.url
                    }, {
                        keepVisible
                    });
                    storedCommitted = true;

                    await createCatalogAuditLog({
                        posRepository,
                        user,
                        item,
                        eventType: 'pos_catalog_image_uploaded',
                        action: 'CREATE',
                        changes: {
                            original_filename: String(file.originalname || '').slice(0, 180) || null,
                            replaced_existing_image: Boolean(existing?.pos_image_path),
                            bulk_upload: true
                        }
                    });

                    if (existing?.pos_image_path && existing.pos_image_path !== stored.path) {
                        try {
                            await imageStorage.remove({ path: existing.pos_image_path });
                        } catch {
                            // Best-effort cleanup of replaced image.
                        }
                    }

                    summary.uploaded += 1;
                    results.push({
                        filename: file.originalname,
                        sku_code: skuCode,
                        item_id: item.item_id,
                        surface: 'pos',
                        status: 'uploaded',
                        image_url: stored.url,
                        image_variants: stored.image_variants || null,
                        image_original_path: stored.original?.path || null,
                        image_classification: stored.classification || null,
                        errors: [],
                        readiness_snapshot: readinessEnvelope?.pos_readiness || null,
                        data: toSerializable(updated)
                    });
                } catch (error) {
                    if (stored && !storedCommitted) {
                        try {
                            await imageStorage.remove({ path: stored.path });
                        } catch {
                            // Best-effort cleanup.
                        }
                    }
                    await cleanupTempFile(file);
                    summary.failed += 1;
                    results.push({
                        filename: file.originalname,
                        sku_code: skuCode || null,
                        item_id: itemBySku.get(skuKey)?.item_id || null,
                        surface: 'pos',
                        status: 'failed',
                        image_url: null,
                        errors: [error?.message || 'Failed to upload image'],
                        readiness_snapshot: null
                    });
                }
            }

            return ok({ summary, results });
        } catch (error) {
            await Promise.all(normalizedFiles.map((file) => cleanupTempFile(file)));
            return fail(mapPosUseCaseError(error, 'Failed to upload POS catalog images in bulk'));
        }
    };
};

export const buildDeletePosCatalogImageUseCase = ({ posRepository, imageStorage }) => {
    return async ({ itemId, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
        if (!normalizedItemId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'itemId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to delete POS catalog images.',
                    { statusCode: 403 }
                );
            }

            const existing = await posRepository.findCatalogOverrideByItemId(normalizedItemId);
            if (existing?.pos_image_path) {
                await imageStorage.remove({ path: existing.pos_image_path });
            }

            const data = await posRepository.clearCatalogImage(normalizedItemId);
            await createCatalogAuditLog({
                posRepository,
                user,
                item: { item_id: normalizedItemId },
                eventType: 'pos_catalog_image_deleted',
                action: 'DELETE',
                changes: {
                    had_image: Boolean(existing?.pos_image_path || existing?.pos_image_url)
                }
            });
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to delete POS catalog image'));
        }
    };
};

const summarizeCashEvents = (events = []) => {
    const summary = {
        cash_in_total: 0,
        cash_out_total: 0,
        opening_adjustment_total: 0,
        closing_adjustment_total: 0,
        net_events_total: 0
    };

    for (const event of events) {
        const eventType = String(event.event_type || '').trim();
        const amount = round4(Number(event.amount || 0));
        if (!CASH_EVENT_EFFECT[eventType]) continue;
        const key = `${eventType}_total`;
        if (Object.prototype.hasOwnProperty.call(summary, key)) {
            summary[key] = round4(summary[key] + amount);
        }
        summary.net_events_total = round4(summary.net_events_total + (amount * CASH_EVENT_EFFECT[eventType]));
    }

    return summary;
};

const buildShiftCashSummary = ({ shift, cashSalesAmount }) => {
    if (!shift) return null;
    const events = Array.isArray(shift.cashEvents) ? shift.cashEvents : [];
    const eventSummary = summarizeCashEvents(events);
    const openingFloat = round4(shift.opening_float_amount || 0);
    const expectedCashAmount = round4(openingFloat + eventSummary.net_events_total + round4(cashSalesAmount || 0));
    return {
        pos_terminal_shift_id: shift.pos_terminal_shift_id,
        business_date: shift.business_date,
        terminal_id: shift.terminal_id,
        location_id: parsePositiveInt(shift.location_id) || null,
        location_name: String(shift?.location?.name || '').trim() || null,
        cashier_id: shift.cashier_id,
        status: shift.status,
        opened_at: shift.opened_at,
        closed_at: shift.closed_at,
        opening_float_amount: openingFloat,
        closing_cash_amount: shift.closing_cash_amount != null ? round4(shift.closing_cash_amount) : null,
        expected_cash_amount: shift.expected_cash_amount != null ? round4(shift.expected_cash_amount) : expectedCashAmount,
        cash_variance_amount: shift.cash_variance_amount != null ? round4(shift.cash_variance_amount) : null,
        cash_sales_amount: round4(cashSalesAmount || 0),
        ...eventSummary
    };
};

const cashSalesFromSalesSummary = (salesSummary) => getPosCashPaymentAmount(salesSummary?.payment_breakdown);

const resolveShiftSalesWindow = (shift = {}) => {
    const startAt = new Date(shift?.opened_at || '');
    if (!Number.isFinite(startAt.getTime())) return {};

    const requestedEndAt = shift?.closed_at ? new Date(shift.closed_at) : new Date();
    const endAt = Number.isFinite(requestedEndAt.getTime()) && requestedEndAt > startAt
        ? requestedEndAt
        : new Date();
    return {
        // Tenant POS timestamps use DATETIME(0). Buffer both boundaries so a
        // shift-linked sale created in the same database second as opening or
        // closing cannot fall outside a millisecond-precision JavaScript window.
        startAt: new Date(startAt.getTime() - POS_SHIFT_SALES_WINDOW_PRECISION_BUFFER_MS),
        endAt: new Date(endAt.getTime() + POS_SHIFT_SALES_WINDOW_PRECISION_BUFFER_MS)
    };
};

const buildShiftSalesSummary = async ({ posRepository, shiftId, shift, transaction }) => {
    if (typeof posRepository?.getZReadingSummary !== 'function') return null;
    return normalizeZReadingSummary(
        await posRepository.getZReadingSummary({
            shiftId,
            ...resolveShiftSalesWindow(shift)
        }, { transaction })
    );
};

const buildCashierHistorySalesSummary = async ({ posRepository, shiftId, shift }) => {
    const summary = await buildShiftSalesSummary({ posRepository, shiftId, shift });
    if (
        !summary
        || !shift?.closed_at
        || String(shift?.status || '').trim().toLowerCase() !== 'closed'
    ) {
        return summary;
    }

    const scope = {
        shiftId,
        closedAt: shift.closed_at,
        terminalId: shift.terminal_id || null,
        locationId: shift.location_id || null
    };
    const [postCloseVoids, postCloseAdjustments] = await Promise.all([
        typeof posRepository?.getPostCloseVoidSummaryForShift === 'function'
            ? posRepository.getPostCloseVoidSummaryForShift(scope)
            : null,
        typeof posRepository?.getPostCloseAdjustmentSummaryForShift === 'function'
            ? posRepository.getPostCloseAdjustmentSummaryForShift(scope)
            : null
    ]);
    const postCloseVoidTransactionCount = Number.parseInt(postCloseVoids?.post_close_void_transaction_count || 0, 10);
    const postCloseVoidAmount = round4(postCloseVoids?.post_close_void_amount);
    const postCloseVoidedItemCount = round4(postCloseVoids?.post_close_voided_item_count);

    return {
        ...summary,
        void_transaction_count: summary.void_transaction_count + postCloseVoidTransactionCount,
        void_amount: round4(summary.void_amount + postCloseVoidAmount),
        voided_item_count: round4(summary.voided_item_count + postCloseVoidedItemCount),
        post_close_void_transaction_count: postCloseVoidTransactionCount,
        post_close_void_amount: postCloseVoidAmount,
        post_close_voided_item_count: postCloseVoidedItemCount,
        post_close_adjustment_count: Number.parseInt(postCloseAdjustments?.post_close_adjustment_count || 0, 10),
        post_close_refund_amount: round4(postCloseAdjustments?.post_close_refund_amount),
        post_close_pending_amount: round4(postCloseAdjustments?.post_close_pending_amount),
        post_close_manual_review_amount: round4(postCloseAdjustments?.post_close_manual_review_amount),
        post_close_adjustments: Array.isArray(postCloseAdjustments?.post_close_adjustments)
            ? postCloseAdjustments.post_close_adjustments
            : []
    };
};

export const buildOpenTerminalShiftUseCase = ({
    posRepository,
    resolveIdentityStatus = resolvePosOperatorIdentityStatus,
    resolveLocationScope = resolvePosOperationalLocationScope,
    onShiftOpened = null
}) => {
    return async ({ payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to open a terminal shift',
                { statusCode: 401 }
            ));
        }

        if (hasPermission(user, PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS) && user?.is_master_admin !== true) {
            return fail(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Administrator navigation is read-only. Sign in as the cashier to open the shift.',
                {
                    statusCode: 403,
                    details: { reason_code: 'ADMIN_SHIFT_OPEN_NOT_ALLOWED' }
                }
            ));
        }

        const requestedTerminalId = sanitizeTerminalId(payload?.terminal_id);
        if (!requestedTerminalId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'terminal_id is required to open a terminal shift',
                { statusCode: 422 }
            ));
        }
        const businessDate = payload?.business_date
            ? String(payload.business_date).slice(0, 10)
            : nowInManilaBusinessDate();
        if (payload?.opening_float_amount == null || String(payload.opening_float_amount).trim() === '') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Opening cash amount is required',
                { statusCode: 422 }
            ));
        }
        const openingFloatAmount = round4(Number(payload.opening_float_amount));
        const openingNote = String(payload?.opening_note || '').trim() || null;
        const requestedLocationId = payload?.location_id == null
            ? null
            : parsePositiveInt(payload.location_id);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);

        if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'opening_float_amount must be a non-negative number',
                { statusCode: 422 }
            ));
        }
        if (payload?.location_id != null && !requestedLocationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer when provided',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;
        try {
            const tenantId = String(dbStore.getStore()?.tenantId || '').trim();
            await assertPosOperatorIdentity({ tenantId, user, resolveIdentityStatus });
            const terminalPolicySettings = await resolveTerminalIdentityPolicySettings({
                posRepository,
                settings: {}
            });
            const terminalPolicyContext = requireRegisteredTerminalContext({
                terminalId: requestedTerminalId,
                policy: terminalPolicySettings,
                operation: 'open_shift'
            });
            const terminalId = terminalPolicyContext.terminal_id;
            const locationScope = await resolveLocationScope({
                requestedLocationId: requestedLocationId || terminalPolicyContext.registry_entry?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS shift open',
                allowNullWhenUnresolved: true
            });
            const enforcedShiftLocationId = enforceTerminalHomeLocationPolicy({
                bindingEnforced: true,
                terminalPolicyContext,
                targetLocationId: locationScope.location_id
            });
            if (!enforcedShiftLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'POS shift opening requires a valid terminal location scope.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
                    statusCode: 422
                });
            }
            const replayRequestHash = hashPayload({
                terminal_id: terminalId,
                location_id: enforcedShiftLocationId,
                business_date: businessDate,
                opening_float_amount: openingFloatAmount,
                opening_note: openingNote
            });
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: terminalId,
                    terminal_action: 'open_shift'
                },
                user
            });

            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                idempotencyKey,
                requestHash: replayRequestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const existing = await posRepository.findOpenTerminalShift({
                cashierId: normalizedUserId
            }, { transaction, lock: true });
            if (existing) {
                const existingLocationId = parsePositiveInt(existing.location_id);
                if (String(existing.terminal_id || '') !== String(terminalId || '')) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Cashier already has an active open shift.',
                        {
                            statusCode: 409,
                            details: {
                                existing_shift_id: existing.pos_terminal_shift_id,
                                existing_terminal_id: existing.terminal_id || null,
                                requested_terminal_id: terminalId || null
                            }
                        }
                    );
                }
                if (existingLocationId && existingLocationId !== enforcedShiftLocationId) {
                    throw buildLocationScopeDeniedError({
                        message: 'Existing open shift is bound to a different location.',
                        reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
                        statusCode: 409,
                        details: {
                            existing_shift_id: existing.pos_terminal_shift_id,
                            existing_location_id: existingLocationId,
                            requested_location_id: enforcedShiftLocationId
                        }
                    });
                }
                const lifecycle = typeof onShiftOpened === 'function'
                    ? await onShiftOpened({
                        shift: existing,
                        user,
                        payload,
                        requestId: idempotencyKey,
                        tenantId,
                        transaction
                    })
                    : null;
                const replayPayload = {
                    reused_existing: true,
                    compliance_decision: complianceDecision,
                    terminal_identity_policy: terminalPolicyContext,
                    shift: toSerializable(existing),
                    ...(lifecycle ? { cashier_lifecycle: lifecycle } : {})
                };
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                    responsePayload: replayPayload,
                    createdBy: normalizedUserId,
                    transaction
                });
                await transaction.commit();
                return ok({
                    ...replayPayload,
                    idempotent_replay: false,
                    replay_outcome: 'processed'
                });
            }

            const terminalShift = await posRepository.findOpenTerminalShift({
                terminalId
            }, { transaction, lock: true });
            if (terminalShift) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This terminal already has an active shift. Close the current shift before another cashier starts.',
                    {
                        statusCode: 409,
                        details: {
                            existing_shift_id: terminalShift.pos_terminal_shift_id,
                            terminal_id: terminalId,
                            active_cashier_id: terminalShift.cashier_id || null,
                            requested_cashier_id: normalizedUserId
                        }
                    }
                );
            }

            let created;
            try {
                created = await posRepository.createTerminalShift({
                    business_date: businessDate,
                    terminal_id: terminalId,
                    location_id: enforcedShiftLocationId,
                    cashier_id: normalizedUserId,
                    opening_float_amount: openingFloatAmount,
                    opening_note: openingNote,
                    opened_at: new Date(),
                    status: 'open'
                }, { transaction });
            } catch (error) {
                const duplicateOpenTerminal = error?.name === 'SequelizeUniqueConstraintError'
                    || error?.parent?.code === 'ER_DUP_ENTRY'
                    || error?.original?.code === 'ER_DUP_ENTRY';
                if (!duplicateOpenTerminal) throw error;
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This terminal already has an active shift. Close the current shift before another cashier starts.',
                    {
                        statusCode: 409,
                        details: {
                            terminal_id: terminalId,
                            requested_cashier_id: normalizedUserId
                        }
                    }
                );
            }
            const hydratedCreated = await posRepository.getTerminalShiftById(
                created.pos_terminal_shift_id,
                { transaction }
            );

            const lifecycle = typeof onShiftOpened === 'function'
                ? await onShiftOpened({
                    shift: hydratedCreated || created,
                    user,
                    payload,
                    requestId: idempotencyKey,
                    tenantId,
                    transaction
                })
                : null;
            const replayPayload = {
                reused_existing: false,
                compliance_decision: complianceDecision,
                terminal_identity_policy: terminalPolicyContext,
                shift: toSerializable(hydratedCreated || created),
                ...(lifecycle ? { cashier_lifecycle: lifecycle } : {})
            };
            await createShiftAuditLog({
                posRepository,
                actorUserId: normalizedUserId,
                shiftId: created.pos_terminal_shift_id,
                action: 'CREATE',
                event: 'shift_opened',
                changes: {
                    terminal_id: terminalId,
                    location_id: enforcedShiftLocationId,
                    business_date: businessDate,
                    opening_float_amount: openingFloatAmount
                },
                transaction
            });
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId,
                transaction
            });
            await transaction.commit();
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                const replayRequestHash = hashPayload({
                    terminal_id: requestedTerminalId || null,
                    location_id: requestedLocationId || null,
                    business_date: businessDate,
                    opening_float_amount: openingFloatAmount,
                    opening_note: openingNote
                });
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: normalizedUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to open terminal shift'));
        }
    };
};

export const buildSwitchTerminalShiftLocationUseCase = ({ posRepository }) => {
    return async ({ shiftId, payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        const normalizedShiftId = parsePositiveInt(shiftId);
        if (!normalizedUserId || !normalizedShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid shiftId and authenticated user are required',
                { statusCode: 400 }
            ));
        }
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }
        if (!hasPermission(user, PERMISSION_SWITCH_LOCATION)) {
            return fail(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'You do not have permission to switch terminal shift location.',
                { statusCode: 403 }
            ));
        }

        const targetLocationId = parsePositiveInt(payload.target_location_id);
        if (!targetLocationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'target_location_id must be a positive integer',
                { statusCode: 422 }
            ));
        }
        const reason = String(payload.reason || '').trim();
        if (reason.length < 8) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 8 characters',
                { statusCode: 422 }
            ));
        }

        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestedTerminalId = sanitizeTerminalId(payload?.terminal_id);
        const replayRequestHash = hashPayload({
            shift_id: normalizedShiftId,
            terminal_id: requestedTerminalId || null,
            target_location_id: targetLocationId,
            reason
        });
        logger.info('[POS][ShiftSwitch] Location switch requested', {
            shift_id: normalizedShiftId,
            actor_user_id: normalizedUserId,
            target_location_id: targetLocationId,
            terminal_id: requestedTerminalId || null
        });

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_SWITCH,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_SWITCH,
                idempotencyKey,
                requestHash: replayRequestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const existingShift = await posRepository.getTerminalShiftById(normalizedShiftId, {
                transaction,
                lock: true
            });
            const shiftAuthorization = authorizePosShiftMutation({
                shift: existingShift,
                actorUser: user,
                operation: 'switch_location',
                overrideReason: reason
            });

            const existingShiftPayload = toSerializable(existingShift);
            const sourceLocationId = parsePositiveInt(existingShiftPayload?.location_id);
            if (sourceLocationId === targetLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'Switch target location must differ from current shift location.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
                    statusCode: 422,
                    details: {
                        shift_id: normalizedShiftId,
                        location_id: sourceLocationId
                    }
                });
            }

            if (sourceLocationId) {
                await resolvePosReadLocationScope({
                    requestedLocationId: sourceLocationId,
                    userId: normalizedUserId,
                    transaction,
                    operationLabel: 'POS shift location switch source scope'
                });
            }
            const targetLocationScope = await resolvePosReadLocationScope({
                requestedLocationId: targetLocationId,
                userId: normalizedUserId,
                transaction,
                operationLabel: 'POS shift location switch target scope'
            });

            const terminalPolicySettings = await resolveTerminalIdentityPolicySettings({
                posRepository,
                settings: {},
                options: { transaction }
            });
            const terminalPolicyContext = evaluateTerminalIdentityPolicy({
                terminalId: requestedTerminalId || existingShiftPayload?.terminal_id,
                policy: terminalPolicySettings,
                operation: 'switch_location'
            });
            const normalizedTerminalId = terminalPolicyContext.terminal_id
                || sanitizeTerminalId(existingShiftPayload?.terminal_id);
            if (!normalizedTerminalId) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Unable to resolve terminal identity for location switch.',
                    { statusCode: 422 }
                );
            }
            const enforcedTargetLocationId = enforceTerminalHomeLocationPolicy({
                bindingEnforced: terminalPolicySettings.binding_enforced === true,
                terminalPolicyContext,
                targetLocationId: targetLocationScope.location_id
            });

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: normalizedTerminalId,
                    terminal_action: 'switch_location'
                },
                user
            });

            const closedShift = await posRepository.closeTerminalShift(normalizedShiftId, {
                status: 'closed',
                closed_at: new Date(),
                closed_by: normalizedUserId,
                closing_note: `location_switch: ${reason}`
            }, {
                transaction,
                lock: true
            });

            const openedShift = await posRepository.createTerminalShift({
                business_date: existingShiftPayload?.business_date || nowInManilaBusinessDate(),
                terminal_id: normalizedTerminalId,
                location_id: enforcedTargetLocationId,
                cashier_id: parsePositiveInt(existingShiftPayload?.cashier_id) || normalizedUserId,
                opening_float_amount: 0,
                opening_note: `location_switch from shift #${normalizedShiftId}: ${reason}`,
                opened_at: new Date(),
                status: 'open'
            }, { transaction });
            const hydratedOpenedShift = await posRepository.getTerminalShiftById(
                openedShift.pos_terminal_shift_id,
                { transaction }
            );

            const transition = await posRepository.createShiftLocationTransition({
                from_shift_id: normalizedShiftId,
                to_shift_id: openedShift.pos_terminal_shift_id,
                terminal_id: normalizedTerminalId,
                from_location_id: sourceLocationId,
                to_location_id: enforcedTargetLocationId,
                reason,
                actor_user_id: normalizedUserId,
                idempotency_key: idempotencyKey || null,
                switched_at: new Date()
            }, { transaction });

            const replayPayload = {
                compliance_decision: complianceDecision,
                shift_authorization: shiftAuthorization,
                terminal_identity_policy: terminalPolicyContext,
                transition: toSerializable(transition),
                from_shift: toSerializable(closedShift),
                to_shift: toSerializable(hydratedOpenedShift || openedShift)
            };
            await createShiftAuditLog({
                posRepository,
                actorUserId: normalizedUserId,
                shiftId: normalizedShiftId,
                event: 'shift_location_switched',
                changes: {
                    authorization_mode: shiftAuthorization.mode,
                    operator_session_id: parsePositiveInt(user?.operator_session_id),
                    override_reason: shiftAuthorization.override_reason || null,
                    from_location_id: sourceLocationId,
                    to_location_id: enforcedTargetLocationId,
                    from_terminal_id: existingShiftPayload?.terminal_id || null,
                    to_terminal_id: normalizedTerminalId,
                    replacement_shift_id: openedShift.pos_terminal_shift_id,
                    reason
                },
                transaction
            });
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_SWITCH,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId,
                transaction
            });
            await transaction.commit();
            logger.info('[POS][ShiftSwitch] Location switch completed', {
                shift_id: normalizedShiftId,
                actor_user_id: normalizedUserId,
                target_location_id: enforcedTargetLocationId,
                terminal_id: normalizedTerminalId,
                from_shift_id: normalizedShiftId,
                to_shift_id: openedShift.pos_terminal_shift_id
            });
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            logger.warn('[POS][ShiftSwitch] Location switch failed', {
                shift_id: normalizedShiftId,
                actor_user_id: normalizedUserId,
                target_location_id: targetLocationId,
                terminal_id: requestedTerminalId || null,
                error_code: error?.code || null,
                status_code: error?.statusCode || null,
                message: error?.message || 'Unknown error'
            });
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.SHIFT_SWITCH,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: normalizedUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to switch terminal shift location'));
        }
    };
};

export const buildGetCurrentTerminalShiftUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ query, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view current terminal shift',
                { statusCode: 401 }
            ));
        }

        try {
            const readinessSummary = typeof posRepository?.getShiftLocationBindingReadinessSummary === 'function'
                ? await posRepository.getShiftLocationBindingReadinessSummary()
                : null;
            const requestedTerminalId = String(query?.terminal_id || '').trim() || null;
            const requestedLocationId = query?.location_id == null
                ? null
                : parsePositiveInt(query.location_id);
            const shift = await posRepository.findOpenTerminalShift({
                terminalId: requestedTerminalId,
                // Terminal context never grants ownership of another cashier's
                // drawer. Admin monitoring is exposed through a separate
                // read-only endpoint below.
                cashierId: parsePositiveInt(user?.register_shift_owner_user_id) || normalizedUserId,
                locationId: requestedLocationId
            });

            let terminalOccupancy = null;
            if (requestedTerminalId && requestedLocationId) {
                const locationScope = await resolveLocationScope({
                    requestedLocationId,
                    userId: normalizedUserId,
                    operationLabel: 'POS terminal availability'
                });
                const authorizedLocationId = parsePositiveInt(locationScope?.location_id);
                if (shift) {
                    terminalOccupancy = {
                        status: 'owned_by_current_user',
                        terminal_id: requestedTerminalId,
                        location_id: authorizedLocationId,
                        requires_supervisor: false
                    };
                } else {
                    const occupiedShift = await posRepository.findOpenTerminalShift({
                        terminalId: requestedTerminalId,
                        locationId: authorizedLocationId
                    });
                    if (occupiedShift) {
                        // This is the server-side counterpart to the client's
                        // blocked-open decision (terminalShiftEntryDecision.js):
                        // the frontend already tells the cashier "already in use
                        // by another cashier", but that message is invisible to
                        // anyone who isn't looking at that one screen, and a
                        // shift that's been sitting open for weeks (a stale-shift
                        // bug, not a real concurrent cashier) previously required
                        // a manual DB query to spot. One line here makes both
                        // visible in `docker compose logs backend` with no client
                        // instrumentation involved at all.
                        const occupiedSince = occupiedShift?.opened_at ? new Date(occupiedShift.opened_at) : null;
                        const occupiedAgeHours = occupiedSince
                            ? Math.round((Date.now() - occupiedSince.getTime()) / 3_600_000)
                            : null;
                        logger.info('[POS][TerminalOccupancy] Open Shift blocked: terminal already has an open shift', {
                            terminal_id: requestedTerminalId,
                            location_id: authorizedLocationId,
                            requesting_user_id: normalizedUserId,
                            occupying_shift_id: occupiedShift?.pos_terminal_shift_id ?? null,
                            occupying_user_id: occupiedShift?.active_operator_user_id ?? occupiedShift?.cashier_id ?? null,
                            occupied_since: occupiedSince ? occupiedSince.toISOString() : null,
                            occupied_age_hours: occupiedAgeHours
                        });
                    }
                    terminalOccupancy = occupiedShift
                        ? {
                            status: 'occupied_by_other',
                            terminal_id: requestedTerminalId,
                            location_id: authorizedLocationId,
                            requires_supervisor: true
                        }
                        : {
                            status: 'available',
                            terminal_id: requestedTerminalId,
                            location_id: authorizedLocationId,
                            requires_supervisor: false
                        };
                }
            }

            if (!shift) {
                return ok({
                    shift: null,
                    cash_summary: null,
                    sales_summary: null,
                    terminal_occupancy: terminalOccupancy,
                    location_binding_readiness: readinessSummary
                });
            }

            const salesSummary = await buildShiftSalesSummary({
                posRepository,
                shiftId: shift.pos_terminal_shift_id,
                shift
            });
            const cashSales = cashSalesFromSalesSummary(salesSummary);
            return ok({
                shift: toSerializable(shift),
                cash_summary: buildShiftCashSummary({ shift: toSerializable(shift), cashSalesAmount: cashSales }),
                sales_summary: salesSummary,
                terminal_occupancy: terminalOccupancy,
                location_binding_readiness: readinessSummary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to load current terminal shift'));
        }
    };
};

export const buildGetCashierShiftHistoryUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ query = {}, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view cashier shift history',
                { statusCode: 401 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId: query?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS cashier history read'
            });
            const result = await posRepository.listCashierShiftHistory({
                cashierId: normalizedUserId,
                locationId: locationScope.location_id,
                dateFrom: query?.date_from,
                dateTo: query?.date_to,
                status: query?.status || 'all',
                page: query?.page || 1,
                limit: query?.limit || 20
            });
            const rows = Array.isArray(result?.rows) ? result.rows : [];
            const records = await Promise.all(rows.map(async (row) => {
                const shift = toSerializable(row);
                const shiftId = parsePositiveInt(shift?.pos_terminal_shift_id);
                const salesSummary = shiftId
                    ? await buildCashierHistorySalesSummary({
                        posRepository,
                        shiftId,
                        shift
                    })
                    : null;
                const cashSales = cashSalesFromSalesSummary(salesSummary);
                return {
                    shift,
                    cash_summary: buildShiftCashSummary({
                        shift,
                        cashSalesAmount: cashSales
                    }),
                    sales_summary: salesSummary
                };
            }));

            return ok({
                cashier: {
                    cashier_id: normalizedUserId,
                    cashier_name: String(user?.username || user?.email || '').trim() || null
                },
                records,
                pagination: result?.pagination || {
                    page: 1,
                    limit: 20,
                    total: records.length,
                    totalPages: 1
                },
                applied_filters: {
                    location_id: locationScope.location_id,
                    date_from: normalizeBusinessDateInput(query?.date_from) || null,
                    date_to: normalizeBusinessDateInput(query?.date_to) || null,
                    status: query?.status || 'all'
                }
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to load cashier shift history'));
        }
    };
};

export const buildRecordCashDrawerEventUseCase = ({ posRepository }) => {
    return async ({ shiftId, payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        const normalizedShiftId = parsePositiveInt(shiftId);
        if (!normalizedUserId || !normalizedShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid shiftId and authenticated user are required',
                { statusCode: 400 }
            ));
        }

        const eventType = String(payload?.event_type || '').trim();
        const amount = round4(Number(payload?.amount || 0));
        const reason = String(payload?.reason || '').trim();
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const replayRequestHash = hashPayload({
            shift_id: normalizedShiftId,
            event_type: eventType,
            amount,
            reason
        });

        if (!CASH_EVENT_EFFECT[eventType]) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Unsupported cash drawer event type',
                { statusCode: 422 }
            ));
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'amount must be greater than zero',
                { statusCode: 422 }
            ));
        }
        if (reason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 3 characters',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.CASH_EVENT,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.CASH_EVENT,
                idempotencyKey,
                requestHash: replayRequestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const shift = await posRepository.getTerminalShiftById(normalizedShiftId, {
                transaction,
                lock: true
            });
            const shiftAuthorization = authorizePosShiftMutation({
                shift,
                actorUser: user,
                operation: 'cash_drawer_event',
                overrideReason: reason
            });

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: shift.terminal_id || null,
                    terminal_action: 'cash_drawer_event'
                },
                user
            });

            const created = await posRepository.createCashDrawerEvent({
                pos_terminal_shift_id: normalizedShiftId,
                event_type: eventType,
                amount,
                reason,
                recorded_by: normalizedUserId
            }, { transaction });

            const replayPayload = {
                ...toSerializable(created),
                compliance_decision: complianceDecision,
                shift_authorization: shiftAuthorization
            };
            await createShiftAuditLog({
                posRepository,
                actorUserId: normalizedUserId,
                shiftId: normalizedShiftId,
                event: 'cash_drawer_event_recorded',
                changes: {
                    authorization_mode: shiftAuthorization.mode,
                    operator_session_id: parsePositiveInt(user?.operator_session_id),
                    override_reason: shiftAuthorization.override_reason || null,
                    cash_drawer_event_id: created.pos_cash_drawer_event_id || null,
                    event_type: eventType,
                    amount,
                    reason
                },
                transaction
            });
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.CASH_EVENT,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId,
                transaction
            });
            await transaction.commit();
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.CASH_EVENT,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: normalizedUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to record cash drawer event'));
        }
    };
};

const assertNoUnresolvedParkedSalesForShift = async ({ posRepository, shiftId, transaction }) => {
    const claimedParkedSaleCount = await posRepository.countActiveParkedSalesForShift(shiftId, {
        transaction,
        lock: true
    });
    if (Number(claimedParkedSaleCount || 0) <= 0) return;

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        `Resolve ${claimedParkedSaleCount} claimed parked sale${Number(claimedParkedSaleCount) === 1 ? '' : 's'} before closing this shift.`,
        {
            statusCode: 409,
            details: {
                reason_code: 'POS_PARKED_SALES_UNRESOLVED',
                // Keep the legacy detail key for older clients while exposing
                // the exact blocking state to newer clients.
                active_parked_sale_count: Number(claimedParkedSaleCount),
                claimed_parked_sale_count: Number(claimedParkedSaleCount),
                shift_id: Number(shiftId)
            }
        }
    );
};

const assertNoUnresolvedFundedPaymentSessionsForShift = async ({ posRepository, shiftId, transaction }) => {
    const sessions = await posRepository.listUnresolvedFundedPaymentSessionsForShift(shiftId, {
        transaction,
        lock: true
    });
    if (sessions.length === 0) return;

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        `Resolve ${sessions.length} funded split-payment session${sessions.length === 1 ? '' : 's'} before closing this shift.`,
        {
            statusCode: 409,
            details: {
                reason_code: 'POS_PAYMENT_SESSIONS_FUNDED_UNRESOLVED',
                active_payment_session_count: sessions.length,
                shift_id: Number(shiftId),
                sessions: sessions.map((session) => ({
                    pos_payment_session_id: Number(session.pos_payment_session_id),
                    session_reference: session.session_reference,
                    status: session.status,
                    paid_amount: Number(session.paid_amount || 0),
                    remaining_amount: Number(session.remaining_amount || 0)
                }))
            }
        }
    );
};

const assertNoInFlightPaymentSessionsForShift = async ({ posRepository, shiftId, transaction }) => {
    const sessions = typeof posRepository.listInFlightPaymentSessionsForShift === 'function'
        ? await posRepository.listInFlightPaymentSessionsForShift(shiftId, { transaction, lock: true })
        : [];
    if (sessions.length === 0) return;

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        `Complete or cancel ${sessions.length} in-flight payment session${sessions.length === 1 ? '' : 's'} before closing this shift.`,
        {
            statusCode: 409,
            details: {
                reason_code: 'POS_PAYMENT_SESSIONS_IN_FLIGHT',
                active_payment_session_count: sessions.length,
                shift_id: Number(shiftId),
                sessions: sessions.map((session) => ({
                    pos_payment_session_id: Number(session.pos_payment_session_id),
                    session_reference: session.session_reference,
                    status: session.status
                }))
            }
        }
    );
};

const assertNoInFlightOperatorMutationForShift = async ({ posRepository, shiftId, transaction }) => {
    const mutation = typeof posRepository.findInFlightOperatorMutationForShift === 'function'
        ? await posRepository.findInFlightOperatorMutationForShift(shiftId, {
            staleBefore: new Date(Date.now() - (5 * 60 * 1000)),
            transaction,
            lock: true
        })
        : null;
    if (!mutation) return;

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        'Wait for the active cashier operation to finish before closing this shift.',
        {
            statusCode: 409,
            details: {
                reason_code: 'POS_OPERATOR_MUTATION_IN_FLIGHT',
                operator_session_id: Number(mutation.pos_terminal_operator_session_id),
                operation_type: mutation.protected_operation_type || null,
                shift_id: Number(shiftId)
            }
        }
    );
};

export const buildCloseTerminalShiftUseCase = ({ posRepository, revokeOperatorSessionsForTerminal = null, onShiftClosing = null }) => {
    return async ({ shiftId, payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        const normalizedShiftId = parsePositiveInt(shiftId);
        if (!normalizedUserId || !normalizedShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid shiftId and authenticated user are required',
                { statusCode: 400 }
            ));
        }

        const closingCashAmount = round4(Number(payload?.closing_cash_amount || 0));
        const closingNote = String(payload?.closing_note || '').trim() || null;
        const overrideReason = String(payload?.override_reason || '').trim() || null;
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const replayRequestHash = hashPayload({
            shift_id: normalizedShiftId,
            closing_cash_amount: closingCashAmount,
            closing_note: closingNote,
            override_reason: overrideReason
        });
        if (!Number.isFinite(closingCashAmount) || closingCashAmount < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'closing_cash_amount must be a non-negative number',
                { statusCode: 422 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_CLOSE,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_CLOSE,
                idempotencyKey,
                requestHash: replayRequestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const shift = await posRepository.getTerminalShiftById(normalizedShiftId, {
                transaction,
                lock: true
            });
            const shiftAuthorization = authorizePosShiftMutation({
                shift,
                actorUser: user,
                operation: 'close_shift',
                overrideReason
            });

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: shift.terminal_id || null,
                    terminal_action: 'close_shift'
                },
                user
            });

            await assertNoUnresolvedParkedSalesForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });
            await assertNoInFlightOperatorMutationForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });
            await assertNoInFlightPaymentSessionsForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });
            await assertNoUnresolvedFundedPaymentSessionsForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });

            const shiftPayload = toSerializable(shift);
            const salesSummary = await buildShiftSalesSummary({
                posRepository,
                shiftId: normalizedShiftId,
                shift: shiftPayload,
                transaction
            });
            const cashSales = cashSalesFromSalesSummary(salesSummary);
            const cashEvents = await posRepository.listCashDrawerEventsByShiftId(
                normalizedShiftId,
                { transaction }
            );
            const tempShift = { ...shiftPayload, cashEvents };
            const summary = buildShiftCashSummary({ shift: tempShift, cashSalesAmount: cashSales });
            const expectedCashAmount = round4(summary.expected_cash_amount || 0);
            const variance = round4(closingCashAmount - expectedCashAmount);

            const cashierLifecycle = typeof onShiftClosing === 'function'
                ? await onShiftClosing({
                    shift,
                    user,
                    payload,
                    requestId: idempotencyKey,
                    transaction
                })
                : null;
            const closed = await posRepository.closeTerminalShift(normalizedShiftId, {
                closing_cash_amount: closingCashAmount,
                expected_cash_amount: expectedCashAmount,
                cash_variance_amount: variance,
                closing_note: closingNote,
                closed_at: new Date(),
                closed_by: normalizedUserId,
                status: 'closed'
            }, {
                transaction,
                lock: true
            });
            if (typeof revokeOperatorSessionsForTerminal === 'function') {
                await revokeOperatorSessionsForTerminal({
                    terminalId: shiftPayload.terminal_id,
                    reason: 'register_closed',
                    transaction,
                    at: new Date()
                });
            }
            const shiftLocationId = parsePositiveInt(shiftPayload?.location_id);
            const remainingOpenShifts = shiftLocationId
                ? await posRepository.listOpenTerminalShiftsForLocation(
                    { locationId: shiftLocationId },
                    { transaction, lock: true }
                )
                : [];
            const replayPayload = {
                compliance_decision: complianceDecision,
                shift_authorization: shiftAuthorization,
                shift: toSerializable(closed),
                ...(cashierLifecycle ? { cashier_lifecycle: cashierLifecycle } : {}),
                cash_summary: {
                    ...summary,
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: variance
                },
                sales_summary: salesSummary,
                day_close_readiness: buildDayCloseReadinessData({
                    businessDate: buildBusinessDateRange(new Date()).businessDate,
                    locationId: shiftLocationId,
                    openShifts: remainingOpenShifts
                })
            };
            await createShiftAuditLog({
                posRepository,
                actorUserId: normalizedUserId,
                shiftId: normalizedShiftId,
                event: 'shift_closed',
                changes: {
                    authorization_mode: shiftAuthorization.mode,
                    override_reason: shiftAuthorization.override_reason || null,
                    terminal_id: shiftPayload.terminal_id || null,
                    location_id: shiftPayload.location_id || null,
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: variance
                },
                transaction
            });
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_CLOSE,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId,
                transaction
            });
            await transaction.commit();
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.SHIFT_CLOSE,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: normalizedUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to close terminal shift'));
        }
    };
};

export const buildForceCloseStaleTerminalShiftUseCase = ({
    posRepository,
    revokeOperatorSessionsForTerminal = null,
    onShiftClosing = null,
    now = () => new Date(),
    staleAfterHours = resolvePosStaleShiftHours()
}) => {
    return async ({ shiftId, payload = {}, user = {} } = {}) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        const normalizedShiftId = parsePositiveInt(shiftId);
        const closingCashAmount = round4(Number(payload?.closing_cash_amount));
        const reason = String(payload?.reason || '').trim();
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        if (!normalizedUserId || !normalizedShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid shiftId and authenticated user are required',
                { statusCode: 400 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for stale shift recovery',
                { statusCode: 422 }
            ));
        }
        if (!Number.isFinite(closingCashAmount) || closingCashAmount < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'closing_cash_amount must be a non-negative number',
                { statusCode: 422 }
            ));
        }

        const requestHash = hashPayload({
            shift_id: normalizedShiftId,
            closing_cash_amount: closingCashAmount,
            reason
        });
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_FORCE_CLOSE,
                idempotencyKey,
                requestHash
            });
            if (replay) {
                return ok(replay);
            }

            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_FORCE_CLOSE,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const shift = await posRepository.getTerminalShiftById(normalizedShiftId, {
                transaction,
                lock: true
            });
            const recoveredAt = now();
            const recoveryAuthorization = authorizePosStaleShiftRecovery({
                shift,
                actorUser: user,
                reason,
                now: recoveredAt,
                staleAfterHours
            });
            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: shift.terminal_id || null,
                    terminal_action: 'force_close_stale_shift'
                },
                user
            });

            await assertNoUnresolvedParkedSalesForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });
            await assertNoInFlightOperatorMutationForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });
            await assertNoInFlightPaymentSessionsForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });
            await assertNoUnresolvedFundedPaymentSessionsForShift({
                posRepository,
                shiftId: normalizedShiftId,
                transaction
            });

            const shiftPayload = toSerializable(shift);
            const salesSummary = await buildShiftSalesSummary({
                posRepository,
                shiftId: normalizedShiftId,
                shift: shiftPayload,
                transaction
            });
            const cashSales = cashSalesFromSalesSummary(salesSummary);
            const cashEvents = await posRepository.listCashDrawerEventsByShiftId(
                normalizedShiftId,
                { transaction }
            );
            const summary = buildShiftCashSummary({
                shift: { ...shiftPayload, cashEvents },
                cashSalesAmount: cashSales
            });
            const expectedCashAmount = round4(summary.expected_cash_amount || 0);
            const variance = round4(closingCashAmount - expectedCashAmount);
            const cashierLifecycle = typeof onShiftClosing === 'function'
                ? await onShiftClosing({
                    shift,
                    user,
                    payload,
                    requestId: idempotencyKey,
                    transaction
                })
                : null;
            const closed = await posRepository.closeTerminalShift(normalizedShiftId, {
                closing_cash_amount: closingCashAmount,
                expected_cash_amount: expectedCashAmount,
                cash_variance_amount: variance,
                closing_note: `Stale shift recovery: ${reason}`,
                closed_at: recoveredAt,
                closed_by: normalizedUserId,
                status: 'closed'
            }, {
                transaction,
                lock: true
            });
            if (typeof revokeOperatorSessionsForTerminal === 'function') {
                await revokeOperatorSessionsForTerminal({
                    terminalId: shiftPayload.terminal_id,
                    reason: 'register_force_closed',
                    transaction,
                    at: recoveredAt
                });
            }

            const replayPayload = {
                compliance_decision: complianceDecision,
                recovery_authorization: recoveryAuthorization,
                ...(cashierLifecycle ? { cashier_lifecycle: cashierLifecycle } : {}),
                shift: toSerializable(closed),
                cash_summary: {
                    ...summary,
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: variance
                },
                sales_summary: salesSummary
            };
            await createShiftAuditLog({
                posRepository,
                actorUserId: normalizedUserId,
                shiftId: normalizedShiftId,
                event: 'stale_shift_force_closed',
                changes: {
                    authorization_mode: recoveryAuthorization.authorization_mode,
                    recovery_reason: recoveryAuthorization.reason,
                    original_cashier_id: recoveryAuthorization.shift_cashier_id,
                    terminal_id: shiftPayload.terminal_id || null,
                    location_id: shiftPayload.location_id || null,
                    opened_at: shiftPayload.opened_at || null,
                    stale_at: recoveryAuthorization.stale_at,
                    age_minutes: recoveryAuthorization.age_minutes,
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: variance
                },
                transaction
            });
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_FORCE_CLOSE,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId,
                transaction
            });
            await transaction.commit();

            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.SHIFT_FORCE_CLOSE,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: normalizedUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to recover stale terminal shift'));
        }
    };
};

export const buildGetTerminalTodayDashboardUseCase = ({ posRepository }) => {
    return async ({ query, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view terminal dashboard',
                { statusCode: 401 }
            ));
        }

        try {
            const readinessSummary = typeof posRepository?.getShiftLocationBindingReadinessSummary === 'function'
                ? await posRepository.getShiftLocationBindingReadinessSummary()
                : null;
            const { businessDate, startAt, endAt } = buildBusinessDateRange(
                query?.business_date || nowInManilaBusinessDate()
            );
            const terminalId = String(query?.terminal_id || '').trim() || null;
            const locationScope = await resolvePosReadLocationScope({
                requestedLocationId: query?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS terminal dashboard read'
            });

            const salesSummary = await posRepository.getZReadingSummary({
                startAt,
                endAt,
                terminalId,
                locationId: locationScope.location_id,
                includeOnlineStoreAcrossTerminals: true
            });
            const openShift = await posRepository.findOpenTerminalShift({
                terminalId,
                cashierId: parsePositiveInt(user?.register_shift_owner_user_id) || normalizedUserId,
                locationId: locationScope.location_id
            });
            const shiftPayload = openShift ? toSerializable(openShift) : null;
            const activeShiftSalesSummary = shiftPayload
                ? await buildShiftSalesSummary({
                    posRepository,
                    shiftId: shiftPayload.pos_terminal_shift_id,
                    shift: shiftPayload
                })
                : null;
            const shiftCashSales = cashSalesFromSalesSummary(activeShiftSalesSummary);

            return ok({
                business_date: businessDate,
                sales_summary: salesSummary,
                active_shift: shiftPayload,
                active_shift_cash_summary: shiftPayload
                    ? buildShiftCashSummary({
                        shift: shiftPayload,
                        cashSalesAmount: shiftCashSales
                    })
                    : null,
                location_binding_readiness: readinessSummary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve terminal dashboard summary'));
        }
    };
};

export const buildListIncomingOnlineOrdersUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ query, user }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view incoming online orders',
                { statusCode: 401 }
            ));
        }

        if (query?.location_id != null && !parsePositiveInt(query.location_id)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer',
                { statusCode: 422 }
            ));
        }
        const shiftId = parsePositiveInt(query?.shift_id);
        if (!shiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'shift_id is required and must be a positive integer',
                {
                    statusCode: 422,
                    details: { reason_code: 'POS_SHIFT_REQUIRED_FOR_INCOMING_QUEUE' }
                }
            ));
        }

        try {
            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId: normalizedUserId,
                shiftId,
                shiftOwnerCashierId: user?.register_shift_owner_user_id || null,
                authorizedOperatorUserId: user?.operator_session_id ? normalizedUserId : null,
                lock: false
            });
            const shiftLocationId = parsePositiveInt(activeShift?.location_id);
            if (!shiftLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'Active shift is missing a valid location for incoming orders.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
                    statusCode: 422,
                    details: { shift_id: shiftId }
                });
            }

            const requestedLocationId = query?.location_id == null
                ? null
                : parsePositiveInt(query.location_id);
            if (requestedLocationId && requestedLocationId !== shiftLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'Incoming order queue location must match the active shift location.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
                    statusCode: 403,
                    details: {
                        shift_id: shiftId,
                        shift_location_id: shiftLocationId,
                        requested_location_id: requestedLocationId
                    }
                });
            }

            const locationScope = await resolveLocationScope({
                requestedLocationId: shiftLocationId,
                userId: normalizedUserId,
                operationLabel: 'POS incoming orders read'
            });
            const orders = await posRepository.listIncomingOnlineOrders({
                locationId: locationScope.location_id,
                limit: query?.limit || 200
            });
            const printStatuses = typeof posRepository?.getReceiptPrintStatuses === 'function'
                ? await posRepository.getReceiptPrintStatuses(orders.map((order) => order?.pos_transaction_id))
                : {};
            // Phase 204 (#965): "View proof" affordance data for the queue card. Batched the same
            // way as printStatuses above -- one query for the whole page, not N+1 per order.
            const proofStatuses = typeof posRepository?.getBalancePaymentProofStatuses === 'function'
                ? await posRepository.getBalancePaymentProofStatuses(orders.map((order) => order?.pos_transaction_id))
                : {};
            return ok({
                orders: orders.map((order) => {
                    const serialized = toSerializable(order);
                    const status = printStatuses?.[serialized?.pos_transaction_id];
                    const proofStatus = proofStatuses?.[serialized?.pos_transaction_id];
                    return {
                        ...serialized,
                        receipt_print_status: status?.status || 'pending',
                        receipt_printed_at: status?.printed_at || null,
                        receipt_print_failure_reason: status?.reason_code || null,
                        // Never proof_file_path itself -- a storage key is not a URL (section 5.4).
                        has_payment_proof: proofStatus?.has_payment_proof === true,
                        balance_payment_id: proofStatus?.pos_order_payment_id || null
                    };
                })
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list incoming online orders'));
        }
    };
};

export const buildListOnlineOrderHistoryUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ query, user }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view online order history',
                { statusCode: 401 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId: query?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS online order history read'
            });
            const history = await posRepository.listOnlineOrderHistory({
                locationId: locationScope.location_id,
                search: query?.search,
                fulfillmentStatus: query?.fulfillment_status,
                paymentStatus: query?.payment_status,
                page: query?.page,
                limit: query?.limit
            });
            return ok(history);
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list online order history'));
        }
    };
};

export const buildGetAdminLocationMonitorUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope,
    now = () => new Date(),
    staleAfterHours = resolvePosStaleShiftHours()
}) => {
    return async ({ query, user }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to monitor a branch',
                { statusCode: 401 }
            ));
        }
        if (!hasEffectivePermission(user, PERMISSION_SWITCH_LOCATION)) {
            return fail(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'POS location switching permission is required to monitor another branch without an active shift.',
                { statusCode: 403 }
            ));
        }

        const requestedLocationId = parsePositiveInt(query?.location_id);
        if (!requestedLocationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id is required and must be a positive integer',
                { statusCode: 422 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId,
                userId: normalizedUserId,
                operationLabel: 'POS administrator branch monitor'
            });
            const [orders, terminalShifts] = await Promise.all([
                posRepository.listIncomingOnlineOrders({
                    locationId: locationScope.location_id,
                    limit: query?.limit || 200
                }),
                posRepository.listOpenTerminalShiftsForLocation({
                    locationId: locationScope.location_id
                })
            ]);

            const evaluatedAt = now();
            const serializedTerminalShifts = terminalShifts.map((shiftRow) => {
                const shift = toSerializable(shiftRow);
                return {
                    ...shift,
                    stale_recovery: evaluatePosShiftStaleness({
                        shift,
                        now: evaluatedAt,
                        staleAfterHours
                    })
                };
            });

            return ok({
                location_id: locationScope.location_id,
                orders: toSerializable(orders),
                terminal_shifts: serializedTerminalShifts
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to monitor branch orders'));
        }
    };
};

const buildCollectCashOnlineOrderUseCase = ({
    posRepository,
    orderMethod,
    paymentTiming,
    requiredFulfillmentStatus,
    operationKey,
    orderLabel,
    fulfillmentLabel
}) => {
    return async ({ posTransactionId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const orderId = parsePositiveInt(posTransactionId);
        const cashierId = parsePositiveInt(user?.user_id);
        const terminalId = sanitizeTerminalId(payload?.terminal_id);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const cashReceived = round4(payload?.cash_received);
        const expectedStatus = String(payload?.expected_status || '').trim() || null;
        const expectedPaymentStatus = String(payload?.expected_payment_status || '').trim().toLowerCase() || null;
        const expectedServerVersion = payload?.expected_server_version instanceof Date
            ? payload.expected_server_version.toISOString()
            : String(payload?.expected_server_version || '').trim() || null;
        if (!orderId || !cashierId || !terminalId || !idempotencyKey || cashReceived <= 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid order, terminal, idempotency key, and cash received are required.',
                { statusCode: 422 }
            ));
        }

        const hasExpectedState = Boolean(expectedStatus || expectedPaymentStatus || expectedServerVersion);
        const requestHash = hashPayload({
            pos_transaction_id: orderId,
            terminal_id: terminalId,
            cash_received: cashReceived,
            ...(hasExpectedState ? {
                expected_status: expectedStatus,
                expected_payment_status: expectedPaymentStatus,
                expected_server_version: expectedServerVersion
            } : {})
        });
        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            // Recheck after opening the transaction so a concurrent request that
            // waited for the first collection can return its durable replay.
            const lockedReplay = await findOperationReplayEntry({
                posRepository,
                operationKey,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (lockedReplay) {
                await transaction.rollback();
                transaction = null;
                return ok(lockedReplay);
            }
            const order = await posRepository.getOrderByIdForLifecycle(orderId, { transaction, lock: true });
            if (!order || order.order_source !== ONLINE_ORDER_SOURCE) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, `Online ${orderLabel} order not found.`, { statusCode: 404 });
            }
            const actualServerVersion = order.updated_at instanceof Date
                ? order.updated_at.toISOString()
                : String(order.updated_at || '').trim();
            if (
                (expectedStatus && String(order.fulfillment_status || '').trim() !== expectedStatus)
                || (expectedPaymentStatus && String(order.payment_status || '').trim().toLowerCase() !== expectedPaymentStatus)
                || (expectedServerVersion && actualServerVersion !== expectedServerVersion)
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This order changed on the server before the offline cash collection could sync.',
                    { statusCode: 409, details: {
                        reason_code: 'MOBILE_ORDER_VERSION_CONFLICT',
                        expected_status: expectedStatus,
                        actual_status: String(order.fulfillment_status || '').trim(),
                        expected_payment_status: expectedPaymentStatus,
                        actual_payment_status: String(order.payment_status || '').trim().toLowerCase(),
                        expected_server_version: expectedServerVersion,
                        actual_server_version: actualServerVersion
                    } }
                );
            }
            if (order.order_method !== orderMethod) {
                throw new DomainError(DomainErrorCode.CONFLICT, `Cash collection is available only for ${orderLabel} orders.`, { statusCode: 409 });
            }
            if (String(order.payment_type || '').trim().toLowerCase() !== 'cash') {
                throw new DomainError(DomainErrorCode.CONFLICT, `Cash collection is available only for cash ${orderLabel} orders.`, { statusCode: 409 });
            }
            if (String(order.payment_timing || '').trim().toLowerCase() !== paymentTiming) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    `Payment timing must be ${paymentTiming} for ${orderLabel} cash orders.`,
                    { statusCode: 409, details: { reason_code: 'PAYMENT_TIMING_MISMATCH' } }
                );
            }
            if (String(order.payment_status || '').trim().toLowerCase() !== 'unpaid') {
                throw new DomainError(DomainErrorCode.CONFLICT, `This ${orderLabel} order has already been paid or cannot accept cash collection.`, { statusCode: 409 });
            }
            if (String(order.fulfillment_status || '').trim() !== requiredFulfillmentStatus) {
                throw new DomainError(DomainErrorCode.CONFLICT, `Cash can be collected only when the ${orderLabel} order is ${fulfillmentLabel}.`, { statusCode: 409 });
            }

            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId,
                terminalId,
                locationId: order.location_id || null,
                shiftOwnerCashierId: user?.register_shift_owner_user_id || null,
                authorizedOperatorUserId: user?.register_shift_owner_user_id ? cashierId : null,
                transaction,
                lock: true
            });
            const totalAmount = round4(order.total_amount);
            if (cashReceived < totalAmount) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Cash received must cover the ${orderLabel} order total.`,
                    { statusCode: 422, details: { total_amount: totalAmount, cash_received: cashReceived } }
                );
            }
            const collectedAt = new Date();
            const changeAmount = round4(cashReceived - totalAmount);
            const updated = await posRepository.updateOrderById(orderId, {
                payment_status: 'paid',
                cash_received: cashReceived,
                change_amount: changeAmount,
                payment_collected_at: collectedAt,
                payment_collected_by: cashierId,
                payment_collected_shift_id: activeShift.pos_terminal_shift_id,
                payment_collected_terminal_id: terminalId,
                cashier_id: parsePositiveInt(order.cashier_id) || cashierId,
                shift_id: activeShift.pos_terminal_shift_id
            }, { transaction, lock: true });

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'pos_transaction',
                entity_id: orderId,
                action: 'UPDATE',
                changes: {
                    event: `${orderLabel}_cash_collected`,
                    operator_session_id: parsePositiveInt(user?.operator_session_id),
                    payment_type: 'cash',
                    payment_timing: paymentTiming,
                    payment_status: 'paid',
                    cash_received: cashReceived,
                    change_amount: changeAmount,
                    shift_id: activeShift.pos_terminal_shift_id,
                    terminal_id: terminalId,
                    collected_at: collectedAt.toISOString()
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const responsePayload = {
                order: toSerializable(updated),
                collection: {
                    order_method: orderMethod,
                    payment_timing: paymentTiming,
                    cash_received: cashReceived,
                    change_amount: changeAmount,
                    collected_at: collectedAt.toISOString(),
                    collected_by: cashierId,
                    shift_id: activeShift.pos_terminal_shift_id,
                    terminal_id: terminalId
                },
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, `Failed to collect cash for ${orderLabel} order`));
        }
    };
};

export const buildCollectCashPickupOrderUseCase = ({ posRepository }) => buildCollectCashOnlineOrderUseCase({
    posRepository,
    orderMethod: 'pickup',
    paymentTiming: 'on_pickup',
    requiredFulfillmentStatus: 'ready_for_pickup',
    operationKey: POS_OPERATION_KEYS.PICKUP_CASH_COLLECTION,
    orderLabel: 'pickup',
    fulfillmentLabel: 'ready'
});

export const buildCollectCashDeliveryOrderUseCase = ({ posRepository }) => buildCollectCashOnlineOrderUseCase({
    posRepository,
    orderMethod: 'delivery',
    paymentTiming: 'on_delivery',
    requiredFulfillmentStatus: 'out_for_delivery',
    operationKey: POS_OPERATION_KEYS.DELIVERY_CASH_COLLECTION,
    orderLabel: 'delivery',
    fulfillmentLabel: 'out for delivery'
});

// Phase 148 (#825): staff-recorded settlement of a downpayment order's remaining balance at
// handover -- the missing middle of epic #815/#273. Phase 141 (#822) captures the downpayment
// online and leaves the order `partially_paid`; Phase 144 (#824) shows staff how much is still
// owed; nothing until now could actually record the balance being paid, so such an order could
// never reach `paid` and never complete.
//
// Deliberately a SIBLING of buildCollectCashOnlineOrderUseCase, not an extension of it. #825's
// first requirement is "extend, don't loosen" -- collect-cash's `payment_status === 'unpaid'` and
// `cash_received >= total_amount` guards protect the live plain-COD path and are not touched. The
// two use cases' domains are disjoint by construction: collect-cash owns `unpaid`, this owns
// `partially_paid`. Everything else here (durable operation replay, request-hash fingerprinting,
// open-shift assertion, locked order read, audit row) reuses collect-cash's proven scaffolding
// rather than inventing a second version of it.
//
// ADR 0069 clause 2 [binding], carried forward verbatim by ADR 0070 (authoritative): the balance
// is collected out-of-band by staff and no automatic second PayMongo charge may ever be initiated
// for it. That clause also requires this action to carry its own single-use confirmation guard
// following ADR 0063 clause 6 -- a distinct concern from webhook-replay dedupe. Both are present:
// the durable operation replay makes a duplicate submit a no-op, and a non-cash method fails
// closed without an explicit `manual_payment_received` attestation.
//
// ADR 0069 clause 9 [default]: the VAT/BIR/fiscal treatment of a balance-settlement event is
// explicitly deferred and is NOT decided here. This writes payment state and ledger evidence only.
export const buildRecordOrderBalancePaymentUseCase = ({ posRepository }) => {
    return async ({ posTransactionId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const orderId = parsePositiveInt(posTransactionId);
        const cashierId = parsePositiveInt(user?.user_id);
        const terminalId = sanitizeTerminalId(payload?.terminal_id);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const paymentMethod = String(payload?.payment_method || '').trim().toLowerCase();
        const paymentReference = String(payload?.payment_reference || '').trim() || null;
        const manualPaymentReceived = payload?.manual_payment_received === true;
        const isCashSettlement = paymentMethod === 'cash';
        // Cash is tendered (change is possible); a digital tender is an exact amount. Read the
        // relevant field per method rather than overloading one name with two meanings.
        const cashReceived = isCashSettlement ? round4(payload?.cash_received) : null;
        const declaredAmount = isCashSettlement ? null : round4(payload?.amount);

        if (!orderId || !cashierId || !terminalId || !idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid order, terminal, and idempotency key are required.',
                { statusCode: 422 }
            ));
        }
        if (!BALANCE_SETTLEMENT_METHODS.includes(paymentMethod)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Unsupported balance settlement method.',
                {
                    statusCode: 422,
                    details: {
                        reason_code: 'BALANCE_SETTLEMENT_METHOD_UNSUPPORTED',
                        supported_methods: [...BALANCE_SETTLEMENT_METHODS]
                    }
                }
            ));
        }
        // ADR 0063 clause 6 [binding]: the confirmation must be explicit in the request, not
        // implied by picking a digital method, and a missing confirmation fails closed. ADR 0063
        // clause 5 [binding] is what that confirmation attests to -- that the STORE received the
        // money; DGFY verified nothing.
        if (!isCashSettlement && !manualPaymentReceived) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Merchant-owned balance settlement requires an explicit confirmation that the store received the payment.',
                { statusCode: 422, details: { reason_code: 'BALANCE_SETTLEMENT_CONFIRMATION_REQUIRED' } }
            ));
        }
        if (isCashSettlement ? !(cashReceived > 0) : !(declaredAmount > 0)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A positive settlement amount is required.',
                { statusCode: 422, details: { reason_code: 'BALANCE_SETTLEMENT_AMOUNT_REQUIRED' } }
            ));
        }

        const requestHash = hashPayload({
            pos_transaction_id: orderId,
            terminal_id: terminalId,
            payment_method: paymentMethod,
            cash_received: cashReceived,
            amount: declaredAmount,
            manual_payment_received: manualPaymentReceived,
            payment_reference: paymentReference || ''
        });
        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_BALANCE_SETTLEMENT,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            // Recheck inside the transaction so a concurrent duplicate submit that waited on the
            // first one returns its durable replay instead of settling the balance twice.
            const lockedReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_BALANCE_SETTLEMENT,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (lockedReplay) {
                await transaction.rollback();
                transaction = null;
                return ok(lockedReplay);
            }

            const order = await posRepository.getOrderByIdForLifecycle(orderId, { transaction, lock: true });
            if (!order || order.order_source !== ONLINE_ORDER_SOURCE) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Online order not found.', { statusCode: 404 });
            }
            // The disjoint-domain guard. An `unpaid` order belongs to collect-cash; a `paid` one is
            // already settled. Neither is an error this endpoint may quietly absorb.
            if (String(order.payment_status || '').trim().toLowerCase() !== 'partially_paid') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Balance settlement is available only for partially paid orders.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'BALANCE_SETTLEMENT_NOT_PARTIALLY_PAID',
                            payment_status: String(order.payment_status || '').trim().toLowerCase() || null
                        }
                    }
                );
            }
            const orderMethod = String(order.order_method || '').trim().toLowerCase();
            const requiredFulfillmentStatus = BALANCE_SETTLEMENT_HANDOVER_STATUS_BY_METHOD[orderMethod];
            if (!requiredFulfillmentStatus) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Balance settlement is available only for pickup and delivery orders.',
                    { statusCode: 409, details: { reason_code: 'BALANCE_SETTLEMENT_ORDER_METHOD_UNSUPPORTED' } }
                );
            }
            if (String(order.fulfillment_status || '').trim() !== requiredFulfillmentStatus) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The balance can be settled only when the order reaches handover.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'BALANCE_SETTLEMENT_FULFILLMENT_NOT_READY',
                            required_fulfillment_status: requiredFulfillmentStatus,
                            fulfillment_status: String(order.fulfillment_status || '').trim() || null
                        }
                    }
                );
            }

            const balanceDue = round4(order.balance_due);
            if (!(balanceDue > 0)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This order has no outstanding balance to settle.',
                    { statusCode: 409, details: { reason_code: 'BALANCE_SETTLEMENT_NO_BALANCE_DUE' } }
                );
            }

            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId,
                terminalId,
                locationId: order.location_id || null,
                shiftOwnerCashierId: user?.register_shift_owner_user_id || null,
                authorizedOperatorUserId: user?.register_shift_owner_user_id ? cashierId : null,
                transaction,
                lock: true
            });

            // v1 settles the FULL remaining balance in one action (#825). The ledger schema
            // supports N rows per order, so instalments are a later UI concern, not a schema one.
            if (isCashSettlement) {
                if (cashReceived < balanceDue) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Cash received must cover the remaining balance.',
                        { statusCode: 422, details: { reason_code: 'BALANCE_SETTLEMENT_CASH_SHORT', balance_due: balanceDue, cash_received: cashReceived } }
                    );
                }
            } else if (declaredAmount !== balanceDue) {
                // No change is possible on a digital tender, so the client must settle the exact
                // remaining balance -- and echoing it back proves the terminal was not acting on a
                // stale balance it read before some other event moved it.
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'A merchant-owned settlement must be for the exact remaining balance.',
                    { statusCode: 422, details: { reason_code: 'BALANCE_SETTLEMENT_AMOUNT_MISMATCH', balance_due: balanceDue, amount: declaredAmount } }
                );
            }

            const settledAt = new Date();
            const changeAmount = isCashSettlement ? round4(cashReceived - balanceDue) : null;
            const totalAmount = round4(order.total_amount);

            const updated = await posRepository.updateOrderById(orderId, {
                payment_status: 'paid',
                amount_paid: totalAmount,
                balance_due: 0,
                // Cash-only. A merchant-owned digital settlement leaves these null rather than
                // claiming cash changed hands -- ADR 0063 clause 5's "must never claim" applied to
                // the cash-reconciliation fields, not just to provider verification.
                ...(isCashSettlement ? { cash_received: cashReceived, change_amount: changeAmount } : {}),
                payment_collected_at: settledAt,
                payment_collected_by: cashierId,
                payment_collected_shift_id: activeShift.pos_terminal_shift_id,
                payment_collected_terminal_id: terminalId,
                cashier_id: parsePositiveInt(order.cashier_id) || cashierId,
                shift_id: activeShift.pos_terminal_shift_id
            }, { transaction, lock: true });

            // Ledger row 2, written in the SAME transaction as the order update -- there is no
            // window where the order reads `paid` and the ledger has no matching event, mirroring
            // how Phase 141 writes row 1 alongside order creation. ADR 0069 clause 4b [default],
            // carried forward by ADR 0070.
            const downpaymentEntry = await posRepository.findOrderPaymentEntryByKind(
                orderId,
                'downpayment',
                { transaction }
            );
            const ledgerEntryId = await posRepository.createOrderPaymentEntry({
                posTransactionId: orderId,
                kind: 'balance',
                status: 'successful',
                // The balance settled, never the cash tendered -- change is not revenue.
                amount: balanceDue,
                paymentMethod,
                // ADR 0063 clause 4 [binding]: a store-owned digital tender is `merchant_owned`,
                // categorically separate from PayMongo. Cash has no provider at all.
                paymentProvider: isCashSettlement ? null : 'merchant_owned',
                // ADR 0063 clause 5 [binding]: never claim a provider event or provider
                // verification for a manually attested payment.
                providerEventId: null,
                paymentReference,
                idempotencyKey,
                relatedPosOrderPaymentId: downpaymentEntry?.pos_order_payment_id || null,
                recordedBy: cashierId
            }, { transaction });

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'pos_transaction',
                entity_id: orderId,
                action: 'UPDATE',
                changes: {
                    event: 'order_balance_settled',
                    operator_session_id: parsePositiveInt(user?.operator_session_id),
                    payment_method: paymentMethod,
                    payment_provider: isCashSettlement ? null : 'merchant_owned',
                    manual_payment_received: manualPaymentReceived,
                    payment_reference: paymentReference,
                    balance_settled: balanceDue,
                    cash_received: cashReceived,
                    change_amount: changeAmount,
                    pos_order_payment_id: ledgerEntryId,
                    shift_id: activeShift.pos_terminal_shift_id,
                    terminal_id: terminalId,
                    settled_at: settledAt.toISOString()
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const responsePayload = {
                order: toSerializable(updated),
                settlement: {
                    order_method: orderMethod,
                    payment_method: paymentMethod,
                    payment_provider: isCashSettlement ? null : 'merchant_owned',
                    balance_settled: balanceDue,
                    cash_received: cashReceived,
                    change_amount: changeAmount,
                    payment_reference: paymentReference,
                    pos_order_payment_id: ledgerEntryId,
                    settled_at: settledAt.toISOString(),
                    settled_by: cashierId,
                    shift_id: activeShift.pos_terminal_shift_id,
                    terminal_id: terminalId
                },
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_BALANCE_SETTLEMENT,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to record the balance payment for this order'));
        }
    };
};

// Phase 204 (#965): attaches a proof-of-payment image to an already-recorded 'balance' ledger
// row. Deliberately a SEPARATE route/use case from buildRecordOrderBalancePaymentUseCase above,
// not a fold-in -- so hashPayload's replay fingerprint (POS_OPERATION_KEYS.ORDER_BALANCE_
// SETTLEMENT) stays untouched by construction, and so a binary payload never has to travel
// through JSON body validation. Attach-once: a second attempt on a payment that already has a
// proof fails closed with 409 rather than silently replacing evidence (ADR 0063 clause 10
// [binding]'s append-only posture, restated by the Amendments block this phase adds).
export const buildAttachOrderBalancePaymentProofUseCase = ({ posRepository, proofStorage }) => {
    return async ({ posTransactionId, paymentId, file, user = {}, auditContext = {} } = {}) => {
        const orderId = parsePositiveInt(posTransactionId);
        const normalizedPaymentId = parsePositiveInt(paymentId);
        const cashierId = parsePositiveInt(user?.user_id);

        const cleanupTempFile = async () => {
            if (file?.path) {
                try {
                    await fs.unlink(file.path);
                } catch {
                    // ignore cleanup errors for temp uploads
                }
            }
        };

        if (!orderId || !normalizedPaymentId || !cashierId) {
            await cleanupTempFile();
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A valid order, payment, and authenticated user are required.',
                { statusCode: 422 }
            ));
        }
        if (!file) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A proof image file is required.',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        let storedProof = null;
        try {
            const fileValidation = await validateImageUploadFile({
                file,
                maxBytes: BALANCE_PROOF_SOURCE_MAX_BYTES
            });
            if (!fileValidation.ok) {
                logger.warn('[PosUseCases] Rejected balance-payment proof upload due to file validation failure', {
                    event_type: 'security_signal',
                    signal_code: 'balance_payment_proof_upload_rejected',
                    reason: fileValidation.reason,
                    reported_mime: String(file?.mimetype || '').trim().toLowerCase() || null
                });
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only a valid image file may be attached as proof of payment.',
                    { statusCode: 422, details: { reason_code: 'BALANCE_PROOF_IMAGE_REJECTED', reason: fileValidation.reason } }
                );
            }

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();

            const order = await posRepository.getOrderByIdForLifecycle(orderId, { transaction, lock: true });
            if (!order || order.order_source !== ONLINE_ORDER_SOURCE) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Online order not found.', { statusCode: 404 });
            }

            // The ownership check: a payment_id from another order (or of any kind other than
            // 'balance') simply does not resolve here -- stops a caller attaching evidence to
            // another order's ledger row.
            const paymentEntry = await posRepository.findOrderPaymentEntryById(normalizedPaymentId, { transaction, lock: true });
            if (
                !paymentEntry
                || parsePositiveInt(paymentEntry.pos_transaction_id) !== orderId
                || paymentEntry.kind !== 'balance'
            ) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Balance payment not found for this order.', { statusCode: 404 });
            }

            if (paymentEntry.proof_file_path) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A proof image has already been attached to this payment.',
                    { statusCode: 409, details: { reason_code: 'BALANCE_PROOF_ALREADY_ATTACHED' } }
                );
            }

            storedProof = await proofStorage.store({ orderId, tempPath: file.path });

            const attachedAt = new Date();
            const updated = await posRepository.updateOrderPaymentEntryProof(normalizedPaymentId, {
                proof_file_path: storedProof.storage_key,
                proof_mime_type: storedProof.mime_type,
                proof_file_size_bytes: storedProof.size_bytes,
                proof_sha256: storedProof.sha256,
                proof_attached_at: attachedAt,
                proof_attached_by: cashierId
            }, { transaction });

            // Never log the file bytes or a URL -- only the integrity fingerprint and size.
            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'pos_transaction',
                entity_id: orderId,
                action: 'UPDATE',
                changes: {
                    event: 'order_balance_payment_proof_attached',
                    pos_order_payment_id: normalizedPaymentId,
                    mime_type: storedProof.mime_type,
                    size_bytes: storedProof.size_bytes,
                    sha256: storedProof.sha256,
                    attached_at: attachedAt.toISOString()
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            await transaction.commit();
            transaction = null;

            return ok({
                pos_order_payment_id: normalizedPaymentId,
                has_payment_proof: true,
                proof_mime_type: updated.proof_mime_type,
                proof_file_size_bytes: updated.proof_file_size_bytes,
                proof_attached_at: updated.proof_attached_at
            });
        } catch (error) {
            // A rolled-back transaction must never orphan a PII file on disk.
            if (transaction && !transaction.finished) await transaction.rollback();
            if (storedProof) {
                try {
                    await proofStorage.remove(storedProof.storage_key);
                } catch {
                    // ignore cleanup errors for orphaned proof files
                }
            }
            return fail(mapPosUseCaseError(error, 'Failed to attach proof of payment for this balance settlement'));
        } finally {
            await cleanupTempFile();
        }
    };
};

// Phase 204 (#965): the authed-serving half. Tenant scoping is structural (dbStore, resolved by
// tenantHandler before this ever runs) rather than a filter here -- see PHASE_204_PLAN.md
// section 4. Returns 404, never 403, whether the row doesn't exist, belongs to another order, or
// simply carries no proof -- the route must not leak which case it is.
export const buildGetOrderBalancePaymentProofUseCase = ({ posRepository, proofStorage }) => {
    return async ({ posTransactionId, paymentId } = {}) => {
        const orderId = parsePositiveInt(posTransactionId);
        const normalizedPaymentId = parsePositiveInt(paymentId);
        if (!orderId || !normalizedPaymentId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A valid order and payment id are required.',
                { statusCode: 422 }
            ));
        }

        try {
            const paymentEntry = await posRepository.findOrderPaymentEntryById(normalizedPaymentId);
            if (
                !paymentEntry
                || parsePositiveInt(paymentEntry.pos_transaction_id) !== orderId
                || paymentEntry.kind !== 'balance'
                || !paymentEntry.proof_file_path
            ) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'No proof of payment is available for this balance settlement.',
                    { statusCode: 404 }
                );
            }

            return ok({
                mime_type: paymentEntry.proof_mime_type,
                size_bytes: paymentEntry.proof_file_size_bytes,
                stream: proofStorage.createReadStream(paymentEntry.proof_file_path)
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to read the proof of payment for this balance settlement'));
        }
    };
};

export const buildListActiveDeliveryPersonnelUseCase = ({
    posRepository,
    resolveLocationScope = resolvePosReadLocationScope
}) => {
    return async ({ query = {}, user = {} } = {}) => {
        if (!isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const userId = parsePositiveInt(user?.user_id);
        if (!userId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view delivery personnel',
                { statusCode: 401 }
            ));
        }

        const requestedLocationId = query.location_id == null
            ? null
            : parsePositiveInt(query.location_id);
        if (query.location_id != null && !requestedLocationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer',
                { statusCode: 422 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId,
                userId,
                operationLabel: 'POS delivery personnel read'
            });
            const personnel = await posRepository.listActiveDeliveryPersonnel({
                locationId: locationScope.location_id
            });
            return ok({
                location_id: locationScope.location_id,
                delivery_personnel: toSerializable(personnel)
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list delivery personnel'));
        }
    };
};

// Phase 225 (#1273/#1081): the write half of delivery-personnel assignment, extracted from
// buildAssignDeliveryPersonnelUseCase below so the delivery-run write-through
// (deliveryRunUseCases.js) can share it rather than authoring a second path that writes
// delivery_personnel_id/_name/assigned_by/assigned_shift_id/assigned_at. This remains the ONLY
// code in the repo that writes those fields. `advanceJobStatus: true` reproduces the original
// per-order assignment endpoint's behavior byte-for-byte (job status advances to `assigned`);
// `advanceJobStatus: false` is the run write-through path, which populates the assignment fields
// while leaving delivery_jobs.status untouched (still `pending_dispatch`) -- see ADR 0034's
// 2026-08-07 and 2026-08-31 amendments for why that split is governance-correct.
export const applyDeliveryPersonnelAssignment = async ({
    posRepository,
    orderId,
    deliveryJob,
    personnel,
    hasRegisteredPersonnel,
    deliveryPersonnelName,
    cashierId,
    activeShift,
    orderLocationId,
    advanceJobStatus = false,
    auditContext = {},
    transaction
}) => {
    const hasThirdPartyPersonnel = !hasRegisteredPersonnel && Boolean(deliveryPersonnelName);
    const currentStatus = String(deliveryJob.status || '').trim().toLowerCase();
    const nextStatus = advanceJobStatus ? 'assigned' : currentStatus;
    const assignedAt = new Date();

    const updatedDeliveryJob = await posRepository.assignDeliveryPersonnelToJob(orderId, {
        delivery_personnel_id: hasRegisteredPersonnel ? personnel.delivery_personnel_id : null,
        delivery_personnel_name: hasThirdPartyPersonnel ? deliveryPersonnelName : null,
        assigned_by: cashierId,
        assigned_shift_id: activeShift.pos_terminal_shift_id,
        assigned_at: assignedAt,
        ...(advanceJobStatus ? { status: nextStatus } : {})
    }, {
        transaction,
        lock: true
    });
    if (!updatedDeliveryJob) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'The delivery assignment could not be saved.',
            {
                statusCode: 409,
                details: { reason_code: 'DELIVERY_ASSIGNMENT_UPDATE_FAILED' }
            }
        );
    }

    await posRepository.createAuditLog({
        user_id: cashierId,
        entity_type: 'delivery_job',
        entity_id: parsePositiveInt(deliveryJob.delivery_job_id) || null,
        action: 'UPDATE',
        changes: {
            event: 'delivery_personnel_assigned',
            pos_transaction_id: orderId,
            provider: deliveryJob.provider,
            previous_status: currentStatus,
            status: nextStatus,
            previous_delivery_personnel_id: parsePositiveInt(deliveryJob.delivery_personnel_id) || null,
            previous_delivery_personnel_name: String(deliveryJob.delivery_personnel_name || '').trim() || null,
            delivery_personnel_id: hasRegisteredPersonnel ? personnel.delivery_personnel_id : null,
            delivery_personnel_name: hasThirdPartyPersonnel ? deliveryPersonnelName : null,
            assigned_by: cashierId,
            assigned_shift_id: activeShift.pos_terminal_shift_id,
            location_id: orderLocationId,
            assigned_at: assignedAt.toISOString()
        },
        ip_address: auditContext.ipAddress || null,
        user_agent: auditContext.userAgent || null
    }, { transaction });

    return {
        updatedDeliveryJob,
        assignedAt,
        currentStatus,
        nextStatus,
        hasThirdPartyPersonnel
    };
};

export const buildAssignDeliveryPersonnelUseCase = ({ posRepository }) => {
    return async ({ posTransactionId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const orderId = parsePositiveInt(posTransactionId);
        const cashierId = parsePositiveInt(user?.user_id);
        const deliveryPersonnelId = parsePositiveInt(payload?.delivery_personnel_id);
        const deliveryPersonnelName = String(payload?.delivery_personnel_name || '').trim();
        const hasRegisteredPersonnel = Boolean(deliveryPersonnelId);
        const hasThirdPartyPersonnel = Boolean(deliveryPersonnelName);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({
            pos_transaction_id: orderId,
            delivery_personnel_id: deliveryPersonnelId,
            delivery_personnel_name: deliveryPersonnelName || null
        });

        if (!orderId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (deliveryPersonnelName.length > 255) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'delivery_personnel_name must be 255 characters or fewer',
                { statusCode: 422 }
            ));
        }
        if ((hasRegisteredPersonnel && hasThirdPartyPersonnel) || (!hasRegisteredPersonnel && !hasThirdPartyPersonnel)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Provide either a positive delivery_personnel_id or a delivery_personnel_name',
                { statusCode: 422 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery assignment',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_ASSIGNMENT,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_ASSIGNMENT,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const order = await posRepository.getOrderByIdForLifecycle(orderId, {
                transaction,
                lock: true
            });
            if (!order || order.order_source !== ONLINE_ORDER_SOURCE || order.order_method !== 'delivery') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery assignment is available only for online delivery orders.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'DELIVERY_ORDER_REQUIRED' }
                    }
                );
            }
            if (String(order.fulfillment_status || '').trim() !== 'out_for_delivery') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery assignment is available only when the order is out for delivery.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'DELIVERY_ORDER_OUT_FOR_DELIVERY_REQUIRED',
                            fulfillment_status: order.fulfillment_status || null
                        }
                    }
                );
            }
            const orderLocationId = parsePositiveInt(order.location_id);
            if (!orderLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'Delivery order is missing a valid location scope.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
                    statusCode: 422,
                    details: { pos_transaction_id: orderId }
                });
            }

            const deliveryJob = order.deliveryJob;
            if (!deliveryJob) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery order does not have a delivery job.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'DELIVERY_JOB_REQUIRED' }
                    }
                );
            }
            if (String(deliveryJob.provider || '').trim().toLowerCase() !== 'manual') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only manual delivery jobs can be assigned from POS.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'MANUAL_DELIVERY_JOB_REQUIRED' }
                    }
                );
            }

            const currentStatus = String(deliveryJob.status || '').trim().toLowerCase();
            if (!['pending_dispatch', 'assigned'].includes(currentStatus)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery personnel cannot be changed after pickup has started.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'DELIVERY_ASSIGNMENT_LOCKED',
                            current_status: currentStatus || null
                        }
                    }
                );
            }

            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId,
                locationId: orderLocationId,
                transaction,
                lock: true
            });
            const shiftAttributionPayload = buildOnlineOrderShiftAttributionPayload({
                order,
                activeShift
            });
            if (Object.keys(shiftAttributionPayload).length > 0) {
                await posRepository.updateOrderById(orderId, shiftAttributionPayload, {
                    transaction,
                    lock: true
                });
            }
            let personnel = null;
            if (hasRegisteredPersonnel) {
                personnel = await posRepository.findActiveDeliveryPersonnelById(deliveryPersonnelId, {
                    locationId: orderLocationId,
                    transaction,
                    lock: true
                });
                if (!personnel) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        'Active delivery personnel was not found for the order location.',
                        {
                            statusCode: 404,
                            details: { reason_code: 'DELIVERY_PERSONNEL_NOT_AVAILABLE' }
                        }
                    );
                }
            } else {
                personnel = {
                    delivery_personnel_id: null,
                    display_name: deliveryPersonnelName,
                    phone: null,
                    location_id: orderLocationId,
                    is_active: true,
                    is_third_party: true
                };
            }

            const {
                updatedDeliveryJob,
                assignedAt,
                currentStatus: previousStatus,
                nextStatus
            } = await applyDeliveryPersonnelAssignment({
                posRepository,
                orderId,
                deliveryJob,
                personnel,
                hasRegisteredPersonnel,
                deliveryPersonnelName,
                cashierId,
                activeShift,
                orderLocationId,
                advanceJobStatus: true,
                auditContext,
                transaction
            });

            const updatedOrder = {
                ...order,
                ...shiftAttributionPayload,
                deliveryJob: updatedDeliveryJob
            };
            const responsePayload = {
                order: toSerializable(updatedOrder),
                delivery_job: toSerializable(updatedDeliveryJob),
                assignment: {
                    delivery_personnel: toSerializable(personnel),
                    delivery_personnel_name: hasThirdPartyPersonnel ? deliveryPersonnelName : null,
                    assigned_by: cashierId,
                    assigned_shift_id: activeShift.pos_terminal_shift_id,
                    assigned_at: assignedAt.toISOString(),
                    outcome: previousStatus === nextStatus ? 'reassigned' : 'assigned'
                },
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_ASSIGNMENT,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({
                ...responsePayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_ASSIGNMENT,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to assign delivery personnel'));
        }
    };
};

export const buildUpdateDeliveryJobStatusUseCase = ({ posRepository }) => {
    return async ({ posTransactionId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const orderId = parsePositiveInt(posTransactionId);
        const cashierId = parsePositiveInt(user?.user_id);
        const requestedStatus = String(payload?.status || '').trim().toLowerCase();
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({
            pos_transaction_id: orderId,
            status: requestedStatus
        });

        if (!orderId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!['assigned', 'picked_up', 'delivered'].includes(requestedStatus)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'status must be assigned, picked_up, or delivered',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_STATUS_UPDATE,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_STATUS_UPDATE,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const order = await posRepository.getOrderByIdForLifecycle(orderId, {
                transaction,
                lock: true
            });
            if (!order || order.order_source !== ONLINE_ORDER_SOURCE || order.order_method !== 'delivery') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery job actions are available only for online delivery orders.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'DELIVERY_ORDER_REQUIRED' }
                    }
                );
            }
            if (String(order.fulfillment_status || '').trim() !== 'out_for_delivery') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery job actions are available only when the order is out for delivery.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'DELIVERY_ORDER_OUT_FOR_DELIVERY_REQUIRED',
                            fulfillment_status: order.fulfillment_status || null
                        }
                    }
                );
            }
            const orderLocationId = parsePositiveInt(order.location_id);
            if (!orderLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'Delivery order is missing a valid location scope.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
                    statusCode: 422,
                    details: { pos_transaction_id: orderId }
                });
            }
            const deliveryJob = order.deliveryJob;
            if (!deliveryJob) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery order does not have a delivery job.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'DELIVERY_JOB_REQUIRED' }
                    }
                );
            }
            if (String(deliveryJob.provider || '').trim().toLowerCase() !== 'manual') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only manual delivery jobs can be updated from POS.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'MANUAL_DELIVERY_JOB_REQUIRED' }
                    }
                );
            }

            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId,
                locationId: orderLocationId,
                transaction,
                lock: true
            });
            const shiftAttributionPayload = buildOnlineOrderShiftAttributionPayload({
                order,
                activeShift
            });
            if (Object.keys(shiftAttributionPayload).length > 0) {
                await posRepository.updateOrderById(orderId, shiftAttributionPayload, {
                    transaction,
                    lock: true
                });
            }
            const currentStatus = String(deliveryJob.status || '').trim().toLowerCase();
            const hasPersonnel = Boolean(
                parsePositiveInt(deliveryJob.delivery_personnel_id)
                || String(deliveryJob.delivery_personnel_name || '').trim()
            );
            const hasAssignment = Boolean(
                hasPersonnel
                && parsePositiveInt(deliveryJob.assigned_by)
                && parsePositiveInt(deliveryJob.assigned_shift_id)
                && deliveryJob.assigned_at
            );
            if (!hasAssignment && ['assigned', 'picked_up', 'delivered'].includes(requestedStatus)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery personnel must be assigned before the delivery job can advance.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'DELIVERY_ASSIGNMENT_REQUIRED' }
                    }
                );
            }
            if (!DELIVERY_JOB_STATUS_VALUES.includes(currentStatus)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Current delivery job state is invalid.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'DELIVERY_JOB_STATUS_INVALID',
                            current_status: currentStatus || null
                        }
                    }
                );
            }

            const allowedNextStatuses = DELIVERY_JOB_TRANSITIONS[currentStatus] || [];
            if (currentStatus !== requestedStatus && !allowedNextStatuses.includes(requestedStatus)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    `Invalid delivery job transition: ${currentStatus} -> ${requestedStatus}`,
                    {
                        statusCode: 409,
                        details: {
                            delivery_job: {
                                reason_code: 'DELIVERY_JOB_STATUS_TRANSITION_INVALID',
                                current_status: currentStatus,
                                requested_status: requestedStatus,
                                allowed_next_statuses: allowedNextStatuses
                            }
                        }
                    }
                );
            }

            const mutationTimestamp = new Date();
            const updatePayload = currentStatus === requestedStatus
                ? {}
                : {
                    status: requestedStatus,
                    ...(requestedStatus === 'picked_up' ? { picked_up_at: mutationTimestamp } : {}),
                    ...(requestedStatus === 'delivered' ? { delivered_at: mutationTimestamp } : {})
                };
            const updatedDeliveryJob = Object.keys(updatePayload).length > 0
                ? await posRepository.updateDeliveryJobByOrderId(orderId, updatePayload, {
                    transaction,
                    lock: true
                })
                : deliveryJob;
            if (!updatedDeliveryJob) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The delivery job could not be updated.',
                    {
                        statusCode: 409,
                        details: { reason_code: 'DELIVERY_JOB_UPDATE_FAILED' }
                    }
                );
            }

            if (currentStatus !== requestedStatus) {
                await posRepository.createAuditLog({
                    user_id: cashierId,
                    entity_type: 'delivery_job',
                    entity_id: parsePositiveInt(deliveryJob.delivery_job_id) || null,
                    action: 'UPDATE',
                    changes: {
                        event: 'delivery_job_status_changed',
                        pos_transaction_id: orderId,
                        provider: deliveryJob.provider,
                        previous_status: currentStatus,
                        status: requestedStatus,
                        shift_id: activeShift.pos_terminal_shift_id,
                        location_id: orderLocationId,
                        applied_at: mutationTimestamp.toISOString()
                    },
                    ip_address: auditContext.ipAddress || null,
                    user_agent: auditContext.userAgent || null
                }, { transaction });
            }

            const updatedOrder = {
                ...order,
                ...shiftAttributionPayload,
                deliveryJob: updatedDeliveryJob
            };
            const responsePayload = {
                order: toSerializable(updatedOrder),
                delivery_job: toSerializable(updatedDeliveryJob),
                status_transition: {
                    current_status: currentStatus,
                    requested_status: requestedStatus,
                    applied_by: cashierId,
                    applied_at: mutationTimestamp.toISOString(),
                    outcome: currentStatus === requestedStatus ? 'no_change' : 'processed'
                },
                idempotency: {
                    key: idempotencyKey || null,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_STATUS_UPDATE,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({
                ...responsePayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_JOB_STATUS_UPDATE,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to update delivery job status'));
        }
    };
};

export const buildUpdateOnlineOrderStatusUseCase = ({
    posRepository,
    inventoryCommandService,
    commerceOrderLifecycleUseCase = null,
    activityRecorder = recordDgfyOrderActivity,
    inventoryReservationService = null
}) => {
    // Phase 9: see buildCheckoutPosUseCase's comment above - no
    // `|| stockMovementService` silent fallback.
    const stockCommands = inventoryCommandService;
    return async ({ posTransactionId, payload, user }) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        if (!normalizedTransactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const targetStatus = normalizeOnlineFulfillmentStatus(payload?.fulfillment_status);
        if (!targetStatus) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'fulfillment_status is required and must be a supported status',
                { statusCode: 422 }
            ));
        }
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const expectedStatus = String(payload?.expected_status || '').trim() || null;
        const expectedPaymentStatus = String(payload?.expected_payment_status || '').trim().toLowerCase() || null;
        const expectedServerVersion = payload?.expected_server_version instanceof Date
            ? payload.expected_server_version.toISOString()
            : String(payload?.expected_server_version || '').trim() || null;
        const hasExpectedState = Boolean(expectedStatus || expectedPaymentStatus || expectedServerVersion);
        const replayRequestHash = hashPayload({
            pos_transaction_id: normalizedTransactionId,
            fulfillment_status: targetStatus,
            ...(hasExpectedState ? {
                expected_status: expectedStatus,
                expected_payment_status: expectedPaymentStatus,
                expected_server_version: expectedServerVersion
            } : {})
        });

        const actingUserId = parsePositiveInt(user?.user_id);
        if (!actingUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_STATUS_UPDATE,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            const existing = await posRepository.getOrderByIdForLifecycle(normalizedTransactionId, {
                transaction,
                lock: true
            });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `POS transaction not found: ${normalizedTransactionId}`,
                    { statusCode: 404 }
                );
            }
            if (existing.order_source !== ONLINE_ORDER_SOURCE) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only online store orders can be updated through this endpoint',
                    { statusCode: 409 }
                );
            }
            const actualServerVersion = existing.updated_at instanceof Date
                ? existing.updated_at.toISOString()
                : String(existing.updated_at || '').trim();
            if (
                (expectedStatus && String(existing.fulfillment_status || '').trim() !== expectedStatus)
                || (expectedPaymentStatus && String(existing.payment_status || '').trim().toLowerCase() !== expectedPaymentStatus)
                || (expectedServerVersion && actualServerVersion !== expectedServerVersion)
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This order changed on the server before the offline status update could sync.',
                    { statusCode: 409, details: {
                        reason_code: 'MOBILE_ORDER_VERSION_CONFLICT',
                        expected_status: expectedStatus,
                        actual_status: String(existing.fulfillment_status || '').trim(),
                        expected_payment_status: expectedPaymentStatus,
                        actual_payment_status: String(existing.payment_status || '').trim().toLowerCase(),
                        expected_server_version: expectedServerVersion,
                        actual_server_version: actualServerVersion
                    } }
                );
            }
            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId: actingUserId,
                locationId: existing.location_id || null,
                transaction,
                lock: true
            });
            const currentStatus = normalizeOnlineFulfillmentStatus(existing.fulfillment_status);
            if (!currentStatus) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Current fulfillment state is invalid',
                    { statusCode: 409 }
                );
            }

            validateOnlineOrderTransition({
                currentStatus,
                nextStatus: targetStatus,
                orderMethod: existing.order_method
            });
            // Phase 148 (#825): the pickup twin of assertDeliveryCompletionReadiness's own
            // zero-balance gate. Kept as a separate check with its own reason_code rather than
            // folded into the `!== 'paid'` condition below -- a partially_paid order failing here
            // is a different operational situation ("collect the balance first") from an unpaid one
            // ("collect payment first"), and the terminal should be able to tell them apart.
            //
            // Ordered BEFORE the unpaid check deliberately: a partially_paid order fails both, and
            // whichever runs first is the reason_code the terminal sees. The balance one is the
            // actionable one.
            if (
                currentStatus === 'ready_for_pickup'
                && targetStatus === 'completed'
                && existing.order_method === 'pickup'
                && round4(existing.balance_due) > 0
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Settle the remaining balance before marking this pickup order as picked up.',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'PICKUP_BALANCE_DUE_OUTSTANDING',
                            balance_due: round4(existing.balance_due)
                        }
                    }
                );
            }
            if (
                currentStatus === 'ready_for_pickup'
                && targetStatus === 'completed'
                && existing.order_method === 'pickup'
                && String(existing.payment_status || '').trim().toLowerCase() !== 'paid'
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Cash pickup orders must be paid before they are marked as picked up.',
                    { statusCode: 409, details: { reason_code: 'PICKUP_PAYMENT_REQUIRED' } }
                );
            }
            if (
                currentStatus !== 'completed'
                && targetStatus === 'completed'
                && existing.order_method === 'delivery'
            ) {
                assertDeliveryCompletionReadiness(existing);
            }
            const mutationTimestamp = new Date();

            if (currentStatus !== 'completed' && targetStatus === 'completed') {
                if (stockCommands?.issueStockForOnlineFulfillment || stockCommands?.createStockMovement) {
                    const stockMovements = await buildOnlineOrderStockMovements({
                        order: existing,
                        posRepository,
                        options: {
                            transaction,
                            lock: true
                        }
                    });
                    for (const movement of stockMovements) {
                        await executeInventoryStockCommand({
                            inventoryCommandService: stockCommands,
                            command: 'issueStockForOnlineFulfillment',
                            movementData: movement,
                            userId: actingUserId,
                            transaction
                        });
                    }
                }
                if (inventoryReservationService?.convertOnlineOrderInventory) {
                    await inventoryReservationService.convertOnlineOrderInventory({
                        sourceId: normalizedTransactionId,
                        transaction
                    });
                }
            } else if (
                currentStatus !== targetStatus
                && ['cancelled', 'rejected'].includes(targetStatus)
                && inventoryReservationService?.releaseOnlineOrderInventory
            ) {
                await inventoryReservationService.releaseOnlineOrderInventory({
                    sourceId: normalizedTransactionId,
                    transaction,
                    reason: targetStatus
                });
            }

            const updatePayload = {
                fulfillment_status: targetStatus,
                ...buildOnlineOrderShiftAttributionPayload({
                    order: existing,
                    activeShift
                })
            };

            // Online orders are created without a cashier. Capture the first staff
            // user who handles lifecycle actions for history/accountability.
            if (!parsePositiveInt(existing.cashier_id)) {
                updatePayload.cashier_id = actingUserId;
            }
            // Phase 210 (#1179). Only the placed -> confirmed|rejected edge stamps accepted_by/at --
            // a later confirmed -> rejected must NOT overwrite that pair, since it genuinely was
            // accepted first. Leave this guard as-is; do not "fix" it to also fire on the reject edge.
            if (currentStatus === 'placed' && (targetStatus === 'confirmed' || targetStatus === 'rejected')) {
                updatePayload.accepted_by = actingUserId;
                updatePayload.accepted_at = mutationTimestamp;
            }

            if (targetStatus === 'rejected') {
                updatePayload.rejection_reason = String(payload?.reason || '').trim().slice(0, 255) || null;
                updatePayload.rejected_by = actingUserId;
                updatePayload.rejected_at = mutationTimestamp;
            }

            // Phase 211 (#1180). Retail-only in the UI, additive in the state machine.
            // PHASE_211_PLAN.md's own text assumed validateOnlineOrderTransition's
            // currentStatus === nextStatus early-return would make a repeat packed -> packed PATCH
            // a no-op here too -- investigated and found FALSE: that early-return only skips the
            // allowed-transition check, it does not stop this block from running, so an
            // unconditional `targetStatus === 'packed'` guard (matching the shape used for
            // `rejected` above) WOULD restamp packed_at/packed_by on every repeat call. Guarded
            // explicitly on `currentStatus !== targetStatus` instead -- confirmed by test.
            if (currentStatus !== targetStatus && targetStatus === 'packed') {
                updatePayload.packed_by = actingUserId;
                updatePayload.packed_at = mutationTimestamp;
            }

            await posRepository.updateOrderById(normalizedTransactionId, updatePayload, {
                transaction,
                lock: true
            });
            const updated = await posRepository.getOrderByIdForLifecycle(normalizedTransactionId, {
                transaction
            });

            await transaction.commit();
            const currentTenantId = dbStore.getStore()?.tenantId || null;
            await activityRecorder({
                tenantId: currentTenantId,
                order: updated,
                storeCustomer: updated?.storeCustomer || updated?.store_customer || null
            }).catch((activityError) => {
                logger.warn('Failed to sync DGFY order activity after POS status update', {
                    pos_transaction_id: normalizedTransactionId,
                    tracking_pin: updated?.tracking_pin || null,
                    error: activityError?.message || activityError
                });
            });

            let paymentLifecycle = {
                tracked: false,
                payment_action: 'not_applicable'
            };
            if (
                commerceOrderLifecycleUseCase
                && ['completed', 'rejected', 'cancelled'].includes(targetStatus)
                && currentTenantId
            ) {
                const lifecycleResult = await commerceOrderLifecycleUseCase({
                    tenantId: currentTenantId,
                    posTransactionId: normalizedTransactionId,
                    fulfillmentStatus: targetStatus,
                    actor: `pos_user:${actingUserId}`,
                    rejectionReason: payload?.reason || null
                });
                paymentLifecycle = lifecycleResult.success
                    ? lifecycleResult.data
                    : {
                        tracked: true,
                        payment_action: 'refund_failed',
                        failure_reason: lifecycleResult.error?.message
                            || 'The payment lifecycle action requires administrator review.'
                    };
                if (!lifecycleResult.success) {
                    logger.error('[PosUseCases] Commerce payment lifecycle failed after order status commit', {
                        tenant_id: currentTenantId,
                        pos_transaction_id: normalizedTransactionId,
                        target_status: targetStatus,
                        error: lifecycleResult.error?.message
                    });
                }
            }

            // Best-effort, post-commit settlement of any pending online-order affiliate commission
            // tied to this order - must never fail the status update that already succeeded. Dormant
            // until online attribution capture is wired up on the storefront (no pending rows exist
            // yet), but correct and ready.
            const affiliateSettleOutcome = targetStatus === 'completed'
                ? 'earned'
                : (targetStatus === 'cancelled' || targetStatus === 'rejected' ? 'reversed' : null);
            if (affiliateSettleOutcome) {
                try {
                    await settleAffiliateCommissionForOrder({
                        tenantId: currentTenantId,
                        orderReference: String(normalizedTransactionId),
                        outcome: affiliateSettleOutcome
                    });
                } catch (settleError) {
                    logger.warn('[PosUseCases] Failed to settle affiliate commission after online status update', {
                        pos_transaction_id: normalizedTransactionId,
                        target_status: targetStatus,
                        error: settleError?.message
                    });
                }
            }
            const replayPayload = {
                order: toSerializable(updated),
                status_transition: {
                    current_status: currentStatus,
                    requested_status: targetStatus,
                    order_method: existing.order_method || null,
                    applied_by: actingUserId,
                    applied_at: mutationTimestamp.toISOString()
                },
                payment_lifecycle: paymentLifecycle,
                idempotency: {
                    key: idempotencyKey || null,
                    request_fingerprint: replayRequestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_STATUS_UPDATE,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: actingUserId
            });
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.ORDER_STATUS_UPDATE,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: actingUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to update online order status'));
        }
    };
};

// Phase 210 (#1179). Staff-only post-placement delivery-address/pin edit. Pat's confirmed decision:
// pre-dispatch only (DELIVERY_ADDRESS_EDITABLE_STATUSES) -- an order already out_for_delivery, or in
// any terminal state, is rejected with a 409. No radius recomputation here: outside_radius_flag is
// left at whatever it was set to at checkout -- re-enforcing the delivery radius on an address
// change is #478's job, not this phase's; touching it here would silently change acceptance
// behaviour for every existing order path.
export const buildUpdateOnlineOrderDeliveryAddressUseCase = ({
    posRepository,
    activityRecorder = recordDgfyOrderActivity
}) => {
    return async ({ posTransactionId, payload, user }) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        if (!normalizedTransactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const newAddress = String(payload?.delivery_address || '').trim();
        if (!newAddress) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'delivery_address is required',
                { statusCode: 422 }
            ));
        }
        const hasLatitude = payload?.delivery_latitude !== undefined && payload?.delivery_latitude !== null;
        const hasLongitude = payload?.delivery_longitude !== undefined && payload?.delivery_longitude !== null;
        if (hasLatitude !== hasLongitude) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'delivery_latitude and delivery_longitude must be provided together',
                { statusCode: 422 }
            ));
        }
        const newLatitude = hasLatitude ? Number(payload.delivery_latitude) : null;
        const newLongitude = hasLongitude ? Number(payload.delivery_longitude) : null;
        const changeReason = String(payload?.change_reason || '').trim();
        if (!changeReason) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'change_reason is required',
                { statusCode: 422 }
            ));
        }

        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const replayRequestHash = hashPayload({
            pos_transaction_id: normalizedTransactionId,
            delivery_address: newAddress,
            delivery_latitude: newLatitude,
            delivery_longitude: newLongitude,
            change_reason: changeReason
        });

        const actingUserId = parsePositiveInt(user?.user_id);
        if (!actingUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_DELIVERY_ADDRESS_UPDATE,
                idempotencyKey,
                requestHash: replayRequestHash
            });
            if (replay) {
                return ok(replay);
            }

            const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
            transaction = await sequelize.transaction();
            const existing = await posRepository.getOrderByIdForLifecycle(normalizedTransactionId, {
                transaction,
                lock: true
            });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `POS transaction not found: ${normalizedTransactionId}`,
                    { statusCode: 404 }
                );
            }
            if (existing.order_source !== ONLINE_ORDER_SOURCE) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only online store orders can be updated through this endpoint',
                    { statusCode: 409 }
                );
            }
            if (existing.order_method !== 'delivery') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only delivery orders have a delivery address to edit',
                    { statusCode: 422, details: { reason_code: 'ORDER_ADDRESS_EDIT_NOT_DELIVERY' } }
                );
            }
            const currentStatus = normalizeOnlineFulfillmentStatus(existing.fulfillment_status);
            if (!currentStatus || !DELIVERY_ADDRESS_EDITABLE_STATUSES.includes(currentStatus)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This order can no longer have its delivery address edited',
                    {
                        statusCode: 409,
                        details: {
                            reason_code: 'ORDER_ADDRESS_EDIT_TERMINAL_STATE',
                            current_status: currentStatus,
                            editable_statuses: DELIVERY_ADDRESS_EDITABLE_STATUSES
                        }
                    }
                );
            }

            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId: actingUserId,
                locationId: existing.location_id || null,
                transaction,
                lock: true
            });
            const mutationTimestamp = new Date();

            await posRepository.createAddressChange({
                posTransactionId: normalizedTransactionId,
                previousAddress: existing.delivery_address || null,
                previousLatitude: existing.delivery_latitude ?? null,
                previousLongitude: existing.delivery_longitude ?? null,
                newAddress,
                newLatitude,
                newLongitude,
                changeReason,
                changedBy: actingUserId,
                changedByShiftId: parsePositiveInt(activeShift?.pos_terminal_shift_id) || null,
                changedAt: mutationTimestamp
            }, { transaction });

            const updated = await posRepository.updateOrderById(normalizedTransactionId, {
                delivery_address: newAddress,
                delivery_latitude: newLatitude,
                delivery_longitude: newLongitude
                // outside_radius_flag is deliberately NOT recomputed here -- see #478.
            }, { transaction, lock: true });

            await transaction.commit();

            const currentTenantId = dbStore.getStore()?.tenantId || null;
            await activityRecorder({
                tenantId: currentTenantId,
                order: updated,
                storeCustomer: updated?.storeCustomer || updated?.store_customer || null
            }).catch((activityError) => {
                logger.warn('Failed to sync DGFY order activity after POS delivery-address update', {
                    pos_transaction_id: normalizedTransactionId,
                    tracking_pin: updated?.tracking_pin || null,
                    error: activityError?.message || activityError
                });
            });

            const replayPayload = {
                order: toSerializable(updated),
                address_change: {
                    previous_address: existing.delivery_address || null,
                    previous_latitude: existing.delivery_latitude ?? null,
                    previous_longitude: existing.delivery_longitude ?? null,
                    new_address: newAddress,
                    new_latitude: newLatitude,
                    new_longitude: newLongitude,
                    change_reason: changeReason,
                    changed_by: actingUserId,
                    changed_at: mutationTimestamp.toISOString()
                },
                idempotency: {
                    key: idempotencyKey || null,
                    request_fingerprint: replayRequestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.ORDER_DELIVERY_ADDRESS_UPDATE,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: actingUserId
            });
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.ORDER_DELIVERY_ADDRESS_UPDATE,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: actingUserId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to update online order delivery address'));
        }
    };
};
