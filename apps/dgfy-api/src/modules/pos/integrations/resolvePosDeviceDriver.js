import { posDeviceBridgeService } from '../../../services/posDeviceBridgeService.js';
import { deviceBridgeEnabled, posDeviceDriverOverride } from '../../../config/posDeviceFeature.js';
import { assertPosDeviceDriverContract } from '../contracts/posDeviceDriver.contract.js';
import { buildEscposBridgeDeviceDriver } from './escposBridgeDeviceDriver.js';
import { clientManagedDeviceDriver } from './clientManagedDeviceDriver.js';
import { disabledDeviceDriver } from './disabledDeviceDriver.js';

const DRIVER_FACTORIES = {
    lan_escpos_bridge: () => buildEscposBridgeDeviceDriver({ bridgeService: posDeviceBridgeService }),
    client_managed: () => clientManagedDeviceDriver,
    none: () => disabledDeviceDriver
};

// Resolves which backend-dispatched POS device driver is active for this
// deployment. 'auto' (the default) picks the LAN device-bridge only when it has
// been explicitly enabled (DEVICE_BRIDGE_ENABLED=true); otherwise hardware is
// assumed to be client-managed, so absence of a bridge is never reported as a
// service failure. See ADR 0053 and ADR 0025.
export const resolvePosDeviceDriver = ({
    override = posDeviceDriverOverride,
    bridgeEnabled = deviceBridgeEnabled
} = {}) => {
    const normalized = String(override || 'auto').trim().toLowerCase();
    const driverId = normalized === 'auto'
        ? (bridgeEnabled ? 'lan_escpos_bridge' : 'client_managed')
        : normalized;

    const factory = DRIVER_FACTORIES[driverId] || DRIVER_FACTORIES.client_managed;
    const driver = factory();

    assertPosDeviceDriverContract(driver);
    return driver;
};

export default resolvePosDeviceDriver;
