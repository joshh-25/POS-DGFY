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
        payment_type: 'card',
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
        payment_type: 'card',
        payment_status: 'paid',
        payment_webhook_confirmed: true,
        payment_session_reference: session.public_reference,
        customer_name: 'Admin User'
      }),
      allowExpiredGuestCheckoutProof: true,
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

  it('preserves a stored GCash payment type during finalization', async () => {
    const tenant = {
      id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a',
      name: 'Masu Cafe',
      plan: 'standard',
      subscription_status: 'active'
    };
    const session = {
      session_id: 14,
      tenant_id: tenant.id,
      store_slug: 'masu-cafe-ed841f',
      public_reference: 'CPS-GCASH1234',
      status: 'paid',
      checkout_payload: JSON.stringify({
        payment_type: 'gcash',
        customer_name: 'GCash Buyer',
        customer_email: 'buyer@example.com'
      }),
      idempotency_key: 'checkout:CPS-GCASH1234'
    };
    const commercePaymentRepository = {
      findTenantById: jest.fn().mockResolvedValue(tenant),
      updateSessionById: jest.fn().mockImplementation(async (_id, changes) => ({
        ...session,
        ...changes
      }))
    };

    await finalizePaidCommerceSession({
      session,
      resource: { id: 'pay_gcash', attributes: { status: 'paid' } },
      providerEventId: 'evt_gcash',
      commercePaymentRepository
    });

    expect(storeCheckoutUseCase).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ payment_type: 'gcash' })
    }));
  });

  it('records a recoverable state when paid order finalization fails', async () => {
    const tenant = {
      id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a',
      name: 'Masu Cafe',
      plan: 'standard',
      subscription_status: 'active'
    };
    const session = {
      session_id: 12,
      tenant_id: tenant.id,
      public_reference: 'CPS-FAILED1234',
      status: 'paid',
      provider_payment_id: 'pay_existing',
      checkout_payload: JSON.stringify({
        customer_name: 'Buyer',
        customer_email: 'buyer@example.com'
      }),
      idempotency_key: 'checkout:CPS-FAILED1234'
    };
    const updateSessionById = jest.fn().mockResolvedValue({
      ...session,
      status: 'paid_manual_resolution_required',
      failure_code: 'ORDER_FINALIZATION_FAILED',
      failure_reason: 'customer_name is required'
    });
    storeCheckoutUseCase.mockResolvedValueOnce({
      success: false,
      error: new Error('customer_name is required')
    });
    const commercePaymentRepository = {
      findTenantById: jest.fn().mockResolvedValue(tenant),
      updateSessionById
    };

    await expect(finalizePaidCommerceSession({
      session,
      resource: { id: 'pay_existing', attributes: { status: 'paid' } },
      providerEventId: 'evt_failed',
      commercePaymentRepository
    })).rejects.toMatchObject({
      message: 'Payment received; order finalization is pending retry.'
    });

    expect(updateSessionById).toHaveBeenCalledWith(
      session.session_id,
      expect.objectContaining({
        status: 'paid_manual_resolution_required',
        provider_event_id: 'evt_failed',
        provider_payment_id: 'pay_existing',
        failure_code: 'ORDER_FINALIZATION_FAILED',
        failure_reason: 'customer_name is required'
      })
    );
  });

  it('#668: tags a voucher-exhaustion finalization failure distinctly from a generic one', async () => {
    const tenant = {
      id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a',
      name: 'Masu Cafe',
      plan: 'standard',
      subscription_status: 'active'
    };
    const session = {
      session_id: 15,
      tenant_id: tenant.id,
      public_reference: 'CPS-VOUCHERRACE',
      status: 'paid',
      provider_payment_id: 'pay_voucher_race',
      checkout_payload: JSON.stringify({
        customer_name: 'Buyer',
        customer_email: 'buyer@example.com',
        voucher_code: 'PHARMA8'
      }),
      idempotency_key: 'checkout:CPS-VOUCHERRACE'
    };
    const updateSessionById = jest.fn().mockResolvedValue({
      ...session,
      status: 'paid_manual_resolution_required',
      failure_code: 'VOUCHER_REDEMPTION_UNAVAILABLE',
      failure_reason: 'Voucher has reached its redemption limit.'
    });
    // Mirrors the shape voucherConflict() (voucherErrors.js) actually throws: statusCode 409,
    // details.reason_code one of the atomic reservation's exhaustion codes.
    storeCheckoutUseCase.mockResolvedValueOnce({
      success: false,
      error: Object.assign(new Error('Voucher has reached its redemption limit.'), {
        statusCode: 409,
        details: { reason_code: 'VOUCHER_REDEMPTION_LIMIT_REACHED', voucher_id: 42 }
      })
    });
    const commercePaymentRepository = {
      findTenantById: jest.fn().mockResolvedValue(tenant),
      updateSessionById
    };

    await expect(finalizePaidCommerceSession({
      session,
      resource: { id: 'pay_voucher_race', attributes: { status: 'paid' } },
      providerEventId: 'evt_voucher_race',
      commercePaymentRepository
    })).rejects.toMatchObject({
      message: 'Payment received; order finalization is pending retry.'
    });

    expect(updateSessionById).toHaveBeenCalledWith(
      session.session_id,
      expect.objectContaining({
        status: 'paid_manual_resolution_required',
        failure_code: 'VOUCHER_REDEMPTION_UNAVAILABLE',
        failure_reason: 'Voucher has reached its redemption limit.'
      })
    );
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

  it('records and alerts a webhook finalization failure', async () => {
    const session = {
      session_id: 13,
      public_reference: 'CPS-CONFLICT1234',
      status: 'paid'
    };
    const createAuditLog = jest.fn().mockResolvedValue({});
    const raiseOperationalAlert = jest.fn().mockResolvedValue(undefined);
    const processVerifiedPaidCommerceSession = jest.fn().mockRejectedValue(
      new Error('idempotency_key was already used with a different payload')
    );
    const commercePaymentRepository = {
      findSessionByPublicReference: jest.fn().mockResolvedValue(session),
      createAuditLog
    };
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService: {
        verifyWebhookSignature: jest.fn().mockReturnValue(true)
      },
      logger: {
        warn: jest.fn(),
        error: jest.fn()
      },
      raiseOperationalAlert,
      processVerifiedPaidCommerceSession
    });

    const result = await useCase({
      headers: { 'paymongo-signature': 'verified-test-signature' },
      rawBody: '{"data":{}}',
      body: {
        data: {
          id: 'evt_conflict',
          attributes: {
            type: 'payment.paid',
            data: {
              id: 'pay_conflict',
              attributes: {
                status: 'paid',
                metadata: { commerce_payment_session: session.public_reference }
              }
            }
          }
        }
      }
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({ statusCode: 500 })
    });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ event: 'commerce_payment_webhook_received' })
    }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        event: 'commerce_payment_webhook_failed',
        event_type: 'payment.paid',
        payment_session: session.public_reference
      })
    }));
    expect(raiseOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'paymongo.commerce_webhook_failure',
      context: expect.objectContaining({
        event_type: 'payment.paid',
        payment_session: session.public_reference
      })
    }));
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
