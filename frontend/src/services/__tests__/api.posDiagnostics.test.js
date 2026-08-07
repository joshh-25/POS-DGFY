// @vitest-environment jsdom
//
// Sentry-independent POS request diagnostics: a small in-memory ring buffer
// of recent API outcomes (success and failure alike) plus attribution
// headers, both gated to the POS surface. Exists because a request that
// never leaves the device, or a failure that never touches axios, is
// invisible to Sentry by construction -- see
// docs/compliance/impact-declarations for the incident this responds to.

import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POS request diagnostics (ring buffer + attribution headers)', () => {
  let apiMock;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'pos');
    window.localStorage.clear();

    const { default: api } = await import('../api.js');
    apiMock = new MockAdapter(api);
  });

  afterEach(() => {
    apiMock?.restore();
    vi.unstubAllEnvs();
  });

  it('records a successful request in the outcome ring buffer', async () => {
    const { default: api, getRecentApiOutcomes } = await import('../api.js');
    apiMock.onGet('/pos/catalog').reply(200, { data: [] });

    await api.get('/pos/catalog');

    const outcomes = getRecentApiOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ method: 'GET', url: '/pos/catalog', status: 200, kind: 'http' });
    expect(typeof outcomes[0].durationMs).toBe('number');
  });

  it('records a final failure exactly once, not once per internal retry', async () => {
    const { default: api, getRecentApiOutcomes } = await import('../api.js');
    apiMock.onGet('/pos/terminal/shifts/current').reply(500, { message: 'boom' });

    await api.get('/pos/terminal/shifts/current', { skipTransientRetry: true }).catch(() => {});

    const outcomes = getRecentApiOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ method: 'GET', url: '/pos/terminal/shifts/current', status: 500, kind: 'http' });
  });

  it('classifies a network failure with no status as kind "network"', async () => {
    const { default: api, getRecentApiOutcomes } = await import('../api.js');
    apiMock.onGet('/pos/incoming-orders').networkError();

    await api.get('/pos/incoming-orders', { skipTransientRetry: true }).catch(() => {});

    const outcomes = getRecentApiOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: null, kind: 'network' });
  });

  it('caps the ring buffer at 10 entries, dropping the oldest', async () => {
    const { default: api, getRecentApiOutcomes } = await import('../api.js');
    apiMock.onGet(/\/pos\/catalog\?n=/).reply(200, { data: [] });

    for (let i = 0; i < 13; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await api.get(`/pos/catalog?n=${i}`);
    }

    const outcomes = getRecentApiOutcomes();
    expect(outcomes).toHaveLength(10);
    expect(outcomes[0].url).toBe('/pos/catalog?n=3');
    expect(outcomes[9].url).toBe('/pos/catalog?n=12');
  });

  it('attaches x-pos-terminal-id from local storage on POS requests', async () => {
    window.localStorage.setItem('pos_terminal_identity_v1', 'COUNTER-01');
    const { default: api } = await import('../api.js');
    apiMock.onGet('/pos/catalog').reply((config) => {
      expect(config.headers['x-pos-terminal-id']).toBe('COUNTER-01');
      return [200, { data: [] }];
    });

    await api.get('/pos/catalog');
  });

  it('omits x-pos-terminal-id when no terminal is stored', async () => {
    const { default: api } = await import('../api.js');
    apiMock.onGet('/pos/catalog').reply((config) => {
      expect(config.headers['x-pos-terminal-id']).toBeUndefined();
      return [200, { data: [] }];
    });

    await api.get('/pos/catalog');
  });

  it('attaches x-pos-error-ref only while a ref is active, then stops once cleared', async () => {
    const { default: api, setActivePosErrorRef, clearActivePosErrorRef } = await import('../api.js');
    setActivePosErrorRef('A7K29QX1');
    apiMock.onGet('/pos/terminal/shifts/open').reply((config) => {
      expect(config.headers['x-pos-error-ref']).toBe('A7K29QX1');
      return [200, {}];
    });
    await api.get('/pos/terminal/shifts/open');

    clearActivePosErrorRef();
    apiMock.onGet('/pos/catalog').reply((config) => {
      expect(config.headers['x-pos-error-ref']).toBeUndefined();
      return [200, { data: [] }];
    });
    await api.get('/pos/catalog');
  });

  it('notifies onApiOutcome subscribers for both success and network-failure outcomes', async () => {
    // This is what drives TerminalPage.jsx's Online/Offline indicator off
    // real request outcomes instead of navigator.onLine alone (which on
    // Android is true whenever any network interface exists, not
    // specifically that the backend was reachable).
    const { default: api, onApiOutcome } = await import('../api.js');
    const seen = [];
    const unsubscribe = onApiOutcome((entry) => seen.push(entry));

    apiMock.onGet('/pos/catalog').reply(200, { data: [] });
    await api.get('/pos/catalog');

    apiMock.onGet('/pos/incoming-orders').networkError();
    await api.get('/pos/incoming-orders', { skipTransientRetry: true }).catch(() => {});

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ kind: 'http', status: 200 });
    expect(seen[1]).toMatchObject({ kind: 'network', status: null });

    unsubscribe();
  });

  it('stops notifying a subscriber after it unsubscribes', async () => {
    const { default: api, onApiOutcome } = await import('../api.js');
    const seen = [];
    const unsubscribe = onApiOutcome((entry) => seen.push(entry));
    unsubscribe();

    apiMock.onGet('/pos/catalog').reply(200, { data: [] });
    await api.get('/pos/catalog');

    expect(seen).toHaveLength(0);
  });

  it('does not record outcomes or attach POS headers on a non-POS surface', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'skupervisor');
    window.localStorage.setItem('pos_terminal_identity_v1', 'COUNTER-01');
    const { default: api, getRecentApiOutcomes } = await import('../api.js');
    const nonPosMock = new MockAdapter(api);
    nonPosMock.onGet('/items').reply((config) => {
      expect(config.headers['x-pos-terminal-id']).toBeUndefined();
      return [200, { data: [] }];
    });

    await api.get('/items');

    expect(getRecentApiOutcomes()).toHaveLength(0);
    nonPosMock.restore();
  });
});
