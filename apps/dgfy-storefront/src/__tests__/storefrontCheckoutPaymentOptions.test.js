import { describe, expect, it } from 'vitest';
import { buildStorefrontCheckoutPaymentOptions } from '../shared/model/storefrontCheckoutPaymentOptions.js';

describe('Storefront checkout payment options', () => {
  it('exposes Pay in store for an enabled Dine-in policy even when tenant cash is disabled', () => {
    const options = buildStorefrontCheckoutPaymentOptions(
      { cash: { enabled: false }, qrph: { enabled: true } },
      { cashLabel: 'Pay in store', allowCash: true }
    );

    expect(options.find((option) => option.value === 'cash')).toEqual({
      value: 'cash',
      label: 'Pay in store'
    });
  });

  it('keeps cash hidden when the Dine-in policy is disabled', () => {
    const options = buildStorefrontCheckoutPaymentOptions(
      { cash: { enabled: true }, qrph: { enabled: true } },
      { hideCash: true, cashLabel: 'Pay in store', allowCash: false }
    );

    expect(options.some((option) => option.value === 'cash')).toBe(false);
  });
});
