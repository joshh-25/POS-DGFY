import { describe, expect, it } from 'vitest';
import {
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
});
