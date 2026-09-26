import { isBusinessAdminDashboardEnabled } from '../domain/businessAdminRolloutPolicy.js';
export const requireBusinessAdminDashboardEnabled = (req, res, next) => {
    if (isBusinessAdminDashboardEnabled(req.tenant)) return next();
    return res.status(403).json({ success: false, code: 'BUSINESS_ADMIN_DASHBOARD_DISABLED', message: 'Business Admin is not enabled for this tenant yet.' });
};
