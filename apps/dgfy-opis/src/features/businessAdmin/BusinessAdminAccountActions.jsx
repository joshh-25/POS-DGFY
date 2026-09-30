import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, LogOut } from 'lucide-react';
import { DGFY_COMPANY_SELECT_ROUTE } from '../../../../../packages/web-core/src/features/dgfyRouteHelpers.js';
import { logout } from '../../../../../packages/web-core/src/services/authService.js';

const BusinessAdminAccountActions = ({ sidebarCollapsed = false }) => (
    <nav className="business-admin-account-actions" aria-label="Account actions">
        <Link
            to={DGFY_COMPANY_SELECT_ROUTE}
            className="business-admin-nav-item"
            aria-label="Switch business"
            title={sidebarCollapsed ? 'Switch business' : undefined}
        >
            <Building2 size={16} />
            <span className="business-admin-nav-item-label">Switch business</span>
        </Link>
        <button
            type="button"
            className="business-admin-nav-item"
            aria-label="Logout"
            title={sidebarCollapsed ? 'Logout' : undefined}
            onClick={() => { void logout({ redirectTo: '/dgfy/auth' }); }}
        >
            <LogOut size={16} />
            <span className="business-admin-nav-item-label">Logout</span>
        </button>
    </nav>
);

export default BusinessAdminAccountActions;
