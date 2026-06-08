import {
    deleteAdminDgfyAccountUseCase,
    getAdminDgfyAccountUseCase,
    listAdminDgfyAccountsUseCase,
    reactivateAdminDgfyAccountUseCase,
    suspendAdminDgfyAccountUseCase,
    updateAdminDgfyAccountProfileUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const buildPlatformAdminActor = (req) => ({
    is_platform_admin: true,
    username: req.admin?.username || 'platform_admin',
    user_id: req.admin?.admin_id || req.admin?.id || null
});

const buildRequestMetadata = (req) => ({
    request_id: req.requestId || req.headers?.['x-request-id'] || null,
    ip_address: req.ip || null,
    user_agent: req.get?.('user-agent') || req.headers?.['user-agent'] || null
});

const trackAdminDgfyAccountUsage = async ({ req, result, eventType, action, successMetadataResolver, failureMetadataResolver }) => {
    await trackProductUsageFromResult({
        req,
        user: buildPlatformAdminActor(req),
        eventType,
        surface: 'admin_dgfy_accounts',
        action,
        result,
        successMetadataResolver,
        failureMetadataResolver
    });
};

export const listAdminDgfyAccounts = async (req, res) => {
    const result = await listAdminDgfyAccountsUseCase({ query: req.query || {} });
    await trackAdminDgfyAccountUsage({
        req,
        result,
        eventType: 'admin_dgfy_accounts_viewed',
        action: 'list_dgfy_accounts',
        successMetadataResolver: (data) => ({
            account_count: data?.payload?.data?.accounts?.length || 0,
            status_filter: req.query?.status || null
        })
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to list DGFY accounts'
    });
};

export const getAdminDgfyAccount = async (req, res) => {
    const result = await getAdminDgfyAccountUseCase({ accountId: req.params?.account_id });
    await trackAdminDgfyAccountUsage({
        req,
        result,
        eventType: 'admin_dgfy_account_viewed',
        action: 'view_dgfy_account',
        successMetadataResolver: () => ({ dgfy_account_id: req.params?.account_id || null }),
        failureMetadataResolver: (error) => ({
            dgfy_account_id: req.params?.account_id || null,
            error_code: error?.code || null
        })
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to load DGFY account'
    });
};

export const updateAdminDgfyAccountProfile = async (req, res) => {
    const result = await updateAdminDgfyAccountProfileUseCase({
        accountId: req.params?.account_id,
        body: req.body || {},
        actor: buildPlatformAdminActor(req),
        metadata: buildRequestMetadata(req)
    });
    await trackAdminDgfyAccountUsage({
        req,
        result,
        eventType: 'admin_dgfy_account_profile_updated',
        action: 'update_dgfy_account_profile',
        successMetadataResolver: () => ({ dgfy_account_id: req.params?.account_id || null }),
        failureMetadataResolver: (error) => ({
            dgfy_account_id: req.params?.account_id || null,
            error_code: error?.code || null
        })
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to update DGFY account profile'
    });
};

export const suspendAdminDgfyAccount = async (req, res) => {
    const result = await suspendAdminDgfyAccountUseCase({
        accountId: req.params?.account_id,
        body: req.body || {},
        actor: buildPlatformAdminActor(req),
        metadata: buildRequestMetadata(req)
    });
    await trackAdminDgfyAccountUsage({
        req,
        result,
        eventType: 'admin_dgfy_account_suspended',
        action: 'suspend_dgfy_account',
        successMetadataResolver: () => ({ dgfy_account_id: req.params?.account_id || null }),
        failureMetadataResolver: (error) => ({
            dgfy_account_id: req.params?.account_id || null,
            error_code: error?.code || null
        })
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to suspend DGFY account'
    });
};

export const reactivateAdminDgfyAccount = async (req, res) => {
    const result = await reactivateAdminDgfyAccountUseCase({
        accountId: req.params?.account_id,
        body: req.body || {},
        actor: buildPlatformAdminActor(req),
        metadata: buildRequestMetadata(req)
    });
    await trackAdminDgfyAccountUsage({
        req,
        result,
        eventType: 'admin_dgfy_account_reactivated',
        action: 'reactivate_dgfy_account',
        successMetadataResolver: () => ({ dgfy_account_id: req.params?.account_id || null }),
        failureMetadataResolver: (error) => ({
            dgfy_account_id: req.params?.account_id || null,
            error_code: error?.code || null
        })
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to reactivate DGFY account'
    });
};

export const deleteAdminDgfyAccount = async (req, res) => {
    const result = await deleteAdminDgfyAccountUseCase({
        accountId: req.params?.account_id,
        body: req.body || {},
        actor: buildPlatformAdminActor(req),
        metadata: buildRequestMetadata(req)
    });
    await trackAdminDgfyAccountUsage({
        req,
        result,
        eventType: 'admin_dgfy_account_deleted',
        action: 'delete_dgfy_account',
        successMetadataResolver: () => ({ dgfy_account_id: req.params?.account_id || null }),
        failureMetadataResolver: (error) => ({
            dgfy_account_id: req.params?.account_id || null,
            error_code: error?.code || null
        })
    });
    return sendUseCaseResult(res, result, {
        fallbackErrorMessage: 'Failed to delete DGFY account'
    });
};

export default {
    listAdminDgfyAccounts,
    getAdminDgfyAccount,
    updateAdminDgfyAccountProfile,
    suspendAdminDgfyAccount,
    reactivateAdminDgfyAccount,
    deleteAdminDgfyAccount
};
