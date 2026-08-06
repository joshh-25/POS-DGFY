import {
    printReceiptWithIminBridge,
    printOrderWithIminBridge,
    openDrawerWithIminBridge,
    getIminHardwareDiagnostics
} from '../../utils/iminHardwareBridge.js';
import { reportPosDeviceClientResult } from '../../services/posService.js';
import { normalizeHardwareResult } from '../posHardwareContract.js';
import { resolveIminPrinterAvailability } from '../iminPrinterAvailability.js';

const isIminWrapper = () => {
    if (typeof window === 'undefined' || !window.iMinBridge) return false;
    if (typeof window.iMinBridge.isIminWrapper !== 'function') return false;
    try {
        return Boolean(window.iMinBridge.isIminWrapper());
    } catch {
        return false;
    }
};

// Silent (no on-screen announcement) probe of the bridge's hardware
// diagnostics, resolved through resolveIminPrinterAvailability's fail-open
// predicate. Shared by detect() (gates whether this driver is even offered)
// and getStatus()/refresh() (re-probed on demand, e.g. after pairing a
// Bluetooth printer). Returns both the availability verdict and the raw
// diagnostics call so callers don't have to hit the bridge twice.
const probeAvailability = () => {
    const diagnostics = getIminHardwareDiagnostics({ silent: true });
    if (!diagnostics.handled) {
        // No bridge at all -- detect() already gates on isIminWrapper(), so
        // this only means the diagnostics call itself failed. Fail open.
        return { diagnostics, availability: { available: true, reasonCode: null, message: null } };
    }
    return { diagnostics, availability: resolveIminPrinterAvailability(diagnostics.result?.diagnostics) };
};

// The native Android/iMin WebView bridge. Detection is a synchronous, local
// check (window.iMinBridge) followed by a silent hardware-diagnostics probe
// — no network call either way, so this driver can always be probed first
// without cost. A bridge with no reachable printer (no iMin service, no
// paired Bluetooth device) does NOT claim the terminal; resolution falls
// through to the next driver (ordinarily noopDriver), so Print controls read
// isPrinterAvailable: false instead of offering a print that's guaranteed to
// fail.
export const iminNativeDriver = {
    id: 'imin_native',
    label: 'iMin built-in printer',
    async detect() {
        if (!isIminWrapper()) return false;
        return probeAvailability().availability.available;
    },
    async getStatus() {
        const { diagnostics, availability } = probeAvailability();
        return {
            available: diagnostics.handled && diagnostics.result?.success !== false && availability.available,
            printersDetected: availability.available ? 1 : 0,
            reasonCode: availability.reasonCode,
            message: availability.message,
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
                success: result.result?.success !== false,
                driverId: this.id,
                message: result.result?.message,
                reasonCode: result.result?.reasonCode || null,
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
                success: result.result?.success !== false,
                driverId: this.id,
                message: result.result?.message,
                reasonCode: result.result?.reasonCode || null,
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
                success: result.result?.success !== false,
                driverId: this.id,
                message: result.result?.message,
                reasonCode: result.result?.reasonCode || null,
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
