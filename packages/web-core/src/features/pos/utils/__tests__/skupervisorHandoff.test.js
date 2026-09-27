/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPosDgfyHandoffUrl,
  buildSkupervisorHandoffUrl,
  getPosOrigin,
  getSkupervisorOrigin
} from '../skupervisorHandoff.js';

const originalLocation = window.location;

const setLocation = ({ protocol = 'https:', hostname, port = '' }) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { protocol, hostname, port }
  });
};

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation
  });
});

// buildSkupervisorHandoffUrl carries a DGFY session over to SKUpervisor for
// the one deliberate click-through from dgfy.ph (see
// useCustomerDashboardBusinessAccess.js). The origin must always be derived
// from the current host - never accept one from a caller - so these lock in
// the derivation for every surface that links out to SKUpervisor.
describe('getSkupervisorOrigin', () => {
  it('derives skupervisor.dgfy.ph from the storefront apex', () => {
    setLocation({ hostname: 'dgfy.ph' });
    expect(getSkupervisorOrigin()).toBe('https://skupervisor.dgfy.ph');
  });

  it('derives skupervisor.dgfy.ph from the store. alt domain', () => {
    setLocation({ hostname: 'store.dgfy.ph' });
    expect(getSkupervisorOrigin()).toBe('https://skupervisor.dgfy.ph');
  });

  it('derives skupervisor.beta.dgfy.ph from the beta storefront', () => {
    setLocation({ hostname: 'beta.dgfy.ph' });
    expect(getSkupervisorOrigin()).toBe('https://skupervisor.beta.dgfy.ph');
  });

  it('maps the local storefront dev port (5175) to the local SKUpervisor dev port (5173)', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5175' });
    expect(getSkupervisorOrigin()).toBe('http://localhost:5173');
  });

  it('maps the local POS dev port (5174) to the local SKUpervisor dev port (5173) too', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5174' });
    expect(getSkupervisorOrigin()).toBe('http://localhost:5173');
  });
});

describe('buildSkupervisorHandoffUrl', () => {
  it('lands on /dgfy/companies with tenant_id, next, and handoff_token', () => {
    setLocation({ hostname: 'dgfy.ph' });
    const url = buildSkupervisorHandoffUrl({ tenantId: 'tenant-1', next: '/items', handoffToken: 'handoff-abc' });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://skupervisor.dgfy.ph');
    expect(parsed.pathname).toBe('/dgfy/companies');
    expect(parsed.searchParams.get('tenant_id')).toBe('tenant-1');
    expect(parsed.searchParams.get('next')).toBe('/items');
    expect(parsed.searchParams.get('handoff_token')).toBe('handoff-abc');
  });

  it('omits handoff_token when minting one failed - degrade, do not dead-end', () => {
    setLocation({ hostname: 'dgfy.ph' });
    const url = buildSkupervisorHandoffUrl({ tenantId: 'tenant-1', next: '/items' });
    expect(new URL(url).searchParams.has('handoff_token')).toBe(false);
  });

  it('defaults next to / and normalizes a bare path', () => {
    setLocation({ hostname: 'dgfy.ph' });
    expect(new URL(buildSkupervisorHandoffUrl({ tenantId: 't1' })).searchParams.get('next')).toBe('/');
    expect(new URL(buildSkupervisorHandoffUrl({ tenantId: 't1', next: 'items' })).searchParams.get('next')).toBe('/items');
  });
});

describe('getPosOrigin and buildPosDgfyHandoffUrl', () => {
  it('maps the storefront apex to the standalone POS origin', () => {
    setLocation({ hostname: 'dgfy.ph' });
    expect(getPosOrigin()).toBe('https://pos.dgfy.ph');
  });

  it('maps local storefront development to port 5174', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5175' });
    expect(getPosOrigin()).toBe('http://localhost:5174');
  });

  it('uses the POS hash route and carries the tenant handoff parameters', () => {
    setLocation({ protocol: 'http:', hostname: 'localhost', port: '5175' });
    const url = buildPosDgfyHandoffUrl({
      tenantId: 'tenant-pos',
      next: '/terminal',
      handoffToken: 'handoff-pos'
    });
    const parsed = new URL(url);
    const hash = new URL(`http://pos.test${parsed.hash.slice(1)}`);

    expect(parsed.origin).toBe('http://localhost:5174');
    expect(parsed.pathname).toBe('/');
    expect(hash.pathname).toBe('/dgfy/companies');
    expect(hash.searchParams.get('tenant_id')).toBe('tenant-pos');
    expect(hash.searchParams.get('next')).toBe('/terminal');
    expect(hash.searchParams.get('handoff_token')).toBe('handoff-pos');
  });
});
