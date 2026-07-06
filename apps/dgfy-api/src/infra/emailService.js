import nodemailer from 'nodemailer';

// Minimal SMTP-only email sender for OTP delivery. Deliberately narrower than
// backend/src/services/emailService.js (no Brevo HTTPS fallback) — this
// service only ever sends OTP codes, not the full transactional-email
// surface backend owns. Same SMTP_* env var names as backend for operational
// consistency when both services share a mail provider.
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

export const sendEmailOtpCode = async ({ email, code, purposeLabel = 'email verification', expiresInMinutes = 10 }) => {
    if (!isEmailConfigured()) {
        const error = new Error('Email verification cannot be sent because SMTP is not configured');
        error.statusCode = 503;
        throw error;
    }

    const fromName = process.env.EMAIL_FROM_NAME || 'DGFY';
    const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;

    await getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: `Your DGFY ${purposeLabel} code`,
        text: `Your DGFY ${purposeLabel} code is ${code}. It expires in ${expiresInMinutes} minutes.`,
        html: `<p>Your DGFY ${purposeLabel} code is <strong>${code}</strong>. It expires in ${expiresInMinutes} minutes.</p>`
    });
};

export default { isEmailConfigured, sendEmailOtpCode };
