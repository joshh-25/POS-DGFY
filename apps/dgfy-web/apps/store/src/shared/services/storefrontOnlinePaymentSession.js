export const STOREFRONT_ONLINE_PAYMENT_TYPES = Object.freeze(['qrph', 'card', 'gcash', 'maya']);

export const isStorefrontOnlinePaymentType = (paymentType) => (
  STOREFRONT_ONLINE_PAYMENT_TYPES.includes(String(paymentType || '').trim().toLowerCase())
);

export async function createStorefrontOnlinePaymentSession({
  authToken,
  checkoutPayload,
  guestCheckoutProof = null,
  idempotencyKey,
  paymentType,
  requestJson,
  storeSlug
}) {
  const normalizedPaymentType = String(paymentType || '').trim().toLowerCase();
  if (!isStorefrontOnlinePaymentType(normalizedPaymentType)) {
    throw new Error('Only QR Ph, card, GCash, or Maya can create an online payment session.');
  }

  const sessionResult = await requestJson('/api/v1/store/checkout/payment-sessions', {
    method: 'POST',
    storeSlug,
    authToken,
    body: {
      ...checkoutPayload,
      idempotency_key: idempotencyKey,
      payment_type: normalizedPaymentType,
      guest_checkout_proof: guestCheckoutProof
    }
  });
  const paymentSession = sessionResult?.payment_session;
  if (!paymentSession?.payment_session_id) {
    throw new Error('PayMongo did not return an online payment session.');
  }
  if (paymentSession.status === 'failed') {
    throw new Error(paymentSession.failure_reason || 'PayMongo could not create this online payment.');
  }
  return paymentSession;
}
