// Wraps the existing LAN device-bridge client (apps/dgfy-api/src/services/posDeviceBridgeService.js)
// as a posDeviceDriver. This is the only driver that talks to physical hardware
// from the backend today — ESC/POS USB printer + RJ11/RJ12 drawer, per ADR 0025.
// Behavior is unchanged from before the driver abstraction existed; this is a
// pure rename of the seam, not a behavior change.
export const buildEscposBridgeDeviceDriver = ({ bridgeService }) => {
    if (!bridgeService || typeof bridgeService.getStatus !== 'function') {
        throw new Error('escposBridgeDeviceDriver requires a bridgeService with getStatus/printReceipt/printShiftSummary/openDrawer');
    }

    return {
        id: 'lan_escpos_bridge',
        async getStatus() {
            return bridgeService.getStatus();
        },
        async printReceipt(payload) {
            return bridgeService.printReceipt(payload);
        },
        async printShiftSummary(payload) {
            return bridgeService.printShiftSummary(payload);
        },
        async openDrawer(payload) {
            return bridgeService.openDrawer(payload);
        }
    };
};

export default buildEscposBridgeDeviceDriver;
