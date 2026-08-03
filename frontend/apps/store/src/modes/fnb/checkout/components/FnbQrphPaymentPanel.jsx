import { useState } from 'react';

const TERMINAL_PAYMENT_STATUSES = new Set([
  'finalized',
  'failed',
  'expired',
  'cancelled',
  'paid_manual_resolution_required'
]);

const formatStatus = (value) => String(value || 'awaiting_payment')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export function FnbQrphPaymentPanel({
  onConfirmTestPayment,
  onUseCash,
  paymentSession,
  refreshing = false
}) {
  const [confirming, setConfirming] = useState(false);
  if (!paymentSession) return null;

  const terminal = TERMINAL_PAYMENT_STATUSES.has(paymentSession.status);
  const failed = ['failed', 'expired', 'cancelled', 'paid_manual_resolution_required'].includes(paymentSession.status);

  return (
    <section
      aria-live="polite"
      style={{
        border: `1px solid ${failed ? '#fca5a5' : '#93c5fd'}`,
        borderRadius: 14,
        background: failed ? '#fef2f2' : '#eff6ff',
        padding: 14,
        display: 'grid',
        gap: 10
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: failed ? '#991b1b' : '#1e3a8a' }}>
        Pay via QR Ph (PayMongo test)
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
        This QR contains the exact order total. Complete it through the PayMongo test flow; payment confirmation updates automatically.
      </p>
      {paymentSession.qr_code_image_url ? (
        <img
          src={paymentSession.qr_code_image_url}
          alt="PayMongo QR Ph payment code"
          style={{
            width: 220,
            maxWidth: '100%',
            justifySelf: 'center',
            borderRadius: 10,
            background: '#fff',
            padding: 8
          }}
        />
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
        <span>Status</span>
        <strong>{formatStatus(paymentSession.status)}</strong>
      </div>
      {paymentSession.failure_reason ? (
        <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{paymentSession.failure_reason}</p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!terminal && typeof onConfirmTestPayment === 'function' ? (
          <button
            type="button"
            onClick={async () => {
              if (confirming) return;
              setConfirming(true);
              try {
                await onConfirmTestPayment();
              } finally {
                setConfirming(false);
              }
            }}
            disabled={confirming || refreshing}
            style={{
              minHeight: 38,
              borderRadius: 10,
              border: '1px solid #16a34a',
              background: '#16a34a',
              color: '#fff',
              padding: '0 12px',
              fontWeight: 800,
              cursor: confirming ? 'wait' : 'pointer'
            }}
          >
            {confirming ? 'Confirming test payment...' : 'Confirm test payment'}
          </button>
        ) : null}
        {paymentSession.checkout_url ? (
          <a
            href={paymentSession.checkout_url}
            target="_blank"
            rel="noreferrer"
            style={{
              minHeight: 38,
              borderRadius: 10,
              background: '#2563eb',
              color: '#fff',
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              fontWeight: 800,
              textDecoration: 'none'
            }}
          >
            Open PayMongo test payment
          </a>
        ) : null}
        {!terminal || failed ? (
          <button
            type="button"
            onClick={onUseCash}
            style={{
              minHeight: 38,
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              padding: '0 12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Use cash instead
          </button>
        ) : null}
      </div>
    </section>
  );
}
