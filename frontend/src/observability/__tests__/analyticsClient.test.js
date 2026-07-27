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

  it('is inactive when enabled but missing a host', () => {
    const config = resolvePostHogBrowserConfig({
      VITE_POSTHOG_ENABLED: 'true',
      VITE_POSTHOG_KEY: 'phc_example'
    }, 'skupervisor');

    expect(config.active).toBe(false);
  });

  it('falls back to the skupervisor surface when none is provided', () => {
    const config = resolvePostHogBrowserConfig({});

    expect(config.surface).toBe('skupervisor');
  });
});
