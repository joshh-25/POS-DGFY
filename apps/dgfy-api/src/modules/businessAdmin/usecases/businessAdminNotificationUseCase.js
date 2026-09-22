import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({ success: false, error: new DomainError(code, message, { statusCode, details }) });
const limit = (value, fallback = 50) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), 200);
const allowed = (value, values) => values.includes(String(value || '').trim().toLowerCase()) ? String(value).trim().toLowerCase() : '';

const accessScope = async ({ user, businessAdminOverviewRepository }) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }) };
    if (access.scope === 'all') return { access, branchIds: null };
    const branchIds = await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (branchIds.length === 0) return { error: fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }) };
    return { access, branchIds };
};

const visibleNotification = async ({ notificationId, user, businessAdminOverviewRepository, businessAdminAlertSnapshotRepository }) => {
    const scope = await accessScope({ user, businessAdminOverviewRepository });
    if (scope.error) return scope;
    const notification = await businessAdminAlertSnapshotRepository.getScoped(notificationId, { branchIds: scope.branchIds });
    if (!notification) return { error: fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'Notification was not found or is outside your branch scope.', 404) };
    return { ...scope, notification };
};

export const buildListBusinessAdminNotificationsUseCase = ({ businessAdminOverviewRepository, businessAdminAlertSnapshotRepository }) => async ({ query = {}, user = {} } = {}) => {
    const scope = await accessScope({ user, businessAdminOverviewRepository });
    if (scope.error) return scope.error;
    const notificationQuery = {
        userId: user.user_id,
        branchIds: scope.branchIds,
        status: allowed(query.status || 'open', ['open', 'resolved']) || 'open',
        severity: allowed(query.severity, ['info', 'warning', 'critical']),
        unreadOnly: String(query.unread_only || '').toLowerCase() === 'true',
        includeDismissed: String(query.include_dismissed || '').toLowerCase() === 'true',
        limit: limit(query.limit)
    };
    const [notifications, unreadCount] = await Promise.all([
        businessAdminAlertSnapshotRepository.list(notificationQuery),
        businessAdminAlertSnapshotRepository.countUnread(notificationQuery)
    ]);
    return ok({ notifications, unread_count: unreadCount, scope: scope.access.scope });
};

export const buildMarkBusinessAdminNotificationReadUseCase = ({ businessAdminOverviewRepository, businessAdminAlertSnapshotRepository }) => async ({ notificationId, user = {} } = {}) => {
    const visible = await visibleNotification({ notificationId, user, businessAdminOverviewRepository, businessAdminAlertSnapshotRepository });
    if (visible.error) return visible.error;
    const state = await businessAdminAlertSnapshotRepository.markRead(notificationId, user.user_id);
    return ok({ notification_id: Number(notificationId), read_at: state.read_at });
};

export const buildDismissBusinessAdminNotificationUseCase = ({ businessAdminOverviewRepository, businessAdminAlertSnapshotRepository }) => async ({ notificationId, user = {} } = {}) => {
    const visible = await visibleNotification({ notificationId, user, businessAdminOverviewRepository, businessAdminAlertSnapshotRepository });
    if (visible.error) return visible.error;
    const state = await businessAdminAlertSnapshotRepository.dismiss(notificationId, user.user_id);
    return ok({ notification_id: Number(notificationId), dismissed_at: state.dismissed_at });
};

export const buildAcknowledgeBusinessAdminNotificationUseCase = ({ businessAdminOverviewRepository, businessAdminAlertSnapshotRepository }) => async ({ notificationId, note = '', user = {} } = {}) => {
    const scope = await accessScope({ user, businessAdminOverviewRepository });
    if (scope.error) return scope.error;
    if (scope.access.scope !== 'all') return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant-wide Business Admin access is required to acknowledge an operational condition.', 403);
    const notification = await businessAdminAlertSnapshotRepository.getScoped(notificationId, { branchIds: null });
    if (!notification) return fail(DomainErrorCode.RESOURCE_NOT_FOUND, 'Notification was not found.', 404);
    const normalizedNote = String(note || '').trim();
    if (normalizedNote.length > 500) return fail(DomainErrorCode.VALIDATION_FAILED, 'Acknowledgement note must be 500 characters or fewer.', 422);
    const acknowledgedNotification = await businessAdminAlertSnapshotRepository.acknowledge(notificationId, { userId: user.user_id, note: normalizedNote });
    return ok({ notification: acknowledgedNotification });
};
