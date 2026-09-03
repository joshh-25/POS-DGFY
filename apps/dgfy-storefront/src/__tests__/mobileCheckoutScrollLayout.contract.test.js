import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(resolve(here, relativePath), 'utf8');

const frameSource = readSource('../shared/components/StorefrontCheckoutDrawerFrame.jsx');
const footerSource = readSource('../shared/components/StorefrontMobileCheckoutFooter.jsx');
const footerHookSource = readSource('../shared/hooks/useStorefrontMobileCheckoutFooter.js');
const deliveryMapSource = readSource('../features/locations/components/DeliveryPinMap.jsx');
const retailPanelSource = readSource('../modes/retail/checkout/components/RetailOrderMobileSummaryPanel.jsx');
const simplePanelSource = readSource('../modes/simple/checkout/components/SimpleCheckoutMobileSummaryPanel.jsx');
const fnbPanelSource = readSource('../modes/fnb/checkout/components/FnbCheckoutMobileSummaryPanel.jsx');
const retailPageSource = readSource('../modes/retail/checkout/pages/RetailOrderPage.jsx');
const simplePageSource = readSource('../modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx');
const fnbPresentationSource = readSource('../modes/fnb/checkout/hooks/useFnbCheckoutPresentation.js');

describe('mobile checkout scroll layout contract', () => {
  it('keeps the shared checkout content region shrinkable and touch-scrollable', () => {
    expect(frameSource).toContain('data-storefront-checkout-scroll-root="true"');
    expect(frameSource).toContain("flex: 1");
    expect(frameSource).toContain("minHeight: 0");
    expect(frameSource).toContain("WebkitOverflowScrolling: 'touch'");
    expect(frameSource).toContain("touchAction: 'pan-y'");
    expect(frameSource).toContain("scrollPaddingBottom: 'var(--storefront-mobile-checkout-footer-reserve, 196px)'");
  });

  it('uses one measured footer shell across Retail, Simple MSME, and F&B', () => {
    [retailPanelSource, simplePanelSource, fnbPanelSource].forEach((source) => {
      expect(source).toContain("StorefrontMobileCheckoutFooter");
    });
    expect(footerSource).toContain('data-storefront-mobile-checkout-footer="true"');
    expect(footerSource).toContain("pointerEvents: 'none'");
    expect(footerSource).toContain("pointerEvents: 'auto'");
    expect(footerHookSource).toContain('ResizeObserver');
    expect(footerHookSource).toContain('--storefront-mobile-checkout-footer-reserve');
  });

  it('reserves footer space for fulfillment maps in every storefront checkout mode', () => {
    [retailPageSource, simplePageSource, fnbPresentationSource].forEach((source) => {
      expect(source).toContain('var(--storefront-mobile-checkout-footer-reserve, 196px)');
    });
    expect(deliveryMapSource).toContain("scrollMarginBottom: 'var(--storefront-mobile-checkout-footer-reserve, 196px)'");
  });
});
