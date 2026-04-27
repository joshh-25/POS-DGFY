/**
 * Email HTML Templates
 *
 * Provides HTML email templates for various system communications.
 * Templates use inline CSS for maximum email client compatibility.
 */

/**
 * Generate invitation email HTML template
 * @param {Object} params - Template parameters
 * @param {string} params.inviterName - Name of the person who sent the invitation
 * @param {string} params.role - Role being assigned (Staff/Manager/Admin)
 * @param {string} params.invitationToken - The unique token for the invitation
 * @param {string} params.appUrl - The base URL of the application
 * @param {string} params.tenantName - Company/tenant name
 * @param {string} [params.companyToken] - Company token for tenant-bound invite acceptance
 * @param {string} params.expiresIn - Human-readable expiry time (e.g., "7 days")
 * @returns {string} HTML email content
 */

// Helper to append UTM parameters to a URL
const appendUtm = (url, campaign) => {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=email&utm_medium=transactional&utm_campaign=${campaign}`;
};

export const getInvitationTemplate = ({ inviterName, role, invitationToken, tenantName, expiresIn, appUrl, companyToken }) => {
  const inviteQuery = new URLSearchParams({
    token: invitationToken,
    ...(companyToken ? { company: companyToken } : {})
  });
  const inviteUrlRaw = `${appUrl}/accept-invite?${inviteQuery.toString()}`;
  const inviteUrl = appendUtm(inviteUrlRaw, 'user_invitation');

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
  <title>You're Invited to ${tenantName}</title>
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
                <strong style="color: #1f2937;">${inviterName}</strong> has invited you to join
                <strong style="color: #1f2937;">${tenantName}</strong> as a
              </p>

              <!-- Role Badge -->
              <div style="text-align: center; margin-bottom: 32px;">
                <span style="display: inline-block; background-color: ${roleColor.bg}; color: ${roleColor.text}; padding: 8px 24px; border-radius: 20px; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${role}
                </span>
              </div>

              <!-- Description -->
              <p style="margin: 0 0 32px; color: #6b7280; font-size: 14px; text-align: center;">
                Click the button below to accept the invitation and set up your account:
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">
                  Accept Invitation
                </a>
              </div>

              <!-- Expiry Notice -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>Note:</strong> This invitation expires in <strong>${expiresIn}</strong>.
                </p>
              </div>

              <!-- Alternative Link -->
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; word-break: break-all;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteUrl}" style="color: #0891b2;">${inviteUrl}</a>
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

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${tenantName}</title>
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
                Welcome to ${tenantName}!
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 22px;">
                Hello, ${username}!
              </h2>

              <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
                Your account has been successfully created. You now have access to the SKU Inventory Manager as a <strong>${role}</strong>.
              </p>

              <p style="margin: 0 0 32px; color: #4b5563; font-size: 16px;">
                You can now log in and start managing inventory, purchase orders, and more.
              </p>

              <div style="text-align: center;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Go to Login
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
 * Generate company approval notification email template
 * @param {Object} params - Template parameters
 * @param {string} params.companyName - The approved company name
 * @param {string} params.adminEmail - Admin's email (login identifier)
 * @param {string} params.companyToken - Company's unique token
 * @param {string} params.appUrl - The base URL of the application
 * @returns {string} HTML email content
 */
export const getCompanyApprovedTemplate = ({ companyName, adminEmail, companyToken, appUrl }) => {
  const loginUrlRaw = `${appUrl}/login`;
  const loginUrl = appendUtm(loginUrlRaw, 'company_approved');

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

              <!-- Credentials Box -->
              <div style="background-color: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; color: #0f766e; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Your Login Credentials
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600;">${adminEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Company Token:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; font-family: monospace;">${companyToken}</td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">
                  Login to Your Account
                </a>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>Security Note:</strong> Keep your company token confidential. Share it only with trusted team members who need access to your company's account.
                </p>
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
export const getCompanyRejectedTemplate = ({ companyName, rejectionReason, appUrl }) => {
  const registerUrlRaw = `${appUrl}/register`;
  const registerUrl = appendUtm(registerUrlRaw, 'company_rejected');

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
                If you believe this was a mistake or would like to provide additional information, please contact our support team. You may also try registering again with updated information.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${registerUrl}" style="display: inline-block; background-color: #6b7280; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Try Again
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
  getResubmissionConfirmationTemplate
};

