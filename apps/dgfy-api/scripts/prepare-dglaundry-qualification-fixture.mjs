import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCreateDglaundryBookingPaymentSessionUseCase } from '../src/modules/commercePayments/usecases/createDglaundryBookingPaymentSessionUseCase.js';
import { commercePaymentRepository } from '../src/modules/commercePayments/index.js';
import { paymongoService } from '../src/services/paymongoService.js';
import { dglaundryDurableDelivery, dgfyLaundryOrderRepository } from '../src/modules/dgfyLaundryOrders/index.js';
import { DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE } from '../src/modules/dgfyLaundryOrders/qualificationConstants.js';

const main = async () => {
  if (process.env.NODE_ENV !== 'staging') throw new Error('Fixture preparation is restricted to NODE_ENV=staging.');
  if (process.env.PAYMONGO_MODE !== 'test') throw new Error('Fixture preparation requires PAYMONGO_MODE=test.');
  if (String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED || '').toLowerCase() !== 'true'
      || String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH || '').toLowerCase() === 'true') {
    throw new Error('The DGLaundry booking payment gate must be enabled and its kill switch clear.');
  }
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: node apps/dgfy-api/scripts/prepare-dglaundry-qualification-fixture.mjs <booking-payload.json>');
  const payload = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
  if (payload.mode !== 'fixed' || !payload.tenant_id || !payload.location_id || !Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error('Fixture input must be a fixed-price booking with tenant_id, location_id, and at least one real service line.');
  }
  if (String(payload.tenant_id) !== String(process.env.DGLAUNDRY_QUALIFICATION_COMPANY_ID || '')
      || String(payload.company_id || payload.tenant_id) !== String(process.env.DGLAUNDRY_QUALIFICATION_COMPANY_ID || '')
      || String(payload.location_id) !== String(process.env.DGLAUNDRY_QUALIFICATION_LOCATION_ID || '')) {
    throw new Error('Fixture input tenant_id/location_id must match the explicitly reserved qualification company/location configuration.');
  }
  const idempotencyKey = String(payload.idempotency_key || '').trim();
  if (idempotencyKey.length < 16) throw new Error('Fixture input requires a stable, high-entropy idempotency_key (16+ characters).');

  const createSession = buildCreateDglaundryBookingPaymentSessionUseCase({
    commercePaymentRepository,
    paymongoService,
    partnerClient: dglaundryDurableDelivery,
    mappingRepository: dgfyLaundryOrderRepository,
    allowQualificationFixture: true
  });
  const result = await createSession({ payload: {
    ...payload,
    tenant_id: process.env.DGLAUNDRY_QUALIFICATION_COMPANY_ID,
    company_id: process.env.DGLAUNDRY_QUALIFICATION_COMPANY_ID,
    location_id: process.env.DGLAUNDRY_QUALIFICATION_LOCATION_ID,
    __qualification_fixture: true
  } });
  if (!result?.success) throw result?.error || new Error('DGLaundry qualification booking could not be prepared.');
  const paymentSession = result.data?.payment_session;
  if (!paymentSession?.payment_session_id || paymentSession.target_type !== 'dglaundry_booking') {
    throw new Error('The booking flow did not return a DGLaundry payment session.');
  }
  const child = result.data?.booking_group?.children?.[0];
  if (child?.externalOrderReference !== DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE) {
    throw new Error('The booking flow did not reserve the required qualification order reference.');
  }
  await dgfyLaundryOrderRepository.upsertOrder({
    companyId: String(payload.tenant_id),
    locationId: String(payload.location_id),
    externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
    trackingReference: child.externalTrackingReference,
    version: 1,
    status: 'pending_payment',
    payload: {
      companyId: String(payload.tenant_id),
      locationId: String(payload.location_id),
      externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
      externalTrackingReference: child.externalTrackingReference,
      status: 'pending_payment',
      mode: 'fixed'
    }
  });
  process.stdout.write(`${JSON.stringify({
    orderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
    paymentSessionReference: paymentSession.payment_session_id,
    paymentMode: 'test',
    status: paymentSession.status,
    expiresAt: paymentSession.expires_at,
    idempotentReplay: result.data.idempotent_replay === true,
    next: 'Set DGLAUNDRY_QUALIFICATION_COMPANY_ID, DGLAUNDRY_QUALIFICATION_LOCATION_ID, and DGLAUNDRY_QUALIFICATION_PAYMENT_SESSION_REFERENCE to these verified fixture values.'
  }, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main().catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
}
