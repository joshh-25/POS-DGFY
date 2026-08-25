import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPosDeviceStatus = vi.fn();
const printPosReceipt = vi.fn();
const openPosDeviceDrawer = vi.fn();
const reportPosDeviceClientResult = vi.fn();

vi.mock('../../services/posService.js', () => ({
    fetchPosDeviceStatus: (...args) => fetchPosDeviceStatus(...args),
    printPosReceipt: (...args) => printPosReceipt(...args),
    openPosDeviceDrawer: (...args) => openPosDeviceDrawer(...args),
    reportPosDeviceClientResult: (...args) => reportPosDeviceClientResult(...args)
}));

let resolvePosHardwareDriver;
let refreshPosHardwareDriver;
let __resetPosHardwareDriverCacheForTests;
let POS_HARDWARE_CAPABILITIES;

beforeEach(async () => {
    vi.resetModules();
    fetchPosDeviceStatus.mockReset();
    printPosReceipt.mockReset();
    openPosDeviceDrawer.mockReset();
    reportPosDeviceClientResult.mockReset();
    // iminHardwareBridge.js (imported transitively by the iMin driver) reads
    // window.location at module-evaluation time, so tests that don't need the
    // iMin bridge must run with no `window` global at all — matching the
    // real non-jsdom node runtime this module also has to work under.
    delete globalThis.window;

    ({ resolvePosHardwareDriver, refreshPosHardwareDriver, __resetPosHardwareDriverCacheForTests } =
        await import('../posHardwareRegistry.js'));
    ({ POS_HARDWARE_CAPABILITIES } = await import('../posHardwareContract.js'));
});

afterEach(() => {
    __resetPosHardwareDriverCacheForTests?.();
});

describe('posHardwareRegistry', () => {
    it('resolves to the iMin driver and never calls /pos/device/status when the iMin bridge is present', async () => {
        globalThis.window = { location: { origin: 'http://localhost' }, iMinBridge: { isIminWrapper: () => true } };

        const driver = await resolvePosHardwareDriver();

        expect(driver.id).toBe('imin_native');
        expect(driver.capabilities).toContain(POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT);
        expect(fetchPosDeviceStatus).not.toHaveBeenCalled();
    });

    it('falls through to the noop driver when the iMin bridge is present but no printer is reachable (no iMin service, no paired Bluetooth device)', async () => {
        globalThis.window = {
            location: { origin: 'http://localhost' },
            iMinBridge: {
                isIminWrapper: () => true,
                getHardwareDiagnostics: () => ({
                    diagnostics: {
                        printerServiceConnected: false,
                        bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 }
                    }
                })
            }
        };
        fetchPosDeviceStatus.mockResolvedValue({ driver: null });

        const driver = await resolvePosHardwareDriver();

        expect(driver.id).toBe('none');
    });

    it('resolves to the iMin driver when the iMin service is unreachable but a Bluetooth printer is paired', async () => {
        globalThis.window = {
            location: { origin: 'http://localhost' },
            iMinBridge: {
                isIminWrapper: () => true,
                getHardwareDiagnostics: () => ({
                    diagnostics: {
                        printerServiceConnected: false,
                        bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 1 }
                    }
                })
            }
        };

        const driver = await resolvePosHardwareDriver();

        expect(driver.id).toBe('imin_native');
        expect(fetchPosDeviceStatus).not.toHaveBeenCalled();
    });

    it('falls back to the noop driver when no client-only driver matches and the backend reports no server driver', async () => {
        fetchPosDeviceStatus.mockResolvedValue({ driver: { id: 'client_managed' } });

        const driver = await resolvePosHardwareDriver();

        expect(driver.id).toBe('none');
        expect(fetchPosDeviceStatus).toHaveBeenCalledTimes(1);
    });

    it('resolves to the LAN bridge driver only when the backend reports it as active', async () => {
        fetchPosDeviceStatus.mockResolvedValue({ driver: { id: 'lan_escpos_bridge' } });

        const driver = await resolvePosHardwareDriver();

        expect(driver.id).toBe('lan_escpos_bridge');
        expect(driver.capabilities).toContain(POS_HARDWARE_CAPABILITIES.PRINT_RECEIPT);
        expect(driver.capabilities).not.toContain(POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT);
    });

    it('falls back to the noop driver, not an exception, when the status request itself fails', async () => {
        fetchPosDeviceStatus.mockRejectedValue(new Error('network down'));

        const driver = await resolvePosHardwareDriver();

        expect(driver.id).toBe('none');
    });

    it('memoizes resolution — repeated calls do not re-fetch device status', async () => {
        fetchPosDeviceStatus.mockResolvedValue({ driver: { id: 'client_managed' } });

        await resolvePosHardwareDriver();
        await resolvePosHardwareDriver();
        await resolvePosHardwareDriver();

        expect(fetchPosDeviceStatus).toHaveBeenCalledTimes(1);
    });

    it('re-fetches only when explicitly refreshed', async () => {
        fetchPosDeviceStatus.mockResolvedValue({ driver: { id: 'client_managed' } });

        await resolvePosHardwareDriver();
        await refreshPosHardwareDriver();

        expect(fetchPosDeviceStatus).toHaveBeenCalledTimes(2);
    });
});
