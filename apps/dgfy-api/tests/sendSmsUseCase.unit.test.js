import { describe, expect, it, jest } from '@jest/globals';

const raiseSmsOperationalAlert = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../src/modules/smsDelivery/adapters/operationalAlertAdapter.js', () => ({ raiseSmsOperationalAlert }));
const { sendSmsUseCase } = await import('../src/modules/smsDelivery/usecases/sendSmsUseCase.js');

const makeRepo = () => ({ create: jest.fn(async (payload) => payload), findByDedupeKey: jest.fn(async () => null) });

describe('sendSmsUseCase', () => {
  it('normalizes recipients, records simulated acceptance without content, and passes purpose to the fake adapter', async () => {
    const repository = makeRepo();
    const send = jest.fn(async () => ({ status: 'accepted', simulated: true }));
    const result = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'transactional_order', content: 'order ready' }, {
      repository,
      adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: '+639171234567', purpose: 'transactional_order' }));
    expect(result.deliveries[0]).toMatchObject({ status: 'accepted', simulated: true });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ recipient_phone: '+639171234567', simulated: true }));
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('content');
    expect(JSON.stringify(repository.create.mock.calls[0][0])).not.toContain('order ready');
  });

  it('accepts one string recipient and resolves the adapter only once for a multi-recipient request', async () => {
    const repository = makeRepo();
    const send = jest.fn(async () => ({ status: 'accepted', simulated: true }));
    const adapterResolver = jest.fn(() => ({ mode: 'fake', adapter: { send } }));
    const result = await sendSmsUseCase({
      recipients: '+63 917 123 4567',
      purpose: 'transactional_order',
      content: 'order ready'
    }, { repository, adapterResolver });

    expect(result.deliveries).toHaveLength(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: '+639171234567' }));

    await sendSmsUseCase({
      recipients: ['09171234567', '09181234567'],
      purpose: 'transactional_order',
      content: 'order ready'
    }, { repository, adapterResolver });
    expect(adapterResolver).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('logs unconfigured and rejects invalid input without calling the adapter', async () => {
    const repository = makeRepo();
    const send = jest.fn();
    const result = await sendSmsUseCase({ recipients: ['garbage'], purpose: 'wrong', content: '' }, {
      repository,
      adapterResolver: () => ({ mode: 'unconfigured', adapter: { send } })
    });
    expect(result.deliveries[0].status).toBe('rejected');
    expect(send).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', recipient_phone: null }));
  });

  it('does not throw adapter failures and returns the existing deduplicated outcome without resending', async () => {
    raiseSmsOperationalAlert.mockClear();
    const repository = makeRepo();
    const send = jest.fn(async () => { throw Object.assign(new Error('gateway down'), { code: 'GATEWAY_DOWN' }); });
    const consentRepository = { getPromotionalEligibility: jest.fn(async () => ({ status: 'active' })) };
    const failed = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale', tenantId: 'tenant-a', optOutInstruction: 'Reply STOP to opt out.', dedupeKey: 'campaign-1' }, {
      repository,
      consentRepository,
      adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(failed.deliveries[0].status).toBe('failed');
    expect(raiseSmsOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sms.send_failed', context: expect.objectContaining({ delivery_id: expect.any(String), provider: 'fake', error_code: 'GATEWAY_DOWN' })
    }));
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'GATEWAY_DOWN', error_message: 'gateway down' }));

    repository.findByDedupeKey.mockResolvedValue({ id: 'prior', recipient_phone_hash: 'hash', status: 'accepted', simulated: true });
    const duplicate = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale', tenantId: 'tenant-a', optOutInstruction: 'Reply STOP to opt out.', dedupeKey: 'campaign-1' }, {
      repository,
      consentRepository,
      adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(duplicate.deliveries[0]).toEqual({ id: 'prior', recipientHash: 'hash', status: 'accepted', simulated: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects promotional messages without tenant-scoped consent and leaves them dedupeable later', async () => {
    const repository = makeRepo();
    const send = jest.fn();
    const consentRepository = { getPromotionalEligibility: jest.fn(async () => ({ status: null })) };
    const result = await sendSmsUseCase({
      recipients: ['09171234567'], purpose: 'promotional', content: 'sale', tenantId: 'tenant-a',
      optOutInstruction: 'Reply STOP to opt out.', dedupeKey: 'campaign-1'
    }, { repository, consentRepository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });

    expect(result.deliveries[0].status).toBe('rejected');
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', error_code: 'consent_missing', dedupe_key: null }));
    expect(send).not.toHaveBeenCalled();
  });

  it('requires tenant context and an opt-out instruction before promotional sends', async () => {
    const repository = makeRepo();
    const send = jest.fn();
    const consentRepository = { getPromotionalEligibility: jest.fn(async () => ({ status: 'active' })) };
    const missingTenant = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale' }, {
      repository, consentRepository, adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    const missingInstruction = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale', tenantId: 'tenant-a' }, {
      repository, consentRepository, adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(missingTenant.deliveries[0].status).toBe('rejected');
    expect(repository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ error_code: 'missing_tenant', dedupe_key: null }));
    expect(missingInstruction.deliveries[0].status).toBe('rejected');
    expect(repository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ error_code: 'missing_opt_out_instruction', dedupe_key: null }));
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed on revoked/global suppression and consent-store errors', async () => {
    const repository = makeRepo();
    const send = jest.fn();
    for (const [eligibility, errorCode] of [
      [{ status: 'revoked' }, 'opted_out'],
      [{ status: null, globallySuppressed: true }, 'opted_out_global']
    ]) {
      const consentRepository = { getPromotionalEligibility: jest.fn(async () => eligibility) };
      const input = { recipients: ['09171234567'], purpose: 'promotional', content: 'sale', tenantId: 'tenant-a', optOutInstruction: 'Reply STOP to opt out.' };
      await sendSmsUseCase(input, {
        repository, consentRepository,
        adapterResolver: () => ({ mode: 'fake', adapter: { send } })
      });
      expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ error_code: errorCode, dedupe_key: null }));
      if (errorCode === 'opted_out') {
        const repeated = await sendSmsUseCase(input, {
          repository, consentRepository,
          adapterResolver: () => ({ mode: 'fake', adapter: { send } })
        });
        expect(repeated.deliveries[0].status).toBe('rejected');
        expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ error_code: 'opted_out', dedupe_key: null }));
      }
    }
    await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale', tenantId: 'tenant-a', optOutInstruction: 'Reply STOP to opt out.' }, {
      repository, consentRepository: { getPromotionalEligibility: jest.fn(async () => { throw new Error('db down'); }) },
      adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ error_code: 'consent_check_failed', dedupe_key: null }));
    expect(send).not.toHaveBeenCalled();
  });

  it('sends promotional content only with active consent and appends the opt-out instruction', async () => {
    const repository = makeRepo();
    const send = jest.fn(async () => ({ status: 'accepted' }));
    const consentRepository = { getPromotionalEligibility: jest.fn(async () => ({ status: 'active' })) };
    const result = await sendSmsUseCase({
      recipients: ['09171234567'], purpose: 'promotional', content: 'Sale today', tenantId: 'tenant-a',
      optOutInstruction: 'Reply STOP to opt out.'
    }, { repository, consentRepository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });

    expect(result.deliveries[0].status).toBe('accepted');
    expect(consentRepository.getPromotionalEligibility).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', recipientPhoneHash: expect.any(String) }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ content: 'Sale today Reply STOP to opt out.' }));
  });

  it('durably deduplicates transactional order alerts without persisting message content or integer order IDs', async () => {
    const rows = new Map();
    const repository = {
      findByDedupeKey: jest.fn(async (key) => rows.get(key) || null),
      create: jest.fn(async (payload) => {
        rows.set(payload.dedupe_key, payload);
        return payload;
      })
    };
    const send = jest.fn(async () => ({ status: 'accepted', simulated: true }));
    const input = {
      recipients: ['09171234567'],
      purpose: 'transactional_order',
      content: 'Main: we received your order SK-ABC123.',
      tenantId: 'tenant-1',
      orderId: null,
      dedupeKey: 'order-alert:tenant-1:42:placed'
    };

    const consentRepository = { getPromotionalEligibility: jest.fn(async () => { throw new Error('transactional path must not read consent'); }) };
    await sendSmsUseCase(input, { repository, consentRepository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });
    await sendSmsUseCase(input, { repository, consentRepository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });

    expect(send).toHaveBeenCalledTimes(1);
    expect(consentRepository.getPromotionalEligibility).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create.mock.calls[0][0]).toMatchObject({ purpose: 'transactional_order', order_id: null });
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('content');
    expect(JSON.stringify(repository.create.mock.calls[0][0])).not.toContain(input.content);
  });

  it('keeps an accepted delivery result when the log repository cannot persist it', async () => {
    raiseSmsOperationalAlert.mockClear();
    const repository = {
      findByDedupeKey: jest.fn(async () => null),
      create: jest.fn(async () => { throw new Error('log database unavailable'); })
    };
    const send = jest.fn(async () => ({ status: 'accepted', simulated: true }));

    const result = await sendSmsUseCase({
      recipients: ['09171234567'],
      purpose: 'transactional_order',
      content: 'order received',
      orderId: null,
      dedupeKey: 'order-alert:tenant-1:42:placed'
    }, { repository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });

    expect(result.deliveries[0].status).toBe('accepted');
    expect(send).toHaveBeenCalledTimes(1);
    expect(raiseSmsOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sms.delivery_log_write_failed'
    }));
  });

  it('returns and logs unconfigured without claiming delivery', async () => {
    const repository = makeRepo();
    const result = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'transactional_order', content: 'ready' }, {
      repository,
      adapterResolver: () => ({ mode: 'unconfigured', adapter: { send: async () => ({ status: 'unconfigured' }) } })
    });
    expect(result.deliveries[0]).toMatchObject({ status: 'unconfigured', simulated: false });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'unconfigured', simulated: false }));
  });
});
