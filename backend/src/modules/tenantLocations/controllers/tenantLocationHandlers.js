import {
    listTenantLocationsUseCase,
    createTenantLocationUseCase,
    updateTenantLocationUseCase,
    deactivateTenantLocationUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import {
    getStorefrontDiscoveryIndexSnapshotForTenant
} from '../../../services/storefrontDiscoveryIndexService.js';
import { syncStorefrontDiscoveryWithReliability } from '../../../services/storefrontDiscoverySyncReliabilityService.js';
import { getStorefrontSyncHealth } from '../../../services/storefrontSyncHealthState.js';
import logger from '../../../config/logger.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

export const listTenantLocations = async (req, res, next) => {
    try {
        const includeInactive = String(req.validatedQuery?.include_inactive ?? 'true').toLowerCase() !== 'false';
        const result = await listTenantLocationsUseCase({ includeInactive });
        let discoverySnapshot = null;
        let syncHealthSnapshot = null;
        if (result?.success && req.tenant?.id) {
            try {
                discoverySnapshot = await getStorefrontDiscoveryIndexSnapshotForTenant({ tenantId: req.tenant.id });
                syncHealthSnapshot = getStorefrontSyncHealth({ tenantId: req.tenant.id });
            } catch (error) {
                logger.warn('[TenantLocationHandlers] Failed to read discovery sync snapshot', {
                    tenantId: req.tenant?.id || null,
                    error: error?.message || 'unknown_error'
                });
            }
        }

        const dataWithHealth = Array.isArray(result?.data)
            ? result.data.map((location) => ({
                ...location,
                storefront_last_synced_at: (
                    discoverySnapshot?.location_id
                    && Number(location?.location_id) === Number(discoverySnapshot.location_id)
                )
                    ? discoverySnapshot.last_synced_at
                    : null
            }))
            : result?.data;

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: dataWithHealth,
                meta: {
                    storefront_sync: discoverySnapshot,
                    storefront_sync_health: syncHealthSnapshot
                },
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const createTenantLocation = async (req, res, next) => {
    try {
        const result = await createTenantLocationUseCase({
            payload: req.validatedData || req.body
        });
        if (result?.success && req.tenant?.id) {
            syncStorefrontDiscoveryWithReliability({
                tenantId: req.tenant.id,
                source: 'tenant_locations_create',
                requestId: requestId(req, res)
            }).then((syncResult) => {
                if (syncResult?.ok) return;
                logger.warn('[TenantLocationHandlers] Discovery index remained degraded after create retries', {
                    tenantId: req.tenant?.id || null,
                    requestId: requestId(req, res),
                    attempts: syncResult?.attempts || 0,
                    errors: syncResult?.errors || []
                });
            }).catch((error) => {
                logger.warn('[TenantLocationHandlers] Discovery reliability runner failed after create', {
                    tenantId: req.tenant?.id || null,
                    requestId: requestId(req, res),
                    error: error?.message || 'unknown_error'
                });
            });
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Tenant location created successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateTenantLocation = async (req, res, next) => {
    try {
        const result = await updateTenantLocationUseCase({
            locationId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body
        });
        if (result?.success && req.tenant?.id) {
            syncStorefrontDiscoveryWithReliability({
                tenantId: req.tenant.id,
                source: 'tenant_locations_update',
                requestId: requestId(req, res)
            }).then((syncResult) => {
                if (syncResult?.ok) return;
                logger.warn('[TenantLocationHandlers] Discovery index remained degraded after update retries', {
                    tenantId: req.tenant?.id || null,
                    locationId: req.validatedParams?.id || req.params.id,
                    requestId: requestId(req, res),
                    attempts: syncResult?.attempts || 0,
                    errors: syncResult?.errors || []
                });
            }).catch((error) => {
                logger.warn('[TenantLocationHandlers] Discovery reliability runner failed after update', {
                    tenantId: req.tenant?.id || null,
                    locationId: req.validatedParams?.id || req.params.id,
                    requestId: requestId(req, res),
                    error: error?.message || 'unknown_error'
                });
            });
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Tenant location updated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const deactivateTenantLocation = async (req, res, next) => {
    try {
        const result = await deactivateTenantLocationUseCase({
            locationId: req.validatedParams?.id || req.params.id
        });
        if (result?.success && req.tenant?.id) {
            syncStorefrontDiscoveryWithReliability({
                tenantId: req.tenant.id,
                source: 'tenant_locations_deactivate',
                requestId: requestId(req, res)
            }).then((syncResult) => {
                if (syncResult?.ok) return;
                logger.warn('[TenantLocationHandlers] Discovery index remained degraded after deactivate retries', {
                    tenantId: req.tenant?.id || null,
                    locationId: req.validatedParams?.id || req.params.id,
                    requestId: requestId(req, res),
                    attempts: syncResult?.attempts || 0,
                    errors: syncResult?.errors || []
                });
            }).catch((error) => {
                logger.warn('[TenantLocationHandlers] Discovery reliability runner failed after deactivate', {
                    tenantId: req.tenant?.id || null,
                    locationId: req.validatedParams?.id || req.params.id,
                    requestId: requestId(req, res),
                    error: error?.message || 'unknown_error'
                });
            });
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Tenant location deactivated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export default {
    listTenantLocations,
    createTenantLocation,
    updateTenantLocation,
    deactivateTenantLocation
};
