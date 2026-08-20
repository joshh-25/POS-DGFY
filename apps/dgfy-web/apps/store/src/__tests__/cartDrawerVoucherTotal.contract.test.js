import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, '..', relative), 'utf8');

const DRAWERS = [
  ['default/retail', 'shared/components/storefront/DefaultProductCartDrawer.jsx'],
  ['simple', 'modes/simple/checkout/components/SimpleCartDrawerSurface.jsx'],
  ['fnb', 'modes/fnb/checkout/components/FnbCartDrawerContent.jsx']
];

// #746, second occurrence. PR #753 fixed the discount display, then its own review-response commit
// re-broke it by gating on `!quoteNeedsRefresh` -- a flag that initializes `true`, is raised by ten
// call sites including a blanket cart invalidator, and is lowered in exactly one place that the cart
// drawer never reaches. The discount was therefore hidden essentially always. These are source
// contracts (matching this repo's existing *.contract.test.js pattern) because the failure was
// structural: three drawers each carrying their own copy of the same wrong condition.
describe('cart drawer voucher/promo total', () => {
  it.each(DRAWERS)('%s drawer does not gate the discount on quoteNeedsRefresh', (_label, path) => {
    const source = read(path);

    expect(source).not.toMatch(/!quoteNeedsRefresh\s*&&/);
    expect(source).not.toMatch(/quoteNeedsRefresh\s*=\s*false,/);
  });

  it.each(DRAWERS)('%s drawer derives its total from the shared helper', (_label, path) => {
    const source = read(path);

    expect(source).toMatch(/resolveCartDiscountDisplay\(/);
    // No drawer keeps its own copy of the arithmetic -- that duplication is how one wrong gate
    // became three wrong gates in a single commit.
    expect(source).not.toMatch(/const displayTotal = Math\.max\(/);
  });

  it.each(DRAWERS)('%s drawer still renders a voucher discount row and the resolved total', (_label, path) => {
    const source = read(path);

    expect(source).toMatch(/hasVoucherDiscount &&/);
    expect(source).toMatch(/money\(displayTotal\)/);
  });

  it('the storefront shell computes staleness from the quoted cart signature', () => {
    const source = read('StorefrontApp.jsx');

    expect(source).toMatch(/const cartSignature = useMemo\(\(\) => buildCartSignature\(cart\)/);
    expect(source).toMatch(/quotedCartSignature !== cartSignature/);
    // All three drawer prop sites must pass the staleness signal, not the old flag.
    expect(source.match(/isQuoteStale,/g) || []).toHaveLength(3);
  });

  it('a successful quote records the cart signature it was priced against', () => {
    const source = read('modes/fnb/checkout/hooks/useFnbCheckoutQuote.js');

    // Captured BEFORE the await -- recording it after would attribute the quote to whatever the cart
    // looks like when the network returns, i.e. the very edit that should invalidate it.
    expect(source).toMatch(/const signatureAtRequest = cartSignature;[\s\S]*await requestJson/);
    expect(source).toMatch(/setQuotedCartSignature\(signatureAtRequest\)/);
  });

  it('the storefront re-quotes from the drawer for any mode once a code is applied', () => {
    const source = read('StorefrontApp.jsx');

    expect(source).toMatch(/shouldAutoSyncDiscountQuote/);
    // The mode-agnostic arm must not inherit the F&B checkout-step gating that kept the original
    // auto-quote from ever firing in the cart drawer.
    const arm = source.slice(
      source.indexOf('const shouldAutoSyncDiscountQuote'),
      source.indexOf('if (!shouldAutoSyncFnbQuote')
    );
    expect(arm).not.toMatch(/fnbOrderStep/);
    expect(arm).not.toMatch(/isFnbMode/);
    expect(arm).toMatch(/hasAppliedDiscountCode/);
  });
});
