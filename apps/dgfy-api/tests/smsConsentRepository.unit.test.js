import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const runTransaction = jest.fn(async (callback) => callback(transaction));
const SmsMarketingConsent = {
  findOne: jest.fn(), create: jest.fn(),
};
const SmsConsentEvent = { create: jest.fn() };
const SmsGlobalSuppression = { findByPk: jest.fn() };
jest.unstable_mockModule('../src/models/index.js', () => ({
  sequelize: { transaction: runTransaction }, SmsMarketingConsent, SmsConsentEvent, SmsGlobalSuppression
}));
const { smsConsentRepository } = await import('../src/modules/smsDelivery/repositories/smsConsentRepository.js');

describe('smsConsentRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes grant projection and append-only event in one transaction', async () => {
    SmsMarketingConsent.findOne.mockResolvedValueOnce(null);
    SmsMarketingConsent.create.mockResolvedValueOnce({ status: 'active' });
    SmsConsentEvent.create.mockResolvedValueOnce({});
    const input = {
      tenantId: 'tenant-a', recipientPhoneHash: 'a'.repeat(64), recipientPrefix: '+63917', source: 'manual_api',
      actorType: 'user', actorId: 'user-a', consentTextVersion: 'v1', occurredAt: new Date('2026-10-10T00:00:00Z')
    };

    const result = await smsConsentRepository.recordConsent(input);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(SmsMarketingConsent.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', granted_at: input.occurredAt }), { transaction });
    expect(SmsConsentEvent.create).toHaveBeenCalledWith(expect.objectContaining({ event: 'granted', source: 'manual_api', occurred_at: input.occurredAt }), { transaction });
    expect(result.status).toBe('active');
  });

  it('creates a revoked projection and event even when no grant row exists', async () => {
    SmsMarketingConsent.findOne.mockResolvedValueOnce(null);
    SmsMarketingConsent.create.mockResolvedValueOnce({ status: 'revoked' });
    SmsConsentEvent.create.mockResolvedValueOnce({});
    const occurredAt = new Date('2026-10-10T00:00:00Z');

    const result = await smsConsentRepository.revokeConsent({
      tenantId: 'tenant-a', recipientPhoneHash: 'b'.repeat(64), recipientPrefix: '+63917',
      source: 'manual_api', actorType: 'user', actorId: 'user-a', occurredAt
    });

    expect(SmsMarketingConsent.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', granted_at: null, revoked_at: occurredAt }), { transaction });
    expect(SmsConsentEvent.create).toHaveBeenCalledWith(expect.objectContaining({ event: 'revoked', occurred_at: occurredAt }), { transaction });
    expect(result.status).toBe('revoked');
  });

  it('checks global suppression before tenant consent', async () => {
    SmsGlobalSuppression.findByPk.mockResolvedValueOnce({ recipient_phone_hash: 'c'.repeat(64) });
    const result = await smsConsentRepository.getPromotionalEligibility({ tenantId: 'tenant-a', recipientPhoneHash: 'c'.repeat(64) });
    expect(result).toEqual({ globallySuppressed: true, status: null });
    expect(SmsMarketingConsent.findOne).not.toHaveBeenCalled();
  });

  it('scopes active consent lookup to the sending tenant', async () => {
    SmsGlobalSuppression.findByPk.mockResolvedValueOnce(null);
    SmsMarketingConsent.findOne.mockResolvedValueOnce({ status: 'active' });
    const result = await smsConsentRepository.getPromotionalEligibility({ tenantId: 'tenant-a', recipientPhoneHash: 'd'.repeat(64) });
    expect(SmsMarketingConsent.findOne).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a', recipient_phone_hash: 'd'.repeat(64) }
    });
    expect(result.status).toBe('active');
  });
});
