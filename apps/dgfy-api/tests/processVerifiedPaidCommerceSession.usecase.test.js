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
    // Model the REAL downstream idempotency contracts, not just "succeeds": both are already
    // safe to call more than once for the same session --
    // postPaidTenantRevenueTransactionUseCase takes its own locked
    // findRevenueTransactionBySession read before insert (tenantRevenueUseCases.js) and reports
    // `posted:false, reason:'already_posted'` on a repeat call; finalizePaidCommerceSession
    // short-circuits on pos_transaction_id/tracking_pin/status==='finalized' and returns the
    // already-finalized row unchanged. A test that mocked these as "always succeeds, count
    // matters" would not catch #476's review finding (RF-1): that a retry landing while the
    // session is merely 'paid' must actually be allowed to reach these calls, not be swallowed
    // as a stale idempotent replay.
    let revenuePosted = false;
    postPaidTenantRevenueTransactionUseCase.mockImplementation(async () => {
      if (revenuePosted) return { success: true, data: { posted: false, reason: 'already_posted' } };
      revenuePosted = true;
      return { success: true, data: { posted: true } };
    });
    finalizePaidCommerceSession.mockImplementation(async ({ session }) => (
      session.pos_transaction_id || session.tracking_pin || session.status === 'finalized'
        ? session
        : { ...session, status: 'finalized', pos_transaction_id: 9001, tracking_pin: 'TRACK1' }
    ));
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

  it('short-circuits a delivery for an already-finalized session without re-invoking downstream work', async () => {
    const finalizedSession = {
      ...baseSession,
      status: 'finalized',
      pos_transaction_id: 9001,
      tracking_pin: 'TRACK1'
    };
    const commercePaymentRepository = buildRepository([finalizedSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: finalizedSession,
      resource: paidResource,
      providerEventId: 'evt_already_finalized'
    });

    expect(result).toEqual({
      handled: true,
      idempotent_replay: true,
      status: 'finalized',
      payment_session: finalizedSession.public_reference
    });
    expect(postPaidTenantRevenueTransactionUseCase).not.toHaveBeenCalled();
    expect(finalizePaidCommerceSession).not.toHaveBeenCalled();
  });

  // #476 review (RF-1): an earlier version of this fix treated bare status:'paid' as an
  // already-claimed terminal state, which silently swallowed exactly this scenario -- a
  // PayMongo retry landing after the claim write committed but before revenue posting /
  // finalization ever completed (e.g. the first delivery's process crashed, or its revenue
  // post/finalization call itself failed and threw). That is "money with no order," the same
  // failure class #476 exists to close, just moved one step later instead of fixed. The claim
  // step must resume processing here, not report a stale idempotent replay.
  it('resumes revenue posting and finalization on a retry that lands while the session is merely "paid"', async () => {
    const midFlightSession = { ...baseSession, status: 'paid' };
    const commercePaymentRepository = buildRepository([midFlightSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    const result = await useCase({
      session: midFlightSession,
      resource: paidResource,
      providerEventId: 'evt_resumed_retry'
    });

    expect(result).toEqual({
      handled: true,
      status: 'finalized',
      payment_session: midFlightSession.public_reference
    });
    expect(postPaidTenantRevenueTransactionUseCase).toHaveBeenCalledTimes(1);
    expect(finalizePaidCommerceSession).toHaveBeenCalledTimes(1);
  });

  it('does not double-post revenue or double-finalize when two deliveries both reach the merely-"paid" window', async () => {
    const commercePaymentRepository = buildRepository([baseSession]);
    const useCase = buildProcessVerifiedPaidCommerceSessionUseCase({ commercePaymentRepository });

    // Simulates a first delivery whose downstream work never persisted back onto the mock
    // repository's row (e.g. it crashed between the claim commit and finalization) -- the row
    // the second delivery re-reads is still 'paid', exactly like the resumed-retry case above,
    // but here BOTH the real idempotency guards inside postPaidTenantRevenueTransactionUseCase
    // and finalizePaidCommerceSession are what's doing the deduping, not this use case's own
    // state check.
    await useCase({ session: baseSession, resource: paidResource, providerEventId: 'evt_dup_1' });
    expect(commercePaymentRepository._rows.get(baseSession.session_id).status).toBe('paid');

    const secondResult = await useCase({
      session: baseSession,
      resource: paidResource,
      providerEventId: 'evt_dup_1'
    });

    expect(secondResult).toEqual({
      handled: true,
      status: 'finalized',
      payment_session: baseSession.public_reference
    });
    // Both downstream calls are re-attempted (this use case never permanently swallows a
    // 'paid' session)...
    expect(postPaidTenantRevenueTransactionUseCase).toHaveBeenCalledTimes(2);
    expect(finalizePaidCommerceSession).toHaveBeenCalledTimes(2);
    // ...but the second attempt is a real no-op at the point that actually matters: the
    // revenue-posting mock's own already_posted guard fired, not a fresh insert.
    await expect(postPaidTenantRevenueTransactionUseCase.mock.results[0].value)
      .resolves.toMatchObject({ data: { posted: true } });
    await expect(postPaidTenantRevenueTransactionUseCase.mock.results[1].value)
      .resolves.toMatchObject({ data: { posted: false, reason: 'already_posted' } });
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
