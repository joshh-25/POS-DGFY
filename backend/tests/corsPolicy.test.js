import { buildCorsPolicy } from '../src/config/corsPolicy.js';

describe('corsPolicy', () => {
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

    expect(policy.resolveCorsAllowed('https://app.mapviu.com', {
      method: 'POST',
      path: '/api/v1/auth/login'
    })).toBe(false);
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
});
