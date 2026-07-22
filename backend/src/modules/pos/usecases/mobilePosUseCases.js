import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { getAllSettingsUseCase } from '../../settings/index.js';

// Exported so middleware/rateLimiter.js can enforce the same number it
// advertises to clients in sync_policy/sync_limit_policy - see
// mobilePosFreeSyncLimiter.
export const MOBILE_SYNC_LIMIT_PER_DAY = 2;
const MOBILE_SYNC_RESET_HOUR = 0;
const MOBILE_SYNC_RESET_MINUTE = 0;
const MOBILE_CHECKPOINT_VERSION = 'mobile-pos.v1';

const MOBILE_SETTINGS_KEYS = [
    'ops_workflow_mode',
    'pos_business_name',
    'pos_address',
    'pos_tin_branch',
    'pos_ptu_number',
    'pos_min_number',
    'pos_accreditation_number',
    'pos_software_name',
    'pos_software_version',
    'pos_software_serial_number',
    'pos_receipt_footer_message',
    'pos_discount_profiles',
    'pos_order_method_fees',
    'pos_terminal_registry_mode',
    'pos_terminal_registry',
    'pos_terminal_location_binding_enforced'
];

const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const safeTrimmedText = (value, fallback = '') => {
    const normalized = String(value ?? fallback).trim();
    return normalized || fallback;
};

const safeObject = (value) => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const buildCheckpointToken = (seed) => crypto
    .createHash('sha256')
    .update(JSON.stringify(seed))
    .digest('hex');

const toFailurePayload = (error) => ({
    message: error?.message || 'Validation failed',
    error_code: error?.code || DomainErrorCode.VALIDATION_FAILED,
    status_code: Number.parseInt(error?.statusCode || 422, 10) || 422,
    details: error?.details || null
});

const buildSyncSummary = ({ totalEntries, acceptedEntries, replayedEntries, rejectedEntries, checkpointToken }) => ({
    total_entries: totalEntries,
    accepted_count: acceptedEntries,
    replayed_count: replayedEntries,
    rejected_count: rejectedEntries,
    checkpoint_token: checkpointToken,
    sync_limit_policy: {
        successful_full_syncs_per_day: MOBILE_SYNC_LIMIT_PER_DAY,
        business_day_reset_hour: MOBILE_SYNC_RESET_HOUR,
        business_day_reset_minute: MOBILE_SYNC_RESET_MINUTE
    }
});

const pickSettings = (settings = {}) => MOBILE_SETTINGS_KEYS.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
        acc[key] = settings[key];
    }
    return acc;
}, {});

const normalizeCatalogBootstrapQuery = (query = {}) => ({
    search: safeTrimmedText(query.search, ''),
    limit: Math.min(toPositiveInt(query.limit) || 500, 500),
    location_id: toPositiveInt(query.location_id)
});

const normalizeSettingsBootstrapPayload = (settings = {}) => ({
    settings: pickSettings(settings),
    sync_policy: {
        successful_full_syncs_per_day: MOBILE_SYNC_LIMIT_PER_DAY,
        business_day_reset_hour: MOBILE_SYNC_RESET_HOUR,
        business_day_reset_minute: MOBILE_SYNC_RESET_MINUTE
    }
});

export const buildGetMobilePosCatalogBootstrapUseCase = ({ listPosCatalogUseCase }) => {
    return async ({ query = {}, user }) => {
        try {
            const normalizedQuery = normalizeCatalogBootstrapQuery(query);
            const result = await listPosCatalogUseCase({
                query: normalizedQuery,
                user
            });
            const data = unwrapApplicationResultOrThrow(result);
            return ok({
                generated_at: new Date().toISOString(),
                bootstrap_version: MOBILE_CHECKPOINT_VERSION,
                query: normalizedQuery,
                catalog: Array.isArray(data) ? data : []
            });
        } catch (error) {
            return fail(error instanceof DomainError
                ? error
                : new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    error?.message || 'Failed to build mobile POS catalog bootstrap',
                    { statusCode: error?.statusCode || 422, details: error?.details || null }
                ));
        }
    };
};

export const buildGetMobilePosSettingsBootstrapUseCase = () => {
    return async () => {
        try {
            const settings = unwrapApplicationResultOrThrow(await getAllSettingsUseCase());
            return ok({
                generated_at: new Date().toISOString(),
                bootstrap_version: MOBILE_CHECKPOINT_VERSION,
                ...normalizeSettingsBootstrapPayload(settings)
            });
        } catch (error) {
            return fail(error instanceof DomainError
                ? error
                : new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    error?.message || 'Failed to build mobile POS settings bootstrap',
                    { statusCode: error?.statusCode || 422, details: error?.details || null }
                ));
        }
    };
};

export const buildGetMobilePosDevicePolicyUseCase = ({ posRepository }) => {
    return async () => {
        try {
            const settings = unwrapApplicationResultOrThrow(await getAllSettingsUseCase());
            const terminalPolicy = await posRepository.getTerminalIdentityPolicySettings();
            return ok({
                generated_at: new Date().toISOString(),
                bootstrap_version: MOBILE_CHECKPOINT_VERSION,
                terminal_policy: terminalPolicy,
                sync_policy: {
                    successful_full_syncs_per_day: MOBILE_SYNC_LIMIT_PER_DAY,
                    business_day_reset_hour: MOBILE_SYNC_RESET_HOUR,
                    business_day_reset_minute: MOBILE_SYNC_RESET_MINUTE
                },
                receipt_profile: pickSettings(settings)
            });
        } catch (error) {
            return fail(error instanceof DomainError
                ? error
                : new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    error?.message || 'Failed to build mobile POS device policy',
                    { statusCode: error?.statusCode || 422, details: error?.details || null }
                ));
        }
    };
};

export const buildSyncMobilePosCheckoutsUseCase = ({ checkoutPosUseCase }) => {
    return async ({ payload = {}, user }) => {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        if (entries.length === 0) {
            return ok({
                generated_at: new Date().toISOString(),
                device_id: safeTrimmedText(payload.device_id, null),
                results: [],
                summary: buildSyncSummary({
                    totalEntries: 0,
                    acceptedEntries: 0,
                    replayedEntries: 0,
                    rejectedEntries: 0,
                    checkpointToken: null
                })
            });
        }

        const results = [];
        let acceptedEntries = 0;
        let replayedEntries = 0;
        let rejectedEntries = 0;

        for (const entry of entries) {
            const localTransactionId = safeTrimmedText(entry?.local_transaction_id, null);
            const syncPayload = safeObject(entry?.payload);
            const checkoutResult = await checkoutPosUseCase({
                payload: syncPayload,
                userId: user?.user_id,
                user
            });

            if (checkoutResult.success) {
                const resultData = checkoutResult.data || {};
                const replayed = resultData.idempotent_replay === true;
                if (replayed) {
                    replayedEntries += 1;
                } else {
                    acceptedEntries += 1;
                }
                results.push({
                    local_transaction_id: localTransactionId,
                    status: replayed ? 'replayed' : 'accepted',
                    server_transaction_id: resultData?.transaction?.pos_transaction_id || null,
                    receipt_contract: {
                        document_type: resultData?.transaction?.document_type || null,
                        document_context: resultData?.transaction?.document_context || null
                    },
                    replay_outcome: resultData?.replay_outcome || (replayed ? 'idempotent_replay' : 'processed')
                });
                continue;
            }

            rejectedEntries += 1;
            results.push({
                local_transaction_id: localTransactionId,
                status: 'rejected',
                error: toFailurePayload(checkoutResult.error)
            });
        }

        const checkpointToken = acceptedEntries + replayedEntries > 0
            ? buildCheckpointToken({
                version: MOBILE_CHECKPOINT_VERSION,
                deviceId: safeTrimmedText(payload.device_id, ''),
                clientSyncRunId: safeTrimmedText(payload.client_sync_run_id, ''),
                totalEntries: entries.length,
                acceptedEntries,
                replayedEntries,
                generatedAt: new Date().toISOString()
            })
            : null;

        return ok({
            generated_at: new Date().toISOString(),
            device_id: safeTrimmedText(payload.device_id, null),
            client_sync_run_id: safeTrimmedText(payload.client_sync_run_id, null),
            results,
            summary: buildSyncSummary({
                totalEntries: entries.length,
                acceptedEntries,
                replayedEntries,
                rejectedEntries,
                checkpointToken
            })
        });
    };
};

export const buildSyncMobilePosShiftsUseCase = ({
    openTerminalShiftUseCase,
    switchTerminalShiftLocationUseCase,
    recordCashDrawerEventUseCase,
    closeTerminalShiftUseCase
}) => {
    return async ({ payload = {}, user }) => {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        if (entries.length === 0) {
            return ok({
                generated_at: new Date().toISOString(),
                device_id: safeTrimmedText(payload.device_id, null),
                results: [],
                summary: buildSyncSummary({
                    totalEntries: 0,
                    acceptedEntries: 0,
                    replayedEntries: 0,
                    rejectedEntries: 0,
                    checkpointToken: null
                })
            });
        }

        const results = [];
        let acceptedEntries = 0;
        let replayedEntries = 0;
        let rejectedEntries = 0;

        for (const entry of entries) {
            const operationType = safeTrimmedText(entry?.operation_type, '');
            const localOperationId = safeTrimmedText(entry?.local_operation_id, null);
            const operationPayload = safeObject(entry?.payload);
            const shiftId = toPositiveInt(entry?.shift_id);

            let result;
            if (operationType === 'shift_open') {
                result = await openTerminalShiftUseCase({ payload: operationPayload, user });
            } else if (operationType === 'switch_location') {
                result = await switchTerminalShiftLocationUseCase({ shiftId, payload: operationPayload, user });
            } else if (operationType === 'cash_event') {
                result = await recordCashDrawerEventUseCase({ shiftId, payload: operationPayload, user });
            } else if (operationType === 'shift_close') {
                result = await closeTerminalShiftUseCase({ shiftId, payload: operationPayload, user });
            } else {
                result = fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Unsupported shift sync operation: ${operationType || 'unknown'}`,
                    { statusCode: 422 }
                ));
            }

            if (result.success) {
                const replayed = result.data?.idempotent_replay === true;
                if (replayed) {
                    replayedEntries += 1;
                } else {
                    acceptedEntries += 1;
                }
                results.push({
                    local_operation_id: localOperationId,
                    operation_type: operationType,
                    status: replayed ? 'replayed' : 'accepted',
                    replay_outcome: result.data?.replay_outcome || (replayed ? 'idempotent_replay' : 'processed'),
                    data: result.data
                });
                continue;
            }

            rejectedEntries += 1;
            results.push({
                local_operation_id: localOperationId,
                operation_type: operationType,
                status: 'rejected',
                error: toFailurePayload(result.error)
            });
        }

        const checkpointToken = acceptedEntries + replayedEntries > 0
            ? buildCheckpointToken({
                version: MOBILE_CHECKPOINT_VERSION,
                scope: 'shifts',
                deviceId: safeTrimmedText(payload.device_id, ''),
                clientSyncRunId: safeTrimmedText(payload.client_sync_run_id, ''),
                totalEntries: entries.length,
                acceptedEntries,
                replayedEntries,
                generatedAt: new Date().toISOString()
            })
            : null;

        return ok({
            generated_at: new Date().toISOString(),
            device_id: safeTrimmedText(payload.device_id, null),
            client_sync_run_id: safeTrimmedText(payload.client_sync_run_id, null),
            results,
            summary: buildSyncSummary({
                totalEntries: entries.length,
                acceptedEntries,
                replayedEntries,
                rejectedEntries,
                checkpointToken
            })
        });
    };
};

export const buildSyncMobilePosHardwareEventsUseCase = () => {
    return async ({ payload = {} }) => {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        const checkpointToken = entries.length > 0
            ? buildCheckpointToken({
                version: MOBILE_CHECKPOINT_VERSION,
                scope: 'hardware-events',
                deviceId: safeTrimmedText(payload.device_id, ''),
                clientSyncRunId: safeTrimmedText(payload.client_sync_run_id, ''),
                totalEntries: entries.length,
                generatedAt: new Date().toISOString()
            })
            : null;

        return ok({
            generated_at: new Date().toISOString(),
            device_id: safeTrimmedText(payload.device_id, null),
            client_sync_run_id: safeTrimmedText(payload.client_sync_run_id, null),
            results: entries.map((entry) => ({
                local_event_id: safeTrimmedText(entry?.local_event_id, null),
                status: 'accepted'
            })),
            summary: buildSyncSummary({
                totalEntries: entries.length,
                acceptedEntries: entries.length,
                replayedEntries: 0,
                rejectedEntries: 0,
                checkpointToken
            })
        });
    };
};

export const buildAcknowledgeMobilePosCheckpointUseCase = () => {
    return async ({ payload = {} }) => {
        const checkpointToken = safeTrimmedText(payload.checkpoint_token, '');
        if (!checkpointToken) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'checkpoint_token is required',
                { statusCode: 422 }
            ));
        }

        return ok({
            acknowledged: true,
            checkpoint_token: checkpointToken,
            acknowledged_at: new Date().toISOString(),
            sync_limit_policy: {
                successful_full_syncs_per_day: MOBILE_SYNC_LIMIT_PER_DAY,
                business_day_reset_hour: MOBILE_SYNC_RESET_HOUR,
                business_day_reset_minute: MOBILE_SYNC_RESET_MINUTE
            }
        });
    };
};
