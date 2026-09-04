import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readAppSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

describe('shared guest checkout Account UI contract', () => {
  it('uses one typography and saved-details contract across product checkout modes', () => {
    const typographySource = readAppSource('shared/components/checkout/guestCheckoutTypography.js');
    const checkoutTokensSource = readAppSource('shared/components/checkout/checkoutUiTokens.js');
    const rendererSource = readAppSource('features/checkout/renderers/customerIdentityRenderers.jsx');
    const savedPanelSource = readAppSource('shared/components/checkout/SavedCustomerDetailsPanel.jsx');
    const identityFormSource = readAppSource('features/checkout/components/GuestIdentityForm.jsx');
    const accountSources = [
      readAppSource('modes/retail/checkout/components/RetailOrderAccountStep.jsx'),
      readAppSource('modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx'),
      readAppSource('modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx')
    ];

    expect(checkoutTokensSource).toContain("'Segoe UI'");
    expect(typographySource).toContain('Guest Check-out Saved Details');
    expect(rendererSource).toContain('GUEST_CHECKOUT_SAVED_DETAILS_TITLE');
    expect(savedPanelSource).toContain('GUEST_CHECKOUT_SAVED_DETAILS_TITLE');
    expect(savedPanelSource).toContain('title={title}');
    expect(identityFormSource).toContain('GUEST_CHECKOUT_FONT_FAMILY');

    for (const accountSource of accountSources) {
      expect(accountSource).toContain('GUEST_CHECKOUT_FONT_FAMILY');
      expect(accountSource).toContain('getGuestCheckoutTypography');
      expect(accountSource).not.toContain('Guest checkout uses the details you entered for this order only.');
    }
  });

  it('keeps the signed-in helper copy removed from every checkout mode', () => {
    const fnbRouteSource = readAppSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx');

    const signedInHelper = 'Your account details are already linked. Only order-specific instructions remain editable here.';
    expect(fnbRouteSource).not.toContain(signedInHelper);
    expect(readAppSource('modes/retail/checkout/components/RetailOrderAccountStep.jsx')).not.toContain(signedInHelper);
    expect(readAppSource('modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx')).not.toContain(signedInHelper);
    expect(readAppSource('modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx')).not.toContain(signedInHelper);
    expect(fnbRouteSource).not.toContain('Guest checkout uses the details you entered for this order only.');
  });

  it('uses the shared checkout hierarchy and control baseline across modes', () => {
    const tokenSource = readAppSource('shared/components/checkout/checkoutUiTokens.js');
    const stepSources = [
      readAppSource('modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx'),
      readAppSource('modes/retail/checkout/components/RetailOrderPaymentStep.jsx'),
      readAppSource('modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx'),
      readAppSource('modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx'),
      readAppSource('modes/fnb/checkout/components/FnbCheckoutFulfillmentStep.jsx'),
      readAppSource('modes/fnb/checkout/components/FnbCheckoutPaymentStep.jsx'),
      readAppSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx')
    ];

    expect(tokenSource).toContain('CHECKOUT_CONTROL_MIN_HEIGHT = 44');
    expect(tokenSource).toContain('fontSize: 18');
    expect(tokenSource).toContain('fontSize: 13');
    expect(tokenSource).toContain('fontSize: 15');
    expect(tokenSource).toContain('fontWeight: 700');

    for (const stepSource of stepSources) {
      expect(stepSource).toContain('checkoutUiTokens.js');
      expect(stepSource).toContain('CHECKOUT_FONT_FAMILY');
    }
  });
});
