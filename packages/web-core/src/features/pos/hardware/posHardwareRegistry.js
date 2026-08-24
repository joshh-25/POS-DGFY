import { fetchPosDeviceStatus } from '../services/posService.js';
import { iminNativeDriver } from './drivers/iminNativeDriver.js';
import { lanBridgeDriver } from './drivers/lanBridgeDriver.js';
import { noopDriver } from './drivers/noopDriver.js';

// Drivers that can be detected purely on the client, with no network call.
// Checked first, in order — the first one whose detect() resolves true wins.
const CLIENT_PROBED_DRIVERS = [iminNativeDriver];

// Server-dispatched drivers, keyed by the driver id the backend reports from
// GET /pos/device/status (see apps/dgfy-api/src/modules/pos/integrations/). Only
// consulted when no client-probed driver claimed the terminal.
const SERVER_DRIVERS_BY_ID = {
    [lanBridgeDriver.id]: lanBridgeDriver
};

const detectDriver = async () => {
    for (const driver of CLIENT_PROBED_DRIVERS) {
        try {
            // eslint-disable-next-line no-await-in-loop
            if (await driver.detect()) return driver;
        } catch {
            // Detection itself failing just means "try the next candidate".
        }
    }

    // This is the ONLY place `/pos/device/status` is called from the hardware
    // layer — once per resolution, memoized below, not on every render and not
    // on every print/drawer action. Absence of a bridge is a normal 200
    // response (ADR 0053), so a failed request here just means "no server
    // driver is reachable right now", not "hardware is broken".
    let status = null;
    try {
        status = await fetchPosDeviceStatus();
    } catch {
        return noopDriver;
    }

    const resolvedId = status?.driver?.id;
    return SERVER_DRIVERS_BY_ID[resolvedId] || noopDriver;
};

let cachedResolution = null;

// Resolves and caches the active POS hardware driver for this browser tab.
// Call refreshPosHardwareDriver() after events that could change what's
// available (shift open, hardware settings changed, iMin wrapper reload).
export const resolvePosHardwareDriver = ({ forceRefresh = false } = {}) => {
    if (forceRefresh || !cachedResolution) {
        cachedResolution = detectDriver();
    }
    return cachedResolution;
};

export const refreshPosHardwareDriver = () => resolvePosHardwareDriver({ forceRefresh: true });

// Test-only: clears the memoized resolution between test cases.
export const __resetPosHardwareDriverCacheForTests = () => {
    cachedResolution = null;
};
