import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dialogSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSParkedSalesDialog.jsx'),
    'utf8'
);
const terminalSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx'),
    'utf8'
);
const terminalViewSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
    'utf8'
);
const terminalRenderSource = `${terminalSource}\n${terminalViewSource}`;
const workflowSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/hooks/usePosCheckoutWorkflow.js'),
    'utf8'
);
const actionSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosCurrentSaleActions.jsx'),
    'utf8'
);
describe('POS parked-sales pay/resume contract', () => {
    it('loads only while the dialog is open and exposes Pay/Resume actions without Refresh', () => {
        expect(terminalRenderSource).toContain('posPresentationBundle.currentSaleActions.showParkedSaleControls');
        expect(terminalRenderSource).toContain('data-testid="pos-header-parked-sales-history-button"');
        expect(actionSource).toContain('data-testid="pos-park-sale-button"');
        expect(dialogSource).toContain('data-testid="pos-parked-sales-dialog"');
        expect(dialogSource).toContain('flex max-h-[calc(100dvh-1rem)] min-h-0 max-w-2xl flex-col overflow-hidden p-0 sm:max-h-[90vh]');
        expect(dialogSource).toContain('min-h-0 flex-1 overflow-y-auto px-5 py-4');
        expect(dialogSource).toContain('shrink-0 border-t border-slate-200 px-5 py-3');
        expect(dialogSource).toContain('fetchPosParkedSales');
        expect(dialogSource).toContain('if (!open) return undefined;');
        expect(dialogSource).toContain('Pay a parked sale now or resume it to add more items.');
        expect(dialogSource).toContain('data-testid={`pos-parked-sale-pay-${parkedSaleId}`}');
        expect(dialogSource).toContain('data-testid={`pos-parked-sale-resume-${parkedSaleId}`}');
        expect(dialogSource).not.toContain('aria-label="Refresh parked sales"');
        expect(dialogSource).not.toContain('>Refresh</');
    });

    it('shows the customer or order name with the short parked-sale ID instead of the long stored reference', () => {
        expect(dialogSource).toContain('formatParkedSaleDisplayName(row)');
        expect(workflowSource).toContain('formatParkedSaleDisplayName(claimedSale)');
        expect(workflowSource).toContain('formatParkedSaleDisplayName(parkedSale)');
        expect(terminalRenderSource).toContain('data-testid="pos-park-sale-name-dialog"');
        expect(terminalRenderSource).toContain('Customer / Order Name');
        expect(terminalRenderSource).toContain('flex-row gap-2 border-0 px-5 !pt-1 pb-3 sm:justify-end');
        expect(terminalRenderSource).toContain('className="min-w-0 flex-1"');
        expect(workflowSource).toContain('parked_sale_name: parkedSaleName');
        expect(dialogSource).not.toContain('row?.park_reference ||');
    });

    it('blocks Pay and Resume when the active cart is not empty', () => {
        const cartGuard = dialogSource.indexOf('if (cartHasItems)');
        const preflight = dialogSource.indexOf('const preflight = await onBeforeClaim(row, normalizedAction) || {};');
        const claimRequest = dialogSource.indexOf('const claimed = await claimPosParkedSale');

        expect(cartGuard).toBeGreaterThan(-1);
        expect(preflight).toBeGreaterThan(cartGuard);
        expect(claimRequest).toBeGreaterThan(preflight);
        expect(dialogSource).toContain('Pay or Resume requires an empty current sale. Park or clear the current sale first.');
        expect(dialogSource).toContain('Parked carts from this branch will appear here for any authorized cashier.');
        expect(dialogSource).toContain('Shared with authorized cashiers at this branch.');
        expect(workflowSource).toContain("const normalizedAction = action === 'resume' ? 'resume' : 'pay';");
        expect(workflowSource).toContain("message: normalizedAction === 'resume'");
    });

    it('hydrates the checkout only after the server claim succeeds', () => {
        const claimRequest = dialogSource.indexOf('const claimed = await claimPosParkedSale');
        const claimedCallback = dialogSource.indexOf('await onClaimed(claimed, normalizedAction, preflight.resumeContext);', claimRequest);
        const terminalHydration = workflowSource.indexOf('const resumedLines = buildResumedCartLines');

        expect(claimedCallback).toBeGreaterThan(claimRequest);
        expect(workflowSource).toContain('validateParkedSaleResume');
        expect(workflowSource).toContain('setCurrentViewMode(\'checkout\');');
        expect(terminalHydration).toBeGreaterThan(-1);
    });

    it('provides an explicit cancellation path for shift-close resolution', () => {
        expect(dialogSource).toContain('cancelPosParkedSale');
        expect(dialogSource).toContain('data-testid={`pos-parked-sale-cancel-${parkedSaleId}`}');
        expect(dialogSource).toContain("const PARKED_SALE_AUTO_CANCEL_REASON = 'Cancelled from Parked Sales';");
        expect(dialogSource).toContain('reason: PARKED_SALE_AUTO_CANCEL_REASON');
        expect(dialogSource).toContain('Cancel this parked sale?');
        expect(dialogSource).not.toContain('Cancellation reason');
        expect(dialogSource).not.toContain('pos-parked-sale-cancel-reason');
        expect(workflowSource).toContain("operation: 'parked_sale'");
        expect(terminalRenderSource).toContain('data-testid="pos-pending-sync-banner"');
    });
});
