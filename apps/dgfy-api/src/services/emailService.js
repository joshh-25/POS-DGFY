/**
 * Email Service
 *
 * Handles email sending via SMTP using nodemailer.
 * Supports HTML templates for user invitations.
 *
 * Uses lazy initialization - only creates transporter when needed.
 *
 * Prior to issue #279 this also supported a Brevo HTTPS API fallback path;
 * it was removed as part of that issue (see the compliance impact
 * declaration and ADR 0021's 2026-08-07 amendment) because it exercised
 * zero production traffic and, being unauthenticated for our sending
 * domain, would have failed DMARC the same way SMTP could -- one less
 * delivery path to instrument for delivery-status feedback.
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import logger from '../config/logger.js';
import { raiseOperationalAlert } from './operationalAlertService.js';
import { hashRecipientEmail, extractRecipientDomain, splitRecipients } from '../modules/emailDelivery/utils/emailAddress.js';
import {
  getInvitationTemplate,
  getAffiliateInviteTemplate,
  getWelcomeTemplate,
  getCashierCredentialTemplate,
  getCompanyApprovedTemplate,
  getCompanyRejectedTemplate,
  getSubscriptionExpiringTemplate,
  getSubscriptionCancelledTemplate,
  getPaymentFailedTemplate,
  getPaymentFailedGracePeriodTemplate,
  getPayMongoSetupTemplate,
  getPayMongoSetupExpiredTemplate,
  getPlanChangePendingTemplate,
  getPlanChangeAppliedTemplate,
  getReactivationRequestTemplate,
  getReactivationApprovedTemplate,
  getResubmissionConfirmationTemplate
} from '../templates/emailTemplates.js';

// Lazy initialize transporter
let _transporter = null;
const getAppUrl = () => process.env.APP_URL || 'http://localhost:5173';
const stripHtml = (html = '') => String(html).replace(/<[^>]*>/g, '');
const getFromIdentity = ({ fromName, fromEmail } = {}) => ({
  fromName: fromName || process.env.EMAIL_FROM_NAME || 'SKUpervisor',
  fromEmail: fromEmail || process.env.EMAIL_FROM || process.env.SMTP_USER
});

// Domain used for the self-generated Message-ID (see sendEmail below).
// Falls back to the resolved from-address's domain so a bare send() without
// EMAIL_MESSAGE_ID_DOMAIN configured still produces a syntactically valid
// Message-ID.
const getMessageIdDomain = (fromEmail) => (
  process.env.EMAIL_MESSAGE_ID_DOMAIN
  || extractRecipientDomain(fromEmail)
  || 'localhost'
);

// --- Delivery log repository access (issue #279) ---------------------------
//
// Loaded via a memoized dynamic import, not a static one: emailService.js is
// imported by ~30 modules, and a static `models/index.js` import (which the
// repository needs) would drag the entire model layer into all of their
// tests just to import this file. The dynamic import only resolves the
// first time a send is actually attempted with logging enabled.
let _deliveryLogRepositoryOverride = null;
let _deliveryLogRepositoryPromise = null;

/** Test seam: inject a fake repository instead of loading the real one. */
export const setEmailDeliveryLogRepository = (repository) => {
  _deliveryLogRepositoryOverride = repository;
  _deliveryLogRepositoryPromise = null;
};

const getDeliveryLogRepository = async () => {
  if (_deliveryLogRepositoryOverride) return _deliveryLogRepositoryOverride;

  if (!_deliveryLogRepositoryPromise) {
    _deliveryLogRepositoryPromise = import('../modules/emailDelivery/repositories/emailDeliveryLogRepository.js')
      .then((mod) => mod.emailDeliveryLogRepository)
      .catch((error) => {
        logger.error('[emailService] Failed to load the email delivery log repository', error);
        _deliveryLogRepositoryPromise = null;
        return null;
      });
  }

  return _deliveryLogRepositoryPromise;
};

const isDeliveryLogEnabled = () => process.env.EMAIL_DELIVERY_LOG_ENABLED !== 'false';

export const isSmtpConfigured = () => {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

/**
 * Check if email is configured
 */
export const isEmailConfigured = () => {
  return isSmtpConfigured();
};

export const getEmailProviderMode = () => {
  return isSmtpConfigured() ? 'smtp' : 'unconfigured';
};

/**
 * Get or create the nodemailer transporter
 */
const getTransporter = () => {
  if (_transporter) return _transporter;

  if (!isSmtpConfigured()) {
    logger.warn('SMTP email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    return null;
  }

  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // With no fallback provider (issue #279), a hung socket would otherwise
    // hang the request indefinitely instead of failing loudly.
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10) || 10_000,
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS, 10) || 10_000,
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 10) || 20_000
  };

  _transporter = nodemailer.createTransport(config);
  logger.info('Email transporter initialized');
  return _transporter;
};

/**
 * Test seam / config-change seam: drops the cached transporter so the next
 * send re-reads SMTP_* from the environment. Production never calls this in
 * the request path -- it exists because _transporter is a module-level
 * singleton that would otherwise silently keep using stale credentials for
 * the lifetime of the process.
 */
export const resetTransporter = () => {
  _transporter = null;
};

/**
 * Records what happened to a send attempt into email_delivery_logs (issue
 * #279). Never throws and never blocks the caller's success/failure path --
 * this runs after the send has already resolved or rejected, purely to
 * persist the outcome. A DB hiccup here must not turn a successful send
 * into a failed one, or vice versa.
 */
const recordDeliveryAttempt = async ({ deliveryId, messageId, outcome, subject, fromEmail, primaryRecipient, recipientCount, meta }) => {
  if (!isDeliveryLogEnabled()) return;

  try {
    const repository = await getDeliveryLogRepository();
    if (!repository) return;

    const providerQueueIdMatch = typeof outcome.smtpResponse === 'string'
      ? outcome.smtpResponse.match(/\bid=(\S+)/i)
      : null;

    await repository.create({
      id: deliveryId,
      message_id: messageId,
      provider: 'smtp',
      provider_queue_id: providerQueueIdMatch ? providerQueueIdMatch[1] : null,
      purpose: meta?.purpose || null,
      tenant_id: meta?.tenantId || null,
      recipient_email: primaryRecipient || null,
      recipient_email_hash: hashRecipientEmail(primaryRecipient),
      recipient_domain: extractRecipientDomain(primaryRecipient),
      recipient_count: recipientCount,
      subject: subject ? String(subject).slice(0, 255) : null,
      from_email: fromEmail || null,
      status: outcome.status,
      smtp_response: outcome.smtpResponse ? String(outcome.smtpResponse).slice(0, 500) : null,
      accepted_recipients: outcome.accepted?.length ? outcome.accepted : null,
      rejected_recipients: outcome.rejected?.length ? outcome.rejected : null,
      error_code: outcome.errorCode || null,
      error_message: outcome.errorMessage || null,
      sent_at: new Date()
    });
  } catch (writeError) {
    await raiseOperationalAlert({
      key: 'email.delivery_log_write_failed',
      error: writeError,
      context: { delivery_id: deliveryId }
    });
  }
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @param {Object} [options.meta] - Optional { purpose, tenantId } recorded on the delivery log row.
 * @returns {Promise<Object>} - Nodemailer send result, plus { provider, deliveryId }
 */
export const sendEmail = async ({ to, subject, html, text, fromName, fromEmail, attachments = [], meta = {} }) => {
  const transporter = getTransporter();

  if (!transporter) {
    const error = new Error('Email service is not configured. Please set SMTP settings in .env');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const { fromName: resolvedFromName, fromEmail: resolvedFromEmail } = getFromIdentity({ fromName, fromEmail });

  // Self-generated correlation key (issue #279): rather than relying on the
  // SMTP envelope sender being predictable for a future bounce reply --
  // authenticated relays commonly rewrite it to the authenticated mailbox,
  // which may not be the address a bounce mailbox is watching -- the
  // delivery log's own id is embedded directly in the outgoing message.
  const deliveryId = crypto.randomUUID();
  const generatedMessageId = `<${deliveryId}@${getMessageIdDomain(resolvedFromEmail)}>`;
  const recipients = splitRecipients(to);
  const primaryRecipient = recipients[0] || '';

  const mailOptions = {
    from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
    to,
    subject,
    html,
    text: text || stripHtml(html),
    attachments,
    messageId: generatedMessageId,
    headers: {
      // Redundant with the Message-ID header above: some MTAs return only
      // headers (not the full Message-ID) in a bounce, so a second,
      // differently-named occurrence makes correlation more robust.
      'X-DGFY-Delivery-Id': deliveryId
    }
  };

  let outcome;

  try {
    const result = await transporter.sendMail(mailOptions);
    const accepted = result.accepted || [];
    const rejected = result.rejected || [];

    if (rejected.length === 0) {
      outcome = { status: 'sent', accepted, rejected, smtpResponse: result.response, result };
    } else if (accepted.length > 0) {
      // nodemailer resolves (does not throw) on a partial rejection -- a
      // second silent-success shape this issue also closes. The caller
      // still gets a result back (some recipients did receive it), but the
      // rejection is recorded and alerted rather than disappearing.
      outcome = {
        status: 'partial',
        accepted,
        rejected,
        smtpResponse: result.response,
        errorCode: 'EMAIL_SOME_RECIPIENTS_REJECTED',
        errorMessage: `Some recipients were rejected by the SMTP server: ${rejected.join(', ')}`,
        result
      };
    } else {
      outcome = {
        status: 'failed',
        accepted,
        rejected,
        smtpResponse: result.response,
        errorCode: 'EMAIL_ALL_RECIPIENTS_REJECTED',
        errorMessage: `All recipients were rejected by the SMTP server: ${rejected.join(', ')}`,
        result
      };
    }
  } catch (error) {
    outcome = {
      status: 'failed',
      accepted: [],
      rejected: [],
      smtpResponse: error?.response || null,
      errorCode: error?.code || error?.responseCode || 'EMAIL_SEND_FAILED',
      errorMessage: String(error?.message || 'Email send failed').slice(0, 500),
      thrownError: error
    };
  }

  await recordDeliveryAttempt({
    deliveryId,
    messageId: generatedMessageId,
    outcome,
    subject,
    fromEmail: resolvedFromEmail,
    primaryRecipient,
    recipientCount: recipients.length,
    meta
  });

  if (outcome.status === 'partial') {
    logger.warn(`Email to ${to} had some recipients rejected`, { messageId: generatedMessageId, rejected: outcome.rejected });
    await raiseOperationalAlert({
      key: 'email.recipients_rejected',
      level: 'warning',
      message: outcome.errorMessage,
      context: {
        delivery_id: deliveryId,
        recipient_domain: extractRecipientDomain(primaryRecipient),
        rejected_count: outcome.rejected.length
      }
    });
    return { ...outcome.result, provider: 'smtp', deliveryId };
  }

  if (outcome.status === 'failed') {
    // No fallback provider (issue #279): a send failure must surface, not
    // silently retry through a second path that would fail the same way.
    const error = outcome.thrownError || Object.assign(new Error(outcome.errorMessage), { code: outcome.errorCode });
    logger.error(`Failed to send email to ${to}:`, error);
    await raiseOperationalAlert({
      key: 'email.smtp_send_failed',
      error,
      context: {
        delivery_id: deliveryId,
        recipient_domain: extractRecipientDomain(primaryRecipient),
        error_code: outcome.errorCode
      }
    });
    throw error;
  }

  logger.info(`Email sent successfully to ${to}`, { messageId: generatedMessageId });
  return { ...outcome.result, provider: 'smtp', deliveryId };
};

/**
 * Send a user invitation email
 * @param {Object} params - Invitation parameters
 * @param {string} params.email - Recipient email address
 * @param {string} params.inviterName - Name of the person sending the invitation
 * @param {string} params.role - Role being assigned (staff/manager/admin)
 * @param {string} params.invitationToken - Unique invitation token
 * @param {string} params.tenantName - Company/tenant name
 * @returns {Promise<Object>} - Nodemailer send result
 */
export const sendInvitationEmail = async ({ email, inviterName, role, invitationToken, tenantName }) => {
  const appUrl = getAppUrl();
  const html = getInvitationTemplate({
    inviterName,
    role: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize role
    invitationToken,
    tenantName,
    expiresIn: '7 days',
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `You've been invited to join ${tenantName} on SKUpervisor`,
    html
  });
};

/**
 * Send an affiliate invitation email. The link target depends on whether the invitee already has a
 * DGFY account (explicit accept) or not (register-with-prefilled-email, then auto-enroll).
 * @param {Object} params
 * @param {string} params.email - Invitee email address
 * @param {string} params.businessName - Inviting store/business name
 * @param {string} [params.inviterName] - Name of the person sending the invite
 * @param {string} params.invitationToken - Opaque invite token (link only)
 * @param {boolean} params.accountExists - Whether a DGFY account already exists for this email
 * @returns {Promise<Object>} Nodemailer send result
 */
export const sendAffiliateInviteEmail = async ({ email, businessName, inviterName, invitationToken, accountExists }) => {
  const appOrigin = String(process.env.STOREFRONT_PUBLIC_ORIGIN || 'https://dgfy.ph').trim();
  const html = getAffiliateInviteTemplate({
    businessName,
    inviterName,
    invitationToken,
    inviteeEmail: email,
    accountExists: accountExists === true,
    appOrigin,
    expiresIn: '7 days'
  });

  return sendEmail({
    to: email,
    subject: `You're invited to be an affiliate of ${businessName} on DGFY`,
    html,
    fromName: 'DGFY'
  });
};

export const sendWelcomeEmail = async ({ email, username, role, tenantName }) => {
  const appUrl = getAppUrl();
  const html = getWelcomeTemplate({
    username,
    role: role.charAt(0).toUpperCase() + role.slice(1),
    tenantName,
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Welcome to ${tenantName} on SKUpervisor`,
    html
  });
};

export const sendCashierCredentialEmail = async ({
  email,
  tenantName,
  temporaryPassword,
  terminalLabel,
  storeName,
  tenantId
}) => {
  const appUrl = getAppUrl();
  const loginUrl = `${appUrl}/login`;
  const resetPasswordUrl = `${appUrl}/dgfy/reset-password?email=${encodeURIComponent(String(email || '').trim())}`;
  const html = getCashierCredentialTemplate({
    tenantName,
    cashierEmail: email,
    temporaryPassword,
    loginUrl,
    resetPasswordUrl,
    terminalLabel,
    storeName
  });

  return sendEmail({
    to: email,
    subject: `Your cashier login details for ${tenantName}`,
    html,
    text: [
      `Your cashier access for ${tenantName} is ready.`,
      `Cashier Gmail: ${email}`,
      `Temporary Password: ${temporaryPassword}`,
      `Terminal: ${terminalLabel || 'Assigned terminal'}`,
      `Store: ${storeName || 'Assigned store'}`,
      `Login: ${loginUrl}`,
      `Reset Password: ${resetPasswordUrl}`,
      'Use the reset-password link if you want to set your own password immediately, or sign in first and change it in account settings.'
    ].join('\n'),
    meta: { purpose: 'cashier_credential', tenantId: tenantId || null }
  });
};

/**
 * Send company approval notification email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Admin's email address
 * @param {string} params.companyName - Company/tenant name
 * @param {string} params.statusUrl - Owner-authorized company registration status URL
 * @returns {Promise<Object>} - Nodemailer send result
 */
export const sendCompanyApprovedEmail = async ({ email, companyName, statusUrl }) => {
  const appUrl = getAppUrl();
  const html = getCompanyApprovedTemplate({
    companyName,
    adminEmail: email,
    statusUrl,
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Your company "${companyName}" has been approved!`,
    html
  });
};

export const sendCompanySubmissionReceivedEmail = async ({ email, companyName, statusUrl }) => sendEmail({
  to: email,
  subject: `Registration received: ${companyName}`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>We received your company registration</h2>
      <p><strong>${companyName}</strong> is waiting for Platform Admin review.</p>
      <p>You can safely close the app and return to the owner-authorized status page at any time.</p>
      <p><a href="${statusUrl}">View registration status</a></p>
    </div>
  `,
  text: `We received the company registration for ${companyName}. It is waiting for Platform Admin review. View status: ${statusUrl}`
});

/**
 * Send company rejection notification email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Admin's email address
 * @param {string} params.companyName - Company/tenant name
 * @param {string} [params.rejectionReason] - Optional rejection reason
 * @returns {Promise<Object>} - Nodemailer send result
 */
export const sendCompanyRejectedEmail = async ({ email, companyName, rejectionReason, statusUrl }) => {
  const appUrl = getAppUrl();

  const html = getCompanyRejectedTemplate({
    companyName,
    adminEmail: email,
    rejectionReason,
    statusUrl,
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Update on your "${companyName}" registration request`,
    html
  });
};

export const sendEmailOtpCode = async ({ email, code, purposeLabel = 'email verification', expiresInMinutes = 10, tenantId = null }) => {
  const safePurpose = String(purposeLabel || 'email verification');
  const safeMinutes = Number.isFinite(Number(expiresInMinutes)) ? Number(expiresInMinutes) : 10;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify your email</h2>
      <p>Use this one-time code to continue ${safePurpose}:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 24px 0;">${code}</p>
      <p>This code expires in ${safeMinutes} minutes.</p>
      <p>If you did not request this code, you can ignore this email.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Your DGFY email verification code',
    html,
    text: `Your DGFY email verification code is ${code}. It expires in ${safeMinutes} minutes.`,
    fromName: 'DGFY',
    meta: { purpose: 'email_otp', tenantId }
  });
};

/**
 * Verify SMTP connection
 * Useful for health checks and configuration validation
 * @returns {Promise<boolean>} - True if connection is successful
 */
export const verifyConnection = async () => {
  const transporter = getTransporter();

  if (!transporter) {
    return { success: false, mode: getEmailProviderMode(), error: 'Email service not configured' };
  }

  try {
    await transporter.verify();
    logger.info('SMTP connection verified successfully');
    return { success: true, provider: 'smtp', mode: getEmailProviderMode() };
  } catch (error) {
    logger.error('SMTP connection verification failed:', error);
    return { success: false, mode: getEmailProviderMode(), error: error.message };
  }
};

/**
 * Send subscription expiring notification
 */
export const sendSubscriptionExpiringEmail = async ({ email, companyName, expiryDate }) => {
  const appUrl = getAppUrl();
  const upgradeUrl = `${appUrl}/settings?tab=subscription`;

  const html = getSubscriptionExpiringTemplate({
    companyName,
    expiryDate: new Date(expiryDate).toLocaleDateString(),
    upgradeUrl,
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Your Premium subscription for ${companyName} is expiring soon`,
    html
  });
};

/**
 * Send subscription cancelled notification
 */
export const sendSubscriptionCancelledEmail = async ({ email, companyName, downgradeDate }) => {
  const appUrl = getAppUrl();
  const html = getSubscriptionCancelledTemplate({
    companyName,
    downgradeDate: new Date(downgradeDate).toLocaleDateString(),
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Subscription Cancelled: ${companyName}`,
    html
  });
};

/**
 * Send payment failed notification
 */
export const sendPaymentFailedEmail = async ({ email, companyName, retryDate }) => {
  const appUrl = getAppUrl();
  const html = getPaymentFailedTemplate({
    companyName,
    retryDate: retryDate ? new Date(retryDate).toLocaleDateString() : 'soon',
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Action Required: Payment Failed for ${companyName}`,
    html
  });
};

/**
 * Send payment failed grace period notification
 */
export const sendPaymentFailedGracePeriodEmail = async ({ email, companyName, gracePeriodEnd }) => {
  const appUrl = getAppUrl();
  const html = getPaymentFailedGracePeriodTemplate({
    companyName,
    gracePeriodEnd: new Date(gracePeriodEnd).toLocaleDateString(),
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Important: Action Required for Your ${companyName} Subscription`,
    html
  });
};

// ─── Subscription Lifecycle Emails (Phase 2) ─────────────────────────────────

/** Admin-initiated PayMongo setup link sent to user */
export const sendPayMongoSetupEmail = async ({ email, companyName, checkoutLink, expiresAt, planName, amount }) => {
  const html = getPayMongoSetupTemplate({ companyName, checkoutLink, expiresAt, planName, amount });
  return sendEmail({
    to: email,
    subject: `Action Required: Set Up PayMongo Recurring Billing for ${companyName}`,
    html
  });
};

/** Admin notified that a PayMongo setup link expired */
export const sendPayMongoSetupExpiredEmail = async ({ email, companyName }) => {
  const html = getPayMongoSetupExpiredTemplate({ companyName });
  return sendEmail({
    to: email,
    subject: `PayMongo Setup Link Expired for ${companyName}`,
    html
  });
};

/** Notifies user that a plan change is queued and needs re-consent */
export const sendPlanChangePendingEmail = async ({ email, companyName, currentPlan, newPlan, approvalUrl }) => {
  const html = getPlanChangePendingTemplate({ companyName, currentPlan, newPlan, approvalUrl });
  return sendEmail({
    to: email,
    subject: `Plan Change Pending Approval for ${companyName}`,
    html
  });
};

/** Notifies user that their plan change has been applied */
export const sendPlanChangeAppliedEmail = async ({ email, companyName, oldPlan, newPlan }) => {
  const html = getPlanChangeAppliedTemplate({ companyName, oldPlan, newPlan });
  return sendEmail({
    to: email,
    subject: `Your ${companyName} Plan Has Been Updated to ${newPlan}`,
    html
  });
};

/** Sent to the platform admin when an inactive tenant requests reactivation */
export const sendReactivationRequestEmail = async ({ email, companyName }) => {
  const requestedAt = new Date().toLocaleString();
  const html = getReactivationRequestTemplate({ companyName, requestedAt });
  return sendEmail({
    to: email,
    subject: `Reactivation Request from ${companyName}`,
    html
  });
};

/** Sent to the tenant admin when their account is reactivated */
export const sendReactivationApprovedEmail = async ({ email, companyName, companyToken }) => {
  const appUrl = getAppUrl();
  const loginUrl = `${appUrl}/login`;
  const html = getReactivationApprovedTemplate({ companyName, companyToken, loginUrl });
  return sendEmail({
    to: email,
    subject: `Your ${companyName} Account Has Been Reactivated!`,
    html
  });
};

/** Sent to the user after they re-submit a previously rejected registration */
export const sendResubmissionConfirmationEmail = async ({ email, companyName }) => {
  const html = getResubmissionConfirmationTemplate({ companyName });
  return sendEmail({
    to: email,
    subject: `Registration Re-submitted: ${companyName}`,
    html
  });
};

export default {
  sendEmail,
  sendInvitationEmail,
  sendAffiliateInviteEmail,
  sendWelcomeEmail,
  sendCashierCredentialEmail,
  sendCompanySubmissionReceivedEmail,
  sendCompanyApprovedEmail,
  sendCompanyRejectedEmail,
  sendEmailOtpCode,
  sendSubscriptionExpiringEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
  sendPaymentFailedGracePeriodEmail,
  sendPayMongoSetupEmail,
  sendPayMongoSetupExpiredEmail,
  sendPlanChangePendingEmail,
  sendPlanChangeAppliedEmail,
  sendReactivationRequestEmail,
  sendReactivationApprovedEmail,
  sendResubmissionConfirmationEmail,
  verifyConnection,
  isEmailConfigured
};
