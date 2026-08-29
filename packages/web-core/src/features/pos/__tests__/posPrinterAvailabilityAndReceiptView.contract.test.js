import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const readCheckoutRenderSource = () => [
    read('../components/POSCheckoutTerminal.jsx'),
    read('../components/POSCheckoutTerminalView.jsx'),
    read('../components/POSCheckoutConfirmDialog.jsx'),
    read('../components/POSCheckoutTerminalReceiptDialogs.jsx'),
].join('\n');

// Source-contract style, matching posWeightEntry.contract.test.js and its
// neighbors -- POSCheckoutTerminal is large enough that a full render setup
// for every terminal state (printer available/unavailable, receipt vs order
// preview) is heavier than the codebase's existing convention for this file.
describe('POS printer availability and post-checkout receipt view', () => {
    it('gates receipt and order-ticket actions on their distinct hardware capabilities', () => {
        const source = readCheckoutRenderSource();
        const currentSaleActionsSource = read('../components/PosCurrentSaleActions.jsx');
        const skupervisorSource = read('../components/SkupervisorPOSCheckoutTerminal.jsx');
        expect(source).toContain('const isPrinterAvailable = posHardware.isPrinterAvailable;');
        expect(source).toContain('const isOrderPrinterAvailable = posHardware.isOrderPrinterAvailable;');
        expect(source).toContain('printOrderDisabled={posActionsBlocked || safeCart.length === 0 || !isOrderPrinterAvailable}');
        expect(currentSaleActionsSource).toContain('disabled={printOrderDisabled}');
        expect(source).toContain('disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isOrderPrinterAvailable}');
        expect(source).toContain('disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync || !isPrinterAvailable}');
        expect(source).toContain('disabled={posActionsBlocked || !lastReceipt || !isOrderPrinterAvailable}');
        expect(skupervisorSource).toContain('disabled={posActionsBlocked || cart.length === 0 || !isOrderPrinterAvailable}');
    });

    it('offers a Recheck printer action when no printer is available, wired to posHardware.refresh()', () => {
        const source = readCheckoutRenderSource();

        expect(source).toContain('No printer detected on this device.');
        expect(source).toContain('onClick={() => posHardware.refresh()}');
        expect(source).toContain('Recheck printer');
    });

    it('lets the cashier toggle between Order Preview and the receipt render after checkout', () => {
        const source = readCheckoutRenderSource();
        const workflowSource = read('../hooks/usePosReceiptHardwareWorkflow.js');

        expect(source).toContain("receiptPreviewSource === 'order_preview' ? 'receipt_preview' : 'order_preview'");
        expect(source).toContain("{receiptPreviewSource === 'order_preview' ? 'View Receipt' : 'Back to Order'}");
        // Resets on close so the next checkout opens on Order Preview again.
        expect(workflowSource).toContain("setReceiptPreviewSource('receipt_preview');");
    });

    it('keeps receipt and drawer orchestration behind the reusable hardware workflow boundary', () => {
        const source = readCheckoutRenderSource();
        const workflowSource = read('../hooks/usePosReceiptHardwareWorkflow.js');

        expect(source).toContain('usePosReceiptHardwareWorkflow');
        expect(source).toContain('} = usePosReceiptHardwareWorkflow({');
        expect(source).not.toContain('const handlePrintReceipt =');
        expect(source).not.toContain('const handleBillRequest =');
        expect(source).not.toContain('const handlePrintOrder =');
        expect(source).not.toContain('const submitDrawerAuthorization =');
        expect(workflowSource).toContain('authorizePosDrawerOpen({');
        expect(workflowSource).toContain('openDrawerAfterPrint: shouldOpenDrawer');
        expect(workflowSource).toContain('billRequest: true');
        expect(workflowSource).toContain('idempotencyKey');
    });
});
