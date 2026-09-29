import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : value;

export const businessAdminSavedReportViewRepository = {
    async listForUser({ userId, reportKey }) {
        const SavedReportView = dbStore.get('BusinessAdminSavedReportView');
        const rows = await SavedReportView.findAll({
            where: { user_id: userId, report_key: reportKey },
            order: [['updated_at', 'DESC'], ['business_admin_saved_report_view_id', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async findByName({ userId, reportKey, name }) {
        const SavedReportView = dbStore.get('BusinessAdminSavedReportView');
        return toPlain(await SavedReportView.findOne({ where: { user_id: userId, report_key: reportKey, name } }));
    },

    async create({ userId, reportKey, name, filters }) {
        const SavedReportView = dbStore.get('BusinessAdminSavedReportView');
        return toPlain(await SavedReportView.create({ user_id: userId, report_key: reportKey, name, filters }));
    },

    async deleteForUser({ userId, viewId }) {
        const SavedReportView = dbStore.get('BusinessAdminSavedReportView');
        return SavedReportView.destroy({ where: { business_admin_saved_report_view_id: viewId, user_id: userId } });
    },

    async appendAudit({ userId, entityId, action, changes, auditContext = {} }) {
        const AuditLog = dbStore.get('AuditLog');
        await AuditLog.create({
            user_id: userId,
            entity_type: 'business_admin_saved_report_view',
            entity_id: entityId,
            action,
            changes,
            effective_role: auditContext.effectiveRole || null,
            request_id: auditContext.requestId || null,
            trace_id: auditContext.traceId || null,
            outcome: 'success',
            ip_address: auditContext.ipAddress || null,
            user_agent: auditContext.userAgent || null
        });
    }
};
