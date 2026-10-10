import crypto from 'crypto';

export const hashPartnerClientSecret = (secret, salt = crypto.randomBytes(16).toString('base64url')) => {
  const digest = crypto.scryptSync(String(secret), salt, 64).toString('base64url');
  return `scrypt$${salt}$${digest}`;
};

export const generatePartnerClientSecret = () => crypto.randomBytes(32).toString('base64url');
