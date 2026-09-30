import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const plain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : value;
const bounded = (value, fallback = 50, maximum = 200) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), maximum);

const notificationView = (row) => {
    const state = Array.isArray(row.notificationStates) ? row.notificationStates[0] : null;
    return {
        notification_id: row.business_admin_alert_snapshot_id,
        alert_key: row.alert_key,
        type: row.alert_type,
        severity: row.severity,
        message: row.message,
        source_domain: row.source_domain,
        source_entity_type: row.source_entity_type,
        source_entity_id: row.source_entity_id,
        branch_id: row.branch_id || null,
        target_route: row.target_route || null,
        status: row.status,
        first_detected_at: row.first_detected_at,
        last_seen_at: row.last_seen_at,
        resolved_at: row.resolved_at || null,
        acknowledged_at: row.acknowledged_at || null,
        acknowledged_by: row.acknowledged_by || null,
        acknowledgement_note: row.acknowledgement_note || null,
        read_at: state?.read_at || null,
        dismissed_at: state?.dismissed_at || null,
        payload: row.payload || {}
    };
};

const scopedWhere = ({ branchIds = null, status = '', severity = '' } = {}) => {
    const where = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (Array.isArray(branchIds)) where.branch_id = { [Op.in]: branchIds };
    return where;
};

const notificationStateInclude = (userId) => ({
    model: dbStore.get('BusinessAdminNotificationState'),
    as: 'notificationStates',
    required: false,
    where: { user_id: userId }
});

const excludedNotificationIds = async ({ userId, unreadOnly = false, includeDismissed = false } = {}) => {
    if (includeDismissed) return [];

    const State = dbStore.get('BusinessAdminNotificationState');
    const where = { user_id: userId };
    if (unreadOnly) {
        where[Op.or] = [
            { read_at: { [Op.not]: null } },
            { dismissed_at: { [Op.not]: null } }
        ];
    } else {
        where.dismissed_at = { [Op.not]: null };
    }

    const rows = await State.findAll({
        where,
        attributes: ['business_admin_alert_snapshot_id'],
        raw: true
    });
    return rows
        .map((row) => Number(row.business_admin_alert_snapshot_id))
        .filter(Number.isInteger);
};

const visibleNotificationsWhere = async ({ userId, branchIds, status, severity, unreadOnly = false, includeDismissed = false } = {}) => {
    const where = scopedWhere({ branchIds, status, severity });
    const excludedIds = await excludedNotificationIds({ userId, unreadOnly, includeDismissed });
    if (excludedIds.length > 0) where.business_admin_alert_snapshot_id = { [Op.notIn]: excludedIds };
    return where;
};

export const businessAdminAlertSnapshotRepository = {
    async reconcile(alerts, now = new Date()) {
        const Alert = dbStore.get('BusinessAdminAlertSnapshot');
        const keys = alerts.map((alert) => alert.alert_key);
        await Promise.all(alerts.map(async (alert) => {
            const existing = await Alert.findOne({ where: { alert_key: alert.alert_key } });
            const values = { ...alert, status: 'open', last_seen_at: now, resolved_at: null };
            if (existing) return existing.update(values);
            return Alert.create({ ...values, first_detected_at: now });
        }));
        const openRows = await Alert.findAll({ where: { status: 'open' } });
        await Promise.all(openRows
            .filter((row) => !keys.includes(row.alert_key))
            .map((row) => row.update({ status: 'resolved', resolved_at: now })));
    },

    async list({ userId, branchIds = null, status = 'open', severity = '', unreadOnly = false, includeDismissed = false, limit = 50 } = {}) {
        const Alert = dbStore.get('BusinessAdminAlertSnapshot');
        const rows = await Alert.findAll({
            where: await visibleNotificationsWhere({ userId, branchIds, status, severity, unreadOnly, includeDismissed }),
            // Keep this as a left join. A missing per-user state is an unread,
            // non-dismissed notification and must not disappear from the list.
            include: [notificationStateInclude(userId)],
            order: [['severity', 'DESC'], ['last_seen_at', 'DESC'], ['business_admin_alert_snapshot_id', 'DESC']],
            limit: bounded(limit)
        });
        return rows
            .map(plain)
            .map(notificationView);
    },

    async countUnread({ userId, branchIds = null, status = 'open', severity = '' } = {}) {
        const Alert = dbStore.get('BusinessAdminAlertSnapshot');
        return Alert.count({
            where: await visibleNotificationsWhere({ userId, branchIds, status, severity, unreadOnly: true })
        });
    },

    async listOpen({ limit = 50 } = {}) {
        const Alert = dbStore.get('BusinessAdminAlertSnapshot');
        const rows = await Alert.findAll({
            where: scopedWhere({ status: 'open' }),
            order: [['severity', 'DESC'], ['last_seen_at', 'DESC'], ['business_admin_alert_snapshot_id', 'DESC']],
            limit: bounded(limit)
        });
        return rows.map(plain);
    },

    async getScoped(notificationId, { branchIds = null } = {}) {
        const Alert = dbStore.get('BusinessAdminAlertSnapshot');
        const row = await Alert.findOne({ where: { ...scopedWhere({ branchIds }), business_admin_alert_snapshot_id: Number(notificationId) } });
        return plain(row);
    },

    async markRead(notificationId, userId) {
        const State = dbStore.get('BusinessAdminNotificationState');
        const [state] = await State.findOrCreate({
            where: { business_admin_alert_snapshot_id: Number(notificationId), user_id: Number(userId) },
            defaults: { read_at: new Date(), dismissed_at: null }
        });
        if (!state.read_at) await state.update({ read_at: new Date() });
        return plain(state);
    },

    async dismiss(notificationId, userId) {
        const State = dbStore.get('BusinessAdminNotificationState');
        const [state] = await State.findOrCreate({
            where: { business_admin_alert_snapshot_id: Number(notificationId), user_id: Number(userId) },
            defaults: { read_at: new Date(), dismissed_at: new Date() }
        });
        if (!state.dismissed_at) await state.update({ read_at: state.read_at || new Date(), dismissed_at: new Date() });
        return plain(state);
    },

    async acknowledge(notificationId, { userId, note = '' } = {}) {
        const Alert = dbStore.get('BusinessAdminAlertSnapshot');
        const row = await Alert.findByPk(Number(notificationId));
        if (!row) return null;
        await row.update({ acknowledged_at: new Date(), acknowledged_by: Number(userId), acknowledgement_note: String(note || '').trim() || null });
        return plain(row);
    },

};
