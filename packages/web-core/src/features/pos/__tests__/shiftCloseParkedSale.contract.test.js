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
  it('does not block ordinary shift close on parked-sale state', () => {
    const dialogSource = readSource('components/TerminalPageDialogLayer.jsx');
    const pageSource = readSource('pages/TerminalPage.jsx');

    expect(dialogSource).not.toContain('closeShiftBlocker.claimedParkedSaleCount');
    expect(dialogSource).not.toContain('claimed parked sale');
    expect(pageSource).not.toContain('Resolve claimed parked sales and pending parked-sale syncs before closing this shift.');
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
