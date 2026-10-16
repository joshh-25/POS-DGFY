const isLoopback = (value) => {
  const normalized = String(value || '').replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

export const isSecureAdminCredentialRequest = (req) => (
  req?.secure === true
  || (isLoopback(req?.hostname) && isLoopback(req?.ip || req?.socket?.remoteAddress))
);
