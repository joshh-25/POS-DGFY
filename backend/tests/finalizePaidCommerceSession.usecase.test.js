import {
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

const storeCheckoutUseCase = jest.fn();
const getConnection = jest.fn();
const getTenantModels = jest.fn();

jest.unstable_mockModule('../src/modules/store/index.js', () => ({
  storeCheckoutUseCase
}));

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
  default: { getConnection }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
  getTenantModels
}));

const { finalizePaidCommerceSession } = await import(
  '../src/modules/commercePayments/usecases/finalizePaidCommerceSession.js'
);
const { buildHandlePayMongoCommerceWebhookUseCase } = await import(
  '../src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js'
);

describe('finalizePaidCommerceSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getConnection.mockResolvedValue({ name: 'tenant-sequelize' });
    getTenantModels.mockReturnValue({ Item: { name: 'Item' } });
    storeCheckoutUseCase.mockResolvedValue({
      success: true,
      data: {
        tracking_pin: 'TRACK123',
        order: {
          pos_transaction_id: 9001,
          tracking_pin: 'TRACK123'
        }
      }
    });
  });

  it('passes the verified payment-session tenant into storefront checkout', async () => {
    const tenant = {
      id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a',
      name: 'Masu Cafe',
      plan: 'standard',
      subscription_status: 'active'
    };
    const session = {
      session_id: 11,
      tenant_id: tenant.id,
      store_slug: 'masu-cafe-ed841f',
      public_reference: 'CPS-PTBBAR79JY',
      status: 'paid',
      checkout_payload: JSON.stringify({
        company_id: 1,
        location_id: 3,
        customer_name: 'Admin User',
        _verified_store_customer: {
          customer_id: 77,
          dgfy_account_id: 'dgfy-account-77',
          name: 'Admin User',
          email: 'admin@test.com',
          phone: '+639999000001'
        }
      }),
      idempotency_key: 'checkout:CPS-PTBBAR79JY',
      provider_payment_intent_id: 'pi_test',
      fee_policy: JSON.stringify({
        collection_model: 'dgfy_collects_then_settles_tenant'
      })
    };
    const commercePaymentRepository = {
      findTenantById: jest.fn().mockResolvedValue(tenant),
      updateSessionById: jest.fn().mockImplementation(async (_id, changes) => ({
        ...session,
        ...changes
      }))
    };

    const result = await finalizePaidCommerceSession({
      session,
      resource: {
        id: 'pay_test',
        attributes: {
          status: 'paid',
          payment_intent_id: 'pi_test'
        }
      },
      providerEventId: 'evt_test',
      commercePaymentRepository
    });

    expect(storeCheckoutUseCase).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: tenant.id,
      payload: expect.objectContaining({
        payment_status: 'paid',
        payment_webhook_confirmed: true,
        payment_session_reference: session.public_reference,
        customer_name: 'Admin User'
      }),
      storeCustomer: {
        customer_id: 77,
        dgfy_account_id: 'dgfy-account-77',
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '+639999000001'
      }
    }));
    expect(result).toEqual(expect.objectContaining({
      status: 'finalized',
      pos_transaction_id: 9001,
      tracking_pin: 'TRACK123'
    }));
  });

  it('does not create another order for an already finalized session', async () => {
    const session = {
      session_id: 11,
      tenant_id: 'tenant-1',
      status: 'finalized',
      pos_transaction_id: 9001,
      tracking_pin: 'TRACK123'
    };

    const result = await finalizePaidCommerceSession({
      session,
      resource: {},
      commercePaymentRepository: {}
    });

    expect(result).toEqual(session);
    expect(storeCheckoutUseCase).not.toHaveBeenCalled();
  });
});

describe('PayMongo paid webhook replay', () => {
  it('keeps a finalized session finalized without writing another order or ledger transaction', async () => {
    const session = {
      session_id: 11,
      public_reference: 'CPS-PTBBAR79JY',
      status: 'finalized',
      pos_transaction_id: 9001,
      tracking_pin: 'TRACK123'
    };
    const commercePaymentRepository = {
      findSessionByPublicReference: jest.fn().mockResolvedValue(session),
      updateSessionById: jest.fn()
    };
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService: {
        verifyWebhookSignature: jest.fn().mockReturnValue(true)
      },
      logger: {
        warn: jest.fn()
      }
    });

    const result = await useCase({
      headers: {
        'paymongo-signature': 'verified-test-signature'
      },
      rawBody: '{"data":{}}',
      body: {
        data: {
          id: 'evt_replayed',
          attributes: {
            type: 'payment.paid',
            data: {
              id: 'pay_test',
              attributes: {
                metadata: {
                  commerce_payment_session: session.public_reference
                },
                status: 'paid'
              }
            }
          }
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        handled: true,
        idempotent_replay: true,
        status: 'finalized',
        payment_session: session.public_reference
      })
    }));
    expect(commercePaymentRepository.updateSessionById).not.toHaveBeenCalled();
    expect(storeCheckoutUseCase).not.toHaveBeenCalled();
  });

  it('holds a paid event when the provider amount does not match the locked checkout total', async () => {
    const session = {
      session_id: 12,
      public_reference: 'CPS-AMOUNT1234',
      status: 'awaiting_payment',
      total_amount_centavos: 17500,
      currency: 'PHP'
    };
    const heldSession = {
      ...session,
      status: 'paid_manual_resolution_required'
    };
    const commercePaymentRepository = {
      findSessionByPublicReference: jest.fn().mockResolvedValue(session),
      updateSessionById: jest.fn().mockResolvedValue(heldSession),
      createAuditLog: jest.fn().mockResolvedValue({})
    };
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService: {
        verifyWebhookSignature: jest.fn().mockReturnValue(true)
      },
      logger: {
        warn: jest.fn()
      }
    });

    const result = await useCase({
      headers: {
        'paymongo-signature': 'verified-test-signature'
      },
      rawBody: '{"data":{}}',
      body: {
        data: {
          id: 'evt_wrong_amount',
          attributes: {
            type: 'payment.paid',
            data: {
              id: 'pay_wrong_amount',
              attributes: {
                amount: 17400,
                currency: 'PHP',
                status: 'paid',
                metadata: {
                  commerce_payment_session: session.public_reference
                }
              }
            }
          }
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        status: 'paid_manual_resolution_required',
        manual_resolution_required: true,
        failure_code: 'PAYMENT_AMOUNT_MISMATCH'
      })
    }));
    expect(commercePaymentRepository.updateSessionById).toHaveBeenCalledWith(
      session.session_id,
      expect.objectContaining({
        status: 'paid_manual_resolution_required',
        failure_code: 'PAYMENT_AMOUNT_MISMATCH'
      })
    );
    expect(commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          expected_amount_centavos: 17500,
          provider_amount_centavos: 17400
        })
      })
    );
    expect(storeCheckoutUseCase).not.toHaveBeenCalled();
  });
});
