import { fetchPosDeviceStatus, printPosReceipt, printPosShiftSummary, printPosZReading, openPosDeviceDrawer } from '../../services/posService.js';
import { normalizeHardwareResult } from '../posHardwareContract.js';

const extractErrorMessage = (error, fallback) => (
    error?.response?.data?.message || error?.message || fallback
);

// Delegates printing/drawer to the backend, which in turn dispatches to the
// LAN device-bridge (apps/dgfy-api/device-bridge, ESC/POS USB printer). Only
// selected by the registry when the backend itself reports this driver as
// active for the terminal (GET /pos/device/status → driver.id ===
// 'lan_escpos_bridge') — see posHardwareRegistry.js. Never probed on its own.
export const lanBridgeDriver = {
    id: 'lan_escpos_bridge',
    label: 'LAN receipt printer bridge',
    async getStatus() {
        try {
            const status = await fetchPosDeviceStatus();
            return {
                available: status?.driver?.id === 'lan_escpos_bridge',
                printersDetected: Number(status?.bridge?.printersDetected || 0),
                raw: status
            };
        } catch {
            return { available: false, printersDetected: 0, raw: null };
        }
    },
    async printReceipt({ transactionId, terminalId, reason, idempotencyKey, copies, paperWidth } = {}) {
        try {
            const result = await printPosReceipt({
                idempotency_key: idempotencyKey,
                transaction_id: transactionId,
                terminal_id: terminalId || undefined,
                reason,
                copies,
                paper_width: paperWidth
            });
            return normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: result?.transaction?.invoice_number
                    ? `Print sent for ${result.transaction.invoice_number}.`
                    : 'Receipt print request sent.',
                raw: result
            });
        } catch (error) {
            return normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: extractErrorMessage(error, 'Failed to send receipt to printer.'),
                reasonCode: 'LAN_BRIDGE_PRINT_FAILED'
            });
        }
    },
    async printShiftSummary({ shiftId, terminalId, reason, idempotencyKey, copies, paperWidth } = {}) {
        try {
            const result = await printPosShiftSummary(shiftId, {
                idempotency_key: idempotencyKey,
                terminal_id: terminalId || undefined,
                reason,
                copies,
                paper_width: paperWidth
            });
            return normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: 'Shift sales summary print request sent.',
                raw: result
            });
        } catch (error) {
            return normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: extractErrorMessage(error, 'Failed to send shift sales summary to printer.'),
                reasonCode: 'LAN_BRIDGE_PRINT_FAILED'
            });
        }
    },
    async printZReading({ businessDate, terminalId, reason, idempotencyKey, copies, paperWidth } = {}) {
        try {
            const result = await printPosZReading(businessDate, {
                idempotency_key: idempotencyKey,
                terminal_id: terminalId || undefined,
                reason,
                copies,
                paper_width: paperWidth
            });
            return normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: 'Z-reading print request sent.',
                raw: result
            });
        } catch (error) {
            return normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: extractErrorMessage(error, 'Failed to send Z-reading to printer.'),
                reasonCode: 'LAN_BRIDGE_PRINT_FAILED'
            });
        }
    },
    async openDrawer({ shiftId, transactionId, terminalId, reason, idempotencyKey } = {}) {
        try {
            const result = await openPosDeviceDrawer({
                idempotency_key: idempotencyKey,
                shift_id: shiftId,
                transaction_id: transactionId || undefined,
                terminal_id: terminalId || undefined,
                reason
            });
            return normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: 'Cash drawer open request sent.',
                raw: result
            });
        } catch (error) {
            return normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: extractErrorMessage(error, 'Failed to open the cash drawer.'),
                reasonCode: 'LAN_BRIDGE_DRAWER_FAILED'
            });
        }
    }
    // No printOrderTicket: the LAN bridge has no kitchen-ticket concept today.
    // usePosHardware falls back to a NOT_SUPPORTED result when a driver omits it.
};

export default lanBridgeDriver;
