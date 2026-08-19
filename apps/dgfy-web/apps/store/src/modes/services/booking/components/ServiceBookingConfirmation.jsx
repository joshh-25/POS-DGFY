import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export function ServiceBookingConfirmation({
  isMobileViewport,
  confirmationReference,
  confirmationServiceName,
  confirmationAmount,
  checkoutResult,
  money,
  servicesPrimary = '#0f766e',
  servicesPrimaryDark = '#134e4a',
  servicesPrimarySoft = '#ecfeff',
  servicesPrimaryBorder = 'rgba(15,118,110,0.2)',
  servicesPrimaryShadow = 'rgba(15,118,110,0.24)',
  onTrackBooking,
  onResetAndBackToServices,
}) {
  const bookingReferences = Array.isArray(checkoutResult?.bookings)
    ? checkoutResult.bookings.map((booking) => String(booking?.public_reference || '').trim()).filter(Boolean)
    : [];
  const paymentLinks = Array.isArray(checkoutResult?.payments)
    ? checkoutResult.payments.filter((entry) => entry?.checkout_url)
    : [];
  return (
    <section
      style={{
        border: '1px solid #dbe5ee',
        borderRadius: 28,
        background: '#fff',
        padding: isMobileViewport ? 20 : 28,
        boxShadow: '0 22px 56px rgba(15, 23, 42, 0.08)',
        display: 'grid',
        gap: 20,
        maxWidth: 860,
      }}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content', padding: '8px 12px', borderRadius: 999, background: '#ecfdf5', color: '#15803d', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <CheckCircle2 size={16} />
          Booking confirmed
        </div>
        <div style={{ fontSize: isMobileViewport ? 28 : 36, fontWeight: 900, color: '#0f172a', lineHeight: 1.08 }}>
          Your service booking is confirmed
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#64748b', maxWidth: 680 }}>
          The request has been sent to the store team. They will message you using the contact details you provided to confirm the schedule and assist with the next steps.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Reference</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{confirmationReference || 'Pending'}</div>
        </div>
        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{confirmationServiceName}</div>
        </div>
        <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated total</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{money(confirmationAmount)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, fontSize: 14, color: '#334155', lineHeight: 1.65 }}>
        <div>Keep your booking reference in case you need to follow up with the team.</div>
        <div>You can return to the services page anytime to browse other services.</div>
      </div>

      {bookingReferences.length > 1 && (
        <div style={{ display: 'grid', gap: 8, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking references</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {bookingReferences.map((reference) => (
              <span key={reference} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 34, borderRadius: 999, background: servicesPrimarySoft, color: servicesPrimaryDark, border: `1px solid ${servicesPrimaryBorder}`, padding: '0 12px', fontSize: 13, fontWeight: 800 }}>
                {reference}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12, flexWrap: 'wrap' }}>
        {confirmationReference && typeof onTrackBooking === 'function' && (
          <button
            type="button"
            onClick={onTrackBooking}
            style={{
              minHeight: 46,
              borderRadius: 14,
              border: `1px solid ${servicesPrimary}`,
              background: '#fff',
              color: servicesPrimaryDark,
              padding: '0 18px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Track booking
          </button>
        )}
        {(paymentLinks.length > 0 ? paymentLinks : (checkoutResult?.payment?.checkout_url ? [checkoutResult.payment] : [])).map((payment, index) => (
          <a
            key={`${payment?.checkout_url || 'payment'}-${index}`}
            href={payment.checkout_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 46,
              borderRadius: 14,
              background: servicesPrimary,
              color: '#fff',
              padding: '0 18px',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {paymentLinks.length > 1 ? `Continue to Payment ${index + 1}` : 'Continue to Payment'}
          </a>
        ))}
        <button
          type="button"
          onClick={onResetAndBackToServices}
          style={{
            minHeight: 46,
            borderRadius: 14,
            border: 'none',
            background: `linear-gradient(135deg, ${servicesPrimary}, ${servicesPrimaryDark})`,
            color: '#fff',
            padding: '0 18px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: `0 10px 24px ${servicesPrimaryShadow}`,
          }}
        >
          Back to Services
        </button>
      </div>
    </section>
  );
}
