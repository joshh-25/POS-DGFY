import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBusinessBackOfficeHandoffUrl,
  getBusinessBackOfficeOrigin
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
});

describe('business Back Office handoff', () => {
  it('maps legacy IMS production hosts to the standalone POS origin', () => {
    setLocation({ hostname: 'skupervisor.dgfy.ph' });
    expect(getBusinessBackOfficeOrigin()).toBe('https://pos.dgfy.ph');
  });

  it('maps local IMS development to the POS development port', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' });
    expect(getBusinessBackOfficeOrigin()).toBe('http://localhost:5174');
  });

  it('carries the tenant handoff and destination inside the POS hash route', () => {
    setLocation({ hostname: 'skupervisor.dgfy.ph' });
    const parsed = new URL(buildBusinessBackOfficeHandoffUrl({
      tenantId: 'tenant-1',
      next: '/backoffice/catalog',
      handoffToken: 'handoff-1'
    }));
    const hash = new URL(`https://pos.test${parsed.hash.slice(1)}`);

    expect(parsed.origin).toBe('https://pos.dgfy.ph');
    expect(hash.pathname).toBe('/dgfy/companies');
    expect(hash.searchParams.get('tenant_id')).toBe('tenant-1');
    expect(hash.searchParams.get('next')).toBe('/backoffice/catalog');
    expect(hash.searchParams.get('handoff_token')).toBe('handoff-1');
  });
});
