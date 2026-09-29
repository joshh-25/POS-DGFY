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
  it('maps merchant app hosts to the dedicated OPIS origin', () => {
    setLocation({ hostname: 'skupervisor.dgfy.ph' });
    expect(getBusinessBackOfficeOrigin()).toBe('https://opis.dgfy.ph');
  });

  it('maps local POS development to the OPIS development port', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5174' });
    expect(getBusinessBackOfficeOrigin()).toBe('http://localhost:5176');
  });

  it('carries the tenant handoff and destination to OPIS without a hash route', () => {
    setLocation({ hostname: 'skupervisor.dgfy.ph' });
    const parsed = new URL(buildBusinessBackOfficeHandoffUrl({
      tenantId: 'tenant-1',
      next: '/catalog',
      handoffToken: 'handoff-1'
    }));
    expect(parsed.origin).toBe('https://opis.dgfy.ph');
    expect(parsed.pathname).toBe('/dgfy/companies');
    expect(parsed.hash).toBe('');
    expect(parsed.searchParams.get('tenant_id')).toBe('tenant-1');
    expect(parsed.searchParams.get('next')).toBe('/catalog');
    expect(parsed.searchParams.get('handoff_token')).toBe('handoff-1');
  });
});
