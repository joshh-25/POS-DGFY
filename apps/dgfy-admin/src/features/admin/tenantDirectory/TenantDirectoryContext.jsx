import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as adminService from '@/services/adminService';

const TenantDirectoryContext = createContext(null);
const EMPTY_DIRECTORY = Object.freeze({
    tenants: null,
    status: 'idle',
    error: '',
    capabilitiesLoaded: false,
    capabilityLoading: false
});

export function TenantDirectoryProvider({ children }) {
    const [snapshot, setSnapshot] = useState(EMPTY_DIRECTORY);
    const snapshotRef = useRef(snapshot);
    const requestGeneration = useRef(0);
    const pendingRequest = useRef(null);

    const publish = useCallback((next) => {
        snapshotRef.current = next;
        setSnapshot(next);
    }, []);

    const invalidate = useCallback(() => {
        requestGeneration.current += 1;
        pendingRequest.current = null;
        publish(EMPTY_DIRECTORY);
    }, [publish]);

    const loadTenants = useCallback(async ({ includeCapabilities = false, force = false } = {}) => {
        const current = snapshotRef.current;
        if (!force && current.tenants !== null && (!includeCapabilities || current.capabilitiesLoaded)) {
            return current.tenants;
        }
        if (!force && pendingRequest.current) {
            if (pendingRequest.current.includeCapabilities || !includeCapabilities) {
                return pendingRequest.current.promise;
            }
        }

        const generation = requestGeneration.current + 1;
        requestGeneration.current = generation;
        publish({
            ...current,
            status: current.tenants === null ? 'loading' : 'refreshing',
            error: '',
            capabilityLoading: includeCapabilities
        });

        const promise = adminService.getTenants('all', { includeCapabilities })
            .then((response) => {
                if (requestGeneration.current !== generation) return null;
                const tenants = Array.isArray(response?.data) ? response.data : [];
                publish({
                    tenants,
                    status: 'loaded',
                    error: '',
                    capabilitiesLoaded: includeCapabilities,
                    capabilityLoading: false
                });
                return tenants;
            })
            .catch((error) => {
                if (requestGeneration.current !== generation) return null;
                const previous = snapshotRef.current;
                publish({
                    ...previous,
                    status: previous.tenants === null ? 'error' : 'loaded',
                    error: error?.response?.data?.message || 'Failed to load tenants',
                    capabilityLoading: false
                });
                return null;
            })
            .finally(() => {
                if (pendingRequest.current?.generation === generation) pendingRequest.current = null;
            });

        pendingRequest.current = { generation, includeCapabilities, promise };
        return promise;
    }, [publish]);

    const refreshTenants = useCallback((options = {}) => loadTenants({ ...options, force: true }), [loadTenants]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        window.addEventListener('admin:tenant-directory-invalidated', invalidate);
        return () => window.removeEventListener('admin:tenant-directory-invalidated', invalidate);
    }, [invalidate]);

    const value = useMemo(() => ({
        ...snapshot,
        tenants: snapshot.tenants || [],
        hasLoaded: snapshot.tenants !== null,
        loadTenants,
        refreshTenants,
        invalidate
    }), [snapshot, loadTenants, refreshTenants, invalidate]);

    return <TenantDirectoryContext.Provider value={value}>{children}</TenantDirectoryContext.Provider>;
}

export function useTenantDirectory() {
    const context = useContext(TenantDirectoryContext);
    if (!context) throw new Error('useTenantDirectory must be used within TenantDirectoryProvider');
    return context;
}
