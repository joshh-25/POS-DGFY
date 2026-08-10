import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildConfirmStoreCheckoutSandboxPaymentUseCase } from '../src/modules/store/usecases/storeUseCases.js';

const SESSION_REFERENCE = 'CPS-TESTPAY001';

const buildSession = (overrides = {}) => ({
  session_id: 41,
  public_reference: SESSION_REFERENCE,
  tenant_id: 'tenant-local',
  status: 'awaiting_payment',
  provider: 'paymongo',
  provider_payment_intent_id: 'pi_test_local',
  total_amount_centavos: 15000,
  total_amount: '150.0000',
  currency: 'PHP',
  expires_at: new Date(Date.now() + 60_000),
  ...overrides
});

describe('local PayMongo sandbox QR Ph confirmation', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPayMongoMode = process.env.PAYMONGO_MODE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.PAYMONGO_MODE = originalPayMongoMode;
    jest.restoreAllMocks();
  });

  const execute = async ({
    session = buildSession(),
    remoteAddress = '::1'
  } = {}) => {
    const commercePaymentRepository = {
      findSessionByPublicReference: jest.fn().mockResolvedValue(session)
    };
    const paymongoService = {
      confirmSandboxQrphPayment: jest.fn().mockResolvedValue({
        paymentIntent: {
          attributes: {
            amount: 15000,
            currency: 'PHP'
          }
        },
        source: {
          attributes: {
            status: 'consumed'
          }
        }
      })
    };
    const useCase = buildConfirmStoreCheckoutSandboxPaymentUseCase({
      commercePaymentRepository,
      paymongoService
    });
    const result = await dbStore.run({ tenantId: 'tenant-local' }, () => useCase({
      paymentSessionId: SESSION_REFERENCE,
      remoteAddress
    }));

    return { result, paymongoService };
  };

  it('requests PayMongo sandbox confirmation for the matching local checkout', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PAYMONGO_MODE = 'test';

    const { result, paymongoService } = await execute();

    expect(result.success).toBe(true);
    expect(result.data.confirmation_requested).toBe(true);
    expect(paymongoService.confirmSandboxQrphPayment).toHaveBeenCalledWith({
      paymentIntentId: 'pi_test_local',
      expectedAmount: 15000,
      expectedCurrency: 'PHP'
    });
  });

  it.each([
    ['live PayMongo mode', { nodeEnv: 'development', paymongoMode: 'live', remoteAddress: '::1' }],
    ['non-loopback request', { nodeEnv: 'development', paymongoMode: 'test', remoteAddress: '192.168.1.50' }]
  ])('hides the confirmation endpoint in %s', async (_label, setup) => {
    process.env.NODE_ENV = setup.nodeEnv;
    process.env.PAYMONGO_MODE = setup.paymongoMode;

    const { result, paymongoService } = await execute({ remoteAddress: setup.remoteAddress });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(404);
    expect(paymongoService.confirmSandboxQrphPayment).not.toHaveBeenCalled();
  });

  it('allows a controlled loopback confirmation in a production runtime when PayMongo is in test mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMONGO_MODE = 'test';

    const { result, paymongoService } = await execute({ remoteAddress: '127.0.0.1' });

    expect(result.success).toBe(true);
    expect(paymongoService.confirmSandboxQrphPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects a provider amount mismatch without changing local payment state', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PAYMONGO_MODE = 'test';

    const { result, paymongoService } = await execute({
      session: buildSession({ total_amount_centavos: 26500 })
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(409);
    expect(paymongoService.confirmSandboxQrphPayment).toHaveBeenCalledTimes(1);
  });
});
