import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const recordSmsMarketingConsentUseCase = jest.fn(async () => ({ status: 'active' }));
const revokeSmsMarketingConsentUseCase = jest.fn(async () => ({ status: 'revoked' }));
jest.unstable_mockModule('../src/modules/smsDelivery/usecases/smsMarketingConsentUseCases.js', () => ({
  recordSmsMarketingConsentUseCase,
  revokeSmsMarketingConsentUseCase
}));
jest.unstable_mockModule('../src/middleware/requireTenantContext.js', () => ({
  requireTenantContext: (req, _res, next) => { req.tenant = { id: 'tenant-a' }; next(); }
}));
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, error_code: 'UNAUTHENTICATED' });
    req.user = req.headers['x-role'] === 'admin' ? { role: 'admin', id: 'user-a' } : { role: 'staff', id: 'user-b' };
    return next();
  }
}));

const { default: smsMarketingConsentRoutes } = await import('../src/routes/smsMarketingConsent.js');
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/sms', smsMarketingConsentRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error_code: error.code || 'ERROR' }));
  return app;
};

describe('sms marketing consent routes', () => {
  afterEach(() => {
    recordSmsMarketingConsentUseCase.mockClear();
    revokeSmsMarketingConsentUseCase.mockClear();
  });

  it('requires authentication and tenant-owner/admin authority', async () => {
    const app = buildApp();
    const unauthenticated = await request(app).post('/sms/marketing-consents').send({ phone: '09171234567', consent_text_version: 'v1' });
    const staff = await request(app).post('/sms/marketing-consents').set('authorization', 'Bearer test').send({ phone: '09171234567', consent_text_version: 'v1' });
    expect(unauthenticated.status).toBe(401);
    expect(staff.status).toBe(403);
    expect(recordSmsMarketingConsentUseCase).not.toHaveBeenCalled();
  });

  it('validates grant details and never echoes the submitted phone number', async () => {
    const app = buildApp();
    const invalid = await request(app).post('/sms/marketing-consents').set('authorization', 'Bearer test').set('x-role', 'admin').send({ phone: '09171234567' });
    const granted = await request(app).post('/sms/marketing-consents').set('authorization', 'Bearer test').set('x-role', 'admin')
      .send({ phone: '09171234567', consent_text_version: 'v1' });
    expect(invalid.status).toBe(400);
    expect(granted.status).toBe(201);
    expect(JSON.stringify(granted.body)).not.toContain('09171234567');
    expect(recordSmsMarketingConsentUseCase).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', phone: '09171234567', consentTextVersion: 'v1', source: 'manual_api'
    }));
  });

  it('validates revoke and records through the tenant-scoped use case', async () => {
    const response = await request(buildApp()).post('/sms/marketing-consents/revoke')
      .set('authorization', 'Bearer test').set('x-role', 'admin').send({ phone: '09171234567' });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('09171234567');
    expect(revokeSmsMarketingConsentUseCase).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', phone: '09171234567' }));
  });
});
