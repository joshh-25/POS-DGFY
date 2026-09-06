/**
 * Builds buyer-facing fee rows from the server quote.
 *
 * Storefront item prices are VAT-inclusive. `vat_amount` is provided for fiscal
 * disclosure, while only `service_fee_amount` (and delivery_fee in its own row)
 * is added to the server-authoritative total. Keeping that distinction here
 * prevents each mode's summary from presenting an amount that cannot reconcile
 * with the payable total.
 */
export const buildStorefrontFeeAndTaxRows = ({ serviceFeeAmount = 0, vatAmount = 0, money }) => {
  const serviceFee = Number(serviceFeeAmount);
  const vat = Number(vatAmount);
  const safeServiceFee = Number.isFinite(serviceFee) ? Math.max(0, serviceFee) : 0;
  const safeVat = Number.isFinite(vat) ? Math.max(0, vat) : 0;

  return [
    { label: 'Fees & Taxes', value: money(safeServiceFee) },
    ...(safeVat > 0
      ? [{ label: 'VAT', value: 'Included in item prices', color: '#64748b' }]
      : [])
  ];
};
