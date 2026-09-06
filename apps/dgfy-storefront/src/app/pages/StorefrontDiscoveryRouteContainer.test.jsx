import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { StorefrontDiscoveryRouteContainer } from './StorefrontDiscoveryRouteContainer.jsx';

const containerSource = readFileSync(
  fileURLToPath(new URL('./StorefrontDiscoveryRouteContainer.jsx', import.meta.url)),
  'utf8'
);

it('delegates both discovery presentation surfaces through their explicit prop bundles', () => {
  expect(StorefrontDiscoveryRouteContainer).toBeTypeOf('function');
  expect(containerSource).toContain('<DiscoveryHomePage {...discoveryProps} />');
  expect(containerSource).toContain('<ServicesDiscoveryDetailModal {...serviceDetailProps} />');
});
