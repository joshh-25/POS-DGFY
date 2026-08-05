import {
    printReceiptWithIminBridge,
    printOrderWithIminBridge,
    openDrawerWithIminBridge,
    getIminHardwareDiagnostics
} from '../../utils/iminHardwareBridge.js';
import { reportPosDeviceClientResult } from '../../services/posService.js';
import { normalizeHardwareResult } from '../posHardwareContract.js';

const isIminWrapper = () => {
    if (typeof window === 'undefined' || !window.iMinBridge) return false;
    if (typeof window.iMinBridge.isIminWrapper !== 'function') return false;
    try {
        return Boolean(window.iMinBridge.isIminWrapper());
    } catch {
        return false;
    }
};

// The native Android/iMin WebView bridge. Detection is a pure, synchronous,
// local check (window.iMinBridge) — no network call, so this driver can
// always be probed first without cost.
export const iminNativeDriver = {
    id: 'imin_native',
    label: 'iMin built-in printer',
    async detect() {
        return isIminWrapper();
    },
    async getStatus() {
        const diagnostics = getIminHardwareDiagnostics();
        return {
            available: diagnostics.handled && diagnostics.result?.success !== false,
            printersDetected: diagnostics.handled ? 1 : 0,
            raw: diagnostics.result || null
        };
    },
    async printReceipt({
        transaction,
        businessSettings,
        receiptContract,
        openDrawerAfterPrint,
        terminalId,
        reason,
        idempotencyKey
    } = {}) {
        let outcome;
        try {
            const result = printReceiptWithIminBridge({ transaction, businessSettings, receiptContract, openDrawerAfterPrint });
            if (!result.handled) return normalizeHardwareResult({ handled: false, driverId: this.id });
            outcome = normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: result.result?.message,
                raw: result.result
            });
        } catch (error) {
            outcome = normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: error?.message || 'Failed to print on the iMin printer.',
                reasonCode: 'IMIN_PRINT_FAILED'
            });
        }

        // Printing already happened (or failed) physically and was already
        // surfaced to the cashier above. Report it to the backend for the
        // audit trail — best-effort, never blocks or re-surfaces as an error.
        // This closes a real gap: iMin prints were previously never audited.
        reportPosDeviceClientResult({
            operation: 'print_receipt',
            transactionId: transaction?.pos_transaction_id,
            terminalId,
            reason,
            idempotencyKey,
            driverId: this.id,
            result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
        });

        return outcome;
    },
    async printOrderTicket({ cart, terminalId, orderMethod, fnbContext } = {}) {
        try {
            const result = printOrderWithIminBridge({ cart, terminalId, orderMethod, fnbContext });
            if (!result.handled) return normalizeHardwareResult({ handled: false, driverId: this.id });
            return normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: result.result?.message,
                raw: result.result
            });
        } catch (error) {
            return normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: error?.message || 'Failed to print the order ticket on the iMin printer.',
                reasonCode: 'IMIN_PRINT_FAILED'
            });
        }
    },
    async openDrawer({ shiftId, transactionId, terminalId, reason, idempotencyKey } = {}) {
        let outcome;
        try {
            const result = openDrawerWithIminBridge();
            if (!result.handled) return normalizeHardwareResult({ handled: false, driverId: this.id });
            outcome = normalizeHardwareResult({
                success: true,
                driverId: this.id,
                message: result.result?.message,
                raw: result.result
            });
        } catch (error) {
            outcome = normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: error?.message || 'Failed to open the iMin cash drawer.',
                reasonCode: 'IMIN_DRAWER_FAILED'
            });
        }

        // See printReceipt above — ADR 0025 requires drawer opens to be
        // authorized and auditable regardless of which driver pulsed them.
        if (shiftId) {
            reportPosDeviceClientResult({
                operation: 'open_drawer',
                shiftId,
                transactionId,
                terminalId,
                reason,
                idempotencyKey,
                driverId: this.id,
                result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
            });
        }

        return outcome;
    }
};

export default iminNativeDriver;
