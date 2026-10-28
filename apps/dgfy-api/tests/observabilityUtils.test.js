import { normalizeRouteForObservability, sanitizeSensitiveLogPath } from '../src/services/observabilityUtils.js';

describe('OIDC observability route privacy', () => {
  test('removes query parameters and replaces interaction and error identifiers', () => {
    const interactionId = 'a'.repeat(43);
    const errorId = '123e4567-e89b-42d3-a456-426614174000';
    expect(sanitizeSensitiveLogPath(`/oidc/authorize?request_uri=urn:secret`)).toBe('/oidc/authorize');
    expect(sanitizeSensitiveLogPath(`/api/v1/dgfy/oidc/interactions/${interactionId}?ticket=secret`))
      .toBe('/api/v1/dgfy/oidc/interactions/:id');
    expect(sanitizeSensitiveLogPath(`https://dgfy.ph/oidc/error/${errorId}?ticket=secret`))
      .toBe('/oidc/error/:id');
  });

  test('uses the Express route template when available', () => {
    expect(normalizeRouteForObservability({
      baseUrl: '/api/v1/dgfy/oidc',
      route: { path: '/interactions/:id/complete' },
      path: `/api/v1/dgfy/oidc/interactions/${'b'.repeat(43)}/complete`
    })).toBe('/api/v1/dgfy/oidc/interactions/:id/complete');
  });
});
