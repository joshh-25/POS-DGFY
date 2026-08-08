// A POS device driver is the seam between the pos module use cases and however
// receipt printing / cash drawer pulsing is actually carried out for a given
// terminal. Today that is the LAN device-bridge (backend/device-bridge), but the
// same shape also covers "no physical driver is configured" and any future
// server-dispatched driver (e.g. a network/IP printer). Client-executed drivers
// (iMin native, Web Bluetooth) never implement this contract — they report their
// outcome back through the print/drawer use cases via `client_driver_id`
// instead, see posDeviceUseCases.js.
const REQUIRED_METHODS = [
    'getStatus',
    'printReceipt',
    'printShiftSummary',
    'printZReading',
    'openDrawer'
];

export const assertPosDeviceDriverContract = (driver) => {
    if (!driver || typeof driver !== 'object') {
        throw new Error('posDeviceDriver must be an object');
    }

    if (typeof driver.id !== 'string' || !driver.id.trim()) {
        throw new Error('posDeviceDriver must declare a non-empty string id');
    }

    for (const methodName of REQUIRED_METHODS) {
        if (typeof driver[methodName] !== 'function') {
            throw new Error(`posDeviceDriver "${driver.id}" is missing required method: ${methodName}`);
        }
    }
};

export default assertPosDeviceDriverContract;
