import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMapStyleUrl,
  rewriteOpenFreeMapUrl,
  tileTransformRequest
} from '../mapLibreShared.js';

describe('mapLibreShared tile routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the same-origin OpenFreeMap proxy by default', () => {
    expect(getMapStyleUrl({})).toBe('/openfreemap/styles/positron');
  });

  it('keeps an explicit tile-base override for operator-managed tile origins', () => {
    expect(getMapStyleUrl({ VITE_TILE_BASE: 'https://tiles.example.test/base/' }))
      .toBe('https://tiles.example.test/base/styles/positron');
  });

  it('rewrites OpenFreeMap TileJSON, vector, sprite, glyph, and raster URLs through the app origin', () => {
    const origin = 'https://skupervisor.dgfy.ph';
    const cases = [
      'https://tiles.openfreemap.org/planet',
      'https://tiles.openfreemap.org/planet/20260614_080001_pt/13/6884/3850.pbf',
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json',
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.png',
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
      'https://tiles.openfreemap.org/natural_earth/ne2sr/6/53/29.png'
    ];

    for (const url of cases) {
      expect(rewriteOpenFreeMapUrl(url, origin)).toBe(
        url.replace('https://tiles.openfreemap.org', `${origin}/openfreemap`)
      );
    }
  });

  it('leaves non-OpenFreeMap URLs untouched', () => {
    expect(rewriteOpenFreeMapUrl('https://tiles.example.test/styles/positron', 'https://skupervisor.dgfy.ph'))
      .toBe('https://tiles.example.test/styles/positron');
  });

  it('exposes a MapLibre transformRequest callback that returns a rewritten URL object', () => {
    vi.stubGlobal('window', { location: { origin: 'https://skupervisor.dgfy.ph' } });

    expect(tileTransformRequest('https://tiles.openfreemap.org/planet')).toEqual({
      url: 'https://skupervisor.dgfy.ph/openfreemap/planet'
    });
  });
});
