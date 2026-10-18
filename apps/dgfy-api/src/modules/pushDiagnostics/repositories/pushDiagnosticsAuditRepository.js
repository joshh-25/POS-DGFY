import { PlatformAdminAuditLog } from '../../../models/index.js';

// request_metadata is a fixed allowlist: no IP, user agent, headers, query string or body.
const safeRequestMetadata = (request = {}) => ({
    request_id: request.requestId || null,
    method: request.method || null,
    path: String(request.path || '').split('?')[0].slice(0, 200) || null
});

export const pushDiagnosticsAuditRepository = {
    async write({ admin, action, reason = null, after = null, request = {} }) {
        await PlatformAdminAuditLog.create({
            actor_admin_id: admin?.id || null,
            actor_username_snapshot: admin?.username || null,
            action,
            reason: reason ? String(reason).slice(0, 500) : null,
            after_snapshot: after,
            request_metadata: safeRequestMetadata(request)
        });
    }
};

export default pushDiagnosticsAuditRepository;
