import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('checkout payment presentation', () => {
  it('keeps product-mode payment steps compact and uses the shared section-heading label style', () => {
    const paymentSteps = [
      readSource('modes/retail/checkout/components/RetailOrderPaymentStep.jsx'),
      readSource('modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx'),
      readSource('modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx'),
      readSource('shared/components/storefront/DefaultOrderPaymentStep.jsx')
    ];
    const paymentControls = [
      [paymentSteps[0], 'typography'],
      [paymentSteps[1], 'typography'],
      [readSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx'), 'checkoutTypography'],
      [paymentSteps[3], 'typography']
    ];

    for (const source of paymentSteps) {
      expect(source).not.toContain('Review the cart');
      expect(source).toContain('Step 3: Review');
    }
    for (const [source, typographyVariable] of paymentControls) {
      expect(source).toContain(`labelStyle={{ ...${typographyVariable}.sectionTitle`);
    }
  });

  it('does not render the redundant cash-payment guidance panel', () => {
    const selector = readSource('shared/components/checkout/PaymentMethodSelectorBlock.jsx');

    expect(selector).not.toContain('Pay with cash when your order arrives.');
    expect(selector).not.toContain('Ensure exact amount is ready for faster transaction.');
    expect(selector).not.toContain('showCashInfo');
  });

  it('uses the checkout typography scale for single-method fulfillment notices', () => {
    const notice = readSource('shared/components/checkout/FulfillmentMethodNotice.jsx');

    expect(notice).toContain('...typography.sectionTitle');
    expect(notice).toContain('...typography.description');
    expect(notice).toContain('CHECKOUT_FONT_FAMILY');
  });
});
