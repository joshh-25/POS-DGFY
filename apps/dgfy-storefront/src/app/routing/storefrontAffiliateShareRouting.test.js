// @vitest-environment jsdom
//
// #452 (Phase 212): the /s/{short_code} path-based affiliate share link. Covers the strict
// short-code discriminator, the path-first (query fully retired, E1) short-code reader, and the
// readRouteSlug() guard that must NEVER hand a short code to the slug resolver (see storefrontRouting.js's
// own comment on why -- the 2026-07-27 unknown-slug miss-repair amplifier).

import { afterEach, describe, expect, it } from 'vitest';
import {
  readAffiliateShortCode,
  readRouteSlug,
  readStoreSubpage,
  setAffiliateShareRouteSlug,
  storePath
} from './storefrontRouting.js';

describe('affiliate short-code path routing (#452, Phase 212)', () => {
  afterEach(() => setAffiliateShareRouteSlug(null));

  it('T11: /s/AF-ABC234 -> readAffiliateShortCode() is AF-ABC234', () => {
    window.history.replaceState({}, '', '/s/AF-ABC234');
    expect(readAffiliateShortCode()).toBe('AF-ABC234');
  });

  it('T12 (regression guard -- must never silently start passing for the wrong reason): /s/AF-ABC234 -> readRouteSlug() is null, never "af-abc234"', () => {
    window.history.replaceState({}, '', '/s/AF-ABC234');
    expect(readRouteSlug()).toBeNull();
  });

  it('T13: after setAffiliateShareRouteSlug("mystore"), readRouteSlug() on the same path returns "mystore"', () => {
    window.history.replaceState({}, '', '/s/AF-ABC234');
    setAffiliateShareRouteSlug('mystore');
    expect(readRouteSlug()).toBe('mystore');
  });

  it('E1 (no back-compat shim): /s/mystore-a1b2c3?p=AF-ABC234 resolves the slug but NOT the short code -- ?p= is retired', () => {
    window.history.replaceState({}, '', '/s/mystore-a1b2c3?p=AF-ABC234');
    expect(readRouteSlug()).toBe('mystore-a1b2c3');
    expect(readAffiliateShortCode()).toBe('');
  });

  it('T15: /s/mystore-a1b2c3 (no code) -> slug resolves, readAffiliateShortCode() is empty', () => {
    window.history.replaceState({}, '', '/s/mystore-a1b2c3');
    expect(readRouteSlug()).toBe('mystore-a1b2c3');
    expect(readAffiliateShortCode()).toBe('');
  });

  it('T16: /s/AF-ABC234/order -> readStoreSubpage() is "order"', () => {
    window.history.replaceState({}, '', '/s/AF-ABC234/order');
    expect(readStoreSubpage()).toBe('order');
  });

  it('T17: /tenant-store/mystore/order and /store/mystore are completely unchanged', () => {
    window.history.replaceState({}, '', '/tenant-store/mystore/order');
    expect(readRouteSlug()).toBe('mystore');
    expect(readStoreSubpage()).toBe('order');

    window.history.replaceState({}, '', '/store/mystore');
    expect(readRouteSlug()).toBe('mystore');
    expect(storePath('mystore')).toBe('/tenant-store/mystore');
  });

  it('T18: a non-conforming /s/{segment} is treated as a slug -- discriminator is strict on length and excluded 0/1/I/O', () => {
    window.history.replaceState({}, '', '/s/af-toolong');
    expect(readRouteSlug()).toBe('af-toolong');
    expect(readAffiliateShortCode()).toBe('');

    window.history.replaceState({}, '', '/s/AF-ABC23');
    expect(readRouteSlug()).toBe('af-abc23');
    expect(readAffiliateShortCode()).toBe('');

    window.history.replaceState({}, '', '/s/AF-ABC0234');
    expect(readRouteSlug()).toBe('af-abc0234');
    expect(readAffiliateShortCode()).toBe('');
  });
});
