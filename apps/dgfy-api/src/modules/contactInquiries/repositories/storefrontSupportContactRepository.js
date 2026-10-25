import {
  PlatformAdminAuditLog,
  PlatformStorefrontSupportContact,
  sequelize
} from '../../../models/index.js';

const SUPPORT_CONTACT_ID = 1;

const readSupportContact = () => PlatformStorefrontSupportContact.findByPk(SUPPORT_CONTACT_ID);

const getOrCreateSupportContact = async (transaction) => {
  const [contact] = await PlatformStorefrontSupportContact.findOrCreate({
    where: { id: SUPPORT_CONTACT_ID },
    defaults: { id: SUPPORT_CONTACT_ID },
    ...(transaction ? { transaction } : {})
  });
  return contact;
};

const auditActor = (admin) => ({
  actor_admin_id: admin?.id || null,
  actor_username_snapshot: admin?.username || null
});

const toAdminStatus = (contact) => ({
  activeEmail: contact?.active_email || null,
  activeEmailVerifiedAt: contact?.active_email_verified_at || null,
  monitoringConfirmedAt: contact?.monitoring_confirmed_at || null,
  pendingEmail: contact?.pending_email || null,
  publicEmailConfigured: Boolean(contact?.active_email)
});

export const getStorefrontSupportContactAdminStatus = async () => (
  toAdminStatus(await readSupportContact())
);

export const getPublicStorefrontSupportContact = async () => {
  const contact = await readSupportContact();
  return { email: contact?.active_email || null };
};

export const saveStorefrontSupportEmail = async ({ email, admin }) => sequelize.transaction(async (transaction) => {
  const contact = await getOrCreateSupportContact(transaction);
  const previousEmail = contact.active_email || null;
  const isChanged = previousEmail !== email;

  await contact.update({
    active_email: email,
    ...(isChanged ? {
      active_email_verified_at: null,
      monitoring_confirmed_at: null,
      monitoring_confirmed_by_admin_id: null,
      pending_email: null
    } : {}),
    updated_by_admin_id: admin?.id || null
  }, { transaction });

  await PlatformAdminAuditLog.create({
    ...auditActor(admin),
    action: isChanged ? 'storefront_support_email_configured' : 'storefront_support_email_saved',
    before_snapshot: { activeEmail: previousEmail },
    after_snapshot: {
      activeEmail: email,
      emailVerified: isChanged ? false : Boolean(contact.active_email_verified_at),
      monitoringConfirmed: isChanged ? false : Boolean(contact.monitoring_confirmed_at)
    }
  }, { transaction });

  return {
    activeEmail: email,
    activeEmailVerifiedAt: isChanged ? null : contact.active_email_verified_at || null,
    monitoringConfirmedAt: isChanged ? null : contact.monitoring_confirmed_at || null,
    pendingEmail: isChanged ? null : contact.pending_email || null,
    publicEmailConfigured: true
  };
});

export const savePendingStorefrontSupportEmail = async ({ email, admin }) => sequelize.transaction(async (transaction) => {
  const contact = await getOrCreateSupportContact(transaction);
  if (contact.active_email !== email) {
    const error = new Error('Save this support email before requesting its optional verification code.');
    error.statusCode = 409;
    error.code = 'SUPPORT_EMAIL_CANDIDATE_CHANGED';
    throw error;
  }
  const previousEmail = contact.pending_email || null;

  await contact.update({
    pending_email: email,
    updated_by_admin_id: admin?.id || null
  }, { transaction });

  await PlatformAdminAuditLog.create({
    ...auditActor(admin),
    action: 'storefront_support_email_verification_requested',
    before_snapshot: { pendingEmail: previousEmail },
    after_snapshot: { activeEmail: email, pendingEmail: email }
  }, { transaction });

  return toAdminStatus(contact);
});

export const recordStorefrontSupportEmailVerification = async ({ email, admin, monitoringConfirmed = false }) => sequelize.transaction(async (transaction) => {
  const contact = await PlatformStorefrontSupportContact.findByPk(SUPPORT_CONTACT_ID, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!contact || contact.active_email !== email || contact.pending_email !== email) {
    const error = new Error('The configured support email changed. Request a new optional verification code.');
    error.statusCode = 409;
    error.code = 'SUPPORT_EMAIL_CANDIDATE_CHANGED';
    throw error;
  }

  const before = {
    activeEmail: contact.active_email || null,
    emailVerified: Boolean(contact.active_email_verified_at)
  };
  const verifiedAt = new Date();

  await contact.update({
    active_email_verified_at: verifiedAt,
    ...(monitoringConfirmed ? {
      monitoring_confirmed_at: verifiedAt,
      monitoring_confirmed_by_admin_id: admin?.id || null
    } : {}),
    pending_email: null,
    updated_by_admin_id: admin?.id || null
  }, { transaction });

  await PlatformAdminAuditLog.create({
    ...auditActor(admin),
    action: 'storefront_support_email_verified',
    before_snapshot: before,
    after_snapshot: {
      activeEmail: email,
      pendingEmail: null,
      emailVerified: true,
      monitoringConfirmed: monitoringConfirmed || Boolean(contact.monitoring_confirmed_at)
    }
  }, { transaction });

  return toAdminStatus(contact);
});
