import { describe, expect, test } from '@jest/globals';
import { normalizeRegisteredOrigin, validateDestinationLists, validateRedirectDestination } from '../src/modules/partnerIdentity/domain/destinationPolicy.js';

describe('partner destination policy', () => {
  test('accepts exact HTTPS origins and callback destinations', () => {
    expect(normalizeRegisteredOrigin('https://partner.example.test').canonical).toBe('https://partner.example.test');
    expect(validateRedirectDestination('https://partner.example.test/callback', ['https://partner.example.test']).value)
      .toBe('https://partner.example.test/callback');
  });

  test.each([
    ['wildcard', 'https://*.example.test/callback', ['https://example.test']],
    ['lookalike suffix', 'https://ok.example.test.evil.test/callback', ['https://ok.example.test']],
    ['fragment', 'https://partner.example.test/callback#fragment', ['https://partner.example.test']],
    ['userinfo', 'https://user@partner.example.test/callback', ['https://partner.example.test']],
    ['plain HTTP public host', 'http://partner.example.test/callback', ['http://partner.example.test']],
    ['traversal', 'https://partner.example.test/a/%2e%2e/callback', ['https://partner.example.test']],
    ['custom scheme', 'javascript:alert(1)', ['https://partner.example.test']],
    ['not a string', 123, ['https://partner.example.test']],
    ['empty value', '', ['https://partner.example.test']]
  ])('rejects %s', (_label, value, origins) => {
    expect(() => validateRedirectDestination(value, origins)).toThrow();
  });

  test('allows HTTP loopback only in a non-production environment', () => {
    expect(validateDestinationLists({
      allowedOrigins: ['http://localhost:5173'],
      redirectUris: ['http://localhost:5173/callback'],
      environment: 'development'
    }).allowed_origins).toEqual(['http://localhost:5173']);
    expect(() => validateDestinationLists({
      allowedOrigins: ['http://localhost:5173'],
      redirectUris: ['http://localhost:5173/callback'],
      environment: 'production'
    })).toThrow();
  });

  test('rejects canonical collisions and path-bearing origins', () => {
    expect(() => validateDestinationLists({
      allowedOrigins: ['https://PARTNER.example.test:443', 'https://partner.example.test'],
      redirectUris: ['https://partner.example.test/callback']
    })).toThrow(/Canonical duplicate/);
    expect(() => normalizeRegisteredOrigin('https://partner.example.test/path')).toThrow(/bare/);
    expect(() => validateDestinationLists({
      allowedOrigins: ['https://partner.example.test'],
      redirectUris: ['https://partner.example.test/callback'],
      postLogoutRedirectUris: ['https://PARTNER.example.test:443/callback']
    })).toThrow(/Canonical duplicate/);
  });

  test('requires every callback origin to be registered exactly', () => {
    expect(() => validateDestinationLists({
      allowedOrigins: ['https://partner.example.test'],
      redirectUris: ['https://partner.example.test.evil.test/callback']
    })).toThrow(/not registered/);
  });
});
