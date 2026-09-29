import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpisBackOfficeUrl,
  buildOpisHandoffUrl,
  buildPosTerminalUrl,
  getBusinessBackOfficeOrigin,
  getOpisBackOfficeOrigin
} from '../businessBackOfficeHandoff.js';

const originalWindow = globalThis.window;

const setLocation = ({ protocol = 'https:', hostname, port = '' }) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { location: { protocol, hostname, port } }
  });
};

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: originalWindow
  });
  vi.unstubAllEnvs();
});

describe('OPIS Back Office origin (issue #2052)', () => {
  it('defaults to the public OPIS origin outside a browser', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: undefined
    });
    expect(getOpisBackOfficeOrigin()).toBe('https://opis.dgfy.ph');
  });

  it('maps POS, SKUpervisor, and storefront production hosts to opis', () => {
    for (const hostname of ['pos.dgfy.ph', 'skupervisor.dgfy.ph', 'store.dgfy.ph']) {
      setLocation({ hostname });
      expect(getOpisBackOfficeOrigin()).toBe('https://opis.dgfy.ph');
    }
  });

  it('derives the local OPIS dev port from a localhost POS tab', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5174' });
    expect(getOpisBackOfficeOrigin()).toBe('http://localhost:5176');
  });

  it('honors the VITE_OPIS_URL override', () => {
    vi.stubEnv('VITE_OPIS_URL', 'https://opis.stage.dgfy.ph');
    setLocation({ hostname: 'pos.dgfy.ph' });
    expect(getOpisBackOfficeOrigin()).toBe('https://opis.stage.dgfy.ph');
  });
});

describe('buildOpisBackOfficeUrl', () => {
  it('preserves the Back Office path and query across the redirect', () => {
    vi.stubEnv('VITE_OPIS_URL', 'https://opis.dgfy.ph');
    expect(buildOpisBackOfficeUrl({ path: '/backoffice/sales', search: '?range=last_30' })).toBe(
      'https://opis.dgfy.ph/backoffice/sales?range=last_30'
    );
  });

  it('defaults to the overview when no path is given', () => {
    vi.stubEnv('VITE_OPIS_URL', 'https://opis.dgfy.ph');
    expect(buildOpisBackOfficeUrl({})).toBe('https://opis.dgfy.ph/backoffice/overview');
  });
});

describe('buildOpisHandoffUrl', () => {
  it('carries tenant, destination, and handoff token as the OPIS company-picker query', () => {
    vi.stubEnv('VITE_OPIS_URL', 'https://opis.dgfy.ph');
    const parsed = new URL(buildOpisHandoffUrl({
      tenantId: 'tenant-1',
      next: '/backoffice/catalog',
      handoffToken: 'handoff-1'
    }));
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://opis.dgfy.ph/dgfy/companies');
    expect(parsed.hash).toBe('');
    expect(parsed.searchParams.get('tenant_id')).toBe('tenant-1');
    expect(parsed.searchParams.get('next')).toBe('/backoffice/catalog');
    expect(parsed.searchParams.get('handoff_token')).toBe('handoff-1');
  });
});

describe('buildPosTerminalUrl (OPIS → POS terminal links, issue #2052 follow-up)', () => {
  it('defaults to the /terminal path on the configured POS origin', () => {
    vi.stubEnv('VITE_POS_TERMINAL_URL', 'https://pos.dgfy.ph');
    expect(buildPosTerminalUrl()).toBe('https://pos.dgfy.ph/terminal');
  });

  it('maps the OPIS production host to the POS host (not pos.opis.*)', () => {
    setLocation({ hostname: 'opis.dev.dgfy.ph' });
    expect(getBusinessBackOfficeOrigin()).toBe('https://opis.dev.dgfy.ph');
    expect(buildPosTerminalUrl()).toBe('https://pos.dev.dgfy.ph/terminal');
  });

  it('derives the local POS dev port from a localhost OPIS tab', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5176' });
    expect(buildPosTerminalUrl()).toBe('http://localhost:5174/terminal');
  });

  it('preserves a terminal query across the cross-origin link', () => {
    vi.stubEnv('VITE_POS_TERMINAL_URL', 'https://pos.dgfy.ph');
    expect(buildPosTerminalUrl({ path: '/terminal', search: '?view=terminal_setup' })).toBe(
      'https://pos.dgfy.ph/terminal?view=terminal_setup'
    );
  });

  it('honors the VITE_POS_TERMINAL_URL override', () => {
    vi.stubEnv('VITE_POS_TERMINAL_URL', 'https://pos.stage.dgfy.ph');
    setLocation({ hostname: 'opis.dgfy.ph' });
    expect(buildPosTerminalUrl()).toBe('https://pos.stage.dgfy.ph/terminal');
  });
});
