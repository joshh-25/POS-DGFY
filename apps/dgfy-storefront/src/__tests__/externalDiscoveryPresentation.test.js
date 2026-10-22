import { describe, expect, it } from 'vitest';
import { buildDiscoveryPinLayerModel } from '../discovery/model/discoveryMapLayers.js';
import { buildStoreMarkerPreviewModel } from '../discovery/model/storefrontMarkerPreview.js';

const examples = [
  ['proventus', 'View job', 'external_jobs'],
  ['eytitu', 'Book ride', 'external_taxis'],
  ['mapviu', 'Inquire', 'external_real_estate'],
  ['synqcore', 'Book stay', 'external_hotels']
];

describe('external discovery presentation', () => {
  it.each(examples)('shows %s as an external pin with the right action', (provider, action, mode) => {
    const listing = {
      entity_type: 'external_listing', external_provider: provider,
      slug: `external-${provider}`, tenant_name: `Sample ${provider}`,
      latitude: 10.7, longitude: 122.5, storefront_open: true
    };
    const popup = buildStoreMarkerPreviewModel(listing);
    expect(popup.actionLabel).toBe(action);
    expect(popup.statusLabel).toBe('External listing');
    expect(popup.branchName).toContain('Opens on');
    const map = buildDiscoveryPinLayerModel({ stores: [listing] });
    expect(map.requiredImages[0].id).toContain(mode);
  });
});
