import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess, userHasBusinessAdminPermission } from '../domain/businessAdminAccessPolicy.js';
import { PERMISSIONS } from '../../../config/permissions.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return DATE_PATTERN.test(normalized) && !Number.isNaN(new Date(`${normalized}T00:00:00.000Z`).getTime()) ? normalized : null;
};

export const buildListBusinessAdminAuditUseCase = ({ businessAdminOverviewRepository }) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed || access.scope !== 'all') {
        return { success: false, error: new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant-wide Business Admin access is required to view audit logs.', { statusCode: 403 }) };
    }
    const role = String(user.role || '').toLowerCase();
    if (!user.is_master_admin && role !== 'admin' && !userHasBusinessAdminPermission(user, PERMISSIONS.SYSTEM.actions.VIEW_AUDIT)) {
        return { success: false, error: new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Audit log permission is required.', { statusCode: 403 }) };
    }
    const dateFrom = optionalDate(query.date_from);
    const dateTo = optionalDate(query.date_to);
    if (dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo)) {
        return { success: false, error: new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Audit date filters are invalid.', { statusCode: 422 }) };
    }
    const entityType = String(query.entity_type || '').trim().slice(0, 50);
    const action = String(query.action || '').trim().toUpperCase();
    if (action && !['CREATE', 'UPDATE', 'DELETE', 'VIEW'].includes(action)) {
        return { success: false, error: new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Audit action filter is invalid.', { statusCode: 422 }) };
    }
    return { success: true, data: await businessAdminOverviewRepository.listAuditLogPage({ limit: query.limit, page: query.page, entityType, action, dateFrom, dateTo }) };
};
