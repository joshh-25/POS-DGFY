import { describe, expect, it, jest } from '@jest/globals';
import {
  recordGlobalSmsOptOutUseCase,
  recordSmsMarketingConsentUseCase,
  revokeSmsMarketingConsentUseCase
} from '../src/modules/smsDelivery/usecases/smsMarketingConsentUseCases.js';

describe('smsMarketingConsentUseCases', () => {
  it('records an auditable grant with normalized identity and required text version', async () => {
    const repository = { recordConsent: jest.fn(async (input) => input) };
    const now = new Date('2026-10-10T00:00:00Z');
    const result = await recordSmsMarketingConsentUseCase({
      tenantId: 'tenant-a', phone: '09171234567', source: 'manual_api', actorId: 'user-1',
      consentTextVersion: 'marketing-v1', now
    }, { repository });

    expect(result).toMatchObject({
      tenantId: 'tenant-a', recipientPhoneHash: expect.any(String), recipientPrefix: '+63917',
      source: 'manual_api', actorId: 'user-1', consentTextVersion: 'marketing-v1', occurredAt: now
    });
    expect(JSON.stringify(result)).not.toContain('09171234567');
  });

  it('rejects invalid phones and grants without a consent text version', async () => {
    const repository = { recordConsent: jest.fn(), revokeConsent: jest.fn() };
    await expect(recordSmsMarketingConsentUseCase({ tenantId: 'tenant-a', phone: 'not-a-phone', consentTextVersion: 'v1' }, { repository }))
      .rejects.toMatchObject({ code: 'INVALID_PHONE' });
    await expect(recordSmsMarketingConsentUseCase({ tenantId: 'tenant-a', phone: '09171234567' }, { repository }))
      .rejects.toMatchObject({ code: 'INVALID_CONSENT_TEXT_VERSION' });
    expect(repository.recordConsent).not.toHaveBeenCalled();
  });

  it('records revocation without requiring a previous grant and records global suppression', async () => {
    const repository = {
      revokeConsent: jest.fn(async (input) => input),
      recordGlobalSuppression: jest.fn(async (input) => input)
    };
    const revoked = await revokeSmsMarketingConsentUseCase({ tenantId: 'tenant-a', phone: '09171234567' }, { repository });
    const suppressed = await recordGlobalSmsOptOutUseCase({ phone: '09171234567', reason: 'recipient_requested' }, { repository });

    expect(revoked).toMatchObject({ tenantId: 'tenant-a', source: 'manual_api', recipientPhoneHash: expect.any(String) });
    expect(suppressed).toMatchObject({ source: 'manual_api', reason: 'recipient_requested', recipientPhoneHash: expect.any(String) });
    expect(JSON.stringify(suppressed)).not.toContain('09171234567');
  });
});
