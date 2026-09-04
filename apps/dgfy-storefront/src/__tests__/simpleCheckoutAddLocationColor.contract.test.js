import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Simple MSME checkout add-location styling', () => {
  it('uses the Simple green accent for every add-location entry point', () => {
    const selector = readSource('modes/simple/checkout/components/SimpleCheckoutSavedAddressSelector.jsx');
    const modal = readSource('modes/simple/checkout/components/SimpleCheckoutSavedAddressesModal.jsx');

    for (const source of [selector, modal]) {
      expect(source).toContain("accentColor: SIMPLE_BRAND");
      expect(source).toContain("accentShadow: 'rgba(23,107,58,0.18)'");
    }
  });
});
