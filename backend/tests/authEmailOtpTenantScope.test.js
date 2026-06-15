import { EMAIL_OTP_PURPOSES } from '../src/services/emailOtpService.js';
import { resolveAuthEmailOtpTenantId } from '../src/modules/auth/controllers/authHandlers.js';

describe('auth email OTP tenant scope', () => {
  it('keeps DGFY account verification OTPs global even when tenant context exists', () => {
    const req = {
      tenant: {
        id: 'tenant-from-stale-browser-session'
      }
    };

    expect(resolveAuthEmailOtpTenantId(req, EMAIL_OTP_PURPOSES.DGFY_ACCOUNT_VERIFICATION)).toBeNull();
  });

  it('keeps tenant-scoped OTP purposes tied to the active tenant context', () => {
    const req = {
      tenant: {
        id: 'tenant-1'
      }
    };

    expect(resolveAuthEmailOtpTenantId(req, EMAIL_OTP_PURPOSES.COMPANY_REGISTRATION)).toBe('tenant-1');
  });
});
