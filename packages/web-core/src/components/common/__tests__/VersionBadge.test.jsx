/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VersionBadge from '../VersionBadge.jsx';

describe('VersionBadge', () => {
  // No `globals: true` in this repo's vitest config (see apps/dgfy-ims/vite.config.js), so
  // @testing-library/react's own implicit auto-cleanup afterEach never registers -- clean up
  // explicitly, same as any test file here that renders more than once.
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('renders the injected VITE_APP_VERSION value', () => {
    vi.stubEnv('VITE_APP_VERSION', '1.1.2');

    render(<VersionBadge />);

    const badge = screen.getByTestId('dgfy-version-badge');
    expect(badge.textContent).toBe('v1.1.2');
    expect(badge.getAttribute('title')).toBe('v1.1.2');
    expect(badge.getAttribute('aria-label')).toBe('v1.1.2');
  });

  it('prefixes the optional label', () => {
    vi.stubEnv('VITE_APP_VERSION', '1.1.2');

    render(<VersionBadge label="POS" />);

    const badge = screen.getByTestId('dgfy-version-badge');
    expect(badge.textContent).toBe('POS v1.1.2');
  });

  it('falls back to "unknown" when VITE_APP_VERSION is empty', () => {
    vi.stubEnv('VITE_APP_VERSION', '');

    render(<VersionBadge />);

    expect(screen.getByTestId('dgfy-version-badge').textContent).toBe('vunknown');
  });
});
