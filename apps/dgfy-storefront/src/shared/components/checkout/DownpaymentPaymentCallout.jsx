import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  buildDownpaymentRefundableNote,
  resolveDownpaymentBalanceLabel
} from '../../model/storefrontDownpaymentPresentation.js';
import { DownpaymentTermsModal } from './DownpaymentTermsModal.jsx';

/**
 * Phase 142 (#823): the amount callout shown under PaymentMethodSelectorBlock's dropdown at a
 * downpayment-required store -- "Downpayment due now: X, the remaining Y is due on
 * delivery/pickup in cash", plus the neutral non-refundable seam (Phase 143/#824's legal copy is
 * blocked on #280; only this seam ships here). Shared across Simple/F&B/Retail's payment steps so
 * the copy and shape stay identical everywhere it renders. Renders nothing when the display is
 * inactive -- callers can pass this unconditionally.
 *
 * Phase 219 (#1220): the same `refundable === false` gate now also renders a link to the full
 * versioned terms (DownpaymentTermsModal). Deliberately not a gate -- no checkbox, no "I agree",
 * and the pay action is never disabled on an unread state; capturing acceptance is #1086's job.
 * A modal rather than a route so opening it cannot lose in-progress checkout state.
 */
export function DownpaymentPaymentCallout({
  accentColor = '#1a4e8d',
  bodyFont = 'inherit',
  display,
  money,
  orderMethod
}) {
  const [termsOpen, setTermsOpen] = useState(false);

  if (!display?.active) return null;
  const refundableNote = buildDownpaymentRefundableNote(display.refundable);
  const balanceLabel = resolveDownpaymentBalanceLabel(orderMethod).toLowerCase();

  return (
    <div style={{ border: `1px solid ${accentColor}33`, borderRadius: 16, background: `${accentColor}0d`, padding: '14px 16px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Info size={18} color={accentColor} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: bodyFont }}>
            Downpayment due now: {money(display.downpaymentAmount)}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, fontFamily: bodyFont }}>
            Pay the remaining {money(display.balanceDueAmount)} in cash {balanceLabel}.
          </div>
        </div>
      </div>
      {refundableNote ? (
        <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5, fontFamily: bodyFont }}>
          {refundableNote}{' '}
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            style={{ background: 'transparent', border: 'none', padding: 0, margin: 0, font: 'inherit', color: accentColor, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', minHeight: 24 }}
          >
            Read the downpayment terms
          </button>
        </div>
      ) : null}
      {refundableNote ? (
        <DownpaymentTermsModal open={termsOpen} onClose={() => setTermsOpen(false)} bodyFont={bodyFont} />
      ) : null}
    </div>
  );
}
