import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportPosDeviceClientResult = vi.fn();

vi.mock('../../../services/posService.js', () => ({
    reportPosDeviceClientResult: (...args) => reportPosDeviceClientResult(...args)
}));

let iminNativeDriver;

beforeEach(async () => {
    vi.resetModules();
    reportPosDeviceClientResult.mockReset();
    reportPosDeviceClientResult.mockResolvedValue({ success: true });
    delete globalThis.window;
    ({ iminNativeDriver } = await import('../iminNativeDriver.js'));
});

afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
});

const withBridge = (overrides = {}) => {
    globalThis.window = {
        iMinBridge: {
            isIminWrapper: () => true,
            ...overrides
        }
    };
};

describe('iminNativeDriver', () => {
    it('detect(): true when the printer service is connected', async () => {
        withBridge({
            getHardwareDiagnostics: () => ({ printer: { printerServiceConnected: true } })
        });

        await expect(iminNativeDriver.detect()).resolves.toBe(true);
    });

    it('detect(): false when neither the iMin service nor a paired Bluetooth printer is reachable', async () => {
        withBridge({
            getHardwareDiagnostics: () => ({
                printer: {
                    printerServiceConnected: false,
                    bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 }
                }
            })
        });

        await expect(iminNativeDriver.detect()).resolves.toBe(false);
    });

    it('detect(): fails open when the diagnostics call itself is unavailable on the bridge', async () => {
        withBridge();

        await expect(iminNativeDriver.detect()).resolves.toBe(true);
    });

    // Regression test for the bug this fix set closed: this method used to
    // report success:true purely because the bridge call was "handled",
    // ignoring result.result.success entirely -- the caught throw was the
    // ONLY way a failure could ever be reported before.
    it('printReceipt(): reports success:false and the short message when the bridge reports failure without throwing', async () => {
        withBridge({
            printReceipt: () => ({
                success: false,
                message: 'long native diagnostics dump',
                diagnostics: {
                    printerServiceConnected: false,
                    bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 }
                }
            })
        });

        const outcome = await iminNativeDriver.printReceipt({ transaction: { pos_transaction_id: 1, lines: [] } });

        expect(outcome.success).toBe(false);
        expect(outcome.reasonCode).toBe('NO_PRINTER_CONFIGURED');
        expect(outcome.message).toBe('No receipt printer is connected to this device.');
        // Still audited, with the real (failed) outcome.
        expect(reportPosDeviceClientResult).toHaveBeenCalledWith(
            expect.objectContaining({ result: expect.objectContaining({ success: false }) })
        );
    });

    it('printReceipt(): reports success:true when the bridge reports success', async () => {
        withBridge({
            printReceipt: () => ({ success: true, message: 'Receipt print command sent.' })
        });

        const outcome = await iminNativeDriver.printReceipt({ transaction: { pos_transaction_id: 1, lines: [] } });

        expect(outcome.success).toBe(true);
        expect(outcome.auditConfirmed).toBe(true);
    });

    it('printReceipt(): awaits the new non-blocking APK callback without using the synchronous bridge', async () => {
        const eventTarget = new EventTarget();
        const printReceipt = vi.fn(() => ({ success: true }));
        let completeNativePrint;
        const printReceiptWithLogoAsync = vi.fn((requestId) => {
            completeNativePrint = () => {
                const event = new Event('dgfy:imin-command-result');
                Object.defineProperty(event, 'detail', {
                    value: {
                        requestId,
                        result: JSON.stringify({ success: true, message: 'Receipt printed asynchronously.' })
                    }
                });
                eventTarget.dispatchEvent(event);
            };
            return { success: true, accepted: true };
        });
        eventTarget.iMinBridge = {
            isIminWrapper: () => true,
            printReceipt,
            printReceiptWithLogoAsync
        };
        globalThis.window = eventTarget;

        const outcomePromise = iminNativeDriver.printReceipt({
            transaction: { pos_transaction_id: 2, lines: [] }
        });
        await Promise.resolve();

        expect(printReceiptWithLogoAsync).toHaveBeenCalledTimes(1);
        expect(printReceipt).not.toHaveBeenCalled();
        expect(reportPosDeviceClientResult).not.toHaveBeenCalled();

        completeNativePrint();
        const outcome = await outcomePromise;

        expect(outcome).toEqual(expect.objectContaining({
            success: true,
            auditConfirmed: true,
            message: 'Receipt printed asynchronously.'
        }));
    });

    it('printReceipt(): returns an uncertain timeout without repeating the physical command', async () => {
        vi.useFakeTimers();
        const eventTarget = new EventTarget();
        const printReceipt = vi.fn(() => ({ success: true }));
        const printReceiptWithLogoAsync = vi.fn(() => ({ success: true, accepted: true }));
        eventTarget.iMinBridge = {
            isIminWrapper: () => true,
            printReceipt,
            printReceiptWithLogoAsync
        };
        globalThis.window = eventTarget;

        const outcomePromise = iminNativeDriver.printReceipt({
            transaction: { pos_transaction_id: 3, lines: [] }
        });
        await vi.advanceTimersByTimeAsync(30_000);
        const outcome = await outcomePromise;

        expect(printReceiptWithLogoAsync).toHaveBeenCalledTimes(1);
        expect(printReceipt).not.toHaveBeenCalled();
        expect(outcome.success).toBe(false);
        expect(outcome.reasonCode).toBe('IMIN_COMMAND_TIMEOUT');
        expect(reportPosDeviceClientResult).toHaveBeenCalledTimes(1);
    });

    it('printOrderTicket(): uses the generic asynchronous text-print callback when available', async () => {
        const eventTarget = new EventTarget();
        const printReceipt = vi.fn(() => ({ success: true }));
        const printReceiptAsync = vi.fn((requestId) => {
            queueMicrotask(() => {
                const event = new Event('dgfy:imin-command-result');
                Object.defineProperty(event, 'detail', {
                    value: {
                        requestId,
                        result: JSON.stringify({ success: true, message: 'Order ticket printed asynchronously.' })
                    }
                });
                eventTarget.dispatchEvent(event);
            });
            return { success: true, accepted: true };
        });
        eventTarget.iMinBridge = {
            isIminWrapper: () => true,
            printReceipt,
            printReceiptAsync
        };
        globalThis.window = eventTarget;

        const outcome = await iminNativeDriver.printOrderTicket({
            cart: [{ item_id: 1, item_name: 'Coffee', quantity: 1 }]
        });

        expect(outcome.success).toBe(true);
        expect(outcome.message).toBe('Order ticket printed asynchronously.');
        expect(printReceiptAsync).toHaveBeenCalledTimes(1);
        expect(printReceipt).not.toHaveBeenCalled();
    });

    it('printShiftSummary(): prints through the supported text command and reports the real result', async () => {
        withBridge({
            printReceipt: () => ({ success: false, message: 'Printer paper is unavailable.' })
        });

        const outcome = await iminNativeDriver.printShiftSummary({
            shiftSummary: {},
            shiftId: 12,
            terminalId: 'COUNTER-01'
        });

        expect(outcome.success).toBe(false);
        expect(outcome.reasonCode).toBe('IMIN_PRINT_FAILED');
        expect(reportPosDeviceClientResult).toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'print_shift_summary' })
        );
    });

    it('printReceipt(): records both receipt and drawer audits for a cash sale with an active shift', async () => {
        const printReceipt = vi.fn(() => ({ success: true, message: 'Receipt print command sent.' }));
        withBridge({ printReceipt });

        const outcome = await iminNativeDriver.printReceipt({
            transaction: { pos_transaction_id: 41, lines: [] },
            transactionId: 41,
            shiftId: 12,
            terminalId: 'COUNTER-01',
            openDrawerAfterPrint: true
        });

        expect(printReceipt).toHaveBeenCalledWith(expect.any(String), true);
        expect(reportPosDeviceClientResult).toHaveBeenCalledTimes(2);
        expect(reportPosDeviceClientResult).toHaveBeenNthCalledWith(1, expect.objectContaining({
            operation: 'print_receipt',
            transactionId: 41
        }));
        expect(reportPosDeviceClientResult).toHaveBeenNthCalledWith(2, expect.objectContaining({
            operation: 'open_drawer',
            shiftId: 12,
            transactionId: 41
        }));
        expect(outcome).toEqual(expect.objectContaining({ success: true, auditConfirmed: true }));
    });

    it('printReceipt(): preserves physical success and flags an unconfirmed backend audit', async () => {
        withBridge({
            printReceipt: () => ({ success: true, message: 'Receipt print command sent.' })
        });
        reportPosDeviceClientResult.mockRejectedValue(new Error('backend unavailable'));

        const outcome = await iminNativeDriver.printReceipt({ transaction: { pos_transaction_id: 1, lines: [] } });

        expect(outcome.success).toBe(true);
        expect(outcome.auditConfirmed).toBe(false);
        expect(outcome.reasonCode).toBe('CLIENT_AUDIT_UNCONFIRMED');
    });

    it('openDrawer(): refuses to pulse without an active shift audit context', async () => {
        const openCashDrawer = vi.fn(() => ({ success: true }));
        withBridge({ openCashDrawer });

        const outcome = await iminNativeDriver.openDrawer({ terminalId: 'COUNTER-01' });

        expect(outcome.success).toBe(false);
        expect(outcome.reasonCode).toBe('SHIFT_REQUIRED');
        expect(outcome.auditConfirmed).toBe(false);
        expect(openCashDrawer).not.toHaveBeenCalled();
    });
});
