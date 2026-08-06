import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emitPosHardwareMessage = vi.fn();

vi.mock('../posHardwareMessageBus.js', () => ({
    emitPosHardwareMessage: (...args) => emitPosHardwareMessage(...args)
}));

let printReceiptWithIminBridge;
let printOrderWithIminBridge;
let openDrawerWithIminBridge;

beforeEach(async () => {
    vi.resetModules();
    emitPosHardwareMessage.mockReset();
    ({ printReceiptWithIminBridge, printOrderWithIminBridge, openDrawerWithIminBridge } =
        await import('../iminHardwareBridge.js'));
});

afterEach(() => {
    delete globalThis.window;
});

const baseTransaction = () => ({ pos_transaction_id: 1, lines: [], created_at: new Date().toISOString() });

const bridgeWith = (methodName, response) => {
    globalThis.window = {
        iMinBridge: {
            isIminWrapper: () => true,
            [methodName]: () => response
        }
    };
};

describe('iMin bridge print/order/drawer failures', () => {
    it('printReceipt: does not throw, returns one short message, and emits no hardware message', () => {
        bridgeWith('printReceipt', {
            success: false,
            // The long, native diagnostics-dump message DrawerController used
            // to return before this fix.
            message: 'Bluetooth receipt failed: No paired Bluetooth devices found | bindRequested=false, serviceConnected=false, lastConnection=bind_request_failed, errorClass=PrinterServiceDisconnected',
            diagnostics: {
                printerServiceConnected: false,
                bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 }
            }
        });

        const outcome = printReceiptWithIminBridge({ transaction: baseTransaction() });

        expect(outcome.handled).toBe(true);
        expect(outcome.result.success).toBe(false);
        expect(outcome.result.message).toBe('No receipt printer is connected to this device.');
        expect(outcome.result.reasonCode).toBe('NO_PRINTER_CONFIGURED');
        expect(outcome.result.diagnostics).toEqual({
            printerServiceConnected: false,
            bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 }
        });
        // This used to fire an error toast here AND the caller
        // (iminNativeDriver) fired a second one from a thrown Error this
        // function no longer raises -- exactly the "two error banners" bug.
        expect(emitPosHardwareMessage).not.toHaveBeenCalled();
    });

    it('printReceipt: emits exactly one success message on success', () => {
        bridgeWith('printReceipt', { success: true, message: 'Receipt print command sent.' });

        const outcome = printReceiptWithIminBridge({ transaction: baseTransaction() });

        expect(outcome.result.success).toBe(true);
        expect(emitPosHardwareMessage).toHaveBeenCalledTimes(1);
        expect(emitPosHardwareMessage.mock.calls[0][0].tone).toBe('success');
    });

    it('printOrderTicket: does not throw and emits no hardware message on failure', () => {
        bridgeWith('printReceipt', {
            success: false,
            message: 'Failed | pairedCount=0, lastAttempted=',
            diagnostics: { printerServiceConnected: false, bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 } }
        });

        const outcome = printOrderWithIminBridge({ cart: [] });

        expect(outcome.result.success).toBe(false);
        expect(outcome.result.message).toBe('No receipt printer is connected to this device.');
        expect(emitPosHardwareMessage).not.toHaveBeenCalled();
    });

    it('openDrawer: does not throw and emits no hardware message on failure', () => {
        bridgeWith('openCashDrawer', {
            success: false,
            message: 'No cash drawer is connected to this device.',
            diagnostics: { printerServiceConnected: false, bluetoothEscPos: { permissionGranted: true, adapterEnabled: true, pairedCount: 0 } }
        });

        const outcome = openDrawerWithIminBridge();

        expect(outcome.result.success).toBe(false);
        expect(emitPosHardwareMessage).not.toHaveBeenCalled();
    });
});
