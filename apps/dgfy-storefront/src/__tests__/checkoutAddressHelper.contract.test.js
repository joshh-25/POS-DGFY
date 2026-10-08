import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => fs.readFileSync(path.resolve(testDir, relativePath), 'utf8');

describe('checkout delivery address helper', () => {
  it('does not render redundant address copy below the compact delivery field', () => {
    [
      '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx',
      '../modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx',
      '../modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx'
    ].forEach((relativePath) => {
      expect(readSource(relativePath)).not.toContain('This is the address where your order will be delivered.');
    });
  });

  it('renders address search in every expanded map flow', () => {
    [
      '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx',
      '../modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx',
      '../modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx',
      '../modes/services/booking/components/ServiceBookingLocationSection.jsx'
    ].forEach((relativePath) => {
      const source = readSource(relativePath);
      expect(source).toContain('DeliveryAddressSearchField');
      expect(source).toContain('onSelectResult=');
      expect(source).toContain('placeholder="Search an address or landmark"');
    });
  });

  it('keeps full-clear and add-location actions wired in every expanded map flow', () => {
    [
      '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx',
      '../modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx',
      '../modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx',
      '../modes/services/booking/components/ServiceBookingLocationSection.jsx'
    ].forEach((relativePath) => {
      const source = readSource(relativePath);
      expect(source).toContain('onClear=');
      expect(source).toContain('handleAddLocationFromMap');
      expect(source).toContain('Add Location');
    });
  });
});
