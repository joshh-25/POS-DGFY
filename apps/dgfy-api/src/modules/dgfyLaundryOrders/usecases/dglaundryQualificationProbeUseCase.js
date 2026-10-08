import crypto from 'node:crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { expireDglaundryBookingSession, notifyDglaundryBookingRefund } from '../../commercePayments/usecases/finalizeDglaundryBookingSession.js';
import { requestHash } from '../contracts.js';
import { DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE } from '../qualificationConstants.js';

export { DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE } from '../qualificationConstants.js';

const fail = (message, statusCode, code = DomainErrorCode.VALIDATION_FAILED) => {
  throw new DomainError(code, message, { statusCode });
};
const text = (value) => String(value ?? '').trim();
const parseObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};
const sessionOrderReference = (session) => {
  const payload = parseObject(session?.checkout_payload);
  return text(payload.external_order_reference || payload.externalOrderReference
    || payload.dglaundry_submission?.externalOrderReference
    || payload.dglaundry_booking_group?.children?.[0]?.externalOrderReference);
};
const responseState = (response, fallback) => text(response?.state || response?.data?.state || response?.data?.status || fallback);

export const buildDglaundryQualificationProbeUseCase = ({
  orderRepository,
  mappingRepository,
  orderUseCases,
  paymentRepository,
  paymongoService,
  createRefundUseCase,
  partnerClient,
  now = () => new Date()
}) => async ({ kind, externalOrderReference, idempotencyKey }) => {
  if (process.env.NODE_ENV !== 'staging') fail('DGLaundry qualification probes are available only in staging.', 404, DomainErrorCode.RESOURCE_NOT_FOUND);
  if (text(externalOrderReference) !== DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE) {
    fail('The requested order is not the reserved qualification sandbox order.', 404, DomainErrorCode.RESOURCE_NOT_FOUND);
  }
  const key = text(idempotencyKey);
  if (!key || key.length < 16 || key.length > 160) fail('A bounded Idempotency-Key of at least 16 characters is required.', 400);
  if (!['cancel', 'expire', 'refund', 'receipt'].includes(kind)) fail('Unknown DGLaundry qualification probe.', 404, DomainErrorCode.RESOURCE_NOT_FOUND);

  const companyId = text(process.env.DGLAUNDRY_QUALIFICATION_COMPANY_ID);
  const locationId = text(process.env.DGLAUNDRY_QUALIFICATION_LOCATION_ID);
  if (!companyId || !locationId) fail('The qualification company/location has not been configured.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);
  const mapping = await mappingRepository.findActiveMapping({ companyId, locationId });
  if (!mapping) fail('The qualification company/location is not actively mapped.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);

  const order = await orderRepository.getOrder({ companyId, locationId, externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE });
  if (!order) fail('The reserved qualification order has not been provisioned in the live order projection.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);

  const readback = async () => orderRepository.getOrder({ companyId, locationId, externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE });
  if (kind === 'cancel') {
    const result = await orderUseCases.cancelOrder({
      payload: {
        companyId,
        locationId,
        externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
        externalTrackingReference: order.external_tracking_reference || undefined,
        reason: 'DGLAUNDRY_QUALIFICATION_PROBE'
      },
      accountId: order.dgfy_account_id || null,
      idempotencyKey: `dglaundry-probe-cancel:${key}`.slice(0, 160)
    });
    const current = await readback();
    return {
      externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
      state: responseState(result.response, current?.status || 'cancel_requested'),
      paymentMode: String(process.env.PAYMONGO_MODE || 'unconfigured').toLowerCase(),
      companyId,
      locationId
    };
  }

  const sessionReference = text(process.env.DGLAUNDRY_QUALIFICATION_PAYMENT_SESSION_REFERENCE);
  const session = sessionReference ? await paymentRepository.findSessionByPublicReference(sessionReference) : null;
  const checkoutPayload = parseObject(session?.checkout_payload);
  if (!session || session.target_type !== 'dglaundry_booking'
    || String(session.provider || '').toLowerCase() !== 'paymongo'
    || sessionOrderReference(session) !== DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE
    || text(checkoutPayload.company_id) !== companyId || text(checkoutPayload.location_id) !== locationId) {
    fail('A payment session tied to the reserved qualification order has not been provisioned.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);
  }
  if (String(process.env.PAYMONGO_MODE || '').toLowerCase() !== 'test') {
    fail('Payment lifecycle probes require PAYMONGO_MODE=test.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);
  }

  if (kind === 'expire') {
    if (!['created', 'pending'].includes(String(session.status || '').toLowerCase())) {
      fail('Only an unpaid qualification checkout can be expired.', 409, DomainErrorCode.CONFLICT);
    }
    if (!session.expires_at || new Date(session.expires_at).getTime() > now().getTime()) {
      fail('The qualification checkout has not reached its expiry time.', 409, DomainErrorCode.CONFLICT);
    }
    const paymentIntentId = text(session.provider_payment_intent_id);
    if (!paymentIntentId) fail('The qualification payment has no PayMongo Payment Intent to inspect.', 409, DomainErrorCode.CONFLICT);
    const resource = await paymongoService.retrievePaymentIntent(paymentIntentId);
    const providerStatus = text(resource?.attributes?.status || resource?.status).toLowerCase();
    if (!['expired', 'cancelled', 'canceled'].includes(providerStatus)) {
      fail('PayMongo has not confirmed that the qualification Payment Intent expired.', 409, DomainErrorCode.CONFLICT);
    }
    const updated = await expireDglaundryBookingSession({
      session,
      resource,
      providerEventId: `dglaundry-qualification-expired-${session.public_reference}`,
      commercePaymentRepository: paymentRepository,
      partnerClient
    });
    return {
      externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
      state: updated.status,
      paymentMode: 'test',
      companyId,
      locationId
    };
  }

  if (kind === 'refund') {
    const refundProbeKey = `dglaundry-qualification-refund:${key}`.slice(0, 160);
    const refundRequestHash = requestHash({ kind, externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE, companyId, locationId, paymentSessionReference: session.public_reference });
    const existing = await orderRepository.findIdempotency(refundProbeKey);
    if (existing) {
      if (existing.request_hash !== refundRequestHash) fail('The Idempotency-Key was already used for a different qualification refund.', 409, DomainErrorCode.CONFLICT);
      if (existing.response?.qualification_probe_result) return existing.response.qualification_probe_result;
      fail('This qualification refund is already processing or needs operator reconciliation.', 409, DomainErrorCode.CONFLICT);
    }
    const reservationOwner = crypto.randomUUID();
    const reservation = await orderRepository.saveIdempotency({
      key: refundProbeKey,
      requestHash: refundRequestHash,
      operation: 'dglaundryQualificationRefund',
      response: { qualification_probe_owner: reservationOwner, status: 'processing' }
    });
    if (reservation.request_hash !== refundRequestHash || reservation.response?.qualification_probe_owner !== reservationOwner) {
      fail('This qualification refund is already processing or needs operator reconciliation.', 409, DomainErrorCode.CONFLICT);
    }
    const refundableCentavos = await paymentRepository.sumRefundedCentavos(session.session_id);
    const amountCentavos = Number(session.total_amount_centavos || 0) - Number(refundableCentavos || 0);
    if (amountCentavos <= 0) fail('The qualification payment has no refundable test-mode balance.', 409, DomainErrorCode.CONFLICT);
    const result = await createRefundUseCase({
      paymentSessionId: session.public_reference,
      payload: { amount_centavos: amountCentavos, reason: 'requested_by_customer', notes: 'DGLaundry qualification sandbox probe' },
      actor: 'dglaundry_qualification_probe'
    });
    if (!result?.success) throw result?.error || new Error('Qualification refund failed.');
    const refund = result.data?.refund;
    if (refund?.status === 'succeeded') {
      await notifyDglaundryBookingRefund({ session: result.data.payment_session, refund, partnerClient });
    }
    const response = {
      externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
      state: responseState(refund, result.data?.payment_session?.status || session.status),
      paymentMode: 'test',
      companyId,
      locationId
    };
    await orderRepository.updateIdempotencyResponse(refundProbeKey, { qualification_probe_result: response });
    return response;
  }

  const result = await orderUseCases.confirmReceipt({
    companyId,
    locationId,
    externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
    idempotencyKey: `dglaundry-probe-receipt:${key}`.slice(0, 160)
  });
  const current = await readback();
  return {
    externalOrderReference: DGLAUNDRY_QUALIFICATION_ORDER_REFERENCE,
    state: responseState(result.response, current?.status || 'receipt_confirmed'),
    paymentMode: String(process.env.PAYMONGO_MODE || 'unconfigured').toLowerCase(),
    companyId,
    locationId
  };
};
