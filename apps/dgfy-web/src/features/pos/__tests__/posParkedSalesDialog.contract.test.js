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
const actionComponentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/PosCurrentSaleActions.jsx'),
    'utf8'
);

describe('POS parked-sales manual resume contract', () => {
    it('requires an explicit dialog action and loads only while the dialog is open', () => {
        expect(actionComponentSource).toContain('data-testid="pos-open-parked-sales-button"');
        expect(terminalSource).toContain('posPresentationBundle.currentSaleActions.showParkedSaleControls');
        expect(dialogSource).toContain('data-testid="pos-parked-sales-dialog"');
        expect(dialogSource).toContain('fetchPosParkedSales');
        expect(dialogSource).toContain('if (!open) return undefined;');
        expect(dialogSource).toContain('Nothing is loaded into the active cart automatically.');
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

    it('blocks claim when the active cart is not empty and claims only after preflight', () => {
        const cartGuard = dialogSource.indexOf('if (cartHasItems) {');
        const preflight = dialogSource.indexOf('const preflight = onBeforeClaim(row) || {};');
        const claimRequest = dialogSource.indexOf('const claimed = await claimPosParkedSale');

        expect(cartGuard).toBeGreaterThan(-1);
        expect(preflight).toBeGreaterThan(cartGuard);
        expect(claimRequest).toBeGreaterThan(preflight);
        expect(dialogSource).toContain('The active cart will never be replaced.');
    });

    it('hydrates the checkout only after the server claim succeeds', () => {
        const claimRequest = dialogSource.indexOf('const claimed = await claimPosParkedSale');
        const claimedCallback = dialogSource.indexOf('await onClaimed(claimed);', claimRequest);
        const terminalHydration = terminalSource.indexOf('const resumedLines = buildResumedCartLines');

        expect(claimedCallback).toBeGreaterThan(claimRequest);
        expect(terminalSource).toContain('validateParkedSaleResume');
        expect(terminalSource).toContain('setCurrentViewMode(\'checkout\');');
        expect(terminalHydration).toBeGreaterThan(-1);
    });

    it('provides an explicit cancellation path for shift-close resolution', () => {
        expect(dialogSource).toContain('cancelPosParkedSale');
        expect(dialogSource).toContain('data-testid={`pos-parked-sale-cancel-${parkedSaleId}`}');
        expect(dialogSource).toContain('Cancellation reason');
        expect(terminalSource).toContain("operation: 'parked_sale'");
        expect(terminalSource).toContain('data-testid="pos-pending-sync-banner"');
    });
});
