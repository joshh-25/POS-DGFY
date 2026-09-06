import { describe, expect, it } from 'vitest';

import { buildStorefrontFeeAndTaxRows } from '../shared/model/storefrontTotalsPresentation.js';

const money = (value) => `PHP ${Number(value).toFixed(2)}`;

describe('storefront fee and tax presentation', () => {
  it('keeps inclusive VAT out of the additive fee amount and discloses it separately', () => {
    expect(buildStorefrontFeeAndTaxRows({
      money,
      serviceFeeAmount: 0,
      vatAmount: 11.25
    })).toEqual([
      { label: 'Fees & Taxes', value: 'PHP 0.00' },
      { label: 'VAT', value: 'Included in item prices', color: '#64748b' }
    ]);
  });

  it('keeps a real convenience fee in the amount that reconciles with the total', () => {
    expect(buildStorefrontFeeAndTaxRows({
      money,
      serviceFeeAmount: 1.05,
      vatAmount: 11.25
    })[0]).toEqual({ label: 'Fees & Taxes', value: 'PHP 1.05' });
  });

  it('does not invent a VAT disclosure row for non-vatable totals', () => {
    expect(buildStorefrontFeeAndTaxRows({
      money,
      serviceFeeAmount: 2,
      vatAmount: 0
    })).toEqual([{ label: 'Fees & Taxes', value: 'PHP 2.00' }]);
  });
});
