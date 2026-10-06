import { afterEach, describe, expect, it, jest } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

const importService = async () => {
  jest.resetModules();
  const post = jest.fn().mockResolvedValue({
    data: { data: { id: 'cs_test_hosted_checkout' } }
  });
  jest.unstable_mockModule('axios', () => ({ default: { post } }));
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    PAYMONGO_MODE: 'test',
    PAYMONGO_TEST_SECRET_KEY: 'sk_test_hosted_checkout',
    PAYMONGO_TEST_PUBLIC_KEY: 'pk_test_hosted_checkout'
  };
  return {
    ...(await import('../src/services/paymongoService.js')),
    post
  };
};

describe('PayMongo hosted storefront checkout', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('forwards billing details and hides redundant provider summary sections', async () => {
    const { PayMongoService, post } = await importService();
    const service = new PayMongoService();

    await service.createHostedCheckoutSession({
      amount: 17500,
      description: 'DGFY storefront checkout CPS-TEST123456',
      lineItems: [{
        name: 'DGFY order CPS-TEST123456',
        amount: 17500,
        currency: 'PHP',
        quantity: 1
      }],
      paymentMethodTypes: ['gcash'],
      billing: {
        name: 'Cain Sama',
        email: 'customer@example.com',
        phone: '+639171234567'
      },
      showDescription: false,
      showLineItems: false,
      successUrl: 'https://dgfy.ph/tenant-store/masu-cafe/order?payment_status=success',
      cancelUrl: 'https://dgfy.ph/tenant-store/masu-cafe/order?payment_status=cancelled',
      referenceNumber: 'CPS-TEST123456',
      metadata: { payment_method: 'gcash' }
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.paymongo.com/v2/checkout_sessions',
      {
        data: {
          attributes: expect.objectContaining({
            billing: {
              name: 'Cain Sama',
              email: 'customer@example.com',
              phone: '+639171234567'
            },
            payment_method_types: ['gcash'],
            show_description: false,
            show_line_items: false
          })
        }
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic ')
        })
      })
    );
  });

  it('creates a GCash-only Payment Intent for the opt-in direct redirect flow', async () => {
    const { PayMongoService, post } = await importService();
    post.mockResolvedValueOnce({
      data: {
        data: {
          id: 'pi_test_direct_gcash',
          attributes: {
            client_key: 'pi_test_direct_gcash_client_key',
            status: 'awaiting_payment_method'
          }
        }
      }
    });

    const service = new PayMongoService();
    const result = await service.createDirectGcashPaymentIntent({
      amount: 17500,
      description: 'DGFY storefront checkout CPS-TEST123456',
      metadata: { payment_method: 'gcash' },
      returnUrl: 'https://dgfy.ph/tenant-store/masu-cafe/order?payment_status=return'
    });

    expect(result).toEqual(expect.objectContaining({
      paymentFlow: 'direct_gcash',
      publicKey: 'pk_test_hosted_checkout',
      returnUrl: expect.stringContaining('payment_status=return'),
      paymentIntent: expect.objectContaining({ id: 'pi_test_direct_gcash' })
    }));
    expect(post).toHaveBeenCalledWith(
      'https://api.paymongo.com/v1/payment_intents',
      {
        data: {
          attributes: expect.objectContaining({
            amount: 17500,
            currency: 'PHP',
            payment_method_allowed: ['gcash'],
            metadata: { payment_method: 'gcash' }
          })
        }
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic ')
        })
      })
    );
  });
});

describe('PayMongo storefront payment-session cancellation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('calls the documented v1 cancellation and expiry endpoints with explicit timeouts', async () => {
    const { PayMongoService, post } = await importService();
    const service = new PayMongoService();

    await service.cancelPaymentIntent('pi_test_cancel');
    await service.expireCheckoutSession('cs_test_expire');

    expect(post).toHaveBeenNthCalledWith(1,
      'https://api.paymongo.com/v1/payment_intents/pi_test_cancel/cancel',
      {},
      expect.objectContaining({ timeout: 15000 })
    );
    expect(post).toHaveBeenNthCalledWith(2,
      'https://api.paymongo.com/v1/checkout_sessions/cs_test_expire/expire',
      {},
      expect.objectContaining({ timeout: 15000 })
    );
  });

  it('classifies a provider 400 as not cancellable and a timeout as transient', async () => {
    const { PayMongoService, post } = await importService();
    post.mockRejectedValueOnce({
      response: { status: 400, data: { errors: [{ code: 'payment_ongoing', detail: 'Payment is ongoing.' }] } }
    });
    post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' });
    const service = new PayMongoService();

    await expect(service.cancelPaymentIntent('pi_test_cancel')).resolves.toMatchObject({
      outcome: 'not_cancellable',
      reason_code: 'payment_ongoing',
      reason: 'Payment is ongoing.'
    });
    await expect(service.expireCheckoutSession('cs_test_expire')).resolves.toMatchObject({
      outcome: 'transient',
      reason_code: 'PAYMONGO_NETWORK_ERROR'
    });
  });
});
