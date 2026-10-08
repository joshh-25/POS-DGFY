import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signDgfyEvent } from '../src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const outputDirectory = path.join(repositoryRoot, '.tmp/dglaundry-event-specimens');
export const buildDglaundryEventSpecimens = ({
  signEvent = signDgfyEvent,
  env = process.env,
  now = new Date()
} = {}) => {
  const authority = new URL(env.DGLAUNDRY_PARTNER_BASE_URL || 'https://laundry.surebizcorp.com').host;
  const eventPath = '/api/v1/integrations/dgfy/events';
  const source = new URL(env.DGFY_EVENT_SOURCE || 'https://api.dgfy.ph').origin;
  const timestamp = now.toISOString();
  const makeEvent = ({ type, data }) => ({ specversion: '1.0', id: `dglaundry-specimen-${crypto.randomUUID()}`, type, source, time: timestamp, data });
  const normal = makeEvent({
    type: 'dgfy.company.access_changed.v1',
    data: { companyId: 'specimen-company', issuer: env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc', subject: 'specimen-subject', companyAccessVersion: 1, locations: [{ locationId: 'specimen-location', status: 'active' }] }
  });
  const payment = makeEvent({
    type: 'dgfy.laundry_order.payment_status_changed.v1',
    data: { companyId: 'specimen-company', locationId: 'specimen-location', externalOrderReference: 'DGLAUNDRY-EVENT-SPECIMEN-PAYMENT', externalTrackingReference: 'specimen-tracking-reference', payment: { owner: 'dgfy', status: 'paid', amountCentavos: 100, externalReference: 'pay_test_specimen', provider: 'paymongo' } }
  });
  const sign = (body) => ({ method: 'POST', authority, path: eventPath, body, headers: signEvent({ method: 'POST', authority, path: eventPath, body }), generatedAt: now.toISOString() });
  const specimens = { normal: sign(normal), payment: sign(payment) };
  // Reuse the exact body and signature envelope to demonstrate replay detection.
  specimens['duplicate-payment'] = structuredClone(specimens.payment);
  return { authority, path: eventPath, specimens };
};

const main = async () => {
  const { authority, path: eventPath, specimens } = buildDglaundryEventSpecimens();
  await fs.mkdir(outputDirectory, { recursive: true });
  for (const [name, specimen] of Object.entries(specimens)) {
    await fs.writeFile(path.join(outputDirectory, `${name}.json`), `${JSON.stringify(specimen, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({ outputDirectory: path.relative(repositoryRoot, outputDirectory), authority, path: eventPath, specimens: Object.keys(specimens), duplicatePaymentIdentityMatches: JSON.stringify(specimens.payment) === JSON.stringify(specimens['duplicate-payment']) }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
