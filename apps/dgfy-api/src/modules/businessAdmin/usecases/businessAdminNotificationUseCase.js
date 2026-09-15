import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { resolveBusinessAdminAccess, userHasBusinessAdminPermission } from '../domain/businessAdminAccessPolicy.js';

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

export const buildListBusinessAdminActivityUseCase = ({ businessAdminOverviewRepository, businessAdminAlertSnapshotRepository }) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    const canViewAudit = user?.is_master_admin || String(user?.role || '').toLowerCase() === 'admin' || userHasBusinessAdminPermission(user, PERMISSIONS.SYSTEM.actions.VIEW_AUDIT);
    if (!access.allowed || access.scope !== 'all' || !canViewAudit) return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant-wide audit permission is required to view business activity.', 403);
    const [auditLogs, notificationLifecycle] = await Promise.all([
        businessAdminOverviewRepository.listAuditLogs({ limit: limit(query.limit, 100) }),
        businessAdminAlertSnapshotRepository.listLifecycle({ limit: limit(query.limit, 100) })
    ]);
    const activities = [
        ...auditLogs.map((row) => ({ activity_type: 'audit', occurred_at: row.timestamp, actor_name: row.actor_name, title: row.action, detail: `${row.entity_type} #${row.entity_id}`, entity_type: row.entity_type, entity_id: row.entity_id })),
        ...notificationLifecycle.flatMap((row) => [
            { activity_type: 'notification_detected', occurred_at: row.first_detected_at, actor_name: 'System', title: row.message, detail: `${row.severity} ${row.alert_type}`, entity_type: row.source_entity_type, entity_id: row.source_entity_id },
            ...(row.acknowledged_at ? [{ activity_type: 'notification_acknowledged', occurred_at: row.acknowledged_at, actor_name: `User #${row.acknowledged_by}`, title: row.message, detail: row.acknowledgement_note || 'Acknowledged', entity_type: row.source_entity_type, entity_id: row.source_entity_id }] : []),
            ...(row.resolved_at ? [{ activity_type: 'notification_resolved', occurred_at: row.resolved_at, actor_name: 'System', title: row.message, detail: 'Condition resolved', entity_type: row.source_entity_type, entity_id: row.source_entity_id }] : [])
        ])
    ].sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at)).slice(0, limit(query.limit, 100));
    return ok({ activities });
};
