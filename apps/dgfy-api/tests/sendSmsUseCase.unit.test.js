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
    const failed = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale', dedupeKey: 'campaign-1' }, {
      repository,
      adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(failed.deliveries[0].status).toBe('failed');
    expect(raiseSmsOperationalAlert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sms.send_failed', context: expect.objectContaining({ delivery_id: expect.any(String), provider: 'fake', error_code: 'GATEWAY_DOWN' })
    }));
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'GATEWAY_DOWN', error_message: 'gateway down' }));

    repository.findByDedupeKey.mockResolvedValue({ id: 'prior', recipient_phone_hash: 'hash', status: 'accepted', simulated: true });
    const duplicate = await sendSmsUseCase({ recipients: ['09171234567'], purpose: 'promotional', content: 'sale', dedupeKey: 'campaign-1' }, {
      repository,
      adapterResolver: () => ({ mode: 'fake', adapter: { send } })
    });
    expect(duplicate.deliveries[0]).toEqual({ id: 'prior', recipientHash: 'hash', status: 'accepted', simulated: true });
    expect(send).toHaveBeenCalledTimes(1);
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

    await sendSmsUseCase(input, { repository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });
    await sendSmsUseCase(input, { repository, adapterResolver: () => ({ mode: 'fake', adapter: { send } }) });

    expect(send).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create.mock.calls[0][0]).toMatchObject({ purpose: 'transactional_order', order_id: null });
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('content');
    expect(JSON.stringify(repository.create.mock.calls[0][0])).not.toContain(input.content);
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
