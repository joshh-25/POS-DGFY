// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildDiscoveryPinLayerModel } from '../discovery/model/discoveryMapLayers.js';
import { buildStoreMarkerPreviewModel, createStoreMarkerPreviewNode } from '../discovery/model/storefrontMarkerPreview.js';
import { getBusinessModePinMeta, renderBusinessModePinSpriteSvg } from '../discovery/model/businessModePins.js';
import { resolveExternalActionHref } from '../discovery/model/externalListingActions.js';

const examples = [
  ['proventus', 'View Job', 'external_jobs', 'Briefcase'],
  ['eytitu', 'Book This Taxi', 'external_taxis', 'Taxi'],
  ['mapviu', 'Inquire', 'external_real_estate', 'Home'],
  ['synqcore', 'Book Stay', 'external_hotels', 'Hotel']
];

describe('external discovery presentation', () => {
  it.each(examples)('shows %s as an external pin with the right action', (provider, action, mode, glyph) => {
    const listing = {
      entity_type: 'external_listing', external_provider: provider,
      slug: `external-${provider}`, tenant_name: `Sample ${provider}`,
      latitude: 10.7, longitude: 122.5, storefront_open: true
    };
    const popup = buildStoreMarkerPreviewModel(listing);
    expect(popup.actionLabel).toBe(action);
    expect(popup.statusLabel).toBe('External listing');
    expect(popup.branchName).toContain('External ·');
    const map = buildDiscoveryPinLayerModel({ stores: [listing] });
    expect(map.requiredImages[0].id).toContain(mode);
    expect(getBusinessModePinMeta(mode).icon).toBe(glyph);
    expect(renderBusinessModePinSpriteSvg(mode)).toContain(getBusinessModePinMeta(mode).color);
    expect(renderBusinessModePinSpriteSvg(mode, true)).not.toBe(renderBusinessModePinSpriteSvg(mode));
  });

  it('renders sparse external details and one outbound action without placeholders', () => {
    const listing = { entity_type: 'external_listing', external_provider: 'mapviu', tenant_name: 'Example property',
      storefront_url: '/e/mapviu-example', latitude: 10.2, longitude: 122.3 };
    const action = vi.fn();
    const close = vi.fn();
    const card = createStoreMarkerPreviewNode(listing, { onAction: action, onClose: close });
    expect(card.textContent).toContain('External · Mapviu');
    expect(card.textContent).not.toMatch(/undefined|null|Address unavailable|ETA|availability|price|storefront item/);
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelectorAll('.store-marker-preview-action')).toHaveLength(1);
    card.querySelector('.store-marker-preview-body').click();
    expect(action).not.toHaveBeenCalled();
    card.querySelector('.store-marker-preview-action').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    card.querySelector('.store-marker-preview-action').click();
    expect(action).toHaveBeenCalledTimes(1);
    card.querySelector('.store-marker-preview-externalClose').click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('accepts only sanitized public URLs and never constructs a partner destination', () => {
    expect(resolveExternalActionHref({ entity_type: 'external_listing', storefront_url: '/e/example', external_reference_id: 'secret' })).toBe(`${window.location.origin}/e/example`);
    expect(resolveExternalActionHref({ entity_type: 'external_listing', storefront_url: 'javascript:alert(1)' })).toBe('');
    expect(resolveExternalActionHref({ entity_type: 'external_listing', external_storefront_url: 'https://partner.example/listing' })).toBe('https://partner.example/listing');
  });
});
