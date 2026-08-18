import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const dialogSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSParkedSalesDialog.jsx'),
    'utf8'
);
const terminalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminal.jsx'),
    'utf8'
);
const actionSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/PosCurrentSaleActions.jsx'),
    'utf8'
);
describe('POS parked-sales pay/resume contract', () => {
    it('loads only while the dialog is open and exposes Pay/Resume actions without Refresh', () => {
        expect(terminalSource).toContain('posPresentationBundle.currentSaleActions.showParkedSaleControls');
        expect(terminalSource).toContain('data-testid="pos-header-parked-sales-history-button"');
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
        expect(terminalSource).toContain('formatParkedSaleDisplayName(claimedSale)');
        expect(terminalSource).toContain('formatParkedSaleDisplayName(parkedSale)');
        expect(terminalSource).toContain('data-testid="pos-park-sale-name-dialog"');
        expect(terminalSource).toContain('Customer / Order Name');
        expect(terminalSource).toContain('parked_sale_name: parkedSaleName');
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
        expect(terminalSource).toContain("const normalizedAction = action === 'resume' ? 'resume' : 'pay';");
        expect(terminalSource).toContain("message: normalizedAction === 'resume'");
    });

    it('hydrates the checkout only after the server claim succeeds', () => {
        const claimRequest = dialogSource.indexOf('const claimed = await claimPosParkedSale');
        const claimedCallback = dialogSource.indexOf('await onClaimed(claimed, normalizedAction);', claimRequest);
        const terminalHydration = terminalSource.indexOf('const resumedLines = buildResumedCartLines');

        expect(claimedCallback).toBeGreaterThan(claimRequest);
        expect(terminalSource).toContain('validateParkedSaleResume');
        expect(terminalSource).toContain('setCurrentViewMode(\'checkout\');');
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
        expect(terminalSource).toContain("operation: 'parked_sale'");
        expect(terminalSource).toContain('data-testid="pos-pending-sync-banner"');
    });
});
