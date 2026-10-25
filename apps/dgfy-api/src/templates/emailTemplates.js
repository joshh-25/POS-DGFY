/**
 * Email HTML Templates
 *
 * Provides HTML email templates for various system communications.
 * Templates use inline CSS for maximum email client compatibility.
 */

import {
  buildOrderConfirmationBreakdownRows,
  formatOrderConfirmationMoney,
  formatOrderQuantity,
  formatOrderTime,
  resolveBalanceLabel,
  resolveFulfillmentLabel,
  VAT_DISCLOSURE_NOTE
} from './storefrontOrderConfirmationPresentation.js';

/**
 * Generate invitation email HTML template
 * @param {Object} params - Template parameters
 * @param {string} params.inviterName - Name of the person who sent the invitation
 * @param {string} params.role - Role being assigned (Staff/Manager/Admin)
 * @param {string} params.invitationToken - The unique token for the invitation
 * @param {string} params.appUrl - The base URL of the application
 * @param {string} params.tenantName - Company/tenant name
 * @param {string} params.expiresIn - Human-readable expiry time (e.g., "7 days")
 * @returns {string} HTML email content
 */

// Helper to append UTM parameters to a URL
const appendUtm = (url, campaign) => {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=email&utm_medium=transactional&utm_campaign=${campaign}`;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const getInvitationTemplate = ({ inviterName, role, invitationToken, tenantName, expiresIn, appUrl }) => {
  const inviteQuery = new URLSearchParams({
    token: invitationToken
  });
  const inviteUrlRaw = `${appUrl}/accept-invite?${inviteQuery.toString()}`;
  const inviteUrl = appendUtm(inviteUrlRaw, 'user_invitation');
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const safeTenantName = escapeHtml(tenantName);
  const safeExpiresIn = escapeHtml(expiresIn);
  const safeInviteUrl = escapeHtml(inviteUrl);

  // Role-specific colors
  const roleColors = {
    Staff: { bg: '#e0f2fe', text: '#0369a1' },      // Light blue
    Manager: { bg: '#fef3c7', text: '#b45309' },    // Amber
    Admin: { bg: '#fee2e2', text: '#dc2626' }       // Red
  };
  const roleColor = roleColors[role] || roleColors.Staff;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${safeTenantName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                SKUpervisor
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Icon -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background-color: #e0f7fa; border-radius: 50%; padding: 16px;">
                  <span style="font-size: 32px;">&#9993;</span>
                </div>
              </div>

              <!-- Heading -->
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px; text-align: center;">
                You've been invited!
              </h2>

              <!-- Message -->
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; text-align: center;">
                <strong style="color: #1f2937;">${safeInviterName}</strong> has invited you to join
                <strong style="color: #1f2937;">${safeTenantName}</strong> as a
              </p>

              <!-- Role Badge -->
              <div style="text-align: center; margin-bottom: 32px;">
                <span style="display: inline-block; background-color: ${roleColor.bg}; color: ${roleColor.text}; padding: 8px 24px; border-radius: 20px; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${safeRole}
                </span>
              </div>

              <!-- Description -->
              <p style="margin: 0 0 32px; color: #6b7280; font-size: 14px; text-align: center;">
                Click the button below to accept the invitation and set up your account. If you already use DGFY with this email, you can also accept it from your DGFY account Business tab:
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${safeInviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">
                  Accept Invitation
                </a>
              </div>

              <!-- Expiry Notice -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>Note:</strong> This invitation expires in <strong>${safeExpiresIn}</strong> and is only for the email address invited by your company administrator.
                </p>
              </div>

              <!-- Alternative Link -->
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; word-break: break-all;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${safeInviteUrl}" style="color: #0891b2;">${safeInviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} SKUpervisor. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate affiliate invitation email HTML template.
 *
 * The CTA link differs by whether the invitee already has a DGFY account:
 *  - existing account -> a magic link to the storefront /affiliate/accept page (explicit accept)
 *  - new user        -> a magic link to /register with the email prefilled + locked, after which
 *                       they are auto-enrolled as an affiliate on account creation.
 *
 * @param {Object} params
 * @param {string} params.businessName - Inviting store/business name
 * @param {string} params.inviterName - Name of the person who sent the invite (optional)
 * @param {string} params.invitationToken - Opaque invite token (goes in the link only)
 * @param {string} params.inviteeEmail - The invited email (prefilled on the register link)
 * @param {boolean} params.accountExists - Whether a DGFY account already exists for this email
 * @param {string} params.appOrigin - Storefront public origin (e.g. https://dgfy.ph)
 * @param {string} params.expiresIn - Human-readable expiry (e.g. "7 days")
 * @returns {string} HTML email content
 */
export const getAffiliateInviteTemplate = ({
  businessName,
  inviterName,
  invitationToken,
  inviteeEmail,
  accountExists,
  appOrigin,
  expiresIn
}) => {
  const origin = String(appOrigin || '').replace(/\/+$/, '');
  const inviteUrlRaw = accountExists
    ? `${origin}/affiliate/accept?token=${encodeURIComponent(invitationToken)}`
    : `${origin}/register?email=${encodeURIComponent(inviteeEmail)}&aff_invite=${encodeURIComponent(invitationToken)}`;
  const inviteUrl = appendUtm(inviteUrlRaw, 'affiliate_invitation');

  const safeBusinessName = escapeHtml(businessName);
  // Only name a distinct inviter; otherwise the sentence would echo the business name
  // ("Acme invited you to become an affiliate of Acme"). Falls back to a business-centric intro.
  const trimmedInviterName = String(inviterName || '').trim();
  const hasDistinctInviter = trimmedInviterName && trimmedInviterName !== String(businessName || '').trim();
  const introHtml = hasDistinctInviter
    ? `<strong style="color: #1f2937;">${escapeHtml(trimmedInviterName)}</strong> invited you to become an affiliate of
                <strong style="color: #1f2937;">${safeBusinessName}</strong> and earn commissions when people you refer buy from their store.`
    : `You've been invited to become an affiliate of
                <strong style="color: #1f2937;">${safeBusinessName}</strong> and earn commissions when people you refer buy from their store.`;
  const safeExpiresIn = escapeHtml(expiresIn);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const ctaLabel = accountExists ? 'Accept &amp; Become an Affiliate' : 'Join &amp; Become an Affiliate';
  const leadIn = accountExists
    ? 'You already have a DGFY account with this email &mdash; just log in and accept to start earning commissions.'
    : 'Create your DGFY account (your email is already filled in) and you\'ll be affiliated with this store automatically.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Become an affiliate of ${safeBusinessName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                DGFY
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Icon -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background-color: #e0f7fa; border-radius: 50%; padding: 16px;">
                  <span style="font-size: 32px;">&#128176;</span>
                </div>
              </div>

              <!-- Heading -->
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px; text-align: center;">
                You've been invited to be an affiliate!
              </h2>

              <!-- Message -->
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; text-align: center;">
                ${introHtml}
              </p>

              <!-- Description -->
              <p style="margin: 0 0 32px; color: #6b7280; font-size: 14px; text-align: center;">
                ${leadIn}
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${safeInviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">
                  ${ctaLabel}
                </a>
              </div>

              <!-- Expiry Notice -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>Note:</strong> This invitation expires in <strong>${safeExpiresIn}</strong> and is tied to this email address.
                </p>
              </div>

              <!-- Alternative Link -->
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; word-break: break-all;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${safeInviteUrl}" style="color: #0891b2;">${safeInviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} DGFY. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate welcome email template (sent after invitation is accepted)
 * @param {Object} params - Template parameters
 * @param {string} params.username - New user's username
 * @param {string} params.role - User's role
 * @param {string} params.tenantName - Company/tenant name
 * @param {string} params.appUrl - The base URL of the application
 * @returns {string} HTML email content
 */
export const getWelcomeTemplate = ({ username, role, tenantName, appUrl }) => {
  const loginUrlRaw = `${appUrl}/login`;
  const loginUrl = appendUtm(loginUrlRaw, 'welcome_email');
  const safeUsername = escapeHtml(username);
  const safeRole = escapeHtml(role);
  const safeTenantName = escapeHtml(tenantName);
  const safeLoginUrl = escapeHtml(loginUrl);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${safeTenantName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Welcome to ${safeTenantName}!
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px;">
                Hello, ${safeUsername}!
              </h2>

              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
                Your account has been successfully created. You now have access to SKUpervisor as a <strong>${safeRole}</strong>.
              </p>

              <p style="margin: 0 0 32px; color: #4b5563; font-size: 16px;">
                You can now log in and start managing inventory, purchase orders, and more.
              </p>

              <div style="text-align: center;">
                <a href="${safeLoginUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Go to Login
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} SKUpervisor. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

export const getCashierCredentialTemplate = ({
  tenantName,
  cashierEmail,
  temporaryPassword,
  loginUrl,
  resetPasswordUrl,
  terminalLabel,
  storeName
}) => {
  const safeTenantName = escapeHtml(tenantName || 'DGFY');
  const safeCashierEmail = escapeHtml(cashierEmail || '');
  const safeTemporaryPassword = escapeHtml(temporaryPassword || '');
  const safeLoginUrl = escapeHtml(appendUtm(loginUrl, 'cashier_credentials') || '');
  const safeResetPasswordUrl = escapeHtml(appendUtm(resetPasswordUrl || '', 'cashier_reset_password') || '');
  const safeTerminalLabel = escapeHtml(terminalLabel || 'Assigned terminal');
  const safeStoreName = escapeHtml(storeName || 'Assigned store');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your cashier access for ${safeTenantName}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1A4E8D 0%,#2563EB 100%);padding:30px 40px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Cashier Login Details</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              <p style="margin:0 0 16px;color:#1f2937;font-size:16px;">
                Your cashier access for <strong>${safeTenantName}</strong> is ready.
              </p>
              <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
                <p style="margin:0 0 8px;color:#1e3a8a;font-size:14px;"><strong>Cashier Gmail:</strong> ${safeCashierEmail}</p>
                <p style="margin:0 0 8px;color:#1e3a8a;font-size:14px;"><strong>Temporary Password:</strong> ${safeTemporaryPassword}</p>
                <p style="margin:0 0 8px;color:#1e3a8a;font-size:14px;"><strong>Terminal:</strong> ${safeTerminalLabel}</p>
                <p style="margin:0;color:#1e3a8a;font-size:14px;"><strong>Store:</strong> ${safeStoreName}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${safeLoginUrl}" style="display:inline-block;background:linear-gradient(135deg,#1A4E8D 0%,#2563EB 100%);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">
                  Open Login
                </a>
              </div>
              <div style="text-align:center;margin:0 0 24px;">
                <a href="${safeResetPasswordUrl}" style="display:inline-block;background:#ffffff;color:#1A4E8D;text-decoration:none;padding:12px 28px;border-radius:8px;border:1px solid #bfdbfe;font-weight:700;font-size:14px;">
                  Reset Password
                </a>
              </div>
              <div style="background-color:#f8fafc;border-left:4px solid #2563eb;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">
                <p style="margin:0;color:#334155;font-size:14px;">
                  <strong>Reset Password Instructions:</strong> Use the reset-password link above if you want to set your own password immediately, or sign in with the temporary password first and change it in account settings.
                </p>
              </div>
              <p style="margin:0;color:#64748b;font-size:13px;">
                If you cannot sign in, contact your company admin and request a new cashier password reset.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate company approval notification email template
 * @param {Object} params - Template parameters
 * @param {string} params.companyName - The approved company name
 * @param {string} params.adminEmail - Admin's email (login identifier)
 * @param {string} params.appUrl - The base URL of the application
 * @returns {string} HTML email content
 */
export const getCompanyApprovedTemplate = ({ companyName, adminEmail, appUrl, statusUrl, posUrl = '' }) => {
  const continueUrl = appendUtm(posUrl || statusUrl || `${appUrl}/register-company`, posUrl ? 'company_onboarding' : 'company_approved');
  const safeContinueUrl = escapeHtml(continueUrl || '');
  const safeStatusUrl = escapeHtml(statusUrl || '');
  const onboardingSection = posUrl ? `
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; color: #1d4ed8; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Next step: POS onboarding
                </h3>
                <p style="margin: 0 0 12px; color: #1e3a8a; font-size: 14px;">
                  Open POS onboarding to finish your business setup. You can add items and categories now; selling and storefront visibility remain disabled until DGFY Admin enables them.
                </p>
                ${statusUrl ? `<p style="margin: 0; color: #1e3a8a; font-size: 13px;"><a href="${safeStatusUrl}" style="color: #1d4ed8;">View registration status</a></p>` : ''}
              </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Company Approved - ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                SKU Inventory Manager
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Success Icon -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background-color: #d1fae5; border-radius: 50%; padding: 16px;">
                  <span style="font-size: 32px;">&#10003;</span>
                </div>
              </div>

              <!-- Heading -->
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px; text-align: center;">
                Your Company Has Been Approved!
              </h2>

              <!-- Message -->
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; text-align: center;">
                Great news! Your company <strong style="color: #1f2937;">"${companyName}"</strong> has been reviewed and approved. Your account is now ready to use.
              </p>

              <!-- Account Access Box -->
              <div style="background-color: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; color: #0f766e; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Account Access
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600;">${adminEmail}</td>
                  </tr>
                </table>
              </div>

              ${onboardingSection}

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${safeContinueUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">
                  ${posUrl ? 'Open POS onboarding' : 'View company status'}
                </a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} SKU Inventory Manager. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate company rejection notification email template
 * @param {Object} params - Template parameters
 * @param {string} params.companyName - The rejected company name
 * @param {string} [params.rejectionReason] - Optional reason for rejection
 * @param {string} params.appUrl - The base URL of the application
 * @returns {string} HTML email content
 */
export const getCompanyRejectedTemplate = ({ companyName, rejectionReason, statusUrl, appUrl }) => {
  const correctionUrl = appendUtm(statusUrl || `${appUrl}/dgfy/account`, 'company_rejected');

  const reasonSection = rejectionReason ? `
              <!-- Reason Box -->
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; color: #991b1b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Reason
                </h3>
                <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
                  ${rejectionReason}
                </p>
              </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registration Update - ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                SKU Inventory Manager
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Notice Icon -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background-color: #fef3c7; border-radius: 50%; padding: 16px;">
                  <span style="font-size: 32px;">&#9888;</span>
                </div>
              </div>

              <!-- Heading -->
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px; text-align: center;">
                Registration Update
              </h2>

              <!-- Message -->
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; text-align: center;">
                We've reviewed your registration request for <strong style="color: #1f2937;">"${companyName}"</strong> and unfortunately, we're unable to approve it at this time.
              </p>

${reasonSection}

              <!-- Help Text -->
              <p style="margin: 0 0 24px; color: #6b7280; font-size: 14px; text-align: center;">
                Open your existing application to correct the information and resubmit it. Do not create a duplicate company registration.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${correctionUrl}" style="display: inline-block; background-color: #6b7280; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Correct and resubmit
                </a>
              </div>

              <!-- Contact Info -->
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                Need help? Contact us at support@skuinventorymanager.com
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                &copy; ${new Date().getFullYear()} SKU Inventory Manager. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generate subscription expiring notification email template
 * @param {Object} params - Template parameters
 * @param {string} params.companyName - The company name
 * @param {string} params.expiryDate - The date the subscription expires
 * @param {string} params.appUrl - The base URL of the application
 * @returns {string} HTML email content
 */
export const getSubscriptionExpiringTemplate = ({ companyName, expiryDate, appUrl }) => {
  const upgradeUrlRaw = `${appUrl}/settings?tab=subscription`;
  const upgradeUrl = appendUtm(upgradeUrlRaw, 'subscription_expiring');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Premium Subscription is Expiring Soon</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background: #0f172a; padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">SKU Inventory Manager</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px;">Your Premium Access is Expiring</h2>
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
                Your Premium subscription for <strong>${companyName}</strong> is scheduled to end on <strong>${expiryDate}</strong>.
              </p>
              <p style="margin: 0 0 32px; color: #4b5563; font-size: 16px;">
                To ensure uninterrupted access to AI features and premium tools, please ensure your payment method is up to date or renew your subscription.
              </p>
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${upgradeUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Manage Subscription
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

export const getSubscriptionCancelledTemplate = ({ companyName, downgradeDate }) => {
  // No CTA in this email currently, but helper is available.

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Cancelled</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background: #334155; padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">SKU Inventory Manager</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px;">Premium Subscription Cancelled</h2>
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
                The Premium subscription for <strong>${companyName}</strong> has been cancelled.
              </p>
              <p style="margin: 0 0 32px; color: #4b5563; font-size: 16px;">
                You will continue to have access to Premium features until <strong>${downgradeDate}</strong>, after which your account will be transitioned to the Standard plan.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

export const getPaymentFailedTemplate = ({ companyName, retryDate }) => {
  // Payment failure notification

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background: #991b1b; padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">SKU Inventory Manager</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="margin: 0 0 16px; color: #b91c1c; font-size: 22px;">Important: Payment Failed</h2>
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
                We were unable to process the latest payment for your <strong>${companyName}</strong> subscription.
              </p>
              <p style="margin: 0 0 32px; color: #4b5563; font-size: 16px;">
                We will automatically retry the payment on <strong>${retryDate}</strong>. Please ensure your payment method has sufficient funds to avoid service interruption.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

export const getPaymentFailedGracePeriodTemplate = ({ companyName, gracePeriodEnd }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed - Grace Period Active</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background: #f59e0b; padding: 30px 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">SKU Inventory Manager</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px;">Attention: Payment Failed</h2>
              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
                We were unable to process the latest payment for <strong>${companyName}</strong>.
              </p>
              <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0; color: #854d0e; font-size: 14px;">
                  <strong>Grace Period Active:</strong> You still have full access to your Premium features until <strong>${gracePeriodEnd}</strong>.
                </p>
              </div>
              <p style="margin: 0 0 32px; color: #4b5563; font-size: 16px;">
                Please update your payment method to ensure uninterrupted service. If payment is not received by the end of the grace period, your account will be automatically downgraded to the Standard plan.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

// ─── Subscription Lifecycle Templates (Phase 2) ──────────────────────────────

const emailWrap = (headerBg, headerText, bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:${headerBg};padding:30px 40px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">SKUpervisor</h1>
              ${headerText ? `<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${headerText}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${new Date().getFullYear()} SKUpervisor. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

/** Admin-initiated PayPal setup invitation (DISABLED - switching to PayMongo) */
/*
export const getPayPalSetupTemplate = ({ companyName, approvalUrl, expiresAt, planName, amount }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Set Up PayPal Recurring Billing</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      Your SKUpervisor administrator has initiated PayPal recurring billing for <strong>${companyName}</strong>.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:14px;"><strong>Plan:</strong> ${planName}</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;"><strong>Amount:</strong> ₱${amount}/month</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;"><strong>Link expires:</strong> ${expiresAt}</p>
    </div>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">
      Click the button below to log in to PayPal and authorize the recurring payment.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${approvalUrl}" style="display:inline-block;background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:16px;">
        Authorize on PayPal
      </a>
    </div>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;">
      <p style="margin:0;color:#92400e;font-size:13px;">This link expires in 72 hours. If it has expired, please contact your administrator.</p>
    </div>`;
  return emailWrap('linear-gradient(135deg, #0d9488 0%, #0891b2 100%)', 'Billing Setup', body);
};

/* Admin notified when PayPal setup link expired
export const getPayPalSetupExpiredTemplate = ({ companyName }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#b91c1c;font-size:22px;">PayPal Setup Link Expired</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      The PayPal recurring billing setup link you sent to <strong>${companyName}</strong> has expired without being approved.
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">
      You can re-initiate the setup from the admin panel on the tenant's detail page.
    </p>`;
  return emailWrap('#991b1b', 'Setup Expired', body);
};
*/

/** Admin-initiated PayMongo setup invitation */
export const getPayMongoSetupTemplate = ({ companyName, checkoutLink, expiresAt, planName, amount }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Set Up PayMongo Recurring Billing</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      Your SKUpervisor administrator has initiated PayMongo recurring billing for <strong>${companyName}</strong>.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:14px;"><strong>Plan:</strong> ${planName}</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;"><strong>Amount:</strong> ${amount}/month</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;"><strong>Link expires:</strong> ${expiresAt}</p>
    </div>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">
      Click the button below to complete your recurring payment setup on PayMongo.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${checkoutLink}" style="display:inline-block;background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:16px;">
        Set Up on PayMongo
      </a>
    </div>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;">
      <p style="margin:0;color:#92400e;font-size:13px;">This link expires in 72 hours. If it has expired, please contact your administrator.</p>
    </div>`;
  return emailWrap('linear-gradient(135deg, #0d9488 0%, #0891b2 100%)', 'Billing Setup', body);
};

/** Admin notified when PayMongo setup link expired */
export const getPayMongoSetupExpiredTemplate = ({ companyName }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#b91c1c;font-size:22px;">PayMongo Setup Link Expired</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      The PayMongo recurring billing setup link you sent to <strong>${companyName}</strong> has expired without being completed.
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">
      You can re-initiate the setup from the admin panel on the tenant's detail page.
    </p>`;
  return emailWrap('#991b1b', 'Setup Expired', body);
};

/** Plan change queued (pending user re-consent on PayPal) - DISABLED, updating for PayMongo */
export const getPlanChangePendingTemplate = ({ companyName, currentPlan, newPlan, approvalUrl }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Plan Change Pending Your Approval</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      A plan change has been initiated for <strong>${companyName}</strong>.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#1d4ed8;font-size:14px;"><strong>Current plan:</strong> ${currentPlan}</p>
      <p style="margin:4px 0 0;color:#1d4ed8;font-size:14px;"><strong>New plan:</strong> ${newPlan}</p>
    </div>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">
      Please approve this change through your payment provider. The new pricing will take effect on your next billing cycle.
    </p>
    ${approvalUrl ? `<div style="text-align:center;margin-bottom:16px;">
      <a href="${approvalUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:16px;">
        Approve Change
      </a>
    </div>` : ''}`;
  return emailWrap('#1d4ed8', 'Plan Change', body);
};

/** Plan change successfully applied */
export const getPlanChangeAppliedTemplate = ({ companyName, oldPlan, newPlan }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#166534;font-size:22px;">Your Plan Has Been Updated</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      The plan for <strong>${companyName}</strong> has been successfully changed.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:14px;"><strong>Previous plan:</strong> ${oldPlan}</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;"><strong>New plan:</strong> ${newPlan}</p>
    </div>
    <p style="margin:0;color:#4b5563;font-size:16px;">Your new billing amount will be reflected on your next invoice.</p>`;
  return emailWrap('#166534', 'Plan Updated', body);
};

/** Sent to the SKUpervisor admin when an inactive user requests reactivation */
export const getReactivationRequestTemplate = ({ companyName, requestedAt }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Reactivation Request Received</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      <strong>${companyName}</strong> has submitted a reactivation request.
    </p>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:14px;"><strong>Requested at:</strong> ${requestedAt}</p>
    </div>
    <p style="margin:0;color:#4b5563;font-size:16px;">
      Please review this request in the admin panel and approve after confirming payment.
    </p>`;
  return emailWrap('#d97706', 'Reactivation Request', body);
};

/** Sent to the user when admin approves their reactivation */
export const getReactivationApprovedTemplate = ({ companyName, companyToken, loginUrl }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#166534;font-size:22px;">Your Account Has Been Reactivated!</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      Great news! Your <strong>${companyName}</strong> account is now active again.
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:13px;">Your company token:</p>
      <p style="margin:4px 0 0;color:#166534;font-size:18px;font-weight:700;letter-spacing:1px;">${companyToken}</p>
    </div>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">All your existing data is intact. Log in to continue where you left off.</p>
    <div style="text-align:center;">
      <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:16px;">
        Log In Now
      </a>
    </div>`;
  return emailWrap('linear-gradient(135deg, #0d9488 0%, #0891b2 100%)', 'Account Reactivated', body);
};

/** Sent to user when their rejected registration is re-submitted */
export const getResubmissionConfirmationTemplate = ({ companyName }) => {
  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Registration Re-submitted</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;">
      Your registration request for <strong>${companyName}</strong> has been re-submitted for review.
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;">
      You will receive an email once our team has reviewed your request. This typically takes 1–2 business days.
    </p>
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:0 8px 8px 0;">
      <p style="margin:0;color:#1d4ed8;font-size:13px;">If you have any questions, please contact our support team.</p>
    </div>`;
  return emailWrap('linear-gradient(135deg, #0d9488 0%, #0891b2 100%)', 'Registration Re-submitted', body);
};

const formatOrderConfirmationLabel = (value) => String(value || '')
  .trim()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const safeOrderConfirmationUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
};

const renderOrderConfirmationMetaRow = (label, value) => `<tr>
  <td style="padding:5px 0;color:#64748b;font-size:13px;">${escapeHtml(label)}</td>
  <td align="right" style="padding:5px 0;color:#1e293b;font-size:13px;font-weight:600;">${escapeHtml(value)}</td>
</tr>`;

const renderOrderConfirmationBreakdownRow = (row) => {
  const isTotal = row.kind === 'total';
  const isDiscount = row.kind === 'discount';
  const labelStyle = isTotal
    ? 'padding:12px 0 0;border-top:1px solid #d9e4e8;color:#1e293b;font-size:16px;font-weight:700;'
    : `padding:6px 0;color:${isDiscount ? '#15803d' : row.kind === 'informational' ? '#64748b' : '#334155'};font-size:${row.kind === 'informational' ? '12px' : '14px'};`;
  const amountStyle = isTotal
    ? 'padding:12px 0 0;border-top:1px solid #d9e4e8;color:#1e293b;font-size:18px;font-weight:700;'
    : labelStyle;
  const amount = `${isDiscount ? '- ' : ''}${formatOrderConfirmationMoney(row.amount)}`;
  return `<tr>
    <td style="${labelStyle}">${escapeHtml(row.label)}</td>
    <td align="right" style="${amountStyle}">${escapeHtml(amount)}</td>
  </tr>`;
};

const renderOrderConfirmationItemRow = (item = {}) => {
  const safeItem = item || {};
  const quantity = formatOrderQuantity(safeItem.quantity);
  const fractionalPrice = quantity.includes('.')
    ? ` · ${formatOrderConfirmationMoney(safeItem.sale_price)} each`
    : '';
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #eef2f7;">
      <div style="color:#1e293b;font-size:14px;font-weight:700;">${escapeHtml(safeItem.item_name || 'Item')}</div>
      <div style="padding-top:3px;color:#64748b;font-size:12px;">x ${escapeHtml(quantity)}${escapeHtml(fractionalPrice)}</div>
    </td>
    <td align="right" valign="middle" style="padding:10px 0 10px 12px;border-bottom:1px solid #eef2f7;color:#1e293b;font-size:14px;font-weight:600;white-space:nowrap;">${escapeHtml(formatOrderConfirmationMoney(safeItem.line_subtotal))}</td>
  </tr>`;
};

/** Receipt-style confirmation for a completed storefront checkout. */
export const getStorefrontOrderConfirmationTemplate = ({
  storeName,
  order = {},
  trackingUrl = null,
  logoUrl = null,
  supportUrl = null
} = {}) => {
  const displayStoreName = String(storeName || 'DGFY');
  const safeStoreName = escapeHtml(displayStoreName);
  const safeTrackingPin = escapeHtml(order.tracking_pin || '');
  const safeInvoiceNumber = escapeHtml(order.invoice_number || '');
  const safePaymentReference = escapeHtml(order.payment_reference || '');
  const safeTrackUrl = escapeHtml(safeOrderConfirmationUrl(trackingUrl));
  const safeLogoUrl = escapeHtml(safeOrderConfirmationUrl(logoUrl));
  const safeSupportUrl = escapeHtml(safeOrderConfirmationUrl(supportUrl));
  const logoInitial = escapeHtml(Array.from(displayStoreName.trim())[0] || 'D');
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRows = items.map(renderOrderConfirmationItemRow).join('') || `
    <tr><td colspan="2" style="padding:12px 0;color:#64748b;font-size:13px;">No item details available.</td></tr>`;
  const breakdownRows = buildOrderConfirmationBreakdownRows(order);
  const hasVat = breakdownRows.some((row) => row.kind === 'informational');

  const paymentType = String(order.payment_type || '').trim().toLowerCase();
  const paymentMethod = paymentType === 'qrph'
    ? 'QRPh'
    : paymentType === 'cash'
      ? ({ delivery: 'Cash on delivery', pickup: 'Cash on pickup', dine_in: 'Pay at store' }[order.order_method] || 'Cash')
      : formatOrderConfirmationLabel(paymentType) || 'Not provided';
  const paymentStatus = formatOrderConfirmationLabel(order.payment_status) || 'Not provided';
  const partialPaymentRows = order.payment_status === 'partially_paid'
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fffbeb" style="margin-top:14px;background-color:#fffbeb;border:1px solid #fcd34d;border-radius:10px;">
          <tr><td style="padding:10px 12px;color:#92400e;font-size:13px;"><strong>Downpayment paid</strong></td><td align="right" style="padding:10px 12px;color:#92400e;font-size:13px;font-weight:700;">${escapeHtml(formatOrderConfirmationMoney(order.amount_paid))}</td></tr>
          <tr><td style="padding:0 12px 10px;color:#92400e;font-size:13px;"><strong>${escapeHtml(resolveBalanceLabel(order.order_method))}</strong></td><td align="right" style="padding:0 12px 10px;color:#92400e;font-size:13px;font-weight:700;">${escapeHtml(formatOrderConfirmationMoney(order.balance_due))}</td></tr>
        </table>`
    : '';

  const locationName = String(order.location?.name || '').trim();
  const locationAddress = String(order.location?.address_line || '').trim();
  let fulfillmentDetails = '';
  if (order.order_method === 'delivery') {
    fulfillmentDetails = `<p style="margin:0;color:#1e293b;font-size:14px;">${escapeHtml(order.delivery_address || 'Not provided')}</p>
      <p style="margin:4px 0 0;color:#64748b;font-size:12px;">Customer delivery address</p>`;
  } else if (order.order_method === 'pickup') {
    fulfillmentDetails = `<p style="margin:0;color:#1e293b;font-size:14px;">${escapeHtml(locationName || 'Store location')}</p>
      ${locationAddress ? `<p style="margin:4px 0 0;color:#64748b;font-size:13px;">${escapeHtml(locationAddress)}</p>` : ''}`;
  } else if (order.order_method === 'dine_in') {
    fulfillmentDetails = `<p style="margin:0;color:#1e293b;font-size:14px;">${escapeHtml(locationName || 'Store location')}</p>`;
  } else if (locationName) {
    fulfillmentDetails = `<p style="margin:0;color:#1e293b;font-size:14px;">${escapeHtml(locationName)}</p>`;
  }
  const scheduledFor = formatOrderTime(order.scheduled_for);
  const orderTime = formatOrderTime(order.created_at);
  const orderTimeRow = scheduledFor
    ? renderOrderConfirmationMetaRow('Scheduled for', `${scheduledFor} (Asia/Manila)`)
    : orderTime
      ? renderOrderConfirmationMetaRow('Order time', `${orderTime} (Asia/Manila)`)
      : '';
  const fulfillmentTitle = ({ delivery: 'Delivery To', pickup: 'Pickup At', dine_in: 'Dine In At' }[order.order_method] || 'Store Location');
  const trackingButton = safeTrackUrl
    ? `<table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:24px auto 10px;"><tr><td align="center" bgcolor="#1a4e8d" style="background-color:#1a4e8d;border-radius:10px;">
        <a href="${safeTrackUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Track your order</a>
      </td></tr></table>`
    : '';
  const supportLink = safeSupportUrl
    ? `<p style="margin:0 0 16px;color:#64748b;font-size:13px;text-align:center;">Need help? <a href="${safeSupportUrl}" style="color:#1a4e8d;font-weight:700;text-decoration:underline;">Contact DGFY support</a></p>`
    : '';
  const trackingPinHint = safeTrackingPin
    ? `<p style="margin:4px 0 0;color:#64748b;font-size:12px;">Keep your order PIN ${safeTrackingPin} for tracking.</p>`
    : '';
  const thankYouCopy = safeTrackUrl
    ? "You can follow your order's progress anytime with the Track your order button."
    : `Thank you for ordering with ${safeStoreName}.`;
  const storeAvatar = safeLogoUrl
    ? `<img src="${safeLogoUrl}" width="48" height="48" alt="${safeStoreName}" style="display:block;width:48px;height:48px;border:1px solid #e2e8f0;border-radius:50%;object-fit:cover;">`
    : `<span style="display:block;width:48px;height:48px;border-radius:50%;background-color:#eef4fb;color:#1a4e8d;font-size:20px;line-height:48px;font-weight:700;text-align:center;">${logoInitial}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Order confirmation</title></head>
<body style="margin:0;padding:0;background-color:#f4f7fb;color:#1e293b;font-family:'Segoe UI',Arial,sans-serif;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f4f7fb" style="width:100%;background-color:#f4f7fb;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
        <tr><td bgcolor="#1a4e8d" style="padding:15px 24px;background-color:#1a4e8d;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:3px;">DGFY</td></tr>
        <tr><td bgcolor="#ffffff" style="padding:24px 24px 18px;background-color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="60" valign="middle" style="width:60px;padding-right:12px;">${storeAvatar}</td>
            <td valign="middle"><div style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:1.2px;">ORDER CONFIRMATION</div><div style="padding-top:2px;color:#0f172a;font-size:22px;font-weight:800;line-height:1.25;">${safeStoreName}</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 24px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fafaf9" style="background-color:#fafaf9;border:1px solid #e7e5e4;border-radius:18px;">
            <tr><td width="60" valign="middle" align="center" style="width:60px;padding:16px 0 16px 16px;"><span style="display:block;width:40px;height:40px;border-radius:50%;background-color:#1a4e8d;color:#ffffff;font-size:22px;line-height:40px;font-weight:700;text-align:center;">&#10003;</span></td>
              <td style="padding:15px 16px 15px 10px;"><div style="color:#1e293b;font-size:17px;font-weight:800;">Order placed</div><div style="padding-top:3px;color:#64748b;font-size:13px;">We've received your order and it's being confirmed by the store.</div></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #d9e4e8;border-radius:18px;">
            <tr><td style="padding:20px 18px 18px;">
              <div style="color:#1a4e8d;font-size:12px;font-weight:700;letter-spacing:1px;">ORDER SUMMARY</div>
              <div style="padding-top:2px;color:#1e293b;font-size:38px;font-weight:800;line-height:1.2;">${escapeHtml(formatOrderConfirmationMoney(order.total_amount))}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
                <tbody>${renderOrderConfirmationMetaRow('Fulfillment', resolveFulfillmentLabel(order.order_method))}${orderTimeRow}${renderOrderConfirmationMetaRow('Status', 'Order placed')}${renderOrderConfirmationMetaRow('Payment method', paymentMethod)}${renderOrderConfirmationMetaRow('Payment status', paymentStatus)}</tbody>
              </table>
              <div style="margin:14px 0;border-top:1px solid #e2e8f0;"></div>
              <div style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.7px;">ORDER PIN</div>
              <div style="padding-top:2px;color:#0f172a;font-size:15px;font-weight:700;">${safeTrackingPin || 'Not available'}</div>
              ${safeInvoiceNumber ? `<div style="padding-top:7px;color:#334155;font-size:12px;"><strong>Invoice number:</strong> ${safeInvoiceNumber}</div>` : ''}
              ${safePaymentReference ? `<div style="padding-top:3px;color:#334155;font-size:12px;"><strong>Payment reference:</strong> ${safePaymentReference}</div>` : ''}
              <div style="margin:14px 0;border-top:1px solid #e2e8f0;"></div>
              <div style="padding-bottom:2px;color:#1e293b;font-size:16px;font-weight:800;">Your Items</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tbody>${itemRows}</tbody></table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-collapse:collapse;"><tbody>${breakdownRows.map(renderOrderConfirmationBreakdownRow).join('')}</tbody></table>
              ${hasVat ? `<p style="margin:9px 0 0;color:#94a3b8;font-size:11px;">${escapeHtml(VAT_DISCLOSURE_NOTE)}</p>` : ''}
              ${partialPaymentRows}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:20px;">
            <tr><td style="padding:16px 18px;"><div style="color:#1e293b;font-size:16px;font-weight:800;">${escapeHtml(fulfillmentTitle)}</div><div style="padding-top:6px;">${fulfillmentDetails || '<p style="margin:0;color:#64748b;font-size:13px;">Details are not available.</p>'}</div></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 18px;text-align:center;">
          ${trackingButton}
          ${trackingPinHint}
        </td></tr>
        <tr><td style="padding:0 24px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eef4fb" style="background-color:#eef4fb;border:1px solid #b9cfe8;border-radius:20px;">
            <tr><td style="padding:16px 18px;"><div style="color:#1e293b;font-size:16px;font-weight:800;">Thank you for your order!</div><p style="margin:5px 0 0;color:#475569;font-size:13px;">${thankYouCopy}</p></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 8px;">${supportLink}</td></tr>
        <tr><td bgcolor="#f8fafc" style="padding:15px 24px 18px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <div style="color:#334155;font-size:12px;font-weight:700;">Powered by DGFY</div>
          <div style="padding-top:3px;color:#94a3b8;font-size:11px;">&copy; ${new Date().getFullYear()} DGFY. All rights reserved.</div>
          <div style="padding-top:6px;color:#94a3b8;font-size:11px;">This message confirms your order and is not an official receipt.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

export default {
  getInvitationTemplate,
  getWelcomeTemplate,
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
  getResubmissionConfirmationTemplate,
  getStorefrontOrderConfirmationTemplate
};
