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
 * @param {string} params.inviteUrl - Full URL to accept the invitation
 * @param {string} params.tenantName - Company/tenant name
 * @param {string} params.expiresIn - Human-readable expiry time (e.g., "7 days")
 * @returns {string} HTML email content
 */
export const getInvitationTemplate = ({ inviterName, role, inviteUrl, tenantName, expiresIn }) => {
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
 * @param {string} params.loginUrl - URL to login page
 * @returns {string} HTML email content
 */
export const getWelcomeTemplate = ({ username, role, tenantName, loginUrl }) => {
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

export default {
  getInvitationTemplate,
  getWelcomeTemplate
};
