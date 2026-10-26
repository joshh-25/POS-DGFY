import { describe, expect, test } from '@jest/globals';
import {
  buildStorefrontOidcUrl,
  normalizeConfiguredOrigin,
  prefersHtmlNavigation,
  resolveDglaundryRestartOrigin,
  resolveOidcIssuerOrigin,
  resolveStorefrontOrigin
} from '../src/modules/partnerIdentity/domain/oidcInteractionPolicy.js';

describe('OIDC browser interaction policy', () => {
  test.each([
    ['text/html', true],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', true],
    ['text/html;q=0.9, application/json;q=0.8', true],
    ['application/json, text/html;q=0.8', false],
    ['text/html;q=0, application/json;q=0', false],
    ['application/json', false],
    ['*/*', false],
    ['text/html;q=0.5, application/*;q=0, */*;q=0.9', true],
    ['text/html;q=0.5, application/*;q=0.7, */*;q=0.9', false],
    ['text/html;q=0.5, application/json;q=0, application/*;q=0.9', true],
    ['application/*;q=1,text/html;q=0.9', false],
    ['', false]
  ])('negotiates Accept %p as HTML=%p', (accept, expected) => {
    expect(prefersHtmlNavigation(accept)).toBe(expected);
  });

  test('accepts exact origin-only values and localhost HTTP while rejecting unsafe destinations', () => {
    expect(normalizeConfiguredOrigin('https://dev.dgfy.ph', { environment: 'development' })).toBe('https://dev.dgfy.ph');
    expect(normalizeConfiguredOrigin('http://api.localhost:4173', { environment: 'development' })).toBe('http://api.localhost:4173');
    expect(normalizeConfiguredOrigin('http://dev.dgfy.ph', { environment: 'development' })).toBeNull();
    expect(normalizeConfiguredOrigin('https://dev.dgfy.ph/path', { environment: 'development' })).toBeNull();
    expect(normalizeConfiguredOrigin('https://dev.dgfy.ph?next=https://evil.test', { environment: 'development' })).toBeNull();
    expect(normalizeConfiguredOrigin(' https://dev.dgfy.ph', { environment: 'development' })).toBeNull();
  });

  test('resolves only configured issuer and Storefront origins', () => {
    const env = {
      NODE_ENV: 'production',
      DGFY_OIDC_ISSUER: 'https://api.stage.dgfy.ph/oidc',
      STOREFRONT_PUBLIC_ORIGIN: 'https://stage.dgfy.ph'
    };
    expect(resolveOidcIssuerOrigin(env)).toEqual({ issuer: 'https://api.stage.dgfy.ph/oidc', origin: 'https://api.stage.dgfy.ph' });
    expect(resolveStorefrontOrigin(env)).toBe('https://stage.dgfy.ph');
    expect(resolveDglaundryRestartOrigin({
      ...env,
      DGLAUNDRY_PARTNER_BASE_URL: 'https://dglaundry.stage.dgfy.ph'
    })).toBe('https://dglaundry.stage.dgfy.ph');
    expect(buildStorefrontOidcUrl('/oidc/interaction/abc', env)).toBe('https://stage.dgfy.ph/oidc/interaction/abc');
    expect(resolveStorefrontOrigin({ ...env, STOREFRONT_PUBLIC_ORIGIN: 'https://dgfy.ph/path' })).toBeNull();
    expect(resolveStorefrontOrigin({ ...env, STOREFRONT_PUBLIC_ORIGIN: 'https://dgfy.ph' })).toBeNull();
    expect(resolveDglaundryRestartOrigin({
      ...env,
      DGLAUNDRY_PARTNER_BASE_URL: 'https://dglaundry.dgfy.ph'
    })).toBeNull();
    expect(resolveOidcIssuerOrigin({ ...env, DGFY_OIDC_ISSUER: 'https://api.stage.dgfy.ph/oidc/path' })).toBeNull();
  });
});
