const isFiniteAmount = (value) => value !== null
  && value !== undefined
  && value !== ''
  && Number.isFinite(Number(value));

const paymentKey = (entry = {}) => String(
  entry.payment_type || entry.payment_method || entry.payment_label || ''
).trim().toLowerCase().replace(/[\s_-]+/g, '');

export const isCashPayment = (entry) => paymentKey(entry) === 'cash';

export const getDailySalesCheckCashSummary = (data) => {
  const savedCash = (Array.isArray(data?.z_payment_breakdown) ? data.z_payment_breakdown : [])
    .find(isCashPayment);
  const reportCash = (Array.isArray(data?.report_payment_breakdown) ? data.report_payment_breakdown : [])
    .find(isCashPayment);
  const cashPaymentsBeforeRefunds = isFiniteAmount(savedCash?.amount)
    ? Number(savedCash.amount)
    : isFiniteAmount(reportCash?.gross_sales)
      ? Number(reportCash.gross_sales)
      : null;
  const hasAdjustmentRows = Array.isArray(data?.report_adjustment_rows);
  const cashRefundsFromAdjustments = hasAdjustmentRows
    ? data.report_adjustment_rows.reduce((total, row) => {
      const adjustmentType = String(row?.adjustment_type || '').trim().toLowerCase();
      const tenderType = String(row?.tender_type || '').trim().toLowerCase();
      const status = String(row?.status || '').trim().toLowerCase();
      return adjustmentType === 'cash_refund' && tenderType === 'cash' && status === 'succeeded'
        ? total + Number(row?.amount || 0)
        : total;
    }, 0)
    : null;
  const cashRefundsFromReconciliation = isFiniteAmount(data?.report_cash_refunds_voids)
    ? Number(data.report_cash_refunds_voids)
    : null;

  if (!isFiniteAmount(cashPaymentsBeforeRefunds)) {
    return { available: false };
  }

  const cashRefundsVoids = cashRefundsFromReconciliation !== null
    ? cashRefundsFromReconciliation
    : isFiniteAmount(cashRefundsFromAdjustments)
      ? Number(cashRefundsFromAdjustments)
      : isFiniteAmount(data?.report_refunds_voids) && isFiniteAmount(reportCash?.net_sales)
        ? Math.max(0, Number(cashPaymentsBeforeRefunds) - Number(reportCash.net_sales))
        : null;

  if (!isFiniteAmount(cashRefundsVoids)) return { available: false };

  return {
    available: true,
    cashPaymentsBeforeRefunds,
    cashRefundsVoids,
    netCashSales: Math.max(0, cashPaymentsBeforeRefunds - cashRefundsVoids)
  };
};

export const getDailySalesCheckVoidActivity = (data) => {
  const count = isFiniteAmount(data?.report_voided_refunded_transactions)
    ? Number(data.report_voided_refunded_transactions)
    : isFiniteAmount(data?.z_void_transaction_count)
      ? Number(data.z_void_transaction_count)
      : null;
  const amount = isFiniteAmount(data?.report_refunds_voids)
    ? Number(data.report_refunds_voids)
    : isFiniteAmount(data?.z_void_amount)
      ? Number(data.z_void_amount)
      : null;

  return {
    available: isFiniteAmount(count) || isFiniteAmount(amount),
    count,
    amount
  };
};

export { isFiniteAmount };
