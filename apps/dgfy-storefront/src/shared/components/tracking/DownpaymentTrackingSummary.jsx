import { resolveDownpaymentBalanceLabel, resolveTrackingDownpaymentDisplay } from '../../model/storefrontDownpaymentPresentation.js';

// Phase 151 (#826): single shared row for the downpayment/balance split on a tracked order,
// replacing five hand-rolled copies (Retail/F&B active+completed views, Simple's route page) that
// each re-derived the `paymentStatus === 'partially_paid'` gate and rendered only balanceDue --
// amountPaid was parsed and carried by every tracking payload model since Phase 142 (#823) but
// never actually displayed anywhere. Named amounts ("Downpayment paid" / "Balance due ...")
// replace the old literal "Partially paid" label, which only echoed the raw payment_status enum.
//
// Fiscal/BIR treatment of a downpayment or balance-settlement event stays deferred per ADR 0069
// clause 9 [default] -- this component states amounts only, never a tax/receipt claim.
export function DownpaymentTrackingSummary({ trackingResult, money, orderMethod }) {
  const display = resolveTrackingDownpaymentDisplay(trackingResult);
  if (!display.active || typeof money !== 'function') return null;
  const balanceLabel = resolveDownpaymentBalanceLabel(orderMethod);

  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 13, color: '#92400e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Downpayment paid</span>
        <span style={{ fontWeight: 700 }}>{money(display.downpaymentAmount)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{balanceLabel}</span>
        <span style={{ fontWeight: 700 }}>{money(display.balanceDueAmount)}</span>
      </div>
    </div>
  );
}
