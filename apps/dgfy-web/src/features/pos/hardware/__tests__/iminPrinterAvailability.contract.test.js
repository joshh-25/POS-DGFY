import { describe, expect, it } from 'vitest';
import { NO_PRINTER_REASON_CODE, resolveIminPrinterAvailability } from '../iminPrinterAvailability.js';

const bluetooth = (overrides = {}) => ({
    permissionGranted: true,
    adapterEnabled: true,
    pairedCount: 1,
    ...overrides
});

describe('resolveIminPrinterAvailability', () => {
    it('is available when the iMin printer service itself is connected', () => {
        const result = resolveIminPrinterAvailability({ printerServiceConnected: true, bluetoothEscPos: bluetooth({ pairedCount: 0 }) });
        expect(result.available).toBe(true);
        expect(result.reasonCode).toBeNull();
    });

    it('is available on a non-iMin device with a paired Bluetooth printer', () => {
        const result = resolveIminPrinterAvailability({
            printerServiceConnected: false,
            bluetoothEscPos: bluetooth({ pairedCount: 1 })
        });
        expect(result.available).toBe(true);
    });

    it('is unavailable when neither the iMin service nor any paired Bluetooth device is reachable', () => {
        const result = resolveIminPrinterAvailability({
            printerServiceConnected: false,
            bluetoothEscPos: bluetooth({ pairedCount: 0 })
        });
        expect(result.available).toBe(false);
        expect(result.reasonCode).toBe(NO_PRINTER_REASON_CODE);
        expect(result.message).toBeTruthy();
    });

    it('is unavailable when Bluetooth is off, even with paired devices remembered', () => {
        const result = resolveIminPrinterAvailability({
            printerServiceConnected: false,
            bluetoothEscPos: bluetooth({ adapterEnabled: false, pairedCount: 2 })
        });
        expect(result.available).toBe(false);
    });

    it('is unavailable when Bluetooth permission has not been granted', () => {
        const result = resolveIminPrinterAvailability({
            printerServiceConnected: false,
            bluetoothEscPos: bluetooth({ permissionGranted: false, pairedCount: 2 })
        });
        expect(result.available).toBe(false);
    });

    it('fails open when diagnostics are missing entirely', () => {
        expect(resolveIminPrinterAvailability(null).available).toBe(true);
        expect(resolveIminPrinterAvailability(undefined).available).toBe(true);
        expect(resolveIminPrinterAvailability('not an object').available).toBe(true);
    });

    it('fails open when printerServiceConnected is absent from an otherwise-unexpected payload', () => {
        const result = resolveIminPrinterAvailability({ someOtherField: true });
        expect(result.available).toBe(true);
    });

    it('fails open when printerServiceConnected is false but Bluetooth diagnostics are missing entirely', () => {
        const result = resolveIminPrinterAvailability({ printerServiceConnected: false });
        expect(result.available).toBe(true);
    });
});
