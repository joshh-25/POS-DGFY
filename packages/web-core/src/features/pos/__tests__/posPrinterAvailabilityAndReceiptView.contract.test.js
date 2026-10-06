import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const readCheckoutRenderSource = () => [
    read('../components/POSCheckoutTerminal.jsx'),
    // Staging repair 2026-09-28-01 (#2110) extracted the shell body here.
    read('../hooks/usePosTerminalViewModel.js'),
    read('../components/POSCheckoutTerminalView.jsx'),
    read('../components/POSCheckoutConfirmDialog.jsx'),
    read('../components/POSCheckoutTerminalReceiptDialogs.jsx'),
].join('\n');

// Source-contract style, matching posWeightEntry.contract.test.js and its
// neighbors -- POSCheckoutTerminal is large enough that a full render setup
// for every terminal state (printer available/unavailable, receipt vs order
// preview) is heavier than the codebase's existing convention for this file.
describe('POS printer availability and post-checkout receipt view', () => {
    it('removes app print margins while preserving the selected receipt width', () => {
        const stylesheet = read('../../../index.css');
        const receiptDialogsSource = read('../components/POSCheckoutTerminalReceiptDialogs.jsx');
        const zReadingSource = read('../components/ZReadingPrintView.jsx');

        expect(stylesheet).toContain('@page {\n    margin: 0;\n  }');
        expect(stylesheet).toContain('body.pos-receipt-print-mode,\n  body.pos-z-reading-printing');
        expect(stylesheet).toContain('width: var(--pos-receipt-paper-width, 80mm);');
        expect(stylesheet).toContain('body.pos-z-reading-printing .pos-z-reading-print');
        expect(stylesheet).toContain('width: var(--pos-z-reading-paper-width, 80mm);');
        expect(receiptDialogsSource).toContain("style={{ '--pos-receipt-paper-width': receiptPaperWidth }}");
        expect(zReadingSource).toContain("style={{ '--pos-z-reading-paper-width': resolvedPaperWidth }}");
        expect(zReadingSource).not.toContain("style={{ width: resolvedPaperWidth, maxWidth: '100%' }}");
    });

    it('gates receipt and order-ticket actions on their distinct hardware capabilities', () => {
        const source = readCheckoutRenderSource();
        const currentSaleActionsSource = read('../components/PosCurrentSaleActions.jsx');
        const receiptDialogsSource = read('../components/POSCheckoutTerminalReceiptDialogs.jsx');
        const skupervisorSource = read('../components/SkupervisorPOSCheckoutTerminal.jsx');
        const viewSource = read('../components/POSCheckoutTerminalView.jsx');
        expect(source).toContain('const isPrinterAvailable = posHardware.isPrinterAvailable;');
        expect(source).toContain('const isOrderPrinterAvailable = posHardware.isOrderPrinterAvailable;');
        expect(source).toContain('cashDrawerAvailable={cashDrawerAvailable}');
        expect(currentSaleActionsSource).toContain('disabled={cashDrawerDisabled}');
        expect(currentSaleActionsSource).toContain('data-testid="pos-open-cash-drawer-button"');
        expect(source).toContain('printOrderDisabled={posActionsBlocked || safeCart.length === 0 || !isOrderPrinterAvailable}');
        expect(currentSaleActionsSource).toContain('disabled={printOrderDisabled}');
        expect(source).toContain('disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isOrderPrinterAvailable}');
        expect(source).toContain('disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync || posHardware.loading}');
        expect(receiptDialogsSource).toContain('disabled={posActionsBlocked || !lastReceipt || !isOrderPrinterAvailable}');
        expect(viewSource).toContain('disabled={posActionsBlocked || !lastReceipt || !isOrderPrinterAvailable}');
        expect(skupervisorSource).toContain('disabled={posActionsBlocked || cart.length === 0 || !isOrderPrinterAvailable}');
    });

    it('offers a Recheck printer action when no printer is available, wired to posHardware.refresh()', () => {
        const source = readCheckoutRenderSource();

        expect(source).toContain('No printer detected on this device.');
        expect(source).toContain('onClick={() => posHardware.refresh()}');
        expect(source).toContain('Recheck printer');
    });

    it('lets checkout open the receipt render without adding a Back to Order action in History', () => {
        const source = readCheckoutRenderSource();
        const receiptDialogsSource = read('../components/POSCheckoutTerminalReceiptDialogs.jsx');
        const workflowSource = read('../hooks/usePosReceiptHardwareWorkflow.js');

        expect(source).toContain("{lastReceipt && receiptPreviewSource === 'order_preview' && (");
        expect(source).toContain("onClick={() => setReceiptPreviewSource('receipt_preview')}");
        expect(source).toContain('View Receipt');
        expect(source).not.toContain('Back to Order');
        expect(receiptDialogsSource).toContain('w-[calc(100vw-1.5rem)] max-w-xl flex-col');
        expect(receiptDialogsSource).toContain("receiptPreviewSource === 'order_preview' ? 'bg-white' : 'bg-slate-50'");
        expect(receiptDialogsSource).not.toContain('max-w-3xl');
        expect(source).toContain('sm:flex-nowrap');
        expect(source).toContain('flex min-w-0 w-full items-center gap-2 sm:max-w-none');
        expect(source.match(/h-10 min-w-0 flex-1/g)?.length).toBeGreaterThanOrEqual(3);
        expect(source).toContain('whitespace-nowrap rounded-lg border border-[#1A4E8D]');
        // Resets on close so the next checkout opens on Order Preview again.
        expect(workflowSource).toContain("setReceiptPreviewSource('receipt_preview');");
    });

    it('keeps receipt and drawer orchestration behind the reusable hardware workflow boundary', () => {
        const source = readCheckoutRenderSource();
        const workflowSource = read('../hooks/usePosReceiptHardwareWorkflow.js');
        const viewSource = read('../components/POSCheckoutTerminalView.jsx');

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
        expect(workflowSource).toContain('window.print();');
        expect(source).toContain('id="pos-drawer-authorization-form"');
        expect(source).toContain('type="submit"');
        expect(source).toContain('form="pos-drawer-authorization-form"');
        expect(viewSource).toContain('className="grid w-full grid-cols-1 items-stretch gap-2 border-t border-slate-200 px-5 py-4 sm:grid-cols-2 sm:gap-2"');
        expect(viewSource).toContain('className="order-2 h-10 w-full min-w-0 px-2 sm:order-1"');
        expect(viewSource).toContain('className="order-1 h-10 w-full min-w-0 bg-[#1A4E8D] px-2 text-white hover:bg-[#143F73] sm:order-2"');
    });
});
