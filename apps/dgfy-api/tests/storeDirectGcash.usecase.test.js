import { afterAll, describe, expect, it, jest } from '@jest/globals';

process.env.TENANT_REVENUE_SHARING_ENABLED = 'true';
process.env.CUSTOMER_ACCESS_MODES_ENABLED = 'false';
process.env.STOREFRONT_GUEST_OTP_REQUIRED = 'false';
process.env.STOREFRONT_PAYMENT_RETURN_URL = 'https://dgfy.ph/payment-return';

const { buildStoreCheckoutPaymentSessionUseCase } = await import(
  '../src/modules/store/usecases/storeUseCases.js'
);
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

afterAll(() => {
  delete process.env.TENANT_REVENUE_SHARING_ENABLED;
  delete process.env.CUSTOMER_ACCESS_MODES_ENABLED;
  delete process.env.STOREFRONT_GUEST_OTP_REQUIRED;
  delete process.env.STOREFRONT_PAYMENT_RETURN_URL;
});

describe('Storefront direct GCash payment-session routing', () => {
  it('creates a GCash Payment Intent without creating Hosted Checkout', async () => {
    const createdSession = {
      session_id: 17,
      public_reference: 'CPS-DIRECT1234',
      status: 'created',
      provider: 'paymongo',
      checkout_payload: JSON.stringify({ payment_type: 'gcash' }),
      total_amount: 2,
      total_amount_centavos: 200,
      currency: 'PHP',
      platform_fee_centavos: 2
    };
    const updatedSession = {
      ...createdSession,
      status: 'awaiting_payment',
      provider_payment_intent_id: 'pi_live_gcash',
      provider_payload: {
        paymentFlow: 'direct_gcash',
        publicKey: 'pk_live_fixture',
        returnUrl: 'https://dgfy.ph/tenant-store/masu-cafe/order?payment_status=return',
        paymentIntent: {
          id: 'pi_live_gcash',
          attributes: { client_key: 'pi_live_gcash_client_key' }
        }
      },
      expires_at: new Date(Date.now() + 60 * 60 * 1000)
    };
    const commercePaymentRepository = {
      findSessionByIdempotency: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue(createdSession),
      updateSessionById: jest.fn().mockResolvedValue(updatedSession)
    };
    const paymongoService = {
      createDirectGcashPaymentIntent: jest.fn().mockResolvedValue({
        paymentFlow: 'direct_gcash',
        publicKey: 'pk_live_fixture',
        returnUrl: 'https://dgfy.ph/tenant-store/masu-cafe/order?payment_status=return',
        paymentIntent: {
          id: 'pi_live_gcash',
          attributes: { client_key: 'pi_live_gcash_client_key' }
        }
      }),
      createHostedCheckoutSession: jest.fn()
    };
    const storeRepository = {
      findDefaultActiveLocation: jest.fn().mockResolvedValue({
        location_id: 1,
        is_open: true,
        allow_out_of_stock_sales: true
      }),
      getSettingsByKeys: jest.fn().mockResolvedValue([]),
      findSellableItemsByIds: jest.fn().mockResolvedValue([{
        item_id: 1,
        name: 'Test Item',
        default_sale_price: 2,
        sale_price: 2,
        is_available: true,
        availability_status: 'in_stock'
      }])
    };
    const useCase = buildStoreCheckoutPaymentSessionUseCase({
      storeRepository,
      commercePaymentRepository,
      tenantRevenueRepository: {
        findEffectiveFeePolicy: jest.fn().mockResolvedValue({
          policy_id: 4,
          version: 1,
          settlement_status: 'active',
          payout_destination_masked: '****1234',
          dgfy_rate_bps: 100,
          provider_fee_payer: 'tenant',
          settlement_cycle_days: 15
        })
      },
      paymongoService,
      commercePaymentsEnabled: true,
      commerceQrphEnabled: false,
      commercePaymongoSplitEnabled: false,
      directGcashEnabled: true,
      directGcashRequested: true,
      requireCommercePaymentConfig: jest.fn().mockReturnValue([])
    });

    const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'masu-cafe' }, () => useCase({
      payload: {
        store_slug: 'masu-cafe',
        payment_type: 'gcash',
        idempotency_key: 'direct-gcash-1234',
        customer_name: 'Test Customer',
        customer_email: 'customer@example.com',
        customer_phone: '+639171234567',
        order_method: 'pickup',
        lines: [{ item_id: 1, quantity: 1 }]
      }
    }));

    expect(result.success).toBe(true);
    expect(result.data.payment_session).toEqual(expect.objectContaining({
      payment_flow: 'direct_gcash',
      payment_method: 'gcash',
      provider_payment_intent_id: 'pi_live_gcash',
      paymongo_public_key: 'pk_live_fixture',
      paymongo_client_key: 'pi_live_gcash_client_key'
    }));
    expect(paymongoService.createDirectGcashPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      currency: 'PHP',
      returnUrl: expect.stringContaining('payment_status=return')
    }));
    expect(paymongoService.createHostedCheckoutSession).not.toHaveBeenCalled();
  });
});
