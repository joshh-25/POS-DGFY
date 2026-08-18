import {
    printReceiptWithIminBridge,
    printShiftSummaryWithIminBridge,
    printZReadingWithIminBridge,
    printOrderWithIminBridge,
    openDrawerWithIminBridge,
    getIminHardwareDiagnostics
} from '../../utils/iminHardwareBridge.js';
import { reportPosDeviceClientResult } from '../../services/posService.js';
import { emitPosHardwareMessage } from '../../utils/posHardwareMessageBus.js';
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

const createClientAuditIdempotencyKey = (operation, providedKey = '') => {
    const normalizedProvidedKey = String(providedKey || '').trim();
    if (normalizedProvidedKey) return normalizedProvidedKey;
    const randomPart = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `pos-${operation}-${randomPart}`.slice(0, 120);
};

const attachClientAuditConfirmation = async ({ outcome, reports = [] }) => {
    const results = await Promise.allSettled(
        reports.map((report) => reportPosDeviceClientResult(report))
    );
    const auditConfirmed = results.every((result) => result.status === 'fulfilled');
    if (!auditConfirmed) {
        emitPosHardwareMessage({
            title: 'POS hardware audit not confirmed',
            message: 'The physical action finished, but its backend audit could not be confirmed. Keep the printed evidence and reconnect before retrying.',
            tone: 'warning',
            source: 'POS hardware'
        });
    }
    return normalizeHardwareResult({
        handled: outcome.handled,
        success: outcome.success,
        driverId: outcome.driverId,
        message: outcome.message,
        reasonCode: !auditConfirmed && outcome.success
            ? 'CLIENT_AUDIT_UNCONFIRMED'
            : outcome.reasonCode,
        auditConfirmed,
        raw: {
            hardware: outcome.raw,
            audit_results: results.map((result) => result.status)
        }
    });
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
        transactionId,
        businessSettings,
        receiptContract,
        openDrawerAfterPrint,
        shiftId,
        terminalId,
        reason,
        idempotencyKey
    } = {}) {
        let outcome;
        try {
            const result = printReceiptWithIminBridge({
                transaction,
                businessSettings,
                receiptContract,
                openDrawerAfterPrint: Boolean(openDrawerAfterPrint && shiftId)
            });
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

        // The physical action is never repeated when audit confirmation fails.
        // The awaited result below preserves the hardware outcome and reports
        // audit confirmation separately so the cashier can retain evidence.
        const receiptAuditKey = createClientAuditIdempotencyKey('receipt-audit', idempotencyKey);
        const reports = [{
            operation: 'print_receipt',
            transactionId: transactionId || transaction?.pos_transaction_id,
            terminalId,
            reason,
            idempotencyKey: receiptAuditKey,
            driverId: this.id,
            result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
        }];
        if (openDrawerAfterPrint && shiftId) {
            reports.push({
                operation: 'open_drawer',
                shiftId,
                transactionId: transactionId || transaction?.pos_transaction_id,
                terminalId,
                reason: `${reason || 'receipt_print'}_drawer`,
                idempotencyKey: createClientAuditIdempotencyKey('receipt-drawer-audit'),
                driverId: this.id,
                result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
            });
        }

        return attachClientAuditConfirmation({ outcome, reports });
    },
    async printOrderTicket({ cart, terminalId, orderMethod, fnbContext, orderNotes, billRequest, billTotal } = {}) {
        try {
            const result = printOrderWithIminBridge({ cart, terminalId, orderMethod, fnbContext, orderNotes, billRequest, billTotal });
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
                message: error?.message || (billRequest ? 'Failed to print the bill request on the iMin printer.' : 'Failed to print the order ticket on the iMin printer.'),
                reasonCode: 'IMIN_PRINT_FAILED'
            });
        }
    },
    async printShiftSummary({ shiftSummary, businessSettings, shiftId, terminalId, reason, idempotencyKey } = {}) {
        let outcome;
        try {
            const result = printShiftSummaryWithIminBridge({ shiftSummary, businessSettings });
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
                message: error?.message || 'Failed to print the shift sales summary on the iMin printer.',
                reasonCode: 'IMIN_PRINT_FAILED'
            });
        }

        return attachClientAuditConfirmation({
            outcome,
            reports: [{
            operation: 'print_shift_summary',
            shiftId,
            terminalId,
            reason,
            idempotencyKey: createClientAuditIdempotencyKey('shift-summary-audit', idempotencyKey),
            driverId: this.id,
            result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
            }]
        });
    },
    async printZReading({ zReading, businessSettings, businessDate, locationId, terminalId, reason, idempotencyKey } = {}) {
        let outcome;
        try {
            const result = printZReadingWithIminBridge({ zReading, businessSettings });
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
                message: error?.message || 'Failed to print the Z-reading on the iMin printer.',
                reasonCode: 'IMIN_PRINT_FAILED'
            });
        }

        return attachClientAuditConfirmation({
            outcome,
            reports: [{
            operation: 'print_z_reading',
            businessDate,
            locationId,
            terminalId,
            reason,
            idempotencyKey: createClientAuditIdempotencyKey('z-reading-audit', idempotencyKey),
            driverId: this.id,
            result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
            }]
        });
    },
    async openDrawer({ shiftId, transactionId, terminalId, reason, idempotencyKey, drawerAuthorizationToken } = {}) {
        if (!shiftId) {
            return normalizeHardwareResult({
                success: false,
                driverId: this.id,
                message: 'Open a shift before opening the cash drawer.',
                reasonCode: 'SHIFT_REQUIRED',
                auditConfirmed: false
            });
        }

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

        // See printReceipt above — ADR 0053 requires drawer opens to be
        // authorized and auditable regardless of which driver pulsed them.
        return attachClientAuditConfirmation({
            outcome,
            reports: [{
                operation: 'open_drawer',
                shiftId,
                transactionId,
                terminalId,
                reason,
                idempotencyKey: createClientAuditIdempotencyKey('drawer-audit', idempotencyKey),
                drawerAuthorizationToken,
                driverId: this.id,
                result: { success: outcome.success, message: outcome.message, reason_code: outcome.reasonCode }
            }]
        });
    }
};

export default iminNativeDriver;
