// Shared contract every POS hardware driver in the registry (frontend/src/features/pos/hardware/)
// conforms to. Terminal components must depend on this shape and on usePosHardware,
// never on a specific driver id — that keeps hardware genuinely pluggable
// (ADR 0053). Reachable from a browser tab: HTTPS bridge, iMin native WebView
// bridge, and (later) Web Bluetooth ESC/POS.

export const POS_HARDWARE_CAPABILITIES = Object.freeze({
    PRINT_RECEIPT: 'print_receipt',
    PRINT_SHIFT_SUMMARY: 'print_shift_summary',
    PRINT_Z_READING: 'print_z_reading',
    OPEN_DRAWER: 'open_drawer',
    PRINT_ORDER_TICKET: 'print_order_ticket'
});

// Every driver method (printReceipt/openDrawer/printOrderTicket) resolves to
// this shape — it never throws for "nothing happened", only for genuine
// programmer errors. `handled: false` means "this driver did not attempt the
// action at all" (used internally during detection); once a driver is
// resolved, `handled` is always true and `success` tells the real story.
export const normalizeHardwareResult = ({
    handled = true,
    success = false,
    driverId = null,
    message = null,
    reasonCode = null,
    raw = null,
    auditConfirmed = null
} = {}) => ({ handled, success, driverId, message, reasonCode, raw, auditConfirmed });

export const NO_PRINTER_REASON_CODE = 'NO_PRINTER_CONFIGURED';

export const noPrinterResult = (driverId, message) => normalizeHardwareResult({
    handled: true,
    success: false,
    driverId,
    message: message || 'No printer is configured for this terminal.',
    reasonCode: NO_PRINTER_REASON_CODE
});
