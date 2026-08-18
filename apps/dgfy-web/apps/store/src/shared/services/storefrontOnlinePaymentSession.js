export const STOREFRONT_HOSTED_PAYMENT_TYPES = Object.freeze([
  'card',
  'gcash',
  'maya',
  'grab_pay',
  'shopeepay'
]);

export const STOREFRONT_ONLINE_PAYMENT_TYPES = Object.freeze([
  'qrph',
  ...STOREFRONT_HOSTED_PAYMENT_TYPES
]);

export const isStorefrontHostedPaymentType = (paymentType) => (
  STOREFRONT_HOSTED_PAYMENT_TYPES.includes(String(paymentType || '').trim().toLowerCase())
);

export const isStorefrontDirectGcashPaymentSession = (paymentSession) => (
  paymentSession?.payment_flow === 'direct_gcash'
  && paymentSession?.payment_method === 'gcash'
);

export const getStorefrontOnlinePaymentLabel = (paymentType) => {
  switch (String(paymentType || '').trim().toLowerCase()) {
    case 'gcash':
      return 'GCash';
    case 'maya':
      return 'Maya';
    case 'grab_pay':
      return 'GrabPay';
    case 'shopeepay':
      return 'ShopeePay';
    case 'qrph':
      return 'QR Ph';
    default:
      return 'Card';
  }
};

export const isStorefrontOnlinePaymentType = (paymentType) => (
  STOREFRONT_ONLINE_PAYMENT_TYPES.includes(String(paymentType || '').trim().toLowerCase())
);

const PAYMONGO_API_BASE_URL = 'https://api.paymongo.com/v1';

const readPayMongoError = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => null);
  return payload?.errors?.[0]?.detail
    || payload?.errors?.[0]?.code
    || fallbackMessage;
};

const buildPayMongoPublicAuthHeaders = (publicKey) => ({
  Authorization: `Basic ${globalThis.btoa(`${publicKey}:`)}`,
  'Content-Type': 'application/json'
});

export async function startStorefrontDirectGcashPayment({
  billing = {},
  paymentSession
}) {
  if (!isStorefrontDirectGcashPaymentSession(paymentSession)) {
    throw new Error('This is not a direct GCash payment session.');
  }

  const paymentIntentId = String(paymentSession.provider_payment_intent_id || '').trim();
  const clientKey = String(paymentSession.paymongo_client_key || '').trim();
  const publicKey = String(paymentSession.paymongo_public_key || '').trim();
  const returnUrl = String(paymentSession.paymongo_return_url || '').trim();
  if (!paymentIntentId || !clientKey || !publicKey || !returnUrl) {
    throw new Error('PayMongo did not return the required GCash authorization details.');
  }

  const paymentMethodResponse = await globalThis.fetch(`${PAYMONGO_API_BASE_URL}/payment_methods`, {
    method: 'POST',
    headers: buildPayMongoPublicAuthHeaders(publicKey),
    body: JSON.stringify({
      data: {
        attributes: {
          type: 'gcash',
          billing: {
            name: billing.name || 'Storefront Customer',
            email: billing.email || undefined,
            phone: billing.phone || undefined
          }
        }
      }
    })
  });
  if (!paymentMethodResponse.ok) {
    throw new Error(await readPayMongoError(paymentMethodResponse, 'PayMongo could not create the GCash payment method.'));
  }
  const paymentMethodPayload = await paymentMethodResponse.json();
  const paymentMethodId = String(paymentMethodPayload?.data?.id || '').trim();
  if (!paymentMethodId) {
    throw new Error('PayMongo did not return a GCash payment method.');
  }

  const attachResponse = await globalThis.fetch(
    `${PAYMONGO_API_BASE_URL}/payment_intents/${encodeURIComponent(paymentIntentId)}/attach`,
    {
      method: 'POST',
      headers: buildPayMongoPublicAuthHeaders(publicKey),
      body: JSON.stringify({
        data: {
          attributes: {
            payment_method: paymentMethodId,
            client_key: clientKey,
            return_url: returnUrl
          }
        }
      })
    }
  );
  if (!attachResponse.ok) {
    throw new Error(await readPayMongoError(attachResponse, 'PayMongo could not start the GCash authorization.'));
  }
  const attachPayload = await attachResponse.json();
  const redirectUrl = String(
    attachPayload?.data?.attributes?.next_action?.redirect?.url
      || attachPayload?.data?.attributes?.next_action?.redirect_url
      || ''
  ).trim();
  if (!redirectUrl) {
    throw new Error('PayMongo did not return the GCash authorization redirect.');
  }

  return {
    paymentMethodId,
    redirectUrl
  };
}

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
    throw new Error('Only QR Ph, card, GCash, Maya, GrabPay, or ShopeePay can create an online payment session.');
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
