import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getStorefrontOnlinePaymentLabel,
  isStorefrontDirectCardPaymentSession,
  isStorefrontDirectPaymentSession,
  isStorefrontHostedPaymentType,
  startStorefrontDirectCardPayment
} from '../../services/storefrontOnlinePaymentSession.js';
import { formatCardNumber, getCardFieldErrors } from '../../utils/cardValidation.js';

const TERMINAL_PAYMENT_STATUSES = new Set([
  'finalized',
  'failed',
  'expired',
  'cancelled',
  'paid_manual_resolution_required'
]);

const DIRECT_CARD_SUBMISSION_STORAGE_PREFIX = 'dgfy_storefront_direct_card_submitted:';

const getDirectCardSubmissionStorageKey = (paymentSessionId) => {
  const normalizedId = String(paymentSessionId || '').trim();
  return normalizedId ? `${DIRECT_CARD_SUBMISSION_STORAGE_PREFIX}${normalizedId}` : '';
};

const readDirectCardSubmission = (paymentSessionId) => {
  if (typeof window === 'undefined') return false;
  const key = getDirectCardSubmissionStorageKey(paymentSessionId);
  if (!key) return false;
  try {
    return window.sessionStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const markDirectCardSubmission = (paymentSessionId) => {
  if (typeof window === 'undefined') return;
  const key = getDirectCardSubmissionStorageKey(paymentSessionId);
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, 'true');
  } catch {
    // Private browsing or disabled storage must not block payment submission.
  }
};

const clearDirectCardSubmission = (paymentSessionId) => {
  if (typeof window === 'undefined') return;
  const key = getDirectCardSubmissionStorageKey(paymentSessionId);
  if (!key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Private browsing or disabled storage must not block payment recovery.
  }
};

const formatStatus = (value) => String(value || 'awaiting_payment')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const getCardInputStyle = (hasError) => ({
  minHeight: 38,
  border: `1px solid ${hasError ? '#dc2626' : '#cbd5e1'}`,
  boxShadow: hasError ? '0 0 0 1px #dc2626' : undefined,
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 14,
  background: hasError ? '#fff7f7' : '#fff'
});

const getCardLabelStyle = (hasError) => ({
  display: 'grid',
  gap: 4,
  fontSize: 12,
  color: hasError ? '#b91c1c' : '#334155',
  fontWeight: 700
});

export function StorefrontOnlinePaymentPanel({
  billing = {},
  onConfirmTestPayment,
  onChooseAnotherPaymentMethod,
  paymentEnvironment = null,
  paymentSession,
  refreshing = false,
  paymentType = paymentSession?.payment_method || 'qrph'
}) {
  const [confirming, setConfirming] = useState(false);
  const [cardDetails, setCardDetails] = useState({ cardholder: '', cardNumber: '', expiration: '', cvc: '' });
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardError, setCardError] = useState('');
  const [cardFieldErrors, setCardFieldErrors] = useState({});
  const paymentSessionId = String(paymentSession?.payment_session_id || '').trim();
  const directCard = isStorefrontDirectCardPaymentSession(paymentSession);
  const paymentSessionTerminal = TERMINAL_PAYMENT_STATUSES.has(paymentSession?.status);
  const [cardSubmitted, setCardSubmitted] = useState(() => readDirectCardSubmission(paymentSessionId));

  useEffect(() => {
    if (!directCard) {
      setCardDetails({ cardholder: '', cardNumber: '', expiration: '', cvc: '' });
      setCardError('');
      setCardFieldErrors({});
      setCardSubmitted(false);
    } else if (paymentSessionTerminal) {
      clearDirectCardSubmission(paymentSessionId);
      setCardSubmitted(false);
    } else {
      setCardSubmitted(readDirectCardSubmission(paymentSessionId));
    }
  }, [directCard, paymentSessionId, paymentSessionTerminal]);

  if (!paymentSession) return null;

  const terminal = paymentSessionTerminal;
  const failed = ['failed', 'expired', 'cancelled', 'paid_manual_resolution_required'].includes(paymentSession.status);
  const retryablePayment = ['failed', 'expired', 'cancelled'].includes(paymentSession.status);
  const paymentInFlight = ['awaiting_payment', 'paid'].includes(paymentSession.status);
  const cardSubmissionPersisted = directCard && readDirectCardSubmission(paymentSessionId);
  const cardAuthorizationSubmitted = cardSubmitted || cardSubmissionPersisted;
  const paymentLabel = getStorefrontOnlinePaymentLabel(paymentType);
  const directPayment = isStorefrontDirectPaymentSession(paymentSession);
  const isTestEnvironment = paymentEnvironment === 'test';
  const paymentReturnPending = paymentType === 'card'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('payment_status') === 'return'
    && !terminal;
  const hosted = isStorefrontHostedPaymentType(paymentType) && !directPayment && !paymentReturnPending;
  const processing = paymentInFlight && (directCard
    ? cardSubmitting || cardAuthorizationSubmitted || paymentReturnPending
    : true);
  const canChooseAnotherPaymentMethod = retryablePayment
    || (directCard && Boolean(cardError) && !cardSubmitting && !cardAuthorizationSubmitted && !paymentReturnPending);

  const handleCardSubmit = async () => {
    if (cardSubmitting || cardAuthorizationSubmitted) return;

    const validationErrors = getCardFieldErrors(cardDetails);
    if (Object.keys(validationErrors).length > 0) {
      setCardFieldErrors(validationErrors);
      setCardError('');
      return;
    }

    setCardSubmitting(true);
    setCardError('');
    setCardFieldErrors({});
    try {
      const result = await startStorefrontDirectCardPayment({
        billing,
        cardDetails,
        paymentSession
      });
      if (result.status === 'awaiting_payment_method') {
        clearDirectCardSubmission(paymentSessionId);
        setCardError(result.errorMessage || 'PayMongo could not authorize this card. Check your details and try again.');
        setCardSubmitted(false);
        return;
      }
      markDirectCardSubmission(paymentSessionId);
      setCardSubmitted(true);
      setCardDetails({ cardholder: '', cardNumber: '', expiration: '', cvc: '' });
      if (result.redirectUrl && typeof window !== 'undefined') {
        window.location.assign(result.redirectUrl);
      }
    } catch (error) {
      setCardError(error?.message || 'Unable to start card authorization.');
    } finally {
      setCardSubmitting(false);
    }
  };

  const handleCardFieldChange = (field, value) => {
    setCardDetails((current) => ({ ...current, [field]: value }));
    setCardFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setCardError('');
  };

  return (
    <section
      aria-live="polite"
      aria-busy={processing || refreshing ? 'true' : undefined}
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
        {paymentReturnPending
          ? 'Confirming card payment'
          : directPayment
            ? `Pay via ${paymentLabel}`
            : hosted
              ? `Pay via ${paymentLabel}`
              : `Pay via QR Ph${isTestEnvironment ? ' (PayMongo test)' : ''}`}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
        {paymentReturnPending
          ? '3-D Secure returned. Payment confirmation updates automatically; please do not submit the card again.'
          : directCard
            ? 'Enter your card details below. PayMongo will open 3-D Secure authentication when your bank requires it.'
            : directPayment
              ? `Continue in the ${paymentLabel} app or browser authorization screen. Payment confirmation updates automatically when you return.`
              : hosted
                ? `Continue to PayMongo to complete your ${paymentLabel} payment. Payment confirmation updates automatically.`
                : `This QR contains the exact order total. Complete it through ${isTestEnvironment ? 'the PayMongo test flow' : 'your banking or wallet app'}; payment confirmation updates automatically.`}
      </p>
      {directCard && !terminal && !cardAuthorizationSubmitted && !paymentReturnPending ? (
        <div style={{ display: 'grid', gap: 9, borderRadius: 10, background: '#fff', border: '1px solid #bfdbfe', padding: 12 }}>
          <label style={getCardLabelStyle(cardFieldErrors.cardholder)}>
            Cardholder name
            <input
              autoComplete="cc-name"
              value={cardDetails.cardholder}
              onChange={(event) => handleCardFieldChange('cardholder', event.target.value)}
              aria-invalid={Boolean(cardFieldErrors.cardholder)}
              aria-describedby={cardFieldErrors.cardholder ? 'cardholder-error' : undefined}
              style={getCardInputStyle(cardFieldErrors.cardholder)}
            />
            {cardFieldErrors.cardholder ? <span id="cardholder-error" role="alert">{cardFieldErrors.cardholder}</span> : null}
          </label>
          <label style={getCardLabelStyle(cardFieldErrors.cardNumber)}>
            Card number
            <input
              autoComplete="cc-number"
              inputMode="numeric"
              value={cardDetails.cardNumber}
              onChange={(event) => handleCardFieldChange('cardNumber', formatCardNumber(event.target.value))}
              placeholder="4242 4242 4242 4242"
              maxLength={23}
              aria-invalid={Boolean(cardFieldErrors.cardNumber)}
              aria-describedby={cardFieldErrors.cardNumber ? 'card-number-error' : undefined}
              style={getCardInputStyle(cardFieldErrors.cardNumber)}
            />
            {cardFieldErrors.cardNumber ? <span id="card-number-error" role="alert">{cardFieldErrors.cardNumber}</span> : null}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={getCardLabelStyle(cardFieldErrors.expiration)}>
              Expiry (MM/YY)
              <input
                autoComplete="cc-exp"
                inputMode="numeric"
                value={cardDetails.expiration}
                onChange={(event) => handleCardFieldChange('expiration', event.target.value)}
                placeholder="12/30"
                maxLength={7}
                aria-invalid={Boolean(cardFieldErrors.expiration)}
                aria-describedby={cardFieldErrors.expiration ? 'expiry-error' : undefined}
                style={getCardInputStyle(cardFieldErrors.expiration)}
              />
              {cardFieldErrors.expiration ? <span id="expiry-error" role="alert">{cardFieldErrors.expiration}</span> : null}
            </label>
            <label style={getCardLabelStyle(cardFieldErrors.cvc)}>
              CVC
              <input
                autoComplete="cc-csc"
                inputMode="numeric"
                type="password"
                value={cardDetails.cvc}
                onChange={(event) => handleCardFieldChange('cvc', event.target.value)}
                placeholder="123"
                maxLength={4}
                aria-invalid={Boolean(cardFieldErrors.cvc)}
                aria-describedby={cardFieldErrors.cvc ? 'cvc-error' : undefined}
                style={getCardInputStyle(cardFieldErrors.cvc)}
              />
              {cardFieldErrors.cvc ? <span id="cvc-error" role="alert">{cardFieldErrors.cvc}</span> : null}
            </label>
          </div>
          {cardError ? <p style={{ margin: 0, color: '#b91c1c', fontSize: 12 }}>{cardError}</p> : null}
          <button
            type="button"
            onClick={handleCardSubmit}
            disabled={cardSubmitting || refreshing}
            style={{ minHeight: 40, border: 0, borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 800, cursor: cardSubmitting ? 'wait' : 'pointer' }}
          >
            {cardSubmitting ? 'Starting secure authorization...' : 'Continue securely with card'}
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>Your card details are sent directly to PayMongo and are not stored by DGFY.</span>
        </div>
      ) : null}
      {directCard && (cardAuthorizationSubmitted || paymentReturnPending) && !terminal ? (
        <div role="status" style={{ borderRadius: 10, background: '#fff', border: '1px solid #bfdbfe', padding: 10, color: '#1e3a8a', fontSize: 13 }}>
          {paymentReturnPending
            ? '3-D Secure returned. Waiting for PayMongo confirmation.'
            : 'Card submitted securely. Waiting for PayMongo confirmation.'}
        </div>
      ) : null}
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
      {processing ? (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            borderRadius: 10,
            background: '#fff',
            border: '1px solid #bfdbfe',
            padding: 10,
            color: '#1e3a8a'
          }}
        >
          <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          <div>
            <strong style={{ display: 'block', fontSize: 13 }}>Payment processing</strong>
            <span style={{ display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.45 }}>
              {paymentSession.status === 'paid'
                ? 'Payment received. We are finalizing your order.'
                : 'We are confirming your payment. Please do not pay again.'}
            </span>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!terminal && paymentType === 'qrph' && typeof onConfirmTestPayment === 'function' ? (
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
        {paymentSession.checkout_url && !paymentReturnPending ? (
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
            {hosted ? `Open PayMongo ${paymentLabel} payment` : `Open PayMongo${isTestEnvironment ? ' test' : ''} payment`}
          </a>
        ) : null}
        {canChooseAnotherPaymentMethod ? (
          <button
            type="button"
            onClick={onChooseAnotherPaymentMethod}
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
            Choose another payment method
          </button>
        ) : null}
      </div>
    </section>
  );
}
