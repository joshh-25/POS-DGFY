import { afterAll, describe, expect, it, jest } from '@jest/globals';

const post = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { post }
}));
jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

process.env.PAYMONGO_MODE = 'live';
process.env.PAYMONGO_LIVE_PUBLIC_KEY = 'pk_live_fixture';
process.env.PAYMONGO_LIVE_SECRET_KEY = 'sk_live_fixture';

const { PayMongoService } = await import('../src/services/paymongoService.js');

afterAll(() => {
  delete process.env.PAYMONGO_MODE;
  delete process.env.PAYMONGO_LIVE_PUBLIC_KEY;
  delete process.env.PAYMONGO_LIVE_SECRET_KEY;
});

describe('PayMongo direct GCash Payment Intent flow', () => {
  it('creates a GCash-only Payment Intent and returns only browser-safe authorization data', async () => {
    post.mockResolvedValueOnce({
      data: {
        data: {
          id: 'pi_live_gcash',
          attributes: {
            client_key: 'pi_live_gcash_client_key'
          }
        }
      }
    });

    const service = new PayMongoService();
    const result = await service.createDirectGcashPaymentIntent({
      amount: 200,
      description: 'DGFY storefront checkout CPS-LIVE1234',
      metadata: { commerce_payment_session: 'CPS-LIVE1234' },
      returnUrl: 'https://dgfy.ph/tenant-store/example/order?payment_status=return'
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.paymongo.com/v1/payment_intents',
      {
        data: {
          attributes: expect.objectContaining({
            amount: 200,
            currency: 'PHP',
            payment_method_allowed: ['gcash'],
            metadata: { commerce_payment_session: 'CPS-LIVE1234' }
          })
        }
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic ')
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({
      paymentFlow: 'direct_gcash',
      publicKey: 'pk_live_fixture',
      returnUrl: 'https://dgfy.ph/tenant-store/example/order?payment_status=return',
      paymentIntent: expect.objectContaining({ id: 'pi_live_gcash' })
    }));
    expect(result).not.toHaveProperty('secretKey');
  });
});
