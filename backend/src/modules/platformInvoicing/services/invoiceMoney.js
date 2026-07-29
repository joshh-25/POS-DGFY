const MAX_CENTAVOS = 999_999_999_99;

export const parseCentavos = (value, field = 'amount') => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_CENTAVOS) {
    const error = new Error(`${field} must be an integer centavo amount within the supported range.`);
    error.code = 'INVALID_MONEY_AMOUNT';
    throw error;
  }
  return value;
};

// For non-negative integer centavos, adding 56 implements round-half-up for 12/112.
export const calculateVatInclusiveInvoice = ({ grossCentavos, cashTenderedCentavos, changeReturnedConfirmed = false }) => {
  const gross = parseCentavos(grossCentavos, 'grossCentavos');
  if (gross <= 0) {
    const error = new Error('grossCentavos must be greater than zero.');
    error.code = 'GROSS_REQUIRED';
    throw error;
  }
  const tendered = parseCentavos(cashTenderedCentavos, 'cashTenderedCentavos');
  const vat = Math.floor((gross * 12 + 56) / 112);
  const vatableSales = gross - vat;
  const amountApplied = Math.min(tendered, gross);
  const balanceDue = gross - amountApplied;
  const changeDue = Math.max(tendered - gross, 0);
  if (changeDue > 0 && !changeReturnedConfirmed) {
    const error = new Error('Cash change must be confirmed as returned before issuance.');
    error.code = 'CHANGE_RETURN_CONFIRMATION_REQUIRED';
    throw error;
  }
  return { currency: 'PHP', gross_centavos: gross, vat_centavos: vat, vatable_sales_centavos: vatableSales, cash_tendered_centavos: tendered, amount_applied_centavos: amountApplied, balance_due_centavos: balanceDue, change_due_centavos: changeDue, payment_status: balanceDue === 0 ? 'paid' : amountApplied === 0 ? 'unpaid' : 'partial' };
};
