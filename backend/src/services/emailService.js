/**
 * Email Service
 *
 * Handles email sending via SMTP using nodemailer.
 * Supports HTML templates for user invitations.
 *
 * Uses lazy initialization - only creates transporter when needed.
 */

import nodemailer from 'nodemailer';
import logger from '../config/logger.js';
import {
  getInvitationTemplate,
  getCompanyApprovedTemplate,
  getCompanyRejectedTemplate,
  getSubscriptionExpiringTemplate,
  getSubscriptionCancelledTemplate,
  getPaymentFailedTemplate,
  getPaymentFailedGracePeriodTemplate
} from '../templates/emailTemplates.js';

// Lazy initialize transporter
let _transporter = null;
let _isConfigured = false;

/**
 * Check if email is configured
 */
export const isEmailConfigured = () => {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

/**
 * Get or create the nodemailer transporter
 */
const getTransporter = () => {
  if (_transporter) return _transporter;

  if (!isEmailConfigured()) {
    logger.warn('Email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
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
  _isConfigured = true;

  logger.info('Email transporter initialized');
  return _transporter;
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
export const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();

  if (!transporter) {
    const error = new Error('Email service is not configured. Please set SMTP settings in .env');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'SKU Inventory Manager';
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for plain text fallback
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const inviteUrl = `${appUrl}/accept-invite?token=${invitationToken}`;

  const html = getInvitationTemplate({
    inviterName,
    role: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize role
    inviteUrl,
    tenantName,
    expiresIn: '7 days',
    appUrl
  });

  return sendEmail({
    to: email,
    subject: `You've been invited to join ${tenantName} on SKU Inventory Manager`,
    html
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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
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

/**
 * Verify SMTP connection
 * Useful for health checks and configuration validation
 * @returns {Promise<boolean>} - True if connection is successful
 */
export const verifyConnection = async () => {
  const transporter = getTransporter();

  if (!transporter) {
    return { success: false, error: 'Email service not configured' };
  }

  try {
    await transporter.verify();
    logger.info('SMTP connection verified successfully');
    return { success: true };
  } catch (error) {
    logger.error('SMTP connection verification failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send subscription expiring notification
 */
export const sendSubscriptionExpiringEmail = async ({ email, companyName, expiryDate }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
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

export default {
  sendEmail,
  sendInvitationEmail,
  sendCompanyApprovedEmail,
  sendCompanyRejectedEmail,
  sendSubscriptionExpiringEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
  sendPaymentFailedGracePeriodEmail,
  verifyConnection,
  isEmailConfigured
};

