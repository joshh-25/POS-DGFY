import logger from '../config/logger.js';
import {
    reconcileStorefrontDiscoveryIndex,
    syncStorefrontDiscoveryIndexForTenant
} from './storefrontDiscoveryIndexService.js';
import { clearStorefrontTenantResolverCache } from './storefrontTenantResolver.js';
import { clearStorefrontDiscoveryRepositoryCache } from '../modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js';
import { recordStorefrontSyncHealth } from './storefrontSyncHealthState.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryDelays = () => {
    const raw = String(process.env.STOREFRONT_DISCOVERY_SYNC_RETRY_DELAYS_MS || '0,250,800');
    const parsed = raw
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0);
    return parsed.length > 0 ? parsed : [0, 250, 800];
};

const shouldTreatAsSuccess = (result = null) => {
    const status = String(result?.status || '').toLowerCase();
    return ['upserted', 'removed', 'skipped'].includes(status);
};

const logSyncEvent = ({ level = 'info', message, payload = {} }) => {
    const logMethod = typeof logger[level] === 'function' ? logger[level] : logger.info;
    logMethod(message, payload);
};

export const syncStorefrontDiscoveryWithReliability = async ({
    tenantId,
    source = 'unknown_source',
    requestId = null
} = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) {
        const outcome = {
            ok: false,
            source,
            attempts: 0,
            reconciled: false,
            result: null,
            reason: 'missing_tenant_id'
        };
        recordStorefrontSyncHealth({
            tenantId: normalizedTenantId,
            ok: false,
            source,
            attempts: 0,
            reconciled: false,
            errors: ['missing_tenant_id'],
            result: null
        });
        return outcome;
    }

    const retryDelays = parseRetryDelays();
    const errors = [];
    let attempt = 0;

    for (let index = 0; index < retryDelays.length; index += 1) {
        attempt = index + 1;
        const delay = retryDelays[index];

        if (delay > 0) {
            await sleep(delay);
        }

        try {
            const result = await syncStorefrontDiscoveryIndexForTenant({ tenantId: normalizedTenantId });
            if (shouldTreatAsSuccess(result)) {
                clearStorefrontTenantResolverCache();
                clearStorefrontDiscoveryRepositoryCache();
                logSyncEvent({
                    message: '[StorefrontDiscoverySync] Tenant sync completed',
                    payload: {
                        event_type: 'storefront_sync_success',
                        metric_name: 'storefront_sync_success_count',
                        metric_value: 1,
                        tenantId: normalizedTenantId,
                        source,
                        requestId,
                        attempt,
                        status: result?.status || null,
                        slug: result?.slug || null
                    }
                });
                const outcome = {
                    ok: true,
                    source,
                    attempts: attempt,
                    reconciled: false,
                    result
                };
                recordStorefrontSyncHealth({
                    tenantId: normalizedTenantId,
                    ok: true,
                    source,
                    attempts: attempt,
                    reconciled: false,
                    errors: [],
                    result
                });
                return outcome;
            }

            const status = String(result?.status || 'unknown');
            errors.push(`attempt_${attempt}:${status}`);
            logSyncEvent({
                level: 'warn',
                message: '[StorefrontDiscoverySync] Tenant sync returned non-success status',
                payload: {
                    event_type: 'storefront_sync_non_success_status',
                    metric_name: 'storefront_sync_failure_count',
                    metric_value: 1,
                    tenantId: normalizedTenantId,
                    source,
                    requestId,
                    attempt,
                    status
                }
            });
        } catch (error) {
            const errorMessage = error?.message || 'unknown_error';
            errors.push(`attempt_${attempt}:${errorMessage}`);
            logSyncEvent({
                level: 'warn',
                message: '[StorefrontDiscoverySync] Tenant sync attempt failed',
                payload: {
                    event_type: 'storefront_sync_attempt_failed',
                    metric_name: 'storefront_sync_failure_count',
                    metric_value: 1,
                    tenantId: normalizedTenantId,
                    source,
                    requestId,
                    attempt,
                    error: errorMessage
                }
            });
        }
    }

    try {
        const reconcileResult = await reconcileStorefrontDiscoveryIndex({
            tenantIds: [normalizedTenantId],
            pruneStale: false,
            concurrency: 1
        });

        const reconciled = Number(reconcileResult?.failed || 0) === 0;
        if (reconciled) {
            clearStorefrontTenantResolverCache();
            clearStorefrontDiscoveryRepositoryCache();
        }

        logSyncEvent({
            level: reconciled ? 'info' : 'warn',
            message: reconciled
                ? '[StorefrontDiscoverySync] Fallback reconcile recovered tenant sync'
                : '[StorefrontDiscoverySync] Fallback reconcile failed to recover tenant sync',
            payload: {
                event_type: reconciled
                    ? 'storefront_sync_recovered_by_reconcile'
                    : 'storefront_sync_reconcile_failed',
                metric_name: reconciled
                    ? 'storefront_sync_recovered_count'
                    : 'storefront_sync_failure_count',
                metric_value: 1,
                tenantId: normalizedTenantId,
                source,
                requestId,
                attempts: attempt,
                errors,
                reconcile: reconcileResult
            }
        });

        const outcome = {
            ok: reconciled,
            source,
            attempts: attempt,
            reconciled: true,
            result: reconcileResult,
            errors
        };
        recordStorefrontSyncHealth({
            tenantId: normalizedTenantId,
            ok: reconciled,
            source,
            attempts: attempt,
            reconciled: true,
            errors,
            result: reconcileResult
        });
        return outcome;
    } catch (reconcileError) {
        const reconcileErrorMessage = reconcileError?.message || 'unknown_error';
        logSyncEvent({
            level: 'error',
            message: '[StorefrontDiscoverySync] Fallback reconcile threw an error',
            payload: {
                event_type: 'storefront_sync_reconcile_exception',
                metric_name: 'storefront_sync_failure_count',
                metric_value: 1,
                tenantId: normalizedTenantId,
                source,
                requestId,
                attempts: attempt,
                errors,
                reconcileError: reconcileErrorMessage
            }
        });

        const outcome = {
            ok: false,
            source,
            attempts: attempt,
            reconciled: false,
            result: null,
            errors: [...errors, `reconcile:${reconcileErrorMessage}`]
        };
        recordStorefrontSyncHealth({
            tenantId: normalizedTenantId,
            ok: false,
            source,
            attempts: attempt,
            reconciled: false,
            errors: outcome.errors,
            result: null
        });
        return outcome;
    }
};
