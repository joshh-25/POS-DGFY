import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser } from '../services/authService';

const PermissionContext = createContext(null);

export const PermissionProvider = ({ children }) => {
    const [permissions, setPermissions] = useState([]);
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [tenantPlan, setTenantPlan] = useState('free'); // Default to free

    // ... ensureCompanyToken ...

    const loadPermissions = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            setPermissions([]);
            setIsMasterAdmin(false);
            setUserRole(null);
            setTenantPlan('free');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const user = await getCurrentUser();

            if (user) {
                // Extract permissions - handle array, JSON string, and legacy object formats
                let perms = [];
                let rawPerms = user.permissions;

                // MariaDB may return JSON columns as strings; parse them first
                if (typeof rawPerms === 'string') {
                    try {
                        rawPerms = JSON.parse(rawPerms);
                    } catch (e) {
                        console.warn('PermissionContext: Failed to parse permissions string', e);
                        rawPerms = [];
                    }
                }

                if (Array.isArray(rawPerms)) {
                    perms = rawPerms;
                } else if (rawPerms && typeof rawPerms === 'object') {
                    // Convert legacy object format { items: { view: true } } to ['items:view']
                    Object.entries(rawPerms).forEach(([entity, actions]) => {
                        if (actions && typeof actions === 'object') {
                            Object.entries(actions).forEach(([action, allowed]) => {
                                if (allowed) perms.push(`${entity}:${action}`);
                            });
                        }
                    });
                }

                setPermissions(perms);
                setIsMasterAdmin(!!user.is_master_admin);
                setUserRole(user.role);

                // Set Tenant Plan
                if (user.company && user.company.plan) {
                    setTenantPlan(user.company.plan);
                    console.log('PermissionContext: Tenant Plan', user.company.plan);
                }

                console.log('PermissionContext: Permissions loaded', {
                    role: user.role,
                    isMaster: !!user.is_master_admin,
                    permissionCount: perms.length
                });
            } else {
                // No user - clear permissions
                setPermissions([]);
                setIsMasterAdmin(false);
                setUserRole(null);
            }
        } catch (error) {
            console.error('PermissionContext: Failed to load permissions', error);
            setPermissions([]);
            setIsMasterAdmin(false);
            setUserRole(null);
        } finally {
            setLoading(false);
        }
    };

    // Check if user has specific permission
    const can = (permission) => {
        if (isMasterAdmin) return true;
        if (!permissions) return false;
        return permissions.includes(permission);
    };

    // Convenience helpers for common permission patterns
    const canView = (entity) => can(`${entity}:view`);
    const canCreate = (entity) => can(`${entity}:create`);
    const canEdit = (entity) => can(`${entity}:edit`);
    const canDelete = (entity) => can(`${entity}:delete`);
    const canApprove = (entity) => can(`${entity}:approve`);
    const canExport = (entity) => can(`${entity}:export`);
    const canImport = (entity) => can(`${entity}:import`);

    // Role-based checks
    const normalizedRole = String(userRole || '').toLowerCase();
    const isAdmin = normalizedRole === 'admin' || isMasterAdmin;
    const isManager = normalizedRole === 'manager' || isAdmin;
    const isStaff = ['staff', 'cashier', 'po', 'do', 'jo'].includes(normalizedRole);

    // Check if user can manage users (for Settings visibility)
    const canManageUsers = can('users:manage');
    const canViewSettings = can('settings:view');

    // Initial load
    useEffect(() => {
        loadPermissions();
    }, []);

    // Listen for custom auth events (login/logout) to reload permissions
    useEffect(() => {
        const handleAuthChange = () => {
            console.log('PermissionContext: Auth change detected, reloading permissions');
            loadPermissions();
        };

        window.addEventListener('auth:login', handleAuthChange);
        window.addEventListener('auth:logout', handleAuthChange);

        return () => {
            window.removeEventListener('auth:login', handleAuthChange);
            window.removeEventListener('auth:logout', handleAuthChange);
        };
    }, []);

    return (
        <PermissionContext.Provider value={{
            // Core state
            permissions,
            isMasterAdmin,
            userRole,
            tenantPlan,
            loading,
            loadPermissions,
            // Permission checks
            can,
            canView,
            canCreate,
            canEdit,
            canDelete,
            canApprove,
            canExport,
            canImport,
            // Role checks
            isAdmin,
            isManager,
            isStaff,
            canManageUsers,
            canViewSettings
        }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermission = () => {
    const context = useContext(PermissionContext);
    if (!context) {
        throw new Error('usePermission must be used within a PermissionProvider');
    }
    return context;
};
