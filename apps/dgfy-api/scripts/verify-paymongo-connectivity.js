import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const envPath = path.join(backendRoot, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const args = new Set(process.argv.slice(2));
const mode = args.has('--live') ? 'live' : 'test';

if (mode === 'live' && process.env.PAYMONGO_ALLOW_LIVE_CONNECTIVITY_PROBE !== 'true') {
  console.error('[paymongo-connectivity] Refusing live probe without PAYMONGO_ALLOW_LIVE_CONNECTIVITY_PROBE=true.');
  process.exit(1);
}

const secretKey = mode === 'live'
  ? (process.env.PAYMONGO_LIVE_SECRET_KEY || process.env.PAYMONGO_SECRET_KEY)
  : (process.env.PAYMONGO_TEST_SECRET_KEY || process.env.PAYMONGO_SECRET_KEY);

if (!secretKey) {
  console.error(`[paymongo-connectivity] Missing ${mode === 'live' ? 'PAYMONGO_LIVE_SECRET_KEY' : 'PAYMONGO_TEST_SECRET_KEY'}.`);
  process.exit(1);
}

const baseUrl = process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1';
const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

const postPayMongo = async (pathName, body) => {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload?.errors?.[0] || {};
    throw new Error(`${pathName} failed with ${response.status}: ${error.code || error.detail || 'unknown_error'}`);
  }
  return payload.data;
};

const capabilityResponse = await fetch(`${baseUrl}/merchants/capabilities/payment_methods`, {
  headers: {
    Authorization: authHeader,
    Accept: 'application/json'
  }
});
const capabilityPayload = await capabilityResponse.json().catch(() => ({}));
if (!capabilityResponse.ok) {
  const error = capabilityPayload?.errors?.[0] || {};
  throw new Error(`/merchants/capabilities/payment_methods failed with ${capabilityResponse.status}: ${error.code || error.detail || 'unknown_error'}`);
}
const supportedPaymentMethods = Array.isArray(capabilityPayload)
  ? capabilityPayload.map((method) => String(method || '').trim().toLowerCase()).filter(Boolean)
  : [];

const paymentIntent = await postPayMongo('/payment_intents', {
  data: {
    attributes: {
      amount: 10000,
      currency: 'PHP',
      payment_method_allowed: ['qrph'],
      description: `SKU ${mode} QR Ph connectivity probe`,
      metadata: {
        source: 'sku_inventory_manager_connectivity_probe',
        mode
      }
    }
  }
});

const paymentMethod = await postPayMongo('/payment_methods', {
  data: {
    attributes: {
      type: 'qrph',
      billing: {
        name: 'SKU Sandbox Probe',
        email: 'sandbox@example.com',
        phone: '+639171234567'
      },
      metadata: {
        source: 'sku_inventory_manager_connectivity_probe',
        mode
      }
    }
  }
});

const attachedIntent = await postPayMongo(`/payment_intents/${paymentIntent.id}/attach`, {
  data: {
    attributes: {
      payment_method: paymentMethod.id,
      return_url: process.env.STOREFRONT_PAYMENT_RETURN_URL || 'http://localhost:5173/payment-return'
    }
  }
});

const nextAction = attachedIntent?.attributes?.next_action || {};
const code = nextAction?.code || {};

console.log(JSON.stringify({
  ok: true,
  mode,
  base_url: baseUrl,
  supported_payment_methods: [...new Set(supportedPaymentMethods)],
  requested_methods_supported: {
    card: supportedPaymentMethods.includes('card'),
    gcash: supportedPaymentMethods.includes('gcash'),
    maya: supportedPaymentMethods.includes('paymaya') || supportedPaymentMethods.includes('maya')
  },
  payment_intent_id_prefix: String(paymentIntent.id || '').slice(0, 8),
  payment_method_id_prefix: String(paymentMethod.id || '').slice(0, 8),
  attached_status: attachedIntent?.attributes?.status || null,
  has_qr_image: Boolean(code.image_url || code.imageUrl),
  expires_at_present: Boolean(code.expires_at || nextAction.expires_at || attachedIntent?.attributes?.expires_at)
}, null, 2));
