import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, '..', relative), 'utf8');

describe('checkout quote invalidation contract', () => {
  it('does not invalidate server quotes when the selected payment rail changes', () => {
    const source = read('StorefrontApp.jsx');
    const invalidation = source.match(
      /useLayoutEffect\(\(\) => \{\s*if \(!isStorePage\) return;\s*setQuoteNeedsRefresh\(true\);[\s\S]*?\}, \[([^\]]*)\]\);/
    );

    expect(invalidation).not.toBeNull();
    expect(invalidation[1]).toContain('paymentElection');
    expect(invalidation[1]).not.toContain('fnbPaymentType');

    const syncKey = source.match(/const syncKey = \[([\s\S]*?)\]\.join\('::'\);/);
    expect(syncKey).not.toBeNull();
    expect(syncKey[1]).toContain('paymentElection');
    expect(syncKey[1]).toContain('cartSignature');
    expect(syncKey[1]).not.toContain('fnbPaymentType');

    const autoSyncStart = source.indexOf('const shouldAutoSyncFnbQuote');
    const autoSyncEnd = source.indexOf('\n  const {', autoSyncStart);
    const autoSyncEffect = source.slice(autoSyncStart, autoSyncEnd);
    expect(autoSyncEffect).not.toContain('fnbPaymentType');
  });

  it('keeps the rail in the quote payload while excluding it from quote identity', () => {
    const source = read('modes/fnb/checkout/hooks/useFnbCheckoutQuote.js');
    const quoteContextStart = source.indexOf('const quoteContext = useCallback');
    const quoteContextEnd = source.indexOf('\n  }), [', quoteContextStart);
    const quoteContext = source.slice(quoteContextStart, quoteContextEnd);
    const quoteContextDependenciesEnd = source.indexOf(']);', quoteContextEnd);
    const quoteContextDependencies = source.slice(quoteContextEnd, quoteContextDependenciesEnd);

    expect(quoteContext).not.toContain('paymentType:');
    expect(quoteContextDependencies).not.toContain('fnbPaymentType');
    expect(source).toContain('paymentType: fnbPaymentType');
  });
});
