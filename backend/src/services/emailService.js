/**
 * Email Service
 *
 * Handles email sending via SMTP using nodemailer, with optional Brevo HTTPS API delivery.
 * Supports HTML templates for user invitations.
 *
 * Uses lazy initialization - only creates transporter when needed.
 */

import nodemailer from 'nodemailer';
import logger from '../config/logger.js';
import {
  getInvitationTemplate,
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
const getEmailDeliveryProvider = () => String(process.env.EMAIL_DELIVERY_PROVIDER || 'auto').trim().toLowerCase();
const getBrevoApiUrl = () => process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';
const stripHtml = (html = '') => String(html).replace(/<[^>]*>/g, '');
const getFromIdentity = ({ fromName, fromEmail } = {}) => ({
  fromName: fromName || process.env.EMAIL_FROM_NAME || 'SKUpervisor',
  fromEmail: fromEmail || process.env.EMAIL_FROM || process.env.SMTP_USER
});

export const isSmtpConfigured = () => {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

export const isBrevoApiConfigured = () => {
  const { fromEmail } = getFromIdentity();
  return !!(process.env.BREVO_API_KEY && fromEmail);
};

/**
 * Check if email is configured
 */
export const isEmailConfigured = () => {
  return isSmtpConfigured() || isBrevoApiConfigured();
};

export const getEmailProviderMode = () => {
  const requestedProvider = getEmailDeliveryProvider();
  const smtpConfigured = isSmtpConfigured();
  const brevoApiConfigured = isBrevoApiConfigured();

  if (requestedProvider === 'brevo_api') {
    return brevoApiConfigured ? 'brevo_api' : 'unconfigured';
  }

  if (requestedProvider === 'smtp') {
    return smtpConfigured ? 'smtp' : 'unconfigured';
  }

  if (smtpConfigured && brevoApiConfigured) {
    return 'smtp_with_brevo_api_fallback';
  }

  if (smtpConfigured) {
    return 'smtp';
  }

  if (brevoApiConfigured) {
    return 'brevo_api';
  }

  return 'unconfigured';
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
    }
  };

  _transporter = nodemailer.createTransport(config);
  logger.info('Email transporter initialized');
  return _transporter;
};

const buildBrevoRecipients = (to) => {
  if (Array.isArray(to)) {
    return to.map((email) => ({ email: String(email).trim() })).filter((entry) => entry.email);
  }

  return String(to || '')
    .split(',')
    .map((email) => ({ email: email.trim() }))
    .filter((entry) => entry.email);
};

export const sendEmailViaBrevoApi = async ({ to, subject, html, text, fromName, fromEmail }) => {
  if (!isBrevoApiConfigured()) {
    const error = new Error('Brevo API email delivery is not configured. Set BREVO_API_KEY and EMAIL_FROM.');
    error.code = 'BREVO_API_NOT_CONFIGURED';
    throw error;
  }

  const { fromName: resolvedFromName, fromEmail: resolvedFromEmail } = getFromIdentity({ fromName, fromEmail });
  const payload = {
    sender: {
      name: resolvedFromName,
      email: resolvedFromEmail
    },
    to: buildBrevoRecipients(to),
    subject,
    htmlContent: html,
    textContent: text || stripHtml(html)
  };

  if (!payload.to.length) {
    const error = new Error('At least one recipient email is required for Brevo API delivery.');
    error.code = 'EMAIL_RECIPIENT_REQUIRED';
    throw error;
  }

  const response = await fetch(getBrevoApiUrl(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    // Non-JSON provider errors are handled by HTTP status below.
  }

  if (!response.ok) {
    const error = new Error(responseBody?.message || `Brevo API delivery failed with HTTP ${response.status}`);
    error.code = 'BREVO_API_DELIVERY_FAILED';
    error.status = response.status;
    error.details = responseBody;
    throw error;
  }

  logger.info(`Email sent successfully to ${to} via Brevo API`, { messageId: responseBody?.messageId });
  return {
    messageId: responseBody?.messageId,
    provider: 'brevo_api',
    response: responseBody
  };
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @returns {Promise<Object>} - Nodemailer send result
 */
export const sendEmail = async ({ to, subject, html, text, fromName, fromEmail }) => {
  const provider = getEmailDeliveryProvider();
  const allowBrevoFallback = process.env.EMAIL_DELIVERY_FALLBACK_TO_BREVO_API !== 'false';

  if (provider === 'brevo_api') {
    return sendEmailViaBrevoApi({ to, subject, html, text, fromName, fromEmail });
  }

  if (!isSmtpConfigured() && isBrevoApiConfigured()) {
    return sendEmailViaBrevoApi({ to, subject, html, text, fromName, fromEmail });
  }

  const transporter = getTransporter();

  if (!transporter) {
    const error = new Error('Email service is not configured. Please set SMTP settings in .env');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const { fromName: resolvedFromName, fromEmail: resolvedFromEmail } = getFromIdentity({ fromName, fromEmail });

  const mailOptions = {
    from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
    to,
    subject,
    html,
    text: text || stripHtml(html)
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}`, { messageId: result.messageId });
    return {
      ...result,
      provider: 'smtp'
    };
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    if (allowBrevoFallback && isBrevoApiConfigured()) {
      logger.warn(`Retrying email to ${to} through Brevo API after SMTP failure`);
      return sendEmailViaBrevoApi({ to, subject, html, text, fromName, fromEmail });
    }
    throw error;
  }
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
  storeName
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
    ].join('\n')
  });
};

/**
 * Send company approval notification email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Admin's email address
 * @param {string} params.companyName - Company/tenant name
 * @param {string} params.companyToken - Company's unique login token
 * @returns {Promise<Object>} - Nodemailer send result
 */
export const sendCompanyApprovedEmail = async ({ email, companyName, companyToken }) => {
  const appUrl = getAppUrl();
  const loginUrl = `${appUrl}/login`;

  const html = getCompanyApprovedTemplate({
    companyName,
    adminEmail: email,
    companyToken,
    loginUrl,
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Your company "${companyName}" has been approved!`,
    html
  });
};

/**
 * Send company rejection notification email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Admin's email address
 * @param {string} params.companyName - Company/tenant name
 * @param {string} [params.rejectionReason] - Optional rejection reason
 * @returns {Promise<Object>} - Nodemailer send result
 */
export const sendCompanyRejectedEmail = async ({ email, companyName, rejectionReason }) => {
  const appUrl = getAppUrl();
  const registerUrl = `${appUrl}/register-company`;

  const html = getCompanyRejectedTemplate({
    companyName,
    adminEmail: email,
    rejectionReason,
    registerUrl,
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `Update on your "${companyName}" registration request`,
    html
  });
};

export const sendEmailOtpCode = async ({ email, code, purposeLabel = 'email verification', expiresInMinutes = 10 }) => {
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
    fromName: 'DGFY'
  });
};

/**
 * Verify SMTP connection
 * Useful for health checks and configuration validation
 * @returns {Promise<boolean>} - True if connection is successful
 */
export const verifyConnection = async () => {
  if (getEmailDeliveryProvider() === 'brevo_api' || (!isSmtpConfigured() && isBrevoApiConfigured())) {
    return {
      success: true,
      provider: 'brevo_api',
      mode: getEmailProviderMode()
    };
  }

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
    if (isBrevoApiConfigured()) {
      return {
        success: true,
        provider: 'brevo_api',
        mode: getEmailProviderMode(),
        warning: `SMTP verification failed; Brevo API fallback is configured: ${error.message}`
      };
    }
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
  sendWelcomeEmail,
  sendCashierCredentialEmail,
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
