import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readDeliveryPinMapSource = () =>
  fs.readFileSync(path.resolve(process.cwd(), 'src/features/locations/components/DeliveryPinMap.jsx'), 'utf8');

describe('DeliveryPinMap worker source contract', () => {
  it('registers the self-contained MapLibre worker URL emitted by Vite', () => {
    const deliveryPinMapSource = readDeliveryPinMapSource();

    expect(deliveryPinMapSource).toContain(
      "import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';"
    );
    expect(deliveryPinMapSource).toContain(
      "if (typeof maplibregl.setWorkerUrl === 'function' && maplibreWorkerUrl) {"
    );
    expect(deliveryPinMapSource).toContain('maplibregl.setWorkerUrl(maplibreWorkerUrl);');
  });
});
