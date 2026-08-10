import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readStoresMapSource = () => {
  const directPath = path.resolve(process.cwd(), 'apps/store/src/discovery/components/StoresMap.jsx');
  const repoPath = path.resolve(process.cwd(), 'apps/dgfy-web/apps/store/src/discovery/components/StoresMap.jsx');
  return fs.readFileSync(fs.existsSync(directPath) ? directPath : repoPath, 'utf8');
};

describe('StoresMap source contract', () => {
  it('keeps storefront discovery pins renderer-owned instead of DOM Marker-owned', () => {
    const storesMapSource = readStoresMapSource();

    expect(storesMapSource).toContain('buildDiscoveryPinLayerModel');
    expect(storesMapSource).toContain('ensureDiscoveryMapLayers');
    expect(storesMapSource).toContain('setGeoJsonSourceData(map, DISCOVERY_PIN_SOURCE_ID');
    expect(storesMapSource).toContain('map.on(\'click\', DISCOVERY_PIN_LAYER_ID');
    expect(storesMapSource).not.toContain('new maplibregl.Marker');
    expect(storesMapSource).not.toContain('makeClusterElement');
    expect(storesMapSource).not.toContain('createSharedCoordinatePreviewNode');
  });
});
