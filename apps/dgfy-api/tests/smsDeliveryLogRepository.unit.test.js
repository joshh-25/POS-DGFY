import { afterEach, describe, expect, it, jest } from '@jest/globals';

const model = {
  findAll: jest.fn(), update: jest.fn(), destroy: jest.fn(), create: jest.fn(), findByPk: jest.fn(), findOne: jest.fn()
};
jest.unstable_mockModule('../src/models/index.js', () => ({ SmsDeliveryLog: model, default: { SmsDeliveryLog: model } }));
const { smsDeliveryLogRepository } = await import('../src/modules/smsDelivery/repositories/smsDeliveryLogRepository.js');

afterEach(() => jest.clearAllMocks());

describe('smsDeliveryLogRepository', () => {
  it('redacts only raw phone values and retains the hash and prefix', async () => {
    model.findAll.mockResolvedValue([{ id: 'delivery-1' }]);
    model.update.mockResolvedValue([1]);
    await expect(smsDeliveryLogRepository.redactPiiOlderThan(new Date('2026-01-01'))).resolves.toBe(1);
    expect(model.update).toHaveBeenCalledWith(expect.objectContaining({ recipient_phone: null, pii_redacted_at: expect.any(Date) }), expect.any(Object));
    expect(model.update.mock.calls[0][0]).not.toHaveProperty('recipient_phone_hash');
    expect(model.update.mock.calls[0][0]).not.toHaveProperty('recipient_prefix');
  });
});
