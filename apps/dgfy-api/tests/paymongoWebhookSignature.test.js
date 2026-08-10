import crypto from 'crypto';
import { jest } from '@jest/globals';
import { buildHandleWebhookUseCase } from '../src/modules/payments/usecases/handleWebhookUseCase.js';

const ORIGINAL_ENV = { ...process.env };

const importService = async (env = {}) => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    PAYMENTS_ENABLED: 'false',
    PAYMONGO_MODE: 'test',
    PAYMONGO_WEBHOOK_SECRET: '',
    PAYMONGO_TEST_WEBHOOK_SECRET: '',
    PAYMONGO_LIVE_WEBHOOK_SECRET: '',
    PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS: '',
    PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: '300',
    ...env
  };
  return import('../src/services/paymongoService.js');
};

const signedHeader = ({
  secret,
  payload,
  timestamp = Math.floor(Date.now() / 1000),
  mode = 'test',
  overrideDigest = null
}) => {
  const digest = overrideDigest || crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return mode === 'live'
    ? `t=${timestamp},te=,li=${digest}`
    : `t=${timestamp},te=${digest},li=`;
};

describe('PayMongoService.verifyWebhookSignature', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('rejects unsigned webhooks in production when the webhook secret is missing', async () => {
    const { PayMongoService } = await importService({
      NODE_ENV: 'production',
      PAYMONGO_WEBHOOK_SECRET: ''
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature('', '{}')).toBe(false);
  });

  it('rejects unsigned webhooks when payments are enabled and the webhook secret is missing', async () => {
    const { PayMongoService } = await importService({
      PAYMENTS_ENABLED: 'true',
      PAYMONGO_WEBHOOK_SECRET: '',
      PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS: 'true'
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature('', '{}')).toBe(false);
  });

  it('rejects missing signatures even when a webhook secret is configured', async () => {
    const { PayMongoService } = await importService({
      PAYMONGO_TEST_WEBHOOK_SECRET: 'whsec_test'
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature('', '{}')).toBe(false);
  });

  it('accepts a valid test-mode signature over the raw payload and rejects a tampered signature', async () => {
    const webhookSecret = 'whsec_test_signature';
    const payload = JSON.stringify({ data: { id: 'evt_test' } });
    const { PayMongoService } = await importService({
      PAYMONGO_TEST_WEBHOOK_SECRET: webhookSecret
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature(
      signedHeader({ secret: webhookSecret, payload }),
      Buffer.from(payload)
    )).toBe(true);
    expect(service.verifyWebhookSignature(
      signedHeader({ secret: webhookSecret, payload, overrideDigest: '0'.repeat(64) }),
      Buffer.from(payload)
    )).toBe(false);
  });

  it('rejects stale timestamped signatures', async () => {
    const webhookSecret = 'whsec_test_signature';
    const payload = JSON.stringify({ data: { id: 'evt_test' } });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const { PayMongoService } = await importService({
      PAYMONGO_TEST_WEBHOOK_SECRET: webhookSecret,
      PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: '300'
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature(
      signedHeader({ secret: webhookSecret, payload, timestamp: staleTimestamp }),
      payload
    )).toBe(false);
  });

  it('uses the live signature slot when PAYMONGO_MODE is live', async () => {
    const webhookSecret = 'whsec_live_signature';
    const payload = JSON.stringify({ data: { id: 'evt_live' } });
    const { PayMongoService } = await importService({
      PAYMONGO_MODE: 'live',
      PAYMONGO_LIVE_WEBHOOK_SECRET: webhookSecret
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature(
      signedHeader({ secret: webhookSecret, payload, mode: 'live' }),
      payload
    )).toBe(true);
    expect(service.verifyWebhookSignature(
      signedHeader({ secret: webhookSecret, payload, mode: 'test' }),
      payload
    )).toBe(false);
  });

  it('allows unsigned webhooks only with an explicit non-production bypass while payments are disabled', async () => {
    const { PayMongoService } = await importService({
      NODE_ENV: 'development',
      PAYMENTS_ENABLED: 'false',
      PAYMONGO_MODE: 'test',
      PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS: 'true'
    });
    const service = new PayMongoService();

    expect(service.verifyWebhookSignature('', '{}')).toBe(true);
  });
});

describe('payments PayMongo webhook use case signature gate', () => {
  const makeLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  });

  const makePaymentRepository = () => ({
    findTenantBySubscriptionId: jest.fn(),
    findTenantByPendingSubscriptionId: jest.fn(),
    runInTransaction: jest.fn().mockImplementation(async (callback) => callback({})),
    createPayment: jest.fn().mockResolvedValue(true),
    findWebhookLog: jest.fn().mockResolvedValue(null),
    findOrCreateWebhookLog: jest.fn().mockResolvedValue([
      { update: jest.fn().mockResolvedValue(true) }
    ])
  });

  const paymentPaidBody = {
    id: 'evt-paymongo-paid-1',
    event_type: 'payment.paid',
    resource: {
      id: 'pay_123',
      attributes: {
        amount: 19900,
        currency: 'PHP',
        metadata: {
          subscription_id: 'sub_paymongo_1'
        }
      }
    }
  };

  it('rejects invalid PayMongo signatures before webhook logging or payment mutation', async () => {
    const paymentRepository = makePaymentRepository();
    const paymongoService = {
      verifyWebhookSignature: jest.fn().mockReturnValue(false)
    };
    const useCase = buildHandleWebhookUseCase({
      paymentRepository,
      paypalService: { verifyWebhookSignature: jest.fn() },
      paymongoService,
      trackEngagementEvent: jest.fn().mockResolvedValue({ created: true }),
      logger: makeLogger()
    });

    const result = await useCase({
      body: paymentPaidBody,
      rawBody: JSON.stringify(paymentPaidBody),
      headers: {
        'paymongo-signature': 't=1,te=bad,li='
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('AUTHENTICATION_FAILED');
    expect(result.error.statusCode).toBe(401);
    expect(paymongoService.verifyWebhookSignature).toHaveBeenCalled();
    expect(paymentRepository.findWebhookLog).not.toHaveBeenCalled();
    expect(paymentRepository.findOrCreateWebhookLog).not.toHaveBeenCalled();
    expect(paymentRepository.createPayment).not.toHaveBeenCalled();
    expect(paymentRepository.runInTransaction).not.toHaveBeenCalled();
  });

  it('treats replayed PayMongo events as idempotent and does not mutate state again', async () => {
    const paymentRepository = makePaymentRepository();
    paymentRepository.findWebhookLog.mockResolvedValue({ status: 'processed' });
    const useCase = buildHandleWebhookUseCase({
      paymentRepository,
      paypalService: { verifyWebhookSignature: jest.fn() },
      paymongoService: {
        verifyWebhookSignature: jest.fn().mockReturnValue(true)
      },
      trackEngagementEvent: jest.fn().mockResolvedValue({ created: true }),
      logger: makeLogger()
    });

    const result = await useCase({
      body: paymentPaidBody,
      rawBody: JSON.stringify(paymentPaidBody),
      headers: {
        'paymongo-signature': 't=1,te=valid,li=',
        'paymongo-event-id': 'evt-paymongo-paid-1'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body).toBe('OK');
    expect(paymentRepository.findWebhookLog).toHaveBeenCalledWith('evt-paymongo-paid-1');
    expect(paymentRepository.findOrCreateWebhookLog).not.toHaveBeenCalled();
    expect(paymentRepository.createPayment).not.toHaveBeenCalled();
    expect(paymentRepository.runInTransaction).not.toHaveBeenCalled();
  });
});
