// Pure predicate over the iMin hardware-diagnostics payload (the `diagnostics`
// object DrawerController.diagnosticsJson() / BluetoothEscPosController
// .diagnosticsJson() produce on the Android side, reached here via
// getIminHardwareDiagnostics().result.diagnostics): is there an actually
// reachable receipt printer, either the iMin printer service or a paired
// Bluetooth ESC/POS device? "Non-iMin hardware" must not mean "no printer" --
// a paired Bluetooth printer still counts.
//
// Fails OPEN on anything short of a clear, well-formed "no printer" answer --
// missing, unparseable, or partial diagnostics all resolve to available:true.
// A probe hiccup must never disable Print on a real iMin terminal.

export const NO_PRINTER_REASON_CODE = 'NO_PRINTER_CONFIGURED';

const availableResult = () => ({ available: true, reasonCode: null, message: null });

const unavailableResult = () => ({
    available: false,
    reasonCode: NO_PRINTER_REASON_CODE,
    message: 'No printer detected on this device.'
});

export const resolveIminPrinterAvailability = (diagnostics) => {
    if (!diagnostics || typeof diagnostics !== 'object') {
        // No diagnostics at all -- can't tell, fail open.
        return availableResult();
    }

    if (typeof diagnostics.printerServiceConnected !== 'boolean') {
        // Unexpected/partial shape -- can't tell, fail open.
        return availableResult();
    }

    if (diagnostics.printerServiceConnected) {
        return availableResult();
    }

    const bluetooth = diagnostics.bluetoothEscPos;
    if (!bluetooth || typeof bluetooth !== 'object') {
        // No Bluetooth diagnostics reported -- can't rule out a paired
        // printer, fail open.
        return availableResult();
    }

    const pairedCount = Number(bluetooth.pairedCount);
    const hasPairedPrinter = bluetooth.permissionGranted === true
        && bluetooth.adapterEnabled === true
        && Number.isFinite(pairedCount)
        && pairedCount > 0;

    if (hasPairedPrinter) {
        return availableResult();
    }

    return unavailableResult();
};

export default resolveIminPrinterAvailability;
