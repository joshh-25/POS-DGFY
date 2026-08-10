import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportPosDeviceClientResult = vi.fn();

vi.mock('../../../services/posService.js', () => ({
    reportPosDeviceClientResult: (...args) => reportPosDeviceClientResult(...args)
}));

let iminNativeDriver;

beforeEach(async () => {
    vi.resetModules();
    reportPosDeviceClientResult.mockReset();
    delete globalThis.window;
    ({ iminNativeDriver } = await import('../iminNativeDriver.js'));
});

afterEach(() => {
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
    });
});
