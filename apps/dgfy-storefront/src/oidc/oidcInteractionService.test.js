/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { validateOidcCompletionUrl, validateOidcRestartUrl } from './oidcInteractionService.js';
import { sanitizeSentryEvent } from '../../../../packages/web-core/src/observability/sentryClient.js';
import { sanitizePostHogEventUrls } from '../../../../packages/web-core/src/observability/analyticsClient.js';

const ticket = 'a'.repeat(43);

describe('Storefront OIDC destination validation', () => {
  it('accepts only configured API issuer hosts and the completion bridge path', () => {
    expect(validateOidcCompletionUrl(`https://api.dev.dgfy.ph/oidc/complete#ticket=${ticket}`, { storefrontHost: 'dev.dgfy.ph' }))
      .toBe(`https://api.dev.dgfy.ph/oidc/complete#ticket=${ticket}`);
    expect(validateOidcCompletionUrl(`https://api.stage.dgfy.ph/oidc/complete#ticket=${ticket}`, { storefrontHost: 'stage.dgfy.ph' }))
      .toContain('api.stage.dgfy.ph');
    expect(validateOidcCompletionUrl(`https://api.dgfy.ph/oidc/complete#ticket=${ticket}`, { storefrontHost: 'dgfy.ph' }))
      .toContain('api.dgfy.ph');
    expect(validateOidcCompletionUrl(`https://api.dgfy.ph/oidc/complete#ticket=${ticket}`, { storefrontHost: 'stage.dgfy.ph' })).toBe('');
    expect(validateOidcCompletionUrl(`https://api.dgfy.ph.evil.test/oidc/complete#ticket=${ticket}`, { storefrontHost: 'dgfy.ph' })).toBe('');
    expect(validateOidcCompletionUrl(`https://api.dgfy.ph/oidc/complete/other#ticket=${ticket}`, { storefrontHost: 'dgfy.ph' })).toBe('');
    expect(validateOidcCompletionUrl(`https://api.dgfy.ph/oidc/complete?ticket=${ticket}`, { storefrontHost: 'dgfy.ph' })).toBe('');
  });

  it('allows HTTP only for loopback completion and limits restart links to trusted DGLaundry hosts', () => {
    expect(validateOidcCompletionUrl(`http://localhost:4173/oidc/complete#ticket=${ticket}`)).toContain('localhost:4173');
    expect(validateOidcCompletionUrl(`https://api.dev.dgfy.ph/oidc/complete#ticket=${ticket}`)).toContain('api.dev.dgfy.ph');
    expect(validateOidcCompletionUrl(`https://api.stage.dgfy.ph/oidc/complete#ticket=${ticket}`)).toBe('');
    expect(validateOidcCompletionUrl(`http://api.dev.dgfy.ph/oidc/complete#ticket=${ticket}`, { storefrontHost: 'dev.dgfy.ph' })).toBe('');
    expect(validateOidcRestartUrl('https://laundry.surebizcorp.com', { storefrontHost: 'dev.dgfy.ph' }))
      .toBe('https://laundry.surebizcorp.com');
    expect(validateOidcRestartUrl('https://dglaundry.stage.dgfy.ph', { storefrontHost: 'stage.dgfy.ph' }))
      .toBe('https://dglaundry.stage.dgfy.ph');
    expect(validateOidcRestartUrl('https://dglaundry.dgfy.ph', { storefrontHost: 'dgfy.ph' }))
      .toBe('https://dglaundry.dgfy.ph');
    expect(validateOidcRestartUrl('https://dglaundry.dgfy.ph', { storefrontHost: 'stage.dgfy.ph' })).toBe('');
    expect(validateOidcRestartUrl('https://laundry.surebizcorp.com', { storefrontHost: 'localhost' }))
      .toBe('https://laundry.surebizcorp.com');
    expect(validateOidcRestartUrl('https://evil.test', { storefrontHost: 'dgfy.ph' })).toBe('');
  });

  it('redacts API interaction ids from shared frontend Sentry URLs', () => {
    const interactionId = 'z'.repeat(43);
    const event = sanitizeSentryEvent({
      request: { url: `https://api.dev.dgfy.ph/api/v1/dgfy/oidc/interactions/${interactionId}?ticket=${ticket}#oidc_handoff=${ticket}` }
    });
    expect(event.request.url).toBe('https://api.dev.dgfy.ph/api/v1/dgfy/oidc/interactions/:id?ticket=%5BFiltered%5D');
  });

  it('strips OIDC secrets from shared frontend analytics URL properties', () => {
    const event = sanitizePostHogEventUrls({
      event: '$pageview',
      properties: {
        $current_url: `https://dev.dgfy.ph/oidc/interaction/${ticket}?oidc_interaction_id=${ticket}#oidc_handoff=${ticket}`,
        $referrer: `https://api.dev.dgfy.ph/oidc/authorize?request_uri=${ticket}`
      }
    });
    expect(event.properties.$current_url).toBe(`https://dev.dgfy.ph/oidc/interaction/${ticket}`);
    expect(event.properties.$referrer).toBe('https://api.dev.dgfy.ph/oidc/authorize');
  });
});
