import { describe, expect, it, vi } from 'vitest';
import {
  identifyAnalyticsUser,
  resolvePostHogBrowserConfig
} from '../analyticsClient.js';

describe('browser PostHog config', () => {
  it('is inactive by default even when a key/host exist', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_APP_SURFACE: 'pos',
      VITE_POSTHOG_KEY: 'phc_example',
      VITE_POSTHOG_HOST: 'https://posthog.example.test'
    });

    expect(config.enabled).toBe(false);
    expect(config.active).toBe(false);
  });

  it('is active for the requested surface when enabled with a key and host', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_POSTHOG_ENABLED: 'true',
      VITE_POSTHOG_KEY: 'phc_example',
      VITE_POSTHOG_HOST: 'https://posthog.example.test',
      VITE_POSTHOG_ENVIRONMENT: 'beta'
    }, 'store');

    expect(config.active).toBe(true);
    expect(config.surface).toBe('store');
    expect(config.apiKey).toBe('phc_example');
    expect(config.apiHost).toBe('https://posthog.example.test');
    expect(config.environment).toBe('beta');
  });

  it('hard-disable wins when a key and host are configured', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_POSTHOG_ENABLED: 'false',
      VITE_POSTHOG_KEY: 'phc_example',
      VITE_POSTHOG_HOST: 'https://posthog.example.test'
    }, 'pos');

    expect(config.active).toBe(false);
  });

  it('is inactive when enabled but missing an API key, even with no host set', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_POSTHOG_ENABLED: 'true'
    }, 'skupervisor');

    expect(config.active).toBe(false);
  });

  // With no VITE_POSTHOG_HOST, api_host defaults to the same-origin /ingest
  // proxy (infrastructure/docker/nginx/nginx.conf.template) rather than going
  // inactive. Before this, an unset host silently no-op'd analytics; see
  // docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md.
  it('defaults to the same-origin /ingest proxy and a fixed ui_host when no host is configured', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_POSTHOG_ENABLED: 'true',
      VITE_POSTHOG_KEY: 'phc_example'
    }, 'store');

    expect(config.active).toBe(true);
    expect(config.apiHost).toBe('/ingest');
    expect(config.uiHost).toBe('https://eu.posthog.com');
  });

  it('still honors an explicit VITE_POSTHOG_HOST override (e.g. local dev with no proxy)', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_POSTHOG_ENABLED: 'true',
      VITE_POSTHOG_KEY: 'phc_example',
      VITE_POSTHOG_HOST: 'https://eu.i.posthog.com'
    }, 'store');

    expect(config.apiHost).toBe('https://eu.i.posthog.com');
  });

  it('falls back to the skupervisor surface when none is provided', () => {
    const config = resolvePostHogBrowserConfig({});

    expect(config.surface).toBe('skupervisor');
  });

  it('scopes autocapture to interactive elements on the pos surface, leaves it unrestricted elsewhere', () => {
    const posConfig = resolvePostHogBrowserConfig({}, 'pos');
    const storeConfig = resolvePostHogBrowserConfig({}, 'store');

    expect(posConfig.autocapture).toEqual({
      element_allowlist: ['button', 'a', 'input', 'select'],
      css_selector_ignorelist: ['.ph-no-capture', '[data-ph-no-capture]']
    });
    expect(storeConfig.autocapture).toBe(true);
  });

  it('resolves session replay per-surface, falling back to the shared flag, defaulting off', () => {
    expect(resolvePostHogBrowserConfig({}, 'store').sessionReplayEnabled).toBe(false);
    expect(resolvePostHogBrowserConfig({
      VITE_POSTHOG_SESSION_REPLAY_STORE: 'true'
    }, 'store').sessionReplayEnabled).toBe(true);
    // POS is untouched by the STORE-specific flag.
    expect(resolvePostHogBrowserConfig({
      VITE_POSTHOG_SESSION_REPLAY_STORE: 'true'
    }, 'pos').sessionReplayEnabled).toBe(false);
    // Shared fallback flag applies when no surface-specific flag is set.
    expect(resolvePostHogBrowserConfig({
      VITE_POSTHOG_SESSION_REPLAY: 'true'
    }, 'skupervisor').sessionReplayEnabled).toBe(true);
  });
});

describe('identifyAnalyticsUser', () => {
  it('strips email/phone/address/token/secret/password traits before identifying', async () => {
    const identifyMock = vi.fn();
    vi.doMock('posthog-js', () => ({
      default: {
        init: vi.fn(),
        register: vi.fn(),
        identify: identifyMock,
        reset: vi.fn(),
        capture: vi.fn()
      }
    }));
    vi.resetModules();
    const freshModule = await import('../analyticsClient.js');

    freshModule.initBrowserAnalytics({
      env: { VITE_POSTHOG_ENABLED: 'true', VITE_POSTHOG_KEY: 'phc_test' },
      surface: 'store'
    });
    // The dynamic import('posthog-js') inside initBrowserAnalytics resolves
    // on a microtask; flush it before asserting on the mocked module.
    await new Promise((resolve) => setTimeout(resolve, 0));

    freshModule.identifyAnalyticsUser({
      id: 'cust-1',
      email: 'visitor@example.com',
      phone: '+63123456789',
      delivery_address: '123 Main St',
      auth_token: 'secret-token',
      role: 'customer'
    });

    expect(identifyMock).toHaveBeenCalledWith('cust-1', { role: 'customer' });
    vi.doUnmock('posthog-js');
  });

  it('is a no-op when called without an id', () => {
    expect(() => identifyAnalyticsUser({ email: 'no-id@example.com' })).not.toThrow();
  });
});
