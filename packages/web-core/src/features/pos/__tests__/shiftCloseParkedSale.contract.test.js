import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readSource = (relativePath) => fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos', relativePath),
  'utf8'
);

describe('POS shift-close parked-sale handoff contract', () => {
  it('only presents claimed carts as blockers with actionable copy', () => {
    const dialogSource = readSource('components/TerminalPageDialogLayer.jsx');
    const pageSource = readSource('pages/TerminalPage.jsx');

    expect(dialogSource).toContain('closeShiftBlocker.claimedParkedSaleCount');
    expect(dialogSource).toContain('claimed parked sale');
    expect(dialogSource).not.toContain('active parked sale');
    expect(pageSource).toContain('resolutionState.claimedParkedSaleCount');
    expect(pageSource).toContain('Resolve claimed parked sales');
  });

  it('routes payment-session blockers back to the active split-payment checkout', () => {
    const dialogSource = readSource('components/TerminalPageDialogLayer.jsx');
    const pageSource = readSource('pages/TerminalPage.jsx');
    const checkoutSource = readSource('components/POSCheckoutTerminalView.jsx');

    expect(pageSource).toContain('POS_PAYMENT_SESSIONS_IN_FLIGHT');
    expect(pageSource).toContain('handleResolveCloseShiftPaymentBlocker');
    expect(dialogSource).toContain('pos-close-shift-resolve-payment');
    expect(dialogSource).toContain('Return to Checkout');
    expect(checkoutSource).toContain('pos-split-payment-modal-host');
    expect(checkoutSource).not.toContain('pos-current-sale-payment-recovery');
  });
});
