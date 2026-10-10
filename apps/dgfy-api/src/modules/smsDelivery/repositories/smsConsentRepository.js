import {
  sequelize,
  SmsConsentEvent,
  SmsGlobalSuppression,
  SmsMarketingConsent
} from '../../../models/index.js';

const plain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

export const smsConsentRepository = {
  async getPromotionalEligibility({ tenantId, recipientPhoneHash }) {
    const globalSuppression = await SmsGlobalSuppression.findByPk(recipientPhoneHash);
    if (globalSuppression) return { globallySuppressed: true, status: null };
    const consent = await SmsMarketingConsent.findOne({ where: { tenant_id: tenantId, recipient_phone_hash: recipientPhoneHash } });
    return { globallySuppressed: false, status: consent?.status || null };
  },

  async recordConsent({ tenantId, recipientPhoneHash, recipientPrefix, source, actorType, actorId, consentTextVersion, occurredAt }) {
    return sequelize.transaction(async (transaction) => {
      const where = { tenant_id: tenantId, recipient_phone_hash: recipientPhoneHash };
      const current = await SmsMarketingConsent.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
      const values = {
        recipient_prefix: recipientPrefix,
        status: 'active',
        source,
        actor_type: actorType,
        actor_id: actorId,
        consent_text_version: consentTextVersion,
        granted_at: occurredAt,
        revoked_at: null
      };
      if (current) await current.update(values, { transaction });
      else await SmsMarketingConsent.create({ ...where, ...values }, { transaction });
      await SmsConsentEvent.create({
        ...where, event: 'granted', source, actor_type: actorType, actor_id: actorId,
        consent_text_version: consentTextVersion, occurred_at: occurredAt
      }, { transaction });
      return { status: 'active', tenant_id: tenantId, recipient_phone_hash: recipientPhoneHash, granted_at: occurredAt };
    });
  },

  async revokeConsent({ tenantId, recipientPhoneHash, recipientPrefix, source, actorType, actorId, occurredAt }) {
    return sequelize.transaction(async (transaction) => {
      const where = { tenant_id: tenantId, recipient_phone_hash: recipientPhoneHash };
      const current = await SmsMarketingConsent.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
      const values = {
        recipient_prefix: recipientPrefix,
        status: 'revoked',
        source,
        actor_type: actorType,
        actor_id: actorId,
        revoked_at: occurredAt
      };
      if (current) await current.update(values, { transaction });
      else await SmsMarketingConsent.create({ ...where, ...values, consent_text_version: null, granted_at: null }, { transaction });
      await SmsConsentEvent.create({
        ...where, event: 'revoked', source, actor_type: actorType, actor_id: actorId,
        consent_text_version: null, occurred_at: occurredAt
      }, { transaction });
      return { status: 'revoked', tenant_id: tenantId, recipient_phone_hash: recipientPhoneHash, revoked_at: occurredAt };
    });
  },

  async recordGlobalSuppression({ recipientPhoneHash, reason, source, actorType, actorId, occurredAt }) {
    return sequelize.transaction(async (transaction) => {
      const current = await SmsGlobalSuppression.findByPk(recipientPhoneHash, { transaction, lock: transaction.LOCK.UPDATE });
      if (current) return plain(current);
      const row = await SmsGlobalSuppression.create({
        recipient_phone_hash: recipientPhoneHash, reason, source, actor_type: actorType, actor_id: actorId, created_at: occurredAt
      }, { transaction });
      return plain(row);
    });
  }
};

export default smsConsentRepository;
