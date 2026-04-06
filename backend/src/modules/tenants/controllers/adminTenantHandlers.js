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
    deleteTenantUseCase,
    resubmitRegistrationUseCase,
    tenantAdminRepository
} from '../index.js';
import { setupPayPalRecurringUseCase, changePlanUseCase } from '../../payments/index.js';
import * as emailService from '../../../services/emailService.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import { paymentsEnabled, paymentsDisabledMessage } from '../../../config/paymentsFeature.js';

/**
 * PUBLIC: Register a new company (creates a "pending" request)
 * No authentication required
 */
export const registerCompanyRequest = async (req, res) => {
    const requestedPlan = typeof req.body?.plan === 'string' ? req.body.plan.toLowerCase() : 'standard';
    const requestsSubscriptionFlow = requestedPlan === 'premium' || Boolean(req.body?.subscriptionId);

    if (!paymentsEnabled && requestsSubscriptionFlow) {
        return res.status(503).json({
            success: false,
            message: paymentsDisabledMessage,
            code: 'PAYMENTS_DISABLED'
        });
    }

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

/**
 * ADMIN: Initiate admin-driven PayPal setup for a manual tenant
 * Generates an approval link to email the tenant
 */
export const setupPayPalRecurring = async (req, res) => {
    if (!paymentsEnabled) {
        return res.status(503).json({
            success: false,
            message: paymentsDisabledMessage,
            code: 'PAYMENTS_DISABLED'
        });
    }
    const result = await setupPayPalRecurringUseCase({
        tenantId: req.params?.id
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to initiate PayPal setup'
    });
};

/**
 * ADMIN: Change a tenant's plan immediately (admin-override, no PayPal re-consent)
 */
export const adminChangePlan = async (req, res) => {
    if (!paymentsEnabled) {
        return res.status(503).json({
            success: false,
            message: paymentsDisabledMessage,
            code: 'PAYMENTS_DISABLED'
        });
    }
    const result = await changePlanUseCase({
        tenantId: req.params?.id,
        newPlan: req.body?.plan,
        immediate: true
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to change plan'
    });
};

/**
 * ADMIN: Reactivate an inactive tenant
 * Sets status='active', subscription_status='active', extends period +30 days
 */
export const adminReactivateTenant = async (req, res) => {
    try {
        const tenant = await tenantAdminRepository.findTenantById(req.params?.id);
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        const newPeriodEnd = new Date();
        newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

        await tenantAdminRepository.updateTenant(tenant, {
            status: 'active',
            subscription_status: 'active',
            current_period_end: newPeriodEnd,
            reactivation_requested_at: null
        });

        if (emailService.isEmailConfigured()) {
            await emailService.sendReactivationApprovedEmail({
                email: tenant.admin_email,
                companyName: tenant.name,
                companyToken: tenant.company_token
            }).catch(() => {
                // Non-fatal
            });
        }

        return res.json({
            success: true,
            message: `Tenant ${tenant.name} reactivated`,
            data: { id: tenant.id, status: 'active', current_period_end: newPeriodEnd }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUBLIC: Re-submit a rejected registration for re-review
 * Uses x-company-token; no JWT required
 */
export const resubmitRegistration = async (req, res) => {
    const result = await resubmitRegistrationUseCase({
        tenantId: req.tenant?.id
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Re-submission failed'
    });
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
    deleteTenant,
    setupPayPalRecurring,
    adminChangePlan,
    adminReactivateTenant,
    resubmitRegistration
};
