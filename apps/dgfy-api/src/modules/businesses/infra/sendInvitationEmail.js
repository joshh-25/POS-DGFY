import nodemailer from 'nodemailer';

// Minimal generic email sender for staff invitations (D-11). Deliberately
// narrow — apps/dgfy-api/src/infra/emailService.js only ever sends OTP
// codes (a fixed subject/body shape), so it cannot be reused directly for an
// arbitrary {to, subject, text, html} invitation email. This mirrors that
// file's SMTP_* env var convention and its graceful-degradation behavior
// (see CLAUDE.md: "Email Notifications... Uses Nodemailer SMTP with
// graceful degradation") rather than throwing when SMTP isn't configured,
// since a missing SMTP config in local/dev shouldn't hard-fail every staff
// invitation attempt.
let cachedTransporter = null;

export const isEmailConfigured = () => Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

const getTransporter = () => {
    if (cachedTransporter) return cachedTransporter;
    cachedTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number.parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    return cachedTransporter;
};

/**
 * @param {{to: string, subject: string, text?: string, html?: string}} message
 */
export const sendEmail = async ({ to, subject, text, html }) => {
    if (!isEmailConfigured()) {
        console.log(`[businesses/sendInvitationEmail] SMTP not configured — skipping email to ${to}: ${subject}`);
        return { sent: false, reason: 'smtp_not_configured' };
    }

    const fromName = process.env.EMAIL_FROM_NAME || 'DGFY';
    const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;

    await getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        text,
        html
    });

    return { sent: true };
};

export default sendEmail;
