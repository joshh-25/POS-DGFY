import { acknowledgeBusinessAdminNotificationUseCase, cancelBusinessAdminApprovalUseCase, createBusinessAdminCustomerUseCase, createBusinessAdminExpenseUseCase, createBusinessAdminSavedReportViewUseCase, decideBusinessAdminApprovalUseCase, deleteBusinessAdminSavedReportViewUseCase, dismissBusinessAdminNotificationUseCase, exportBusinessAdminReportUseCase, getBusinessAdminAttendanceUseCase, getBusinessAdminBootstrapUseCase, getBusinessAdminCompanyUseCase, getBusinessAdminCommerceMonitoringUseCase, getBusinessAdminCustomerDetailUseCase, getBusinessAdminFiscalUseCase, getBusinessAdminInventoryValuationUseCase, getBusinessAdminMultiCompanyOverviewUseCase, getBusinessAdminOrderDetailUseCase, getBusinessAdminOverviewUseCase, getBusinessAdminPosActivityAnalyticsUseCase, getBusinessAdminReportDatasetUseCase, getBusinessAdminReportsUseCase, getBusinessAdminWorkforceUseCase, listBusinessAdminAuditUseCase, listBusinessAdminApprovalsUseCase, listBusinessAdminCustomersUseCase, listBusinessAdminExpensesUseCase, listBusinessAdminInventoryStockUseCase, listBusinessAdminNotificationsUseCase, listBusinessAdminOrdersUseCase, listBusinessAdminRecipesUseCase, listBusinessAdminReportDefinitionsUseCase, listBusinessAdminSavedReportViewsUseCase, listBusinessAdminShiftsUseCase, markBusinessAdminNotificationReadUseCase, voidBusinessAdminExpenseUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const auditContext = (req, res) => ({
    requestId: requestId(req, res),
    traceId: req.traceId || res.locals?.traceId || null,
    effectiveRole: String(req.user?.role || '').toLowerCase() || null,
    ipAddress: req.ip || null,
    userAgent: req.get?.('user-agent') || null
});

const errorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

export const getOverview = async (req, res, next) => {
    try {
        const result = await getBusinessAdminOverviewUseCase({
            query: req.query,
            user: req.user,
            tenant: req.tenant
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getCompany = async (req, res, next) => {
    try {
        const result = await getBusinessAdminCompanyUseCase({ user: req.user, tenant: req.tenant });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getMultiCompanyOverview = async (req, res, next) => {
    try {
        const result = await getBusinessAdminMultiCompanyOverviewUseCase({
            query: req.query,
            user: req.user,
            tenant: req.tenant,
            auditContext: auditContext(req, res)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getReports = async (req, res, next) => {
    try {
        const result = await getBusinessAdminReportsUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getPosActivityAnalytics = async (req, res, next) => {
    try {
        const result = await getBusinessAdminPosActivityAnalyticsUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listReportDefinitions = async (req, res, next) => {
    try {
        const result = await listBusinessAdminReportDefinitionsUseCase({ user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getReportDataset = async (req, res, next) => {
    try {
        const result = await getBusinessAdminReportDatasetUseCase({ query: req.query, user: req.user, reportKey: req.params.reportKey });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const exportReportDataset = async (req, res, next) => {
    try {
        const result = await exportBusinessAdminReportUseCase({ query: req.query, user: req.user, reportKey: req.params.reportKey });
        if (!result.success) return sendUseCaseResult(res, result, { errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
        res.setHeader('Content-Type', result.data.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.data.filename}"`);
        return res.status(200).send(result.data.content);
    } catch (error) { next(error); }
};

export const getInventoryValuation = async (req, res, next) => {
    try {
        const result = await getBusinessAdminInventoryValuationUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listInventoryStock = async (req, res, next) => {
    try {
        const result = await listBusinessAdminInventoryStockUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() })
        });
    } catch (error) { next(error); }
};

export const getWorkforce = async (req, res, next) => {
    try {
        const result = await getBusinessAdminWorkforceUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getAttendance = async (req, res, next) => {
    try {
        const result = await getBusinessAdminAttendanceUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getFiscal = async (req, res, next) => {
    try {
        const result = await getBusinessAdminFiscalUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listRecipes = async (req, res, next) => {
    try {
        const result = await listBusinessAdminRecipesUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listCustomers = async (req, res, next) => {
    try {
        const result = await listBusinessAdminCustomersUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const createCustomer = async (req, res, next) => {
    try {
        const result = await createBusinessAdminCustomerUseCase({ body: req.body, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getCustomerDetail = async (req, res, next) => {
    try {
        const result = await getBusinessAdminCustomerDetailUseCase({ profileRef: req.params.profileRef, query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listExpenses = async (req, res, next) => {
    try {
        const result = await listBusinessAdminExpensesUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const createExpense = async (req, res, next) => {
    try {
        const result = await createBusinessAdminExpenseUseCase({
            body: req.body,
            user: req.user,
            auditContext: auditContext(req, res)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => result.data?.idempotent ? 200 : 201,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const voidExpense = async (req, res, next) => {
    try {
        const result = await voidBusinessAdminExpenseUseCase({
            expenseId: req.params.id,
            body: req.body,
            user: req.user,
            auditContext: auditContext(req, res)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listOrders = async (req, res, next) => {
    try {
        const result = await listBusinessAdminOrdersUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listShifts = async (req, res, next) => {
    try {
        const result = await listBusinessAdminShiftsUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getOrderDetail = async (req, res, next) => {
    try {
        const result = await getBusinessAdminOrderDetailUseCase({ transactionId: req.params.id, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const getCommerceMonitoring = async (req, res, next) => {
    try {
        const result = await getBusinessAdminCommerceMonitoringUseCase({ user: req.user, tenant: req.tenant, query: req.query || {} });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listSavedReportViews = async (req, res, next) => {
    try {
        const result = await listBusinessAdminSavedReportViewsUseCase({ user: req.user });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 200, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export const createSavedReportView = async (req, res, next) => {
    try {
        const result = await createBusinessAdminSavedReportViewUseCase({ body: req.body, user: req.user, auditContext: auditContext(req, res) });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 201, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export const deleteSavedReportView = async (req, res, next) => {
    try {
        const result = await deleteBusinessAdminSavedReportViewUseCase({ viewId: req.params.id, user: req.user, auditContext: auditContext(req, res) });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 200, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export const getBootstrap = async (req, res, next) => {
    try {
        const result = await getBusinessAdminBootstrapUseCase({
            user: req.user,
            tenant: req.tenant
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listAudit = async (req, res, next) => {
    try {
        const result = await listBusinessAdminAuditUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const decideApproval = async (req, res, next) => {
    try {
        const result = await decideBusinessAdminApprovalUseCase({
            approvalRequestId: req.validatedParams?.id || req.params.id,
            decision: req.params.decision,
            note: req.validatedData?.note || req.body?.note || '',
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const cancelApproval = async (req, res, next) => {
    try {
        const result = await cancelBusinessAdminApprovalUseCase({
            approvalRequestId: req.validatedParams?.id || req.params.id,
            note: req.body?.note || '',
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listApprovals = async (req, res, next) => {
    try {
        const result = await listBusinessAdminApprovalsUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => errorPayload(req, res, failure)
        });
    } catch (error) { next(error); }
};

export const listNotifications = async (req, res, next) => {
    try {
        const result = await listBusinessAdminNotificationsUseCase({ query: req.query, user: req.user });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 200, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export const markNotificationRead = async (req, res, next) => {
    try {
        const result = await markBusinessAdminNotificationReadUseCase({ notificationId: req.params.id, user: req.user });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 200, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export const dismissNotification = async (req, res, next) => {
    try {
        const result = await dismissBusinessAdminNotificationUseCase({ notificationId: req.params.id, user: req.user });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 200, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export const acknowledgeNotification = async (req, res, next) => {
    try {
        const result = await acknowledgeBusinessAdminNotificationUseCase({ notificationId: req.params.id, note: req.body?.note, user: req.user });
        return sendUseCaseResult(res, result, { successStatusCodeResolver: () => 200, successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }), errorPayloadResolver: (failure) => errorPayload(req, res, failure) });
    } catch (error) { next(error); }
};

export default {
    getCompany,
    getBootstrap,
    getOverview,
    getMultiCompanyOverview,
    getReports,
    getPosActivityAnalytics,
    listReportDefinitions,
    getReportDataset,
    exportReportDataset,
    getInventoryValuation,
    listInventoryStock,
    getWorkforce,
    getAttendance,
    getFiscal,
    listOrders,
    getOrderDetail,
    listCustomers,
    createCustomer,
    getCustomerDetail,
    listExpenses,
    createExpense,
    voidExpense,
    getCommerceMonitoring,
    listSavedReportViews,
    createSavedReportView,
    deleteSavedReportView,
    listAudit,
    listApprovals,
    decideApproval,
    cancelApproval,
    listNotifications,
    markNotificationRead,
    dismissNotification,
    acknowledgeNotification
};
