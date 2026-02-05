import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser } from '../services/authService';
import api from '../services/api';

const PermissionContext = createContext(null);

export const PermissionProvider = ({ children }) => {
    const [permissions, setPermissions] = useState([]);
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);

    /**
     * Ensure company token is set in localStorage.
     * This helps users who logged in before the token-less login feature,
     * or when the token was lost from localStorage.
     */
    const ensureCompanyToken = async (userEmail) => {
        const existingToken = localStorage.getItem('companyToken');
        if (existingToken) {
            return existingToken; // Already have a token
        }

        try {
            // Look up the company token for this email
            const response = await api.post('/auth/lookup', { email: userEmail });
            const data = response.data.data;

            if (data.company_token) {
                // Single tenant - store the token
                localStorage.setItem('companyToken', data.company_token);
                console.log('PermissionContext: Auto-resolved company token for', userEmail);
                return data.company_token;
            } else if (data.multiple && data.tenants && data.tenants.length > 0) {
                // Multiple tenants - use the first one (user can change via logout/login)
                localStorage.setItem('companyToken', data.tenants[0].company_token);
                console.log('PermissionContext: Auto-resolved company token (first of multiple) for', userEmail);
                return data.tenants[0].company_token;
            }
        } catch (error) {
            // If lookup fails (404 = email not found), don't crash - just log
            console.warn('PermissionContext: Could not auto-resolve company token:', error.message);
        }
        return null;
    };

    const loadPermissions = async () => {
        // Skip loading if on admin portal
        if (window.location.pathname.startsWith('/admin')) {
            setLoading(false);
            return;
        }

        // Skip loading if no token found (guest user)
        const token = localStorage.getItem('authToken');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            // Check if company token is missing - if so, try to recover it first
            const companyToken = localStorage.getItem('companyToken');
            if (!companyToken) {
                // Decode the JWT to get the email (without verification)
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    if (payload.email) {
                        await ensureCompanyToken(payload.email);
                    }
                } catch (decodeError) {
                    console.warn('PermissionContext: Could not decode JWT for email recovery');
                }
            }

            const user = await getCurrentUser();
            // getCurrentUser already returns the user object directly (not wrapped in .data)
            // Skip loading if on admin portal
            if (window.location.pathname.startsWith('/admin')) {
                setLoading(false);
                return;
            }

            if (user) {
                console.log('PermissionContext: Loaded User', user);
                let perms = user.permissions || [];
                console.log('PermissionContext: Raw Permissions', perms, typeof perms);

                // Fix: Parse stringified permissions if necessary (handling backend inconsistencies)
                if (typeof perms === 'string') {
                    try {
                        perms = JSON.parse(perms);
                        console.log('PermissionContext: Parsed Permissions', perms);
                    } catch (e) {
                        // Fallback if parsing fails
                        console.error('PermissionContext: Failed to parse permissions', e);
                        perms = [];
                    }
                }

                setPermissions(perms);

                // Fix: Robust check for master admin flag (boolean or integer)
                const isMaster = user.is_master_admin === true || user.is_master_admin === 1 || user.is_master_admin === '1';
                console.log('PermissionContext: isMasterAdmin decision', isMaster, 'Value:', user.is_master_admin);
                setIsMasterAdmin(isMaster);

                setUserRole(user.role);
            }
        } catch (error) {
            // Ignore 401 (Unauthorized) errors, as they just mean the user isn't logged in
            if (error.response && error.response.status === 401) {
                // Do nothing, just leave permissions empty
            } else {
                console.error("Failed to load permissions", error);
            }
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
        <PermissionContext.Provider value={{ permissions, isMasterAdmin, userRole, can, loadPermissions, loading }}>
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
