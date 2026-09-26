import { useCallback, useEffect, useRef, useState } from 'react';
import { resolvePosHardwareDriver, refreshPosHardwareDriver } from './posHardwareRegistry.js';
import { POS_HARDWARE_CAPABILITIES, normalizeHardwareResult } from './posHardwareContract.js';

const NO_HARDWARE_CAPABILITIES = Object.freeze([]);

// Single entry point terminal components use to reach POS hardware. Resolves
// once per mount (cached across the whole tab via posHardwareRegistry), never
// polls, and never throws — every action resolves to a HardwareCommandResult.
// Components must not branch on driver ids; only on `isPrinterAvailable` /
// `capabilities` for UI state. See ADR 0053.
export const usePosHardware = ({ enabled = true } = {}) => {
    const [driver, setDriver] = useState(null);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const load = useCallback(async ({ forceRefresh = false } = {}) => {
        if (!enabled) return null;
        setLoading(true);
        try {
            const resolved = forceRefresh
                ? await refreshPosHardwareDriver()
                : await resolvePosHardwareDriver();
            let resolvedStatus = null;
            if (resolved && typeof resolved.getStatus === 'function') {
                try {
                    resolvedStatus = await resolved.getStatus();
                } catch {
                    resolvedStatus = { available: false, printersDetected: 0, raw: null };
                }
            }
            if (mountedRef.current) {
                setDriver(resolved);
                setStatus(resolvedStatus);
            }
            return resolved;
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        mountedRef.current = true;
        if (!enabled) {
            setDriver(null);
            setStatus(null);
            setLoading(false);
            return () => {
                mountedRef.current = false;
            };
        }
        load();
        return () => {
            mountedRef.current = false;
        };
    }, [enabled, load]);

    const withDriver = useCallback(async (methodName, args) => {
        const activeDriver = driver || await load();
        if (!activeDriver) {
            return normalizeHardwareResult({
                success: false,
                driverId: 'none',
                reasonCode: 'AUTH_REQUIRED',
                message: 'Sign in to use POS hardware.'
            });
        }
        if (typeof activeDriver[methodName] !== 'function') {
            return normalizeHardwareResult({
                success: false,
                driverId: activeDriver.id,
                reasonCode: 'NOT_SUPPORTED',
                message: 'This action is not supported by the current terminal driver.'
            });
        }
        return activeDriver[methodName](args);
    }, [driver, load]);

    const printReceipt = useCallback((args) => withDriver('printReceipt', args), [withDriver]);
    const printShiftSummary = useCallback((args) => withDriver('printShiftSummary', args), [withDriver]);
    const printZReading = useCallback((args) => withDriver('printZReading', args), [withDriver]);
    const printOrderTicket = useCallback((args) => withDriver('printOrderTicket', args), [withDriver]);
    const testPrint = useCallback((args) => withDriver('testPrint', args), [withDriver]);
    const openDrawer = useCallback((args) => withDriver('openDrawer', args), [withDriver]);
    const capabilities = driver?.capabilities || NO_HARDWARE_CAPABILITIES;
    const supportsCapability = useCallback(
        (capability) => capabilities.includes(capability),
        [capabilities]
    );
    const refresh = useCallback(() => load({ forceRefresh: true }), [load]);
    const isPrinterAvailable = capabilities.includes(POS_HARDWARE_CAPABILITIES.PRINT_RECEIPT)
        && (typeof status?.available !== 'boolean' || status.available);

    return {
        driver,
        driverId: driver?.id || null,
        driverLabel: driver?.label || null,
        // Honest UI state: true only once a real driver (not the noop fallback)
        // has been resolved. Print/drawer controls should read this instead of
        // failing silently on click.
        isPrinterAvailable,
        isOrderPrinterAvailable: capabilities.includes(POS_HARDWARE_CAPABILITIES.PRINT_ORDER_TICKET),
        status,
        printersDetected: Number(status?.printersDetected || 0),
        capabilities,
        supportsCapability,
        loading,
        refresh,
        printReceipt,
        printShiftSummary,
        printZReading,
        printOrderTicket,
        testPrint,
        openDrawer
    };
};

export default usePosHardware;
