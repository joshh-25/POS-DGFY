import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
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
import dbStore from '../../../utils/dbStore.js';
import { resolveMovementLocation } from '../../../services/locationInventoryService.js';

const VAT_RATE = 0.12;
const INVOICE_COUNTER_KEY = 'POS_OR';
const NON_FISCAL_COUNTER_KEY = 'POS_NFS';
const FISCAL_LIFETIME_COUNTER_KEY = 'POS_FISCAL_LIFETIME_TOTAL_CENTS';
const Z_READING_COUNTER_KEY = 'POS_Z_READING_COUNTER';
const RESET_COUNTER_KEY = 'POS_RESET_COUNTER';
const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery'];
const ORDER_METHOD_FEE_KEYS = [...ORDER_METHODS, 'online'];
const ONLINE_ORDER_SOURCE = 'online_store';
const ONLINE_FULFILLMENT_STATUSES = [
    'placed',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'cancelled',
    'rejected'
];
const ONLINE_FULFILLMENT_TRANSITIONS = Object.freeze({
    placed: ['confirmed', 'rejected'],
    confirmed: ['preparing'],
    preparing: ['ready_for_pickup', 'out_for_delivery'],
    ready_for_pickup: ['completed'],
    out_for_delivery: ['completed'],
    completed: [],
    cancelled: [],
    rejected: []
});
const ORDER_METHOD_FEE_LABELS = {
    dine_in: 'Dine In Fee',
    takeout: 'Takeout Fee',
    pickup: 'Pickup Fee',
    delivery: 'Delivery Fee',
    online: 'Online Fee'
};
const createDefaultOrderMethodFeeMatrix = () => ORDER_METHOD_FEE_KEYS.reduce((acc, method) => {
    acc[method] = {
        enabled: false,
        amount: 0,
        label: ORDER_METHOD_FEE_LABELS[method]
    };
    return acc;
}, {});
const CASH_EVENT_EFFECT = Object.freeze({
    cash_in: 1,
    opening_adjustment: 1,
    cash_out: -1,
    closing_adjustment: -1
});
const PERMISSION_PRICE_OVERRIDE = 'pos:price_override';
const PERMISSION_EDIT_POS_CATALOG = 'items:edit';
const PERMISSION_SWITCH_LOCATION = 'pos:switch_location';
const POS_CATALOG_IMAGE_ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/svg+xml',
    'image/avif'
]);
const POS_CATALOG_IMAGE_ALLOWED_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.avif'
]);
const RESET_COUNTER_CONFIRMATION_TEXT = 'INCREMENT RESET COUNTER';
const SPECIAL_DISCOUNT_BENEFICIARY_TYPES = new Set(['senior', 'pwd', 'national_athlete']);
const RECEIPT_CONTRACT_VERSION = '2026.04.08';
const OPERATION_REPLAY_STATUS = Object.freeze({
    PROCESSED: 'processed',
    BLOCKED: 'blocked'
});
const POS_OPERATION_KEYS = Object.freeze({
    SHIFT_OPEN: 'terminal.shift_open',
    SHIFT_SWITCH: 'terminal.shift_switch_location',
    CASH_EVENT: 'terminal.cash_event',
    SHIFT_CLOSE: 'terminal.shift_close',
    ORDER_STATUS_UPDATE: 'terminal.order_status_update'
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
const LOCATION_SCOPE_REASON_CODES = Object.freeze({
    LOCATION_CONTEXT_REQUIRED: 'POS_LOCATION_CONTEXT_REQUIRED',
    LOCATION_SCOPE_UNRESOLVED: 'POS_LOCATION_SCOPE_UNRESOLVED',
    LOCATION_ACCESS_DENIED: 'POS_LOCATION_ACCESS_DENIED',
    TERMINAL_HOME_LOCATION_MISMATCH: 'POS_TERMINAL_HOME_LOCATION_MISMATCH',
    TERMINAL_HOME_LOCATION_REQUIRED: 'POS_TERMINAL_HOME_LOCATION_REQUIRED',
    SHIFT_LOCATION_MISMATCH: 'POS_SHIFT_LOCATION_MISMATCH'
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

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized <= 0) return null;
    return normalized;
};

const nowInManilaBusinessDate = () => (
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
);

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toCurrencyCents = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));
const fromCurrencyCents = (value) => round4((Number(value) || 0) / 100);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const normalizeOptionalIdempotencyKey = (value) => {
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

const serializeReplayFailure = (error) => ({
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

const findOperationReplayEntry = async ({
    posRepository,
    operationKey,
    idempotencyKey,
    requestHash
}) => {
    if (!idempotencyKey) return null;

    const existing = toSerializable(await posRepository.findOperationReplayByKey({
        operationKey,
        idempotencyKey
    }));
    if (!existing) return null;

    if (String(existing.request_hash || '') !== String(requestHash || '')) {
        throw buildOperationReplayConflictError();
    }

    if (existing.replay_status === OPERATION_REPLAY_STATUS.BLOCKED) {
        throw buildReplayBlockedError(existing.response_payload || {});
    }

    return {
        ...(existing.response_payload && typeof existing.response_payload === 'object'
            ? existing.response_payload
            : {}),
        idempotent_replay: true,
        replay_outcome: 'idempotent_replay'
    };
};

const persistOperationReplay = async ({
    posRepository,
    operationKey,
    idempotencyKey,
    requestHash,
    replayStatus,
    responsePayload,
    createdBy
}) => {
    if (!idempotencyKey) return null;

    return posRepository.createOperationReplay({
        operation_key: operationKey,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        replay_status: replayStatus,
        response_payload: responsePayload || {},
        created_by: createdBy || null
    });
};

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

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

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
    vatable_sales: round4(summary?.vatable_sales),
    vat_amount: round4(summary?.vat_amount),
    vat_exempt_sales: round4(summary?.vat_exempt_sales),
    zero_rated_sales: round4(summary?.zero_rated_sales),
    total_amount: round4(summary?.total_amount),
    payment_breakdown: Array.isArray(summary?.payment_breakdown)
        ? summary.payment_breakdown.map((entry) => ({
            payment_type: entry?.payment_type || null,
            count: Number.parseInt(entry?.count || 0, 10),
            amount: round4(entry?.amount)
        }))
        : [],
    order_method_breakdown: Array.isArray(summary?.order_method_breakdown)
        ? summary.order_method_breakdown.map((entry) => ({
            order_method: entry?.order_method || null,
            count: Number.parseInt(entry?.count || 0, 10),
            amount: round4(entry?.amount)
        }))
        : []
});

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
    operationLabel = 'POS read operation'
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

const resolvePosOperationalLocationScope = async ({
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

const isSupportedPosCatalogImageFile = (file = {}) => {
    const mimetype = String(file?.mimetype || '').trim().toLowerCase();
    if (POS_CATALOG_IMAGE_ALLOWED_MIME_TYPES.has(mimetype)) {
        return true;
    }

    const ext = String(path.extname(file?.originalname || '') || '').toLowerCase();
    return POS_CATALOG_IMAGE_ALLOWED_EXTENSIONS.has(ext);
};

const normalizeOnlineFulfillmentStatus = (value) => {
    const status = String(value || '').trim();
    return ONLINE_FULFILLMENT_STATUSES.includes(status) ? status : null;
};

const validateOnlineOrderTransition = ({ currentStatus, nextStatus, orderMethod }) => {
    if (currentStatus === nextStatus) {
        return;
    }

    const allowedStatuses = ONLINE_FULFILLMENT_TRANSITIONS[currentStatus] || [];
    if (!allowedStatuses.includes(nextStatus)) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Invalid fulfillment transition: ${currentStatus} -> ${nextStatus}`,
            { statusCode: 409 }
        );
    }

    if (nextStatus === 'out_for_delivery' && orderMethod !== 'delivery') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Only delivery orders can transition to out_for_delivery',
            { statusCode: 409 }
        );
    }

    if (nextStatus === 'ready_for_pickup' && orderMethod === 'delivery') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Delivery orders must transition to out_for_delivery instead of ready_for_pickup',
            { statusCode: 409 }
        );
    }
};

const buildOnlineOrderStockMovements = (order = {}) => {
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

    return lines.map((line, index) => {
        const itemId = parsePositiveInt(line?.item_id);
        const quantity = Number(line?.quantity);
        if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                `Online order line ${index + 1} has invalid inventory movement data`,
                { statusCode: 409 }
            );
        }

        const lineReference = parsePositiveInt(line?.line_id) || `${itemId}-${index + 1}`;
        return {
            item_id: itemId,
            quantity,
            movement_type: 'goods_issue',
            location_id: order.location_id || null,
            reference_type: 'POS',
            reference_id: `ONLINE:${orderId}:${lineReference}`,
            notes: `Online order completion ${order.invoice_number || `#${orderId}`}${order.tracking_pin ? ` (${order.tracking_pin})` : ''}`
        };
    });
};

const getPosSettings = async () => unwrapApplicationResultOrThrow(
    await getAllSettingsUseCase(),
    'Failed to retrieve POS setup settings'
);

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

const parseOrderMethodFees = (settings = {}) => {
    const raw = settings?.pos_order_method_fees?.value;
    let parsed = raw;

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = null;
        }
    }

    if (!isPlainObject(parsed)) {
        return createDefaultOrderMethodFeeMatrix();
    }

    const normalized = createDefaultOrderMethodFeeMatrix();
    for (const method of ORDER_METHOD_FEE_KEYS) {
        const entry = parsed?.[method];
        if (!isPlainObject(entry)) {
            continue;
        }

        const amount = Number(entry.amount);
        normalized[method] = {
            enabled: parseBooleanSetting(entry.enabled),
            amount: Number.isFinite(amount) ? Math.max(0, round4(amount)) : 0,
            label: String(entry.label || '').trim() || ORDER_METHOD_FEE_LABELS[method]
        };
    }

    return normalized;
};

const resolveCheckoutServiceFee = ({ payload, settings }) => {
    const orderMethod = ORDER_METHODS.includes(payload?.order_method)
        ? payload.order_method
        : 'dine_in';
    const feeMatrix = parseOrderMethodFees(settings);
    const methodFee = feeMatrix[orderMethod] || createDefaultOrderMethodFeeMatrix()[orderMethod];
    const hasOverride = payload?.service_fee_amount !== undefined && payload?.service_fee_amount !== null;
    const overrideAmount = hasOverride ? Number(payload.service_fee_amount) : null;

    if (hasOverride && (!Number.isFinite(overrideAmount) || overrideAmount < 0)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'service_fee_amount must be a non-negative number',
            { statusCode: 422 }
        );
    }

    if (hasOverride && !methodFee.enabled && overrideAmount > 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Service fee override is not allowed for order method: ${orderMethod}`,
            { statusCode: 422 }
        );
    }

    let serviceFeeAmount = methodFee.enabled ? round4(methodFee.amount) : 0;
    if (hasOverride) {
        serviceFeeAmount = round4(overrideAmount);
    }

    if (serviceFeeAmount <= 0) {
        return {
            serviceFeeAmount: 0,
            serviceFeeLabelSnapshot: null,
            serviceFeeMethodSnapshot: null,
            serviceFeeOverridden: false
        };
    }

    return {
        serviceFeeAmount,
        serviceFeeLabelSnapshot: methodFee.label || ORDER_METHOD_FEE_LABELS[orderMethod],
        serviceFeeMethodSnapshot: orderMethod,
        serviceFeeOverridden: Boolean(hasOverride)
    };
};

const resolveCheckoutDiscount = ({ payload, subtotalAmount, settings }) => {
    const profileName = String(payload?.discount_profile_name || '').trim();
    const requestedDiscount = round4(payload?.discount_amount || 0);
    const requestedRate = payload?.discount_rate;

    if (!profileName) {
        if (requestedRate != null) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'discount_rate requires discount_profile_name.',
                { statusCode: 422 }
            );
        }
        if (requestedDiscount > 0) {
            return {
                discountAmount: Math.min(requestedDiscount, subtotalAmount),
                discountLabelSnapshot: 'Manual Discount',
                discountRateSnapshot: null
            };
        }
        return {
            discountAmount: 0,
            discountLabelSnapshot: null,
            discountRateSnapshot: null
        };
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

    if (!note && !discountBeneficiary && !normalizedReceiptContract) {
        return null;
    }

    const payload = {
        note,
        discount_beneficiary: discountBeneficiary || null,
        receipt_contract: normalizedReceiptContract
    };

    return JSON.stringify(payload);
};

export const buildCheckoutPosUseCase = ({ posRepository, stockMovementService }) => {
    return async ({ payload, userId, user }) => {
        const normalizedUserId = parsePositiveInt(userId);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'userId must be a positive integer',
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
        const normalizedRequestPayload = {
            terminal_id: requestedTerminalId || null,
            location_id: requestedLocationId,
            order_method: normalizedOrderMethod,
            payment_type: payload.payment_type || 'cash',
            service_fee_amount: payload.service_fee_amount == null ? null : round4(payload.service_fee_amount),
            discount_profile_name: String(payload.discount_profile_name || '').trim() || null,
            discount_rate: payload.discount_rate == null ? null : round4(payload.discount_rate),
            discount_amount: round4(payload.discount_amount || 0),
            customer_name: String(payload.customer_name || '').trim() || null,
            customer_email: String(payload.customer_email || '').trim().toLowerCase() || null,
            customer_phone: String(payload.customer_phone || '').trim() || null,
            special_instructions: String(payload.special_instructions || '').trim() || null,
            discount_beneficiary: isPlainObject(payload.discount_beneficiary)
                ? {
                    category: String(payload.discount_beneficiary.category || '').trim().toLowerCase() || null,
                    name: String(payload.discount_beneficiary.name || '').trim() || null,
                    id_number: String(payload.discount_beneficiary.id_number || '').trim() || null
                }
                : null,
            lines: lines
                .map((line) => ({
                    item_id: Number.parseInt(line.item_id, 10),
                    quantity: round4(line.quantity),
                    sale_price: line.sale_price == null ? null : round4(line.sale_price),
                    price_override_reason: String(line.price_override_reason || '').trim() || null
                }))
                .sort((a, b) => a.item_id - b.item_id)
        };

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const settings = await getPosSettings();
            const resolvedCheckoutLocation = await resolvePosOperationalLocationScope({
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
            const terminalPolicyContext = evaluateTerminalIdentityPolicy({
                terminalId: requestedTerminalId,
                policy: terminalPolicySettings,
                operation: 'checkout'
            });
            const normalizedTerminalId = terminalPolicyContext.terminal_id;
            const enforcedCheckoutLocationId = enforceTerminalHomeLocationPolicy({
                bindingEnforced: terminalPolicySettings.binding_enforced === true,
                terminalPolicyContext,
                targetLocationId: scopedCheckoutLocationId
            });
            if (terminalPolicySettings.binding_enforced === true && !enforcedCheckoutLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'POS checkout requires a valid location scope while terminal location binding is enforced.',
                    reasonCode: LOCATION_SCOPE_REASON_CODES.LOCATION_SCOPE_UNRESOLVED,
                    statusCode: 422
                });
            }
            const requestHash = hashPayload({
                ...normalizedRequestPayload,
                terminal_id: normalizedTerminalId || null,
                location_id: enforcedCheckoutLocationId
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

            const existing = await posRepository.findTransactionByIdempotencyKey(
                idempotencyKey,
                { transaction, lock: true }
            );

            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key was already used with a different payload',
                        { statusCode: 409 }
                    );
                }

                await transaction.commit();
                return ok({
                    idempotent_replay: true,
                    compliance_decision: complianceDecision,
                    terminal_identity_policy: terminalPolicyContext,
                    receipt_contract: {
                        ...resolvedReceiptContract,
                        document_context: String(existing.document_context || resolvedReceiptContract.document_context || '').trim().toLowerCase() || 'non_fiscal'
                    },
                    transaction: toSerializable(existing)
                });
            }

            const itemIds = [...new Set(lines.map((line) => Number.parseInt(line.item_id, 10)))];
            const items = await posRepository.findSellableItemsByIds(itemIds, {
                transaction,
                lock: true,
                locationId: enforcedCheckoutLocationId
            });
            const itemMap = new Map(items.map((item) => [item.item_id, item]));

            const normalizedShiftId = parsePositiveInt(payload.shift_id);
            if (payload.shift_id != null) {
                if (!normalizedShiftId) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'shift_id must be a positive integer when provided',
                        { statusCode: 422 }
                    );
                }
                const shift = await posRepository.getTerminalShiftById(normalizedShiftId, { transaction, lock: true });
                if (!shift || shift.status !== 'open') {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Selected terminal shift is not open or no longer available.',
                        { statusCode: 422 }
                    );
                }
                if (Number(shift.cashier_id) !== normalizedUserId) {
                    throw new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Shift does not belong to the authenticated cashier.',
                        { statusCode: 403 }
                    );
                }
                if (normalizedTerminalId && String(shift.terminal_id) !== String(normalizedTerminalId)) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Shift terminal_id does not match checkout terminal_id.',
                        { statusCode: 422 }
                    );
                }
                const shiftLocationId = parsePositiveInt(shift.location_id);
                if (!shiftLocationId && terminalPolicySettings.binding_enforced === true) {
                    throw buildLocationScopeDeniedError({
                        message: 'Active shift is missing location binding.',
                        reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
                        statusCode: 422,
                        details: {
                            shift_id: normalizedShiftId
                        }
                    });
                }
                if (
                    terminalPolicySettings.binding_enforced === true
                    && shiftLocationId
                    && shiftLocationId !== enforcedCheckoutLocationId
                ) {
                    throw buildLocationScopeDeniedError({
                        message: 'Checkout location must match active shift location.',
                        reasonCode: LOCATION_SCOPE_REASON_CODES.SHIFT_LOCATION_MISMATCH,
                        statusCode: 422,
                        details: {
                            shift_id: normalizedShiftId,
                            shift_location_id: shiftLocationId,
                            checkout_location_id: enforcedCheckoutLocationId
                        }
                    });
                }
            }

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

            for (const line of lines) {
                const itemId = Number.parseInt(line.item_id, 10);
                const quantity = Number(line.quantity);
                const item = itemMap.get(itemId);

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid quantity for item ${itemId}`,
                        { statusCode: 400 }
                    );
                }

                const currentStock = Number(item.current_stock) || 0;
                if (currentStock + 0.000001 < quantity) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${quantity}`,
                        { statusCode: 400 }
                    );
                }

                const resolvedPrice = line.sale_price == null
                    ? (
                        item.default_sale_price != null
                            ? Number(item.default_sale_price)
                            : Number(item.cost_per_unit || 0)
                    )
                    : Number(line.sale_price);
                const defaultSalePrice = item.default_sale_price != null
                    ? Number(item.default_sale_price)
                    : Number(item.cost_per_unit || 0);

                if (!Number.isFinite(resolvedPrice) || resolvedPrice < 0) {
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
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: round4(quantity),
                    unit_of_measure: item.unit_of_measure,
                    cost_snapshot: item.cost_per_unit != null ? round4(item.cost_per_unit) : null,
                    sale_price: round4(resolvedPrice),
                    sale_price_overridden: salePriceOverridden,
                    price_override_reason: salePriceOverridden ? priceOverrideReason : null,
                    line_subtotal: lineSubtotal,
                    vat_type_snapshot: item.vat_type || 'vatable',
                    vat_rate_snapshot: VAT_RATE
                });
            }

            subtotalAmount = round4(subtotalAmount);
            const discountResolution = resolveCheckoutDiscount({ payload, subtotalAmount, settings });
            const discountAmount = round4(discountResolution.discountAmount);
            const discountBeneficiary = normalizeDiscountBeneficiary({
                payload,
                discountLabelSnapshot: discountResolution.discountLabelSnapshot
            });
            const transactionSpecialInstructions = buildTransactionSpecialInstructions({
                rawSpecialInstructions: payload.special_instructions,
                discountBeneficiary,
                receiptContract: resolvedReceiptContract
            });
            const netItemsTotal = round4(subtotalAmount - discountAmount);
            const serviceFeeResolution = resolveCheckoutServiceFee({
                payload: { ...payload, order_method: normalizedOrderMethod },
                settings
            });
            const serviceFeeAmount = round4(serviceFeeResolution.serviceFeeAmount);
            const totalAmount = round4(netItemsTotal + serviceFeeAmount);
            const adjustmentFactor = subtotalAmount > 0 ? (netItemsTotal / subtotalAmount) : 1;

            for (const line of preparedLines) {
                line.line_subtotal = round4(line.line_subtotal * adjustmentFactor);
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

            for (const line of preparedLines) {
                if (line.vat_type_snapshot === 'vatable') {
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

            const posTransactionId = await posRepository.createTransactionWithLines({
                header: {
                    invoice_number: invoiceNumber,
                    document_type: resolvedReceiptContract.document_type === 'fiscal_invoice' ? 'fiscal_invoice' : 'non_fiscal_slip',
                    document_context: resolvedReceiptContract.document_context,
                    idempotency_key: idempotencyKey,
                    request_hash: requestHash,
                    cashier_id: normalizedUserId,
                    shift_id: normalizedShiftId || null,
                    terminal_id: normalizedTerminalId || null,
                    order_source: 'in_store',
                    order_method: normalizedOrderMethod,
                    fulfillment_status: 'completed',
                    location_id: enforcedCheckoutLocationId,
                    customer_name: String(payload.customer_name || '').trim() || null,
                    customer_email: String(payload.customer_email || '').trim().toLowerCase() || null,
                    customer_phone: String(payload.customer_phone || '').trim() || null,
                    special_instructions: transactionSpecialInstructions,
                    payment_type: payload.payment_type || 'cash',
                    subtotal_amount: subtotalAmount,
                    vatable_sales: vatableSales,
                    vat_amount: vatAmount,
                    vat_exempt_sales: vatExemptSales,
                    zero_rated_sales: zeroRatedSales,
                    discount_amount: discountAmount,
                    discount_label_snapshot: discountResolution.discountLabelSnapshot,
                    discount_rate_snapshot: discountResolution.discountRateSnapshot,
                    service_fee_amount: serviceFeeAmount,
                    service_fee_label_snapshot: serviceFeeResolution.serviceFeeLabelSnapshot,
                    service_fee_method_snapshot: serviceFeeResolution.serviceFeeMethodSnapshot,
                    service_fee_overridden: serviceFeeResolution.serviceFeeOverridden,
                    total_amount: totalAmount,
                    delivery_fee: 0,
                    status: 'completed'
                },
                lines: preparedLines
            }, { transaction });

            for (const line of preparedLines) {
                await stockMovementService.createStockMovement({
                    item_id: line.item_id,
                    quantity: Number(line.quantity),
                    movement_type: 'goods_issue',
                    location_id: enforcedCheckoutLocationId,
                    reference_type: 'POS',
                    reference_id: String(posTransactionId),
                    notes: `POS checkout ${invoiceNumber}`
                }, normalizedUserId, transaction);
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

            await transaction.commit();
            return ok({
                idempotent_replay: false,
                compliance_decision: complianceDecision,
                terminal_identity_policy: terminalPolicyContext,
                receipt_contract: resolvedReceiptContract,
                transaction: toSerializable(created)
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to complete POS checkout'));
        }
    };
};

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
            return ok(data);
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS transactions'));
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
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS transaction'));
        }
    };
};

export const buildCloseDayZReadingUseCase = ({ posRepository }) => {
    return async ({ businessDateInput }) => {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        let transaction = null;

        try {
            transaction = await sequelize.transaction();
            const { businessDate, startAt, endAt } = buildBusinessDateRange(
                businessDateInput || new Date()
            );
            const summary = normalizeZReadingSummary(
                await posRepository.getZReadingSummary({ startAt, endAt }, { transaction })
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
                reading_identifier: readingIdentifier,
                z_counter_value: zCounterValue,
                reset_counter_value: resetCounterValue,
                lifetime_grand_total_cents: lifetimeGrandTotalCents,
                summary
            }, { transaction });

            await transaction.commit();

            return ok({
                business_date: businessDate,
                generated_at: snapshot?.generated_at || new Date().toISOString(),
                summary,
                snapshot_persisted: true,
                reading_identifier: readingIdentifier,
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
            return fail(mapPosUseCaseError(error, 'Failed to generate daily Z-reading'));
        }
    };
};

export const buildGetDailyZReadingUseCase = ({ posRepository }) => {
    return async ({ businessDateInput }) => {
        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(businessDateInput);
            const snapshot = await posRepository.getLatestZReadingSnapshotByBusinessDate(businessDate);
            if (snapshot) {
                const normalizedSummary = normalizeZReadingSummary(
                    normalizeJsonObject(snapshot.summary, {})
                );
                const zCounterValue = Number.parseInt(snapshot.z_counter_value || 0, 10);
                const resetCounterValue = Number.parseInt(snapshot.reset_counter_value || 0, 10);
                const lifetimeGrandTotalCents = Number.parseInt(snapshot.lifetime_grand_total_cents || 0, 10);

                return ok({
                    business_date: businessDate,
                    generated_at: snapshot.generated_at || snapshot.created_at || new Date().toISOString(),
                    summary: normalizedSummary,
                    snapshot_persisted: true,
                    reading_identifier: snapshot.reading_identifier || null,
                    counters: {
                        z_counter: zCounterValue,
                        reset_counter: resetCounterValue,
                        lifetime_grand_total_cents: lifetimeGrandTotalCents,
                        lifetime_grand_total: fromCurrencyCents(lifetimeGrandTotalCents)
                    }
                });
            }

            const summary = normalizeZReadingSummary(
                await posRepository.getZReadingSummary({ startAt, endAt })
            );
            const [zCounterValue, resetCounterValue, lifetimeGrandTotalCents] = await Promise.all([
                posRepository.getPersistentCounterValue(Z_READING_COUNTER_KEY),
                posRepository.getPersistentCounterValue(RESET_COUNTER_KEY),
                posRepository.getPersistentCounterValue(FISCAL_LIFETIME_COUNTER_KEY)
            ]);

            return ok({
                business_date: businessDate,
                generated_at: new Date().toISOString(),
                summary,
                snapshot_persisted: false,
                reading_identifier: null,
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
            const data = await posRepository.listCatalog({
                search: query?.search || '',
                limit: query?.limit || 100,
                folder_id: query?.folder_id,
                location_id: locationScope.location_id
            });
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
                pos_visible: payload.pos_visible
            });
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to update POS catalog override'));
        }
    };
};

export const buildUploadPosCatalogImageUseCase = ({ posRepository, imageStorage }) => {
    return async ({ itemId, file, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
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

            if (!isSupportedPosCatalogImageFile(file)) {
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
            if (existing?.pos_image_path) {
                await imageStorage.remove({ path: existing.pos_image_path });
            }

            const stored = await imageStorage.store({
                itemId: normalizedItemId,
                originalName: file.originalname,
                tempPath: file.path
            });

            const data = await posRepository.updateCatalogImage(normalizedItemId, {
                path: stored.path,
                url: stored.url
            });

            return ok(toSerializable(data));
        } catch (error) {
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

export const buildOpenTerminalShiftUseCase = ({ posRepository }) => {
    return async ({ payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to open a terminal shift',
                { statusCode: 401 }
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
        const openingFloatAmount = round4(Number(payload?.opening_float_amount || 0));
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

        try {
            const terminalPolicySettings = await resolveTerminalIdentityPolicySettings({
                posRepository,
                settings: {}
            });
            const terminalPolicyContext = evaluateTerminalIdentityPolicy({
                terminalId: requestedTerminalId,
                policy: terminalPolicySettings,
                operation: 'open_shift'
            });
            const terminalId = terminalPolicyContext.terminal_id;
            const locationScope = await resolvePosOperationalLocationScope({
                requestedLocationId,
                userId: normalizedUserId,
                operationLabel: 'POS shift open',
                allowNullWhenUnresolved: true
            });
            const enforcedShiftLocationId = enforceTerminalHomeLocationPolicy({
                bindingEnforced: terminalPolicySettings.binding_enforced === true,
                terminalPolicyContext,
                targetLocationId: locationScope.location_id
            });
            if (terminalPolicySettings.binding_enforced === true && !enforcedShiftLocationId) {
                throw buildLocationScopeDeniedError({
                    message: 'POS shift opening requires a valid location scope while terminal location binding is enforced.',
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

            const existing = await posRepository.findOpenTerminalShift({
                terminalId,
                cashierId: normalizedUserId
            });
            if (existing) {
                const existingLocationId = parsePositiveInt(existing.location_id);
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
                const replayPayload = {
                    reused_existing: true,
                    compliance_decision: complianceDecision,
                    terminal_identity_policy: terminalPolicyContext,
                    shift: toSerializable(existing)
                };
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                    idempotencyKey,
                    requestHash: replayRequestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                    responsePayload: replayPayload,
                    createdBy: normalizedUserId
                });
                return ok({
                    ...replayPayload,
                    idempotent_replay: false,
                    replay_outcome: 'processed'
                });
            }

            const created = await posRepository.createTerminalShift({
                business_date: businessDate,
                terminal_id: terminalId,
                location_id: enforcedShiftLocationId,
                cashier_id: normalizedUserId,
                opening_float_amount: openingFloatAmount,
                opening_note: openingNote,
                opened_at: new Date(),
                status: 'open'
            });
            const hydratedCreated = await posRepository.getTerminalShiftById(
                created.pos_terminal_shift_id
            );

            const replayPayload = {
                reused_existing: false,
                compliance_decision: complianceDecision,
                terminal_identity_policy: terminalPolicyContext,
                shift: toSerializable(hydratedCreated || created)
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_OPEN,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId
            });
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
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
            const existingShift = await posRepository.getTerminalShiftById(normalizedShiftId, {
                transaction,
                lock: true
            });
            if (!existingShift || existingShift.status !== 'open') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only open shifts can switch location.',
                    { statusCode: 422 }
                );
            }

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

            await transaction.commit();

            const replayPayload = {
                compliance_decision: complianceDecision,
                terminal_identity_policy: terminalPolicyContext,
                transition: toSerializable(transition),
                from_shift: toSerializable(closedShift),
                to_shift: toSerializable(hydratedOpenedShift || openedShift)
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_SWITCH,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId
            });
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

export const buildGetCurrentTerminalShiftUseCase = ({ posRepository }) => {
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
            const requestedLocationId = query?.location_id == null
                ? null
                : parsePositiveInt(query.location_id);
            const shift = await posRepository.findOpenTerminalShift({
                terminalId: String(query?.terminal_id || '').trim() || null,
                cashierId: normalizedUserId,
                locationId: requestedLocationId
            });

            if (!shift) {
                return ok({
                    shift: null,
                    cash_summary: null,
                    location_binding_readiness: readinessSummary
                });
            }

            const cashSales = await posRepository.getShiftCashSalesTotal(shift.pos_terminal_shift_id);
            return ok({
                shift: toSerializable(shift),
                cash_summary: buildShiftCashSummary({ shift: toSerializable(shift), cashSalesAmount: cashSales }),
                location_binding_readiness: readinessSummary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to load current terminal shift'));
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

            const shift = await posRepository.getTerminalShiftById(normalizedShiftId);
            if (!shift || shift.status !== 'open') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Cash drawer events can only be recorded for open shifts',
                    { statusCode: 422 }
                );
            }

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
            });

            const replayPayload = {
                ...toSerializable(created),
                compliance_decision: complianceDecision
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.CASH_EVENT,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId
            });
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
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

export const buildCloseTerminalShiftUseCase = ({ posRepository }) => {
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
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const replayRequestHash = hashPayload({
            shift_id: normalizedShiftId,
            closing_cash_amount: closingCashAmount,
            closing_note: closingNote
        });
        if (!Number.isFinite(closingCashAmount) || closingCashAmount < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'closing_cash_amount must be a non-negative number',
                { statusCode: 422 }
            ));
        }

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

            const shift = await posRepository.getTerminalShiftById(normalizedShiftId);
            if (!shift || shift.status !== 'open') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only open shifts can be closed',
                    { statusCode: 422 }
                );
            }

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: shift.terminal_id || null,
                    terminal_action: 'close_shift'
                },
                user
            });

            const shiftPayload = toSerializable(shift);
            const cashSales = await posRepository.getShiftCashSalesTotal(normalizedShiftId);
            const cashEvents = await posRepository.listCashDrawerEventsByShiftId(normalizedShiftId);
            const tempShift = { ...shiftPayload, cashEvents };
            const summary = buildShiftCashSummary({ shift: tempShift, cashSalesAmount: cashSales });
            const expectedCashAmount = round4(summary.expected_cash_amount || 0);
            const variance = round4(closingCashAmount - expectedCashAmount);

            const closed = await posRepository.closeTerminalShift(normalizedShiftId, {
                closing_cash_amount: closingCashAmount,
                expected_cash_amount: expectedCashAmount,
                cash_variance_amount: variance,
                closing_note: closingNote,
                closed_at: new Date(),
                closed_by: normalizedUserId,
                status: 'closed'
            });

            const replayPayload = {
                compliance_decision: complianceDecision,
                shift: toSerializable(closed),
                cash_summary: {
                    ...summary,
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: variance
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.SHIFT_CLOSE,
                idempotencyKey,
                requestHash: replayRequestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload: replayPayload,
                createdBy: normalizedUserId
            });
            return ok({
                ...replayPayload,
                idempotent_replay: false,
                replay_outcome: 'processed'
            });
        } catch (error) {
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
                locationId: locationScope.location_id
            });
            const openShift = await posRepository.findOpenTerminalShift({
                terminalId,
                cashierId: normalizedUserId,
                locationId: locationScope.location_id
            });
            const shiftPayload = openShift ? toSerializable(openShift) : null;
            const shiftCashSales = openShift
                ? await posRepository.getShiftCashSalesTotal(openShift.pos_terminal_shift_id)
                : 0;

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

export const buildListIncomingOnlineOrdersUseCase = ({ posRepository }) => {
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

        try {
            const locationScope = await resolvePosReadLocationScope({
                requestedLocationId: query?.location_id,
                userId: normalizedUserId,
                operationLabel: 'POS incoming orders read'
            });
            const orders = await posRepository.listIncomingOnlineOrders({
                locationId: locationScope.location_id,
                limit: query?.limit || 200
            });
            return ok({ orders });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list incoming online orders'));
        }
    };
};

export const buildUpdateOnlineOrderStatusUseCase = ({ posRepository, stockMovementService }) => {
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
        const replayRequestHash = hashPayload({
            pos_transaction_id: normalizedTransactionId,
            fulfillment_status: targetStatus
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

            if (
                currentStatus !== 'completed'
                && targetStatus === 'completed'
                && stockMovementService?.createStockMovement
            ) {
                const stockMovements = buildOnlineOrderStockMovements(existing);
                for (const movement of stockMovements) {
                    await stockMovementService.createStockMovement(
                        movement,
                        actingUserId,
                        transaction
                    );
                }
            }

            const updatePayload = {
                fulfillment_status: targetStatus
            };

            // Online orders are created without a cashier. Capture the first staff
            // user who handles lifecycle actions for history/accountability.
            if (!parsePositiveInt(existing.cashier_id)) {
                updatePayload.cashier_id = actingUserId;
            }
            if (currentStatus === 'placed' && (targetStatus === 'confirmed' || targetStatus === 'rejected')) {
                updatePayload.accepted_by = actingUserId;
                updatePayload.accepted_at = new Date();
            }

            await posRepository.updateOrderById(normalizedTransactionId, updatePayload, {
                transaction,
                lock: true
            });
            const updated = await posRepository.getOrderByIdForLifecycle(normalizedTransactionId, {
                transaction
            });

            await transaction.commit();
            const replayPayload = {
                order: toSerializable(updated)
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
