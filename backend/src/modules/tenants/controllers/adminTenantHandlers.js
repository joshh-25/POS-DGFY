import { v4 as uuidv4 } from 'uuid';
import {
    registerCompanyRequestUseCase,
    listTenantsUseCase,
    approveTenantUseCase,
    rejectTenantUseCase,
    provisionNewTenantUseCase,
    getPricingSettingsUseCase,
    updatePricingSettingsUseCase,
    updateTenantUseCase,
    deleteTenantUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

/**
 * PUBLIC: Register a new company (creates a "pending" request)
 * No authentication required
 */
export const registerCompanyRequest = async (req, res) => {
    const correlationId = req.requestId || req.headers['x-request-id'] || uuidv4();
    const result = await registerCompanyRequestUseCase({
        body: req.body,
        correlationId
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Registration failed'
    });
};

/**
 * ADMIN: List all tenants with optional status filter
 */
export const listTenants = async (req, res) => {
    const result = await listTenantsUseCase({
        status: req.query?.status
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_tenants_viewed',
        surface: 'admin_tenants',
        action: 'list_tenants',
        result,
        successMetadataResolver: (data) => ({
            tenant_count: Array.isArray(data) ? data.length : 0,
            status_filter: req.query?.status || null
        })
    });
    return sendUseCaseResult(res, result);
};

/**
 * ADMIN: Approve a pending tenant request
 * This triggers the actual database creation
 */
export const approveTenant = async (req, res) => {
    const result = await approveTenantUseCase({
        id: req.params?.id
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_tenant_approved',
        surface: 'admin_tenants',
        action: 'approve_tenant',
        result,
        successMetadataResolver: () => ({
            tenant_id: req.params?.id || null
        })
    });
    return sendUseCaseResult(res, result);
};

/**
 * ADMIN: Reject a pending tenant request
 */
export const rejectTenant = async (req, res) => {
    const result = await rejectTenantUseCase({
        id: req.params?.id,
        reason: req.body?.reason
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_tenant_rejected',
        surface: 'admin_tenants',
        action: 'reject_tenant',
        result,
        successMetadataResolver: () => ({
            tenant_id: req.params?.id || null
        })
    });
    return sendUseCaseResult(res, result);
};

/**
 * Legacy: Direct provisioning (kept for backward compatibility)
 * Requires admin auth
 */
export const provisionNewTenant = async (req, res) => {
    const result = await provisionNewTenantUseCase({
        body: req.body
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_tenant_provisioned',
        surface: 'admin_tenants',
        action: 'provision_tenant',
        result
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Provisioning failed'
    });
};

/**
 * ADMIN: Get pricing settings from system_settings
 */
export const getPricingSettings = async (req, res) => {
    const result = await getPricingSettingsUseCase();
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_pricing_settings_viewed',
        surface: 'admin_tenants',
        action: 'view_pricing_settings',
        result
    });
    return sendUseCaseResult(res, result);
};

/**
 * ADMIN: Update pricing settings
 */
export const updatePricingSettings = async (req, res) => {
    const result = await updatePricingSettingsUseCase({
        body: req.body
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_pricing_settings_updated',
        surface: 'admin_tenants',
        action: 'update_pricing_settings',
        result,
        successMetadataResolver: () => ({
            key_count: req.body ? Object.keys(req.body).length : 0
        })
    });
    return sendUseCaseResult(res, result);
};

/**
 * ADMIN: Update tenant details (status, plan)
 */
export const updateTenant = async (req, res) => {
    const result = await updateTenantUseCase({
        id: req.params?.id,
        body: req.body
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_tenant_updated',
        surface: 'admin_tenants',
        action: 'update_tenant',
        result,
        successMetadataResolver: () => ({
            tenant_id: req.params?.id || null
        })
    });
    return sendUseCaseResult(res, result);
};

/**
 * ADMIN: Permanently delete a tenant and their database
 */
export const deleteTenant = async (req, res) => {
    const result = await deleteTenantUseCase({
        id: req.params?.id
    });
    await trackProductUsageFromResult({
        req,
        user: req.user,
        eventType: 'admin_tenant_deleted',
        surface: 'admin_tenants',
        action: 'delete_tenant',
        result,
        successMetadataResolver: () => ({
            tenant_id: req.params?.id || null
        })
    });
    return sendUseCaseResult(res, result);
};

export default {
    registerCompanyRequest,
    listTenants,
    approveTenant,
    rejectTenant,
    provisionNewTenant,
    getPricingSettings,
    updatePricingSettings,
    updateTenant,
    deleteTenant
};
