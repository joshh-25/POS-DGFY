import { noPrinterResult } from '../posHardwareContract.js';

// Terminal fallback: last in the chain, always resolvable, never throws, never
// makes a network call. The whole point of ADR 0053 — a terminal with no
// physical hardware is a fully supported, ordinary state, not an error.
// Checkout and the on-screen receipt preview work exactly the same either way.
export const noopDriver = {
    id: 'none',
    label: 'No printer configured',
    async getStatus() {
        return { available: false, printersDetected: 0, raw: null };
    },
    async printReceipt() {
        return noPrinterResult(this.id, 'No printer is configured for this terminal. The receipt is available for on-screen preview.');
    },
    async printShiftSummary() {
        return noPrinterResult(this.id, 'No printer is configured for this terminal. The shift sales summary is available for on-screen preview.');
    },
    async printZReading() {
        return noPrinterResult(this.id, 'No printer is configured for this terminal. The Z-reading is available for on-screen preview.');
    },
    async printOrderTicket() {
        return noPrinterResult(this.id, 'No order-ticket printer is configured for this terminal.');
    },
    async openDrawer() {
        return noPrinterResult(this.id, 'No cash drawer is configured for this terminal.');
    }
};

export default noopDriver;
