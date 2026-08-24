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

// #476: processVerifiedPaidCommerceSession now claims the session inside
// commercePaymentRepository.runInTransaction (a locked re-fetch + the state check), so any
// test exercising the real (non-overridden) use case needs a runInTransaction/
// findSessionBySessionId/findSessionByProviderEventId-shaped repository, same pattern already
// used in tests/tenantRevenue.usecases.test.js.
const transactionContext = { LOCK: { UPDATE: 'UPDATE' } };
const runInTransaction = (callback) => callback(transactionContext);

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

  // #706: #668's original four codes covered only exhaustion/version-conflict. Finalization re-runs
  // the SAME full eligibility check preview did (voucherRedemptionUseCases.js's
  // resolveEligibleBenefit), under lock -- so the same "changed between preview and finalization"
  // race also produces these five, each a real state that can flip in that window (campaign edited,
  // time window elapsed, below-cost guard newly triggered).
  describe.each([
    ['VOUCHER_EXPIRED', 'Voucher has expired.'],
    ['VOUCHER_NOT_ACTIVE', 'Voucher is not active.'],
    ['VOUCHER_WEEKDAY_NOT_ELIGIBLE', 'Voucher is not valid on this day of the week.'],
    ['VOUCHER_TIME_WINDOW_BLOCKED', 'Voucher is not valid at this time of day.'],
    ['VOUCHER_PRICE_BELOW_COST', 'This voucher would sell one or more items below their cost.']
  ])('#706: widened reason code %s', (reasonCode, message) => {
    it('tags the finalization failure VOUCHER_REDEMPTION_UNAVAILABLE, not the generic code', async () => {
      const tenant = {
        id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11b',
        name: 'Masu Cafe',
        plan: 'standard',
        subscription_status: 'active'
      };
      const session = {
        session_id: 16,
        tenant_id: tenant.id,
        public_reference: `CPS-${reasonCode}`,
        status: 'paid',
        provider_payment_id: 'pay_voucher_widen',
        checkout_payload: JSON.stringify({
          customer_name: 'Buyer',
          customer_email: 'buyer@example.com',
          voucher_code: 'PHARMA8'
        }),
        idempotency_key: `checkout:CPS-${reasonCode}`
      };
      const updateSessionById = jest.fn().mockResolvedValue({
        ...session,
        status: 'paid_manual_resolution_required',
        failure_code: 'VOUCHER_REDEMPTION_UNAVAILABLE',
        failure_reason: message
      });
      storeCheckoutUseCase.mockResolvedValueOnce({
        success: false,
        error: Object.assign(new Error(message), {
          statusCode: reasonCode === 'VOUCHER_PRICE_BELOW_COST' ? 422 : 409,
          details: { reason_code: reasonCode, voucher_id: 42 }
        })
      });
      const commercePaymentRepository = {
        findTenantById: jest.fn().mockResolvedValue(tenant),
        updateSessionById
      };

      await expect(finalizePaidCommerceSession({
        session,
        resource: { id: 'pay_voucher_widen', attributes: { status: 'paid' } },
        providerEventId: `evt_${reasonCode}`,
        commercePaymentRepository
      })).rejects.toMatchObject({
        message: 'Payment received; order finalization is pending retry.'
      });

      expect(updateSessionById).toHaveBeenCalledWith(
        session.session_id,
        expect.objectContaining({
          status: 'paid_manual_resolution_required',
          failure_code: 'VOUCHER_REDEMPTION_UNAVAILABLE',
          failure_reason: message
        })
      );
    });
  });

  // #706: the deliberately-excluded codes (deterministic against a fixed cart payload, not a race)
  // must keep falling through to the generic code -- confirming the exclusion is real, not an
  // oversight.
  it('#706: a deterministic (non-race) voucher failure stays tagged ORDER_FINALIZATION_FAILED', async () => {
    const tenant = {
      id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11c',
      name: 'Masu Cafe',
      plan: 'standard',
      subscription_status: 'active'
    };
    const session = {
      session_id: 17,
      tenant_id: tenant.id,
      public_reference: 'CPS-VOUCHERMINSPEND',
      status: 'paid',
      provider_payment_id: 'pay_voucher_minspend',
      checkout_payload: JSON.stringify({
        customer_name: 'Buyer',
        customer_email: 'buyer@example.com',
        voucher_code: 'PHARMA8'
      }),
      idempotency_key: 'checkout:CPS-VOUCHERMINSPEND'
    };
    const updateSessionById = jest.fn().mockResolvedValue({
      ...session,
      status: 'paid_manual_resolution_required',
      failure_code: 'ORDER_FINALIZATION_FAILED',
      failure_reason: 'Minimum spend for this voucher was not met.'
    });
    storeCheckoutUseCase.mockResolvedValueOnce({
      success: false,
      error: Object.assign(new Error('Minimum spend for this voucher was not met.'), {
        statusCode: 422,
        details: { reason_code: 'VOUCHER_MIN_SPEND_NOT_MET', voucher_id: 42 }
      })
    });
    const commercePaymentRepository = {
      findTenantById: jest.fn().mockResolvedValue(tenant),
      updateSessionById
    };

    await expect(finalizePaidCommerceSession({
      session,
      resource: { id: 'pay_voucher_minspend', attributes: { status: 'paid' } },
      providerEventId: 'evt_voucher_minspend',
      commercePaymentRepository
    })).rejects.toMatchObject({
      message: 'Payment received; order finalization is pending retry.'
    });

    expect(updateSessionById).toHaveBeenCalledWith(
      session.session_id,
      expect.objectContaining({
        status: 'paid_manual_resolution_required',
        failure_code: 'ORDER_FINALIZATION_FAILED'
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
      findSessionBySessionId: jest.fn().mockResolvedValue(session),
      runInTransaction: jest.fn(runInTransaction),
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
      findSessionBySessionId: jest.fn().mockResolvedValue(session),
      findSessionByProviderEventId: jest.fn().mockResolvedValue(null),
      runInTransaction: jest.fn(runInTransaction),
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
      }),
      { transaction: transactionContext }
    );
    expect(commercePaymentRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          expected_amount_centavos: 17500,
          provider_amount_centavos: 17400
        })
      }),
      { transaction: transactionContext }
    );
    expect(storeCheckoutUseCase).not.toHaveBeenCalled();
  });

  it('holds a live paid event when the provider livemode does not match the backend mode', async () => {
    const previousPayMongoMode = process.env.PAYMONGO_MODE;
    process.env.PAYMONGO_MODE = 'live';
    try {
      const session = {
        session_id: 14,
        public_reference: 'CPS-LIVEMODE123',
        status: 'awaiting_payment',
        total_amount_centavos: 200,
        currency: 'PHP'
      };
      const heldSession = {
        ...session,
        status: 'paid_manual_resolution_required'
      };
      const commercePaymentRepository = {
        findSessionByPublicReference: jest.fn().mockResolvedValue(session),
        findSessionBySessionId: jest.fn().mockResolvedValue(session),
        findSessionByProviderEventId: jest.fn().mockResolvedValue(null),
        runInTransaction: jest.fn(runInTransaction),
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
        headers: { 'paymongo-signature': 'verified-live-signature' },
        rawBody: '{"data":{}}',
        body: {
          data: {
            id: 'evt_wrong_livemode',
            attributes: {
              type: 'payment.paid',
              data: {
                id: 'pay_wrong_livemode',
                attributes: {
                  amount: 200,
                  currency: 'PHP',
                  livemode: false,
                  status: 'paid',
                  metadata: { commerce_payment_session: session.public_reference }
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
          failure_code: 'PAYMENT_LIVEMODE_MISMATCH'
        })
      }));
      expect(storeCheckoutUseCase).not.toHaveBeenCalled();
    } finally {
      if (previousPayMongoMode === undefined) delete process.env.PAYMONGO_MODE;
      else process.env.PAYMONGO_MODE = previousPayMongoMode;
    }
  });
});

describe('PayMongo webhook unknown session escalation (#476)', () => {
  const buildUnknownSessionRepository = () => ({
    findSessionByPublicReference: jest.fn().mockResolvedValue(null),
    findSessionByProviderPaymentIntent: jest.fn().mockResolvedValue(null),
    findSessionByProviderPayment: jest.fn().mockResolvedValue(null),
    createAuditLog: jest.fn().mockResolvedValue({})
  });

  it('raises an operational alert when a paid event has no matching session', async () => {
    const commercePaymentRepository = buildUnknownSessionRepository();
    const raiseOperationalAlert = jest.fn().mockResolvedValue(undefined);
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService: { verifyWebhookSignature: jest.fn().mockReturnValue(true) },
      logger: { warn: jest.fn(), error: jest.fn() },
      raiseOperationalAlert
    });

    const result = await useCase({
      headers: { 'paymongo-signature': 'verified-test-signature' },
      rawBody: '{"data":{}}',
      body: {
        data: {
          id: 'evt_orphan_paid',
          attributes: {
            type: 'payment.paid',
            data: {
              id: 'pay_orphan',
              attributes: {
                status: 'paid',
                metadata: { commerce_payment_session: 'CPS-DOES-NOT-EXIST' }
              }
            }
          }
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: { handled: false, reason: 'session_not_found' }
    }));
    expect(raiseOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'paymongo.commerce_webhook_unknown_session_paid',
      level: 'error',
      context: expect.objectContaining({
        event_type: 'payment.paid',
        provider_event_id: 'evt_orphan_paid'
      })
    }));
  });

  it('does not alert for a non-payment.paid event with no matching session', async () => {
    const commercePaymentRepository = buildUnknownSessionRepository();
    const raiseOperationalAlert = jest.fn().mockResolvedValue(undefined);
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService: { verifyWebhookSignature: jest.fn().mockReturnValue(true) },
      logger: { warn: jest.fn(), error: jest.fn() },
      raiseOperationalAlert
    });

    const result = await useCase({
      headers: { 'paymongo-signature': 'verified-test-signature' },
      rawBody: '{"data":{}}',
      body: {
        data: {
          id: 'evt_orphan_failed',
          attributes: {
            type: 'payment.failed',
            data: {
              id: 'pay_orphan_failed',
              attributes: {
                status: 'failed',
                metadata: { commerce_payment_session: 'CPS-DOES-NOT-EXIST' }
              }
            }
          }
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: { handled: false, reason: 'session_not_found' }
    }));
    expect(raiseOperationalAlert).not.toHaveBeenCalled();
  });
});
