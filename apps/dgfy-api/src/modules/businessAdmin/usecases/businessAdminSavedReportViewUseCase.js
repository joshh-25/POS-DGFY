import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const REPORT_KEY = 'pos_operations';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode, details = null) => ({ success: false, error: new DomainError(code, message, { statusCode, details }) });

const positiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const validDate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (!DATE_PATTERN.test(normalized)) return null;
    const date = new Date(`${normalized}T00:00:00.000Z`);
    return date.toISOString().slice(0, 10) === normalized ? normalized : null;
};

const normalizeFilters = (filters = {}) => {
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return null;
    const dateFrom = validDate(filters.date_from);
    const dateTo = validDate(filters.date_to);
    const branchId = positiveInt(filters.branch_id);
    if (dateFrom === null || dateTo === null || (String(filters.branch_id || '').trim() && !branchId)) return null;
    if (dateFrom && dateTo && dateFrom > dateTo) return null;
    return { ...(dateFrom ? { date_from: dateFrom } : {}), ...(dateTo ? { date_to: dateTo } : {}), ...(branchId ? { branch_id: branchId } : {}) };
};

const authorizeSavedReportAccess = async ({ user, filters, businessAdminOverviewRepository }) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }) };
    if (access.scope === 'all') return { access };
    const grantedLocationIds = await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (grantedLocationIds.length === 0) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }) };
    if (filters.branch_id && !grantedLocationIds.includes(filters.branch_id)) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }) };
    return { access };
};

export const buildListBusinessAdminSavedReportViewsUseCase = ({ businessAdminOverviewRepository, businessAdminSavedReportViewRepository }) => async ({ user = {} } = {}) => {
    const authorization = await authorizeSavedReportAccess({ user, filters: {}, businessAdminOverviewRepository });
    if (authorization.error) return authorization.error;
    return ok({ views: await businessAdminSavedReportViewRepository.listForUser({ userId: user.user_id, reportKey: REPORT_KEY }) });
};

export const buildCreateBusinessAdminSavedReportViewUseCase = ({ businessAdminOverviewRepository, businessAdminSavedReportViewRepository }) => async ({ body = {}, user = {}, auditContext = {} } = {}) => {
    const name = String(body.name || '').trim();
    const filters = normalizeFilters(body.filters);
    if (!name || name.length > 100 || !filters) return fail(DomainErrorCode.VALIDATION_FAILED, 'A unique view name and valid report filters are required.', 422, { reason_code: 'BUSINESS_ADMIN_SAVED_VIEW_INVALID' });
    const authorization = await authorizeSavedReportAccess({ user, filters, businessAdminOverviewRepository });
    if (authorization.error) return authorization.error;
    if (await businessAdminSavedReportViewRepository.findByName({ userId: user.user_id, reportKey: REPORT_KEY, name })) return fail(DomainErrorCode.CONFLICT, 'A saved report view with this name already exists.', 409, { reason_code: 'BUSINESS_ADMIN_SAVED_VIEW_DUPLICATE' });
    const view = await businessAdminSavedReportViewRepository.create({ userId: user.user_id, reportKey: REPORT_KEY, name, filters });
    await businessAdminSavedReportViewRepository.appendAudit({ userId: user.user_id, entityId: view.business_admin_saved_report_view_id, action: 'CREATE', changes: { name, filters }, auditContext });
    return ok({ view });
};

export const buildDeleteBusinessAdminSavedReportViewUseCase = ({ businessAdminOverviewRepository, businessAdminSavedReportViewRepository }) => async ({ viewId, user = {}, auditContext = {} } = {}) => {
    const normalizedViewId = positiveInt(viewId);
    if (!normalizedViewId) return fail(DomainErrorCode.VALIDATION_FAILED, 'Saved report view id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_SAVED_VIEW_ID_INVALID' });
    const authorization = await authorizeSavedReportAccess({ user, filters: {}, businessAdminOverviewRepository });
    if (authorization.error) return authorization.error;
    const deleted = await businessAdminSavedReportViewRepository.deleteForUser({ userId: user.user_id, viewId: normalizedViewId });
    if (!deleted) return fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'Saved report view was not found.', 404, { reason_code: 'BUSINESS_ADMIN_SAVED_VIEW_NOT_FOUND' });
    await businessAdminSavedReportViewRepository.appendAudit({ userId: user.user_id, entityId: normalizedViewId, action: 'DELETE', changes: null, auditContext });
    return ok({ deleted: true, view_id: normalizedViewId });
};
