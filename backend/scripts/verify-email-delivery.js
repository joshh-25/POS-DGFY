import dotenv from 'dotenv';
import {
  getEmailProviderMode,
  isEmailConfigured,
  isSmtpConfigured,
  sendEmail,
  verifyConnection
} from '../src/services/emailService.js';

dotenv.config();

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};

const sendTo = getArgValue('--send-to');
const masked = (value) => (value ? `${String(value).slice(0, 4)}...` : '');
const looksPlaceholder = (value) => /your-|replace_with|change_me/i.test(String(value || ''));

const placeholderFindings = [
  ['SMTP_USER', process.env.SMTP_USER],
  ['SMTP_PASS', process.env.SMTP_PASS],
  ['EMAIL_FROM', process.env.EMAIL_FROM]
].filter(([, value]) => looksPlaceholder(value));

const summary = {
  configured: isEmailConfigured(),
  mode: getEmailProviderMode(),
  smtp_configured: isSmtpConfigured(),
  smtp_host: process.env.SMTP_HOST || null,
  smtp_user: masked(process.env.SMTP_USER),
  email_from: process.env.EMAIL_FROM || null,
  placeholder_values: placeholderFindings.map(([key]) => key)
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.configured || placeholderFindings.length) {
  console.error('Email delivery is not production-ready: configure real SMTP credentials with a verified EMAIL_FROM sender.');
  process.exit(1);
}

if (sendTo) {
  const result = await sendEmail({
    to: sendTo,
    subject: 'SKUpervisor email delivery verification',
    html: '<p>This is a SKUpervisor email delivery verification message.</p>',
    text: 'This is a SKUpervisor email delivery verification message.'
  });
  console.log(JSON.stringify({
    sent: true,
    provider: result.provider,
    message_id: result.messageId || null
  }, null, 2));
  process.exit(0);
}

const verification = await verifyConnection();
console.log(JSON.stringify({
  verified: verification.success,
  provider: verification.provider || null,
  mode: verification.mode || summary.mode,
  error: verification.error || null
}, null, 2));

process.exit(verification.success ? 0 : 1);
