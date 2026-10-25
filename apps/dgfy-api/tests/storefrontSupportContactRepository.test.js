import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const runTransaction = jest.fn(async (callback) => callback(transaction));
const findByPk = jest.fn();
const findOrCreate = jest.fn();
const auditCreate = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
  PlatformAdminAuditLog: { create: auditCreate },
  PlatformStorefrontSupportContact: { findByPk, findOrCreate },
  sequelize: { transaction: runTransaction }
}));

const {
  getPublicStorefrontSupportContact,
  recordStorefrontSupportEmailVerification,
  saveStorefrontSupportEmail
} = await import('../src/modules/contactInquiries/repositories/storefrontSupportContactRepository.js');

describe('Storefront support contact repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes the configured email even when optional verification is incomplete', async () => {
    findByPk.mockResolvedValue({
      active_email: 'support@dgfy.ph',
      active_email_verified_at: null,
      monitoring_confirmed_at: null,
      pending_email: 'support@dgfy.ph'
    });

    await expect(getPublicStorefrontSupportContact()).resolves.toEqual({ email: 'support@dgfy.ph' });
  });

  it('continues to publish the configured address after optional verification', async () => {
    findByPk.mockResolvedValue({
      active_email: 'support@dgfy.ph',
      active_email_verified_at: new Date('2026-10-25T00:00:00.000Z'),
      monitoring_confirmed_at: new Date('2026-10-25T00:00:00.000Z'),
      pending_email: 'replacement@dgfy.ph'
    });

    await expect(getPublicStorefrontSupportContact()).resolves.toEqual({ email: 'support@dgfy.ph' });
  });

  it('saves the address directly and clears old verification when the address changes', async () => {
    const update = jest.fn(async (values) => Object.assign(contact, values));
    const contact = {
      active_email: 'old@dgfy.ph',
      active_email_verified_at: new Date('2026-10-20T00:00:00.000Z'),
      monitoring_confirmed_at: new Date('2026-10-20T00:00:00.000Z'),
      pending_email: 'old@dgfy.ph',
      update
    };
    findOrCreate.mockResolvedValue([contact, false]);

    await saveStorefrontSupportEmail({
      email: 'support@dgfy.ph',
      admin: { id: 'admin-1', username: 'operator' }
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      active_email: 'support@dgfy.ph',
      active_email_verified_at: null,
      monitoring_confirmed_at: null,
      monitoring_confirmed_by_admin_id: null,
      pending_email: null
    }), { transaction });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      action: 'storefront_support_email_configured',
      after_snapshot: expect.objectContaining({ activeEmail: 'support@dgfy.ph', emailVerified: false })
    }), { transaction });
  });

  it('rechecks the configured email inside the verification transaction and records an audit event', async () => {
    const update = jest.fn(async (values) => Object.assign(contact, values));
    const contact = {
      active_email: 'support@dgfy.ph',
      pending_email: 'support@dgfy.ph',
      update
    };
    findByPk.mockResolvedValue(contact);

    await recordStorefrontSupportEmailVerification({
      email: 'support@dgfy.ph',
      monitoringConfirmed: true,
      admin: { id: 'admin-1', username: 'operator' }
    });

    expect(findByPk).toHaveBeenCalledWith(1, { transaction, lock: 'UPDATE' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      active_email_verified_at: expect.any(Date),
      monitoring_confirmed_at: expect.any(Date),
      monitoring_confirmed_by_admin_id: 'admin-1',
      pending_email: null
    }), { transaction });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      actor_admin_id: 'admin-1',
      action: 'storefront_support_email_verified',
      after_snapshot: expect.objectContaining({ emailVerified: true, monitoringConfirmed: true })
    }), { transaction });
  });

  it('rejects activation if the candidate changed while verification was in flight', async () => {
    findByPk.mockResolvedValue({ pending_email: 'replacement@dgfy.ph' });

    await expect(recordStorefrontSupportEmailVerification({ email: 'support@dgfy.ph', admin: { id: 'admin-1' } }))
      .rejects.toMatchObject({ code: 'SUPPORT_EMAIL_CANDIDATE_CHANGED', statusCode: 409 });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
