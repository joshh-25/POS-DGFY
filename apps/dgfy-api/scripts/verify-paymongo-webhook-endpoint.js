import dotenv from 'dotenv';

dotenv.config();

const endpointUrl = process.env.PAYMONGO_WEBHOOK_ENDPOINT_URL || process.argv[2];

if (!endpointUrl) {
  console.error('[paymongo-webhook-endpoint] Missing endpoint URL. Set PAYMONGO_WEBHOOK_ENDPOINT_URL or pass it as the first argument.');
  process.exit(1);
}

if (!/^https:\/\/.+/i.test(endpointUrl)) {
  console.error('[paymongo-webhook-endpoint] PayMongo webhook endpoint must be HTTPS.');
  process.exit(1);
}

const response = await fetch(endpointUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
});

const body = await response.text().catch(() => '');
const result = {
  endpoint_url: endpointUrl,
  http_status: response.status,
  expected_status: 401,
  route_present: response.status !== 404,
  signature_enforced: response.status === 401,
  body_preview: body.slice(0, 300)
};

console.log(JSON.stringify(result, null, 2));

if (response.status !== 401) {
  console.error('[paymongo-webhook-endpoint] Endpoint is not production-ready. Expected unsigned webhook probe to return 401.');
  process.exitCode = 1;
}
