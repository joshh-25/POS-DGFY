import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import app from '../src/server.js';

const posRouteSource = readFileSync(new URL('../src/routes/pos.js', import.meta.url), 'utf8');

describe('POS cashier login route', () => {
  it('is mounted under the POS API route', async () => {
    const response = await request(app)
      .post('/api/v1/pos/auth/cashier-login')
      .send({});

    expect(response.status).not.toBe(404);
    expect(response.body?.message).not.toMatch(/route .* not found/i);
  });

  it('runs tenant-scoped cashier authentication before protected POS middleware', () => {
    const cashierLoginRoute = posRouteSource.indexOf("'/auth/cashier-login'");
    const protectedRoutesStart = posRouteSource.indexOf('router.use(authenticate);');

    expect(cashierLoginRoute).toBeGreaterThan(-1);
    expect(protectedRoutesStart).toBeGreaterThan(cashierLoginRoute);
    expect(posRouteSource.slice(cashierLoginRoute, protectedRoutesStart)).toContain('posLimiter');
    expect(posRouteSource.slice(cashierLoginRoute, protectedRoutesStart)).toContain('requirePremium');
    expect(posRouteSource.slice(cashierLoginRoute, protectedRoutesStart)).toContain("requireTenantCapability('tenant_pos_enabled', 'POS')");
    expect(posRouteSource.slice(cashierLoginRoute, protectedRoutesStart)).toContain('validatePosCashierLogin');
  });
});
