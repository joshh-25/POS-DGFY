import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

// Hardware is administratively turned off for this deployment (POS_DEVICE_DRIVER=none).
// Distinct from clientManagedDeviceDriver so operators can tell "no driver
// selected yet" apart from "hardware is intentionally disabled" in status responses.
export const disabledDeviceDriver = {
    id: 'none',
    async getStatus() {
        return {
            ok: true,
            service: 'disabled',
            mode: 'disabled',
            enabled: false,
            authRequired: false,
            printerStrategy: 'none',
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
            'POS hardware is disabled for this deployment.',
            { statusCode: 503, details: { reason_code: 'POS_HARDWARE_DISABLED' } }
        );
    },
    async openDrawer() {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'POS hardware is disabled for this deployment.',
            { statusCode: 503, details: { reason_code: 'POS_HARDWARE_DISABLED' } }
        );
    }
};

export default disabledDeviceDriver;
