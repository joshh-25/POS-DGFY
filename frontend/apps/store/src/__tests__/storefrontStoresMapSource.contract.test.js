import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readStorefrontAppSource = () => {
  const directPath = path.resolve(process.cwd(), 'apps/store/src/StorefrontApp.jsx');
  const repoPath = path.resolve(process.cwd(), 'frontend/apps/store/src/StorefrontApp.jsx');
  return fs.readFileSync(fs.existsSync(directPath) ? directPath : repoPath, 'utf8');
};

const extractFunctionSource = (source, functionName) => {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) return '';
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, nextFunction < 0 ? undefined : nextFunction);
};

describe('StoresMap source contract', () => {
  it('keeps storefront discovery pins renderer-owned instead of DOM Marker-owned', () => {
    const source = readStorefrontAppSource();
    const storesMapSource = extractFunctionSource(source, 'StoresMap');

    expect(storesMapSource).toContain('buildDiscoveryPinLayerModel');
    expect(storesMapSource).toContain('ensureDiscoveryMapLayers');
    expect(storesMapSource).toContain('setGeoJsonSourceData(map, DISCOVERY_PIN_SOURCE_ID');
    expect(storesMapSource).toContain('map.on(\'click\', DISCOVERY_PIN_LAYER_ID');
    expect(storesMapSource).not.toContain('new maplibregl.Marker');
    expect(storesMapSource).not.toContain('makeClusterElement');
    expect(storesMapSource).not.toContain('createSharedCoordinatePreviewNode');
  });
});
