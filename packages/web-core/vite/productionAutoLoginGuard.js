const AUTO_LOGIN_ENABLE_KEYS = Object.freeze([
  'VITE_POS_DEV_AUTO_LOGIN',
  'VITE_DEV_AUTO_LOGIN_ENABLED'
]);

const AUTO_LOGIN_CREDENTIAL_KEYS = Object.freeze([
  'VITE_POS_DEV_COMPANY_TOKEN',
  'VITE_POS_DEV_EMAIL',
  'VITE_POS_DEV_PASSWORD',
  'VITE_DEV_AUTO_LOGIN_COMPANY_TOKEN',
  'VITE_DEV_AUTO_LOGIN_EMAIL',
  'VITE_DEV_AUTO_LOGIN_PASSWORD'
]);

const isEnabled = (value) => /^(true|1|yes|on)$/i.test(String(value ?? '').trim());

export const getProductionAutoLoginViolations = (env = {}) => [
  ...AUTO_LOGIN_ENABLE_KEYS.filter((key) => isEnabled(env[key])),
  ...AUTO_LOGIN_CREDENTIAL_KEYS.filter((key) => String(env[key] ?? '').trim())
];

/**
 * Refuse production builds that could carry development auto-login settings.
 * Local convenience remains available only in `vite dev` with explicit values;
 * production must never silently inherit a developer's login configuration.
 */
export default function productionAutoLoginGuard() {
  return {
    name: 'dgfy-production-auto-login-guard',
    apply: 'build',
    configResolved(config) {
      if (config.command !== 'build') return;

      const violations = getProductionAutoLoginViolations({
        ...process.env,
        ...(config.env || {})
      });
      if (violations.length === 0) return;

      throw new Error(
        '[production-auto-login-guard] Production build refused because development ' +
        `auto-login is configured: ${violations.join(', ')}. Remove these values from the ` +
        'build environment; production authentication must use the normal sign-in/session flow.'
      );
    }
  };
}
