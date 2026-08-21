import {
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

const postPaidTenantRevenueTransactionUseCase = jest.fn();
const finalizePaidCommerceSession = jest.fn();
const getPaymentIdFromPayMongoResource = jest.fn(() => null);

jest.unstable_mockModule('../src/modules/tenantRevenue/index.js', () => ({
  postPaidTenantRevenueTransactionUseCase
}));

jest.unstable_mockModule('../src/modules/commercePayments/usecases/finalizePaidCommerceSession.js', () => ({
  finalizePaidCommerceSession,
  getPaymentIdFromPayMongoResource
}));

const { buildProcessVerifiedPaidCommerceSessionUseCase } = await import(
  '../src/modules/commercePayments/usecases/processVerifiedPaidCommerceSession.js'
);
const { DomainErrorCode } = await import('../src/modules/shared/contracts/domainErrors.js');

// #476: matches the shared pattern in tests/tenantRevenue.usecases.test.js -- runInTransaction
// just invokes the callback synchronously with a fake transaction handle carrying LOCK.UPDATE,
// so a locked findSessionBySessionId/findSessionByProviderEventId call reads whatever the mock
// repository's in-memory `rows` map holds at that moment.
const transactionContext = { LOCK: { UPDATE: 'UPDATE' } };

const baseSession = {
  session_id: 21,
  public_reference: 'CPS-EVENT1234',
  tenant_id: '9e4897ab-0f44-4fc2-b388-e9b2f0669511',
  status: 'awaiting_payment',
  total_amount_centavos: 15000,
  currency: 'PHP',
  provider_event_id: null,
  pos_transaction_id: null,
  tracking_pin: null
};

const paidResource = {
  attributes: {
    status: 'paid',
    livemode: false,
    amount: 15000,
    currency: 'PHP'
  }
};

// A tiny in-memory "table" so the locked re-fetch inside runInTransaction sees whatever the
// previous claim already committed -- this is what actually proves the second delivery of a
// replayed event short-circuits instead of double-processing.
const buildRepository = (initialRows = []) => {
  const rows = new Map(initialRows.map((row) => [row.session_id, { ...row }]));

  return {
    runInTransaction: jest.fn((callback) => callback(transactionContext)),
    findSessionBySessionId: jest.fn((sessionId) => Promise.resolve(
      rows.has(sessionId) ? { ...rows.get(sessionId) } : null
    )),
    findSessionByProviderEventId: jest.fn((providerEventId) => Promise.resolve(
      [...rows.values()].find((row) => row.provider_event_id === providerEventId) || null
    )),
    updateSessionById: jest.fn((sessionId, payload) => {
      const existing = rows.get(sessionId) || {};
      const updated = { ...existing, ...payload };
      rows.set(sessionId, updated);
      return Promise.resolve({ ...updated });
    }),
    createAuditLog: jest.fn().mockResolvedValue({}),
    _rows: rows
  };
};

describe('processVerifiedPaidCommerceSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postPaidTenantRevenueTransactionUseCase.mockResolvedValue({ success: true });
    finalizePaidCommerceSession.mockImplementation(async ({ session }) => ({
      ...session,
      status: 'finalized'
    }));
  });

  it('claims the session and finalizes it on the first delivery of an event', async () => {
    const commercePaymentRepository = buildRepository([baseSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: baseSession,
      resource: paidResource,
      providerEventId: 'evt_first_delivery'
    });

    expect(result).toEqual({
      handled: true,
      status: 'finalized',
      payment_session: baseSession.public_reference
    });
    expect(postPaidTenantRevenueTransactionUseCase).toHaveBeenCalledTimes(1);
    expect(finalizePaidCommerceSession).toHaveBeenCalledTimes(1);
  });

  it('short-circuits a replayed delivery for the same session/event without double-processing', async () => {
    const commercePaymentRepository = buildRepository([baseSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    // First delivery's claim transaction commits status:'paid' before finalizePaidCommerceSession
    // (mocked here, and in reality a separate tenant-DB call) ever runs -- so the repository's
    // row is genuinely still 'paid', not 'finalized', by the time a second delivery can land.
    // This is the exact window the original code left unguarded: 'paid' alone (no
    // pos_transaction_id/tracking_pin yet) used to fall through and re-run revenue posting +
    // finalization for a second concurrent/retried delivery of the same event.
    await useCase({ session: baseSession, resource: paidResource, providerEventId: 'evt_replay' });
    expect(commercePaymentRepository._rows.get(baseSession.session_id).status).toBe('paid');

    // Second, concurrent/retried delivery of the SAME event against the SAME session.
    const secondResult = await useCase({
      session: baseSession,
      resource: paidResource,
      providerEventId: 'evt_replay'
    });

    expect(secondResult).toEqual({
      handled: true,
      idempotent_replay: true,
      status: 'paid',
      payment_session: baseSession.public_reference
    });
    // Only the first delivery's claim should have reached revenue posting / finalization.
    expect(postPaidTenantRevenueTransactionUseCase).toHaveBeenCalledTimes(1);
    expect(finalizePaidCommerceSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a provider event already recorded against a different session (PAYMENT_PROVIDER_EVENT_REPLAY)', async () => {
    const otherSession = {
      ...baseSession,
      session_id: 22,
      public_reference: 'CPS-OTHER5678',
      provider_event_id: 'evt_cross_session',
      status: 'finalized'
    };
    const commercePaymentRepository = buildRepository([baseSession, otherSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    await expect(useCase({
      session: baseSession,
      resource: paidResource,
      providerEventId: 'evt_cross_session'
    })).rejects.toMatchObject({
      code: DomainErrorCode.CONFLICT,
      statusCode: 409,
      details: expect.objectContaining({
        reason_code: 'PAYMENT_PROVIDER_EVENT_REPLAY',
        payment_session: baseSession.public_reference
      })
    });
    expect(postPaidTenantRevenueTransactionUseCase).not.toHaveBeenCalled();
    expect(finalizePaidCommerceSession).not.toHaveBeenCalled();
  });

  it('does not false-positive when the conflicting row IS the same session (its own prior event)', async () => {
    const sessionWithPriorEvent = {
      ...baseSession,
      provider_event_id: 'evt_same_session_prior'
    };
    const commercePaymentRepository = buildRepository([sessionWithPriorEvent]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: sessionWithPriorEvent,
      resource: paidResource,
      providerEventId: 'evt_same_session_prior'
    });

    expect(result).toMatchObject({ handled: true, status: 'finalized' });
    expect(postPaidTenantRevenueTransactionUseCase).toHaveBeenCalledTimes(1);
  });

  it('still holds a validation-mismatched paid event for manual resolution (regression)', async () => {
    const commercePaymentRepository = buildRepository([baseSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: baseSession,
      resource: { attributes: { status: 'paid', livemode: false, amount: 100, currency: 'PHP' } },
      providerEventId: 'evt_amount_mismatch'
    });

    expect(result).toMatchObject({
      handled: true,
      status: 'paid_manual_resolution_required',
      manual_resolution_required: true,
      failure_code: 'PAYMENT_AMOUNT_MISMATCH'
    });
    expect(postPaidTenantRevenueTransactionUseCase).not.toHaveBeenCalled();
    expect(finalizePaidCommerceSession).not.toHaveBeenCalled();
  });
});
