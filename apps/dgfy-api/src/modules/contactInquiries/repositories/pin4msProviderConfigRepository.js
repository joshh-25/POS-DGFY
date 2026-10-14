import {
  ContactInquiryProviderConfig,
  PlatformAdminAuditLog,
  sequelize
} from '../../../models/index.js';

const PROVIDER_KEY = 'pin4ms';

export const getPin4msProviderConfig = async () => {
  const row = await ContactInquiryProviderConfig.findOne({
    where: { provider_key: PROVIDER_KEY },
    attributes: ['encrypted_api_key', 'updated_at']
  });

  return {
    configured: Boolean(row?.encrypted_api_key),
    updatedAt: row?.updated_at || null
  };
};

export const savePin4msProviderConfig = async ({ encryptedApiKey, admin }) => sequelize.transaction(async (transaction) => {
  const existing = await ContactInquiryProviderConfig.findOne({
    where: { provider_key: PROVIDER_KEY },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const wasConfigured = Boolean(existing?.encrypted_api_key);
  const values = {
    provider_key: PROVIDER_KEY,
    encrypted_api_key: encryptedApiKey,
    updated_by_admin_id: admin?.id || null
  };

  if (existing) {
    await existing.update(values, { transaction });
  } else {
    await ContactInquiryProviderConfig.create(values, { transaction });
  }

  await PlatformAdminAuditLog.create({
    actor_admin_id: admin?.id || null,
    actor_username_snapshot: admin?.username || null,
    action: wasConfigured ? 'contact_inquiries_pin4ms_key_replaced' : 'contact_inquiries_pin4ms_key_configured',
    before_snapshot: { provider: PROVIDER_KEY, configured: wasConfigured },
    after_snapshot: { provider: PROVIDER_KEY, configured: true }
  }, { transaction });

  return getPin4msProviderConfig();
});
