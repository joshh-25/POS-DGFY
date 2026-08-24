import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Simple checkout order summary presentation', () => {
  it('keeps the promo action available across desktop and mobile steps 1 to 3', () => {
    const route = readSource('modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx');

    expect(route.match(/promoPanel=\{renderPromoCodePanel\(/g)).toHaveLength(4);
    expect(route).not.toContain('promoPanel={null}');
    expect(route).not.toContain('simpleOrderStep === 3 ? null');
    expect(route).toContain("accentColor: '#176B3A'");
    expect(route).toContain('isMobile: true');
  });

  it('shows immediate totals without a manual quote action on step 3', () => {
    const actions = readSource('modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx');
    const paymentStep = readSource('modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx');
    const routeProps = readSource('modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js');

    expect(actions).not.toContain('Get Quote');
    expect(actions).not.toContain('Refresh Quote');
    expect(actions).not.toContain('onQuote');
    expect(actions.indexOf('> Back')).toBeLessThan(actions.indexOf("'Place Order'"));
    expect(paymentStep).toContain('calculated order total');
    expect(routeProps).not.toContain('handleQuote');
  });
});
