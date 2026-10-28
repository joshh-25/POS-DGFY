import React from 'react';
import { NavLink } from 'react-router-dom';

export default function TenantConsoleTabs({ adminProfile, location }) {
    const tabs = [
        { path: '/admin/tenants', label: 'Tenants', end: true },
        ...(adminProfile?.is_master ? [{ path: '/admin/tenants/billing', label: 'Billing', end: true }] : [])
    ];

    return (
        <nav aria-label="Tenant management views" className="mb-5 flex gap-2 border-b border-slate-200">
            {tabs.map((tab) => (
                <NavLink
                    key={tab.path}
                    end={tab.end}
                    to={{ pathname: tab.path, search: location.search }}
                    className={({ isActive }) => `border-b-2 px-4 py-2.5 text-sm font-semibold ${isActive ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    {tab.label}
                </NavLink>
            ))}
        </nav>
    );
}
