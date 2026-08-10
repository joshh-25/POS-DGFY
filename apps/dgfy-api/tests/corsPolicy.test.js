import { describe, expect, it } from '@jest/globals';
import { buildCorsPolicy } from '../src/config/corsPolicy.js';

describe('corsPolicy', () => {
  it('allows tenant storefront localhost preview origins in development only', () => {
    const development = buildCorsPolicy({ isProduction: false });
    const production = buildCorsPolicy({ isProduction: true, corsOrigin: 'https://dgfy.ph' });
    const origin = 'http://grandmatador.localhost:5175';

    expect(development.resolveCorsAllowed(origin, { path: '/api/v1/store/catalog' })).toBe(true);
    expect(production.resolveCorsAllowed(origin, { path: '/api/v1/store/catalog' })).toBe(false);
  });

  it('allows public API origins only on configured public GET endpoints', () => {
    const policy = buildCorsPolicy({
      corsOrigin: 'https://dgfy.ph',
      publicApiCorsOrigin: 'https://mapviu.com,https://*.mapviu.com',
      isProduction: true
    });

    expect(policy.resolveCorsAllowed('https://app.mapviu.com', {
      method: 'GET',
      path: '/api/v1/storefront/discovery/map-pins'
    })).toBe(true);
    expect(policy.resolveCorsAccess('https://app.mapviu.com', {
      method: 'GET',
      path: '/api/v1/storefront/discovery/map-pins'
    })).toEqual({
      allowed: true,
      publicApi: true
    });

    expect(policy.resolveCorsAllowed('https://app.mapviu.com', {
      method: 'POST',
      path: '/api/v1/auth/login'
    })).toBe(false);
  });

  it('rejects public API preflights that request mutation methods', () => {
    const policy = buildCorsPolicy({
      corsOrigin: 'https://dgfy.ph',
      publicApiCorsOrigin: 'https://mapviu.com,https://*.mapviu.com',
      isProduction: true
    });

    expect(policy.resolveCorsAllowed('https://app.mapviu.com', {
      method: 'OPTIONS',
      path: '/api/v1/storefront/discovery/map-pins',
      headers: {
        'access-control-request-method': 'POST'
      }
    })).toBe(false);

    expect(policy.resolveCorsAllowed('https://app.mapviu.com', {
      method: 'OPTIONS',
      path: '/api/v1/storefront/discovery/map-pins',
      headers: {
        'access-control-request-method': 'GET'
      }
    })).toBe(true);
  });

  it('keeps primary CORS origins globally allowed', () => {
    const policy = buildCorsPolicy({
      corsOrigin: 'https://dgfy.ph',
      publicApiCorsOrigin: 'https://mapviu.com',
      isProduction: true
    });

    expect(policy.resolveCorsAllowed('https://dgfy.ph', {
      method: 'POST',
      path: '/api/v1/auth/login'
    })).toBe(true);
  });

  it('allows an HTTPS origin only when it exactly matches the request host', () => {
    const policy = buildCorsPolicy({
      corsOrigin: 'https://dgfy.ph',
      isProduction: true,
      isVerifiedStorefrontHost: (hostname) => hostname === 'grandmatador.com'
    });
    expect(policy.resolveCorsAllowed('https://grandmatador.com', {
      method: 'POST', path: '/api/v1/store/checkout', headers: { host: 'grandmatador.com' }
    })).toBe(true);
    expect(policy.resolveCorsAllowed('http://grandmatador.com', {
      method: 'POST', path: '/api/v1/store/checkout', headers: { host: 'grandmatador.com' }
    })).toBe(false);
    expect(policy.resolveCorsAllowed('https://attacker.example', {
      method: 'POST', path: '/api/v1/store/checkout', headers: { host: 'grandmatador.com' }
    })).toBe(false);
    expect(policy.resolveCorsAllowed('https://grandmatador.com', {
      method: 'POST', path: '/api/v1/admin/tenants', headers: { host: 'grandmatador.com' }
    })).toBe(false);
  });

  it('rejects a matching origin when the host is not an active verified storefront domain', () => {
    const policy = buildCorsPolicy({
      corsOrigin: 'https://dgfy.ph',
      isProduction: true,
      isVerifiedStorefrontHost: () => false
    });
    expect(policy.resolveCorsAllowed('https://unverified.example', {
      method: 'POST',
      path: '/api/v1/store/checkout',
      headers: { host: 'unverified.example' }
    })).toBe(false);
  });
});
