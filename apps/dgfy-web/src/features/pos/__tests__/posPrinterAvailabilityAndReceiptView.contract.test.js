import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

// Source-contract style, matching posWeightEntry.contract.test.js and its
// neighbors -- POSCheckoutTerminal is large enough that a full render setup
// for every terminal state (printer available/unavailable, receipt vs order
// preview) is heavier than the codebase's existing convention for this file.
describe('POS printer availability and post-checkout receipt view', () => {
    it('gates every Print control on posHardware.isPrinterAvailable, not just posActionsBlocked', () => {
        const source = read('../components/POSCheckoutTerminal.jsx');
        const currentSaleActionsSource = read('../components/PosCurrentSaleActions.jsx');
        expect(source).toContain('const isPrinterAvailable = posHardware.isPrinterAvailable;');
        // Current-sale Print Order, checkout confirmation Print Order, and the
        // post-checkout preview's Print button all read the same flag.
        expect(source).toContain('printOrderDisabled={posActionsBlocked || safeCart.length === 0 || !isPrinterAvailable}');
        expect(currentSaleActionsSource).toContain('disabled={printOrderDisabled}');
        expect(source).toContain('disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isPrinterAvailable}');
        expect(source).toContain('disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync || !isPrinterAvailable}');
    });

    it('offers a Recheck printer action when no printer is available, wired to posHardware.refresh()', () => {
        const source = read('../components/POSCheckoutTerminal.jsx');

        expect(source).toContain('No printer detected on this device.');
        expect(source).toContain('onClick={() => posHardware.refresh()}');
        expect(source).toContain('Recheck printer');
    });

    it('lets the cashier toggle between Order Preview and the receipt render after checkout', () => {
        const source = read('../components/POSCheckoutTerminal.jsx');

        expect(source).toContain("receiptPreviewSource === 'order_preview' ? 'receipt_preview' : 'order_preview'");
        expect(source).toContain("{receiptPreviewSource === 'order_preview' ? 'View Receipt' : 'Back to Order'}");
        // Resets on close so the next checkout opens on Order Preview again.
        expect(source).toContain("setReceiptPreviewSource('receipt_preview');");
    });
});
