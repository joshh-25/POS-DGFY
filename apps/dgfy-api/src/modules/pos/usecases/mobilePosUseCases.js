import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import dbStore from '../../../utils/dbStore.js';

// Exported so middleware/rateLimiter.js can enforce the same number it
// advertises to clients in sync_policy/sync_limit_policy - see
// mobilePosFreeSyncLimiter.
export const MOBILE_SYNC_LIMIT_PER_DAY = 2;
const MOBILE_SYNC_RESET_HOUR = 0;
const MOBILE_SYNC_RESET_MINUTE = 0;
const MOBILE_CHECKPOINT_VERSION = 'mobile-pos.v1';
const MOBILE_TRANSACTION_CHECKPOINT_VERSION = 'mobile-pos.transactions.v1';
const MOBILE_STATUTORY_POLICY_TTL_MS = 24 * 60 * 60 * 1000;

const MOBILE_SETTINGS_KEYS = [
    'ops_workflow_mode',
    'store_tenant_slug',
    'pos_registered_name',
    'pos_business_name',
    'pos_business_style',
    'pos_taxpayer_type',
    'pos_address',
    'pos_tin_branch',
    'pos_ptu_number',
    'pos_min_number',
    'pos_accreditation_number',
    'pos_software_name',
    'pos_software_version',
    'pos_software_serial_number',
    'pos_receipt_footer_message',
    'storefront_profile_image_url',
    'pos_petty_cash_symbol',
    'pos_petty_cash_amount',
    'pos_discount_profiles',
    'pos_order_method_fees',
    'pos_terminal_registry_mode',
    'pos_terminal_registry',
    'pos_terminal_location_binding_enforced',
    'pos_hardware_profile'
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

const mobilePolicySigningSecret = () => String(
    process.env.MOBILE_POS_POLICY_SIGNING_SECRET || process.env.JWT_SECRET || ''
).trim();

const signStatutoryPolicy = ({ version, expiresAt }) => {
    const secret = mobilePolicySigningSecret();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(`${version}:${expiresAt}`).digest('hex');
};

const buildStatutoryPolicySnapshot = async (posRepository, now = new Date()) => {
    const rows = await Promise.all(['senior', 'pwd'].map((type) => posRepository.findActiveDiscountRuleByType(type)));
    const rules = rows.filter(Boolean).map((row) => ({
        id: toPositiveInt(row.id),
        type: String(row.type || '').trim().toLowerCase(),
        method: String(row.method || '').trim().toLowerCase(),
        rate: row.rate == null ? null : Number(row.rate),
        fixed_amount: row.fixed_amount == null ? null : Number(row.fixed_amount),
        is_vat_exempt: row.is_vat_exempt === true,
        requires_customer_id: row.requires_customer_id === true,
        max_discount_amount: row.max_discount_amount == null ? null : Number(row.max_discount_amount),
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '') || null
    }));
    if (rules.length === 0) return null;
    const generatedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + MOBILE_STATUTORY_POLICY_TTL_MS).toISOString();
    const version = buildCheckpointToken({ contract: 'mobile-pos.statutory-policy.v1', rules });
    const signature = signStatutoryPolicy({ version, expiresAt });
    if (!signature) return null;
    return { version, generated_at: generatedAt, expires_at: expiresAt, signature, rules };
};

const verifyStatutoryPolicyEvidence = async ({ evidence, posRepository, now = new Date() }) => {
    const version = safeTrimmedText(evidence?.version, '');
    const expiresAt = safeTrimmedText(evidence?.expires_at, '');
    const signature = safeTrimmedText(evidence?.signature, '');
    const expiresMs = Date.parse(expiresAt);
    const expectedSignature = signStatutoryPolicy({ version, expiresAt });
    const signatureValid = Boolean(expectedSignature && signature)
        && expectedSignature.length === signature.length
        && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    const current = await buildStatutoryPolicySnapshot(posRepository, now);
    if (!version || !Number.isFinite(expiresMs) || expiresMs <= now.getTime() || !signatureValid || current?.version !== version) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'The offline statutory discount policy is missing, expired, or no longer current',
            { statusCode: 409, details: { reason_code: 'MOBILE_STATUTORY_POLICY_STALE' } }
        );
    }
    return { version, expiresAt, verifiedAt: now.toISOString() };
};

const encodeTransactionCursor = (row) => Buffer.from(JSON.stringify({
    updated_at: row?.updated_at instanceof Date ? row.updated_at.toISOString() : String(row?.updated_at || ''),
    id: toPositiveInt(row?.pos_transaction_id)
})).toString('base64url');

const decodeTransactionCursor = (cursor) => {
    const normalized = safeTrimmedText(cursor, '');
    if (!normalized) return null;
    try {
        const parsed = JSON.parse(Buffer.from(normalized, 'base64url').toString('utf8'));
        const updatedAt = String(parsed?.updated_at || '').trim();
        const id = toPositiveInt(parsed?.id);
        if (!updatedAt || Number.isNaN(Date.parse(updatedAt)) || !id) throw new Error('invalid');
        return { updatedAt, id };
    } catch {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'cursor is invalid', { statusCode: 422 });
    }
};

const toFailurePayload = (error) => ({
    message: error?.message || 'Validation failed',
    error_code: error?.code || DomainErrorCode.VALIDATION_FAILED,
    status_code: Number.parseInt(error?.statusCode || 422, 10) || 422,
    details: error?.details || null
});

const buildSyncSummary = ({ totalEntries, acceptedEntries, replayedEntries, rejectedEntries, checkpointToken, includeLimitPolicy = true }) => ({
    total_entries: totalEntries,
    accepted_count: acceptedEntries,
    replayed_count: replayedEntries,
    rejected_count: rejectedEntries,
    checkpoint_token: checkpointToken,
    // Item sync isn't behind mobilePosFreeSyncLimiter (see
    // buildSyncMobilePosItemsUseCase), so it has no daily cap to advertise -
    // don't imply one exists for a route that doesn't enforce it.
    ...(includeLimitPolicy ? {
        sync_limit_policy: {
            successful_full_syncs_per_day: MOBILE_SYNC_LIMIT_PER_DAY,
            business_day_reset_hour: MOBILE_SYNC_RESET_HOUR,
            business_day_reset_minute: MOBILE_SYNC_RESET_MINUTE
        }
    } : {})
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

const POS_TERMINAL_REGISTRY_KEY = 'pos_terminal_registry';

const parsePositiveLocationId = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const shouldScopeTerminalRegistryToUser = (user = null) => (
    Boolean(user)
    && user?.is_master_admin !== true
    && !hasEffectivePermission(user, PERMISSIONS.POS.actions.SWITCH_LOCATION_POS)
);

export const filterPosTerminalRegistryByLocationIds = (settings = {}, allowedLocationIds = []) => {
    const registrySetting = settings?.[POS_TERMINAL_REGISTRY_KEY];
    if (!registrySetting || !Array.isArray(registrySetting.value)) {
        return settings;
    }

    const allowedLocations = new Set(
        (Array.isArray(allowedLocationIds) ? allowedLocationIds : [])
            .map(parsePositiveLocationId)
            .filter(Boolean)
    );

    return {
        ...settings,
        [POS_TERMINAL_REGISTRY_KEY]: {
            ...registrySetting,
            value: registrySetting.value.filter((entry) => {
                const locationId = parsePositiveLocationId(entry?.location_id);
                return locationId !== null && allowedLocations.has(locationId);
            })
        }
    };
};

const getGrantedLocationIdsForUser = async (user = null) => {
    const userId = parsePositiveLocationId(user?.user_id || user?.id);
    const UserLocationGrant = dbStore.get('UserLocationGrant');
    if (!userId || !UserLocationGrant) return [];

    const grants = await UserLocationGrant.findAll({
        where: { user_id: userId },
        attributes: ['location_id']
    });
    return grants
        .map((grant) => parsePositiveLocationId(grant?.location_id))
        .filter(Boolean);
};

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
    return async ({ user = null } = {}) => {
        try {
            let settings = unwrapApplicationResultOrThrow(await getAllSettingsUseCase());
            if (shouldScopeTerminalRegistryToUser(user)) {
                const grantedLocationIds = await getGrantedLocationIdsForUser(user);
                settings = filterPosTerminalRegistryByLocationIds(settings, grantedLocationIds);
            }
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
            const statutoryDiscountPolicy = await buildStatutoryPolicySnapshot(posRepository);
            return ok({
                generated_at: new Date().toISOString(),
                bootstrap_version: MOBILE_CHECKPOINT_VERSION,
                terminal_policy: terminalPolicy,
                sync_policy: {
                    successful_full_syncs_per_day: MOBILE_SYNC_LIMIT_PER_DAY,
                    business_day_reset_hour: MOBILE_SYNC_RESET_HOUR,
                    business_day_reset_minute: MOBILE_SYNC_RESET_MINUTE
                },
                receipt_profile: pickSettings(settings),
                statutory_discount_policy: statutoryDiscountPolicy
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

export const buildSyncMobilePosCheckoutsUseCase = ({ checkoutPosUseCase, posRepository }) => {
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
            if (String(syncPayload.payment_type || '').trim().toLowerCase() === 'employee_credit') {
                rejectedEntries += 1;
                results.push({
                    local_transaction_id: localTransactionId,
                    status: 'rejected',
                    error: toFailurePayload(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Employee Credit is available only during an online POS checkout',
                        {
                            statusCode: 422,
                            details: { reason_code: 'EMPLOYEE_CREDIT_ONLINE_ONLY' }
                        }
                    ))
                });
                continue;
            }
            const discountType = String(syncPayload?.governed_discount?.type || '').trim().toLowerCase();
            let trustedOfflineStatutoryPolicy = null;
            if (discountType === 'senior' || discountType === 'pwd') {
                try {
                    const verified = await verifyStatutoryPolicyEvidence({ evidence: syncPayload.offline_statutory_policy, posRepository });
                    trustedOfflineStatutoryPolicy = { ...verified, discountType };
                } catch (error) {
                    rejectedEntries += 1;
                    results.push({ local_transaction_id: localTransactionId, status: 'rejected', error: toFailurePayload(error) });
                    continue;
                }
            }
            const checkoutResult = await checkoutPosUseCase({
                payload: syncPayload,
                userId: user?.user_id,
                user,
                trustedOfflineStatutoryPolicy
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
                    server_version: resultData?.transaction?.updated_at || null,
                    invoice_number: resultData?.transaction?.invoice_number || null,
                    payment_status: resultData?.transaction?.payment_status || null,
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

export const buildGetMobilePosTransactionCheckpointUseCase = ({ listPosTransactionsUseCase }) => {
    return async ({ query = {}, user }) => {
        try {
            const cursor = decodeTransactionCursor(query.cursor);
            const limit = Math.min(toPositiveInt(query.limit) || 100, 200);
            const result = await listPosTransactionsUseCase({
                query: {
                    page: 1,
                    limit: limit + 1,
                    location_id: toPositiveInt(query.location_id),
                    mobile_checkpoint: true,
                    updated_after: cursor?.updatedAt || null,
                    updated_after_id: cursor?.id || null
                },
                user
            });
            const data = unwrapApplicationResultOrThrow(result);
            const allRows = Array.isArray(data?.transactions) ? data.transactions : [];
            const transactions = allRows.slice(0, limit);
            const hasMore = allRows.length > limit;
            const last = transactions.at(-1);
            return ok({
                generated_at: new Date().toISOString(),
                checkpoint_version: MOBILE_TRANSACTION_CHECKPOINT_VERSION,
                transactions,
                next_cursor: last ? encodeTransactionCursor(last) : (String(query.cursor || '').trim() || null),
                has_more: hasMore
            });
        } catch (error) {
            return fail(error instanceof DomainError ? error : new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                error?.message || 'Failed to load mobile POS transaction checkpoint',
                { statusCode: error?.statusCode || 422, details: error?.details || null }
            ));
        }
    };
};

export const buildSyncMobilePosVoidsUseCase = ({ voidPosTransactionUseCase }) => {
    return async ({ payload = {}, user }) => {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        const results = [];
        let acceptedEntries = 0;
        let replayedEntries = 0;
        let rejectedEntries = 0;
        for (const entry of entries) {
            const localTransactionId = safeTrimmedText(entry?.local_transaction_id, null);
            const request = safeObject(entry?.payload);
            const transactionId = toPositiveInt(request.transaction_id);
            if (!transactionId) {
                rejectedEntries += 1;
                results.push({ local_transaction_id: localTransactionId, status: 'rejected', error: toFailurePayload({ message: 'transaction_id is required', statusCode: 422 }) });
                continue;
            }
            const result = await voidPosTransactionUseCase({
                posTransactionId: transactionId,
                payload: request,
                user,
                trustedMobileReplay: true
            });
            if (result.success) {
                const replayed = result.data?.idempotent_replay === true;
                if (replayed) replayedEntries += 1; else acceptedEntries += 1;
                results.push({
                    local_transaction_id: localTransactionId,
                    status: replayed ? 'replayed' : 'accepted',
                    server_transaction_id: transactionId,
                    server_version: result.data?.transaction?.updated_at || null,
                    transaction: result.data?.transaction || null
                });
            } else {
                rejectedEntries += 1;
                results.push({ local_transaction_id: localTransactionId, status: 'rejected', error: toFailurePayload(result.error) });
            }
        }
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
                checkpointToken: acceptedEntries + replayedEntries > 0 ? buildCheckpointToken({ scope: 'voids', device_id: payload.device_id, run: payload.client_sync_run_id, acceptedEntries, replayedEntries }) : null
            })
        });
    };
};

// Item sync has no plan-tier gating (unlike checkout/shift/hardware sync,
// which share mobilePosFreeSyncLimiter's 2/day free-tier budget) - item/
// catalog CRUD has never been plan-gated anywhere else in the app, and
// folding it into that shared budget would make catalog management
// unusable for free-tier tenants. See routes/mobilePos.js.
export const buildSyncMobilePosItemsUseCase = ({ createItemUseCase, updateItemUseCase, deleteItemUseCase, itemRepository }) => {
    const resolveCanManageCategories = (user) => {
        return hasEffectivePermission(user, PERMISSIONS.SYSTEM.actions.MANAGE_CATEGORIES);
    };

    const hasPermission = hasEffectivePermission;

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
                    checkpointToken: null,
                    includeLimitPolicy: false
                })
            });
        }

        const results = [];
        let acceptedEntries = 0;
        let replayedEntries = 0;
        let rejectedEntries = 0;

        for (const entry of entries) {
            // local_transaction_id/payload is the generic entry shape shared
            // with checkout sync (mobile's LiveSyncTransport hardcodes this
            // envelope for every entity) - op lives inside payload rather
            // than as a sibling field because the transport forwards
            // whatever the repository builds as `payload` verbatim, with no
            // per-entity control over the entry envelope itself.
            const localTransactionId = safeTrimmedText(entry?.local_transaction_id, null);
            const entryPayload = safeObject(entry?.payload);
            const op = safeTrimmedText(entryPayload.op, '');
            const itemData = { ...entryPayload };
            delete itemData.op;

            const requiredPermission = op === 'create'
                ? 'items:create'
                : op === 'update'
                    ? 'items:edit'
                    : op === 'delete'
                        ? 'items:delete'
                        : null;

            if (!requiredPermission) {
                rejectedEntries += 1;
                results.push({
                    local_transaction_id: localTransactionId,
                    status: 'rejected',
                    error: toFailurePayload({ message: `Unsupported item sync operation: ${op || 'unknown'}`, statusCode: 422 })
                });
                continue;
            }

            if (!hasPermission(user, requiredPermission)) {
                rejectedEntries += 1;
                results.push({
                    local_transaction_id: localTransactionId,
                    status: 'rejected',
                    error: toFailurePayload({ message: 'Access denied: insufficient permissions', code: 'AUTHORIZATION_FAILED', statusCode: 403 })
                });
                continue;
            }

            try {
                if (op === 'create') {
                    let item;
                    try {
                        item = await createItemUseCase({
                            itemData,
                            userId: user?.user_id,
                            canManageCategories: resolveCanManageCategories(user)
                        });
                    } catch (error) {
                        // Same SKU conflict on a retried create means the
                        // earlier push already succeeded server-side but the
                        // client never saw the response - treat it as a
                        // replay of the existing item rather than a failure.
                        if (error?.statusCode === 409 && itemData?.sku_code) {
                            const [existing] = await itemRepository.findItemsBySkuCodes([itemData.sku_code]);
                            if (existing) {
                                replayedEntries += 1;
                                results.push({ local_transaction_id: localTransactionId, status: 'replayed', server_item_id: existing.item_id });
                                continue;
                            }
                        }
                        throw error;
                    }
                    acceptedEntries += 1;
                    results.push({ local_transaction_id: localTransactionId, status: 'accepted', server_item_id: item.item_id });
                } else if (op === 'update') {
                    const serverItemId = toPositiveInt(itemData.server_item_id);
                    if (!serverItemId) {
                        throw Object.assign(new Error('server_item_id is required for update'), { statusCode: 422 });
                    }
                    const item = await updateItemUseCase({
                        itemId: serverItemId,
                        itemData,
                        userId: user?.user_id,
                        canManageCategories: resolveCanManageCategories(user)
                    });
                    acceptedEntries += 1;
                    results.push({ local_transaction_id: localTransactionId, status: 'accepted', server_item_id: item.item_id });
                } else {
                    const serverItemId = toPositiveInt(itemData.server_item_id);
                    if (!serverItemId) {
                        throw Object.assign(new Error('server_item_id is required for delete'), { statusCode: 422 });
                    }
                    try {
                        await deleteItemUseCase({ itemId: serverItemId, userId: user?.user_id });
                        acceptedEntries += 1;
                        results.push({ local_transaction_id: localTransactionId, status: 'accepted', server_item_id: serverItemId });
                    } catch (error) {
                        // Already deleted (e.g. by an earlier attempt whose
                        // response was lost) - the desired end state is
                        // already achieved, so treat as a replay.
                        if (error?.statusCode === 404) {
                            replayedEntries += 1;
                            results.push({ local_transaction_id: localTransactionId, status: 'replayed', server_item_id: serverItemId });
                            continue;
                        }
                        throw error;
                    }
                }
            } catch (error) {
                rejectedEntries += 1;
                results.push({
                    local_transaction_id: localTransactionId,
                    status: 'rejected',
                    error: toFailurePayload(error)
                });
            }
        }

        // No checkpoint_token / ack step here (unlike checkout/shift sync) -
        // items aren't a financial reconciliation flow, so there's nothing
        // that needs a client to acknowledge receipt of the sync result.
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
                checkpointToken: null,
                includeLimitPolicy: false
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
