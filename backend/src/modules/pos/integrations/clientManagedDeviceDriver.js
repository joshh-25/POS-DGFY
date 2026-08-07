import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

// The default driver when no LAN device-bridge is configured. Hardware, if any,
// is owned entirely by the client runtime (iMin native bridge, a future Web
// Bluetooth ESC/POS driver, etc.) — the backend never dispatches a print/drawer
// job itself. Clients that already handled printing/opening locally report the
// outcome back through `client_driver_id` on the print-receipt / open-drawer
// requests (see posDeviceUseCases.js), which skips this driver's printReceipt/
// openDrawer entirely and just records the audit.
//
// Reaching printReceipt/openDrawer on this driver means a client asked the
// backend to physically dispatch a job with no client driver and no server
// driver configured — a genuine "nothing can print this" state, not the
// absence of a status probe.
export const clientManagedDeviceDriver = {
    id: 'client_managed',
    async getStatus() {
        return {
            ok: true,
            service: 'client_managed',
            mode: 'client_managed',
            authRequired: false,
            printerStrategy: 'client_managed',
            configuredPrinter: null,
            cashDrawerPin: null,
            printersDetected: 0,
            printers: [],
            timestamp: new Date().toISOString()
        };
    },
    async printReceipt() {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'No printer is configured for this terminal. The receipt remains available for on-screen preview.',
            { statusCode: 503, details: { reason_code: 'NO_PRINTER_CONFIGURED' } }
        );
    },
    async printShiftSummary() {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'No printer is configured for this terminal. The shift sales summary remains available for on-screen preview.',
            { statusCode: 503, details: { reason_code: 'NO_PRINTER_CONFIGURED' } }
        );
    },
    async openDrawer() {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'No cash drawer is configured for this terminal.',
            { statusCode: 503, details: { reason_code: 'NO_PRINTER_CONFIGURED' } }
        );
    }
};

export default clientManagedDeviceDriver;
