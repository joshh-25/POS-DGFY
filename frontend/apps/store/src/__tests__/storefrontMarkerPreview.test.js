/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  buildStoreMarkerPreviewModel,
  createStoreMarkerPreviewNode,
  formatMarkerDistance
} from '../storefrontMarkerPreview.js';

describe('storefront marker preview helpers', () => {
  const pin = {
    slug: 'alpha',
    tenant_name: 'Alpha Foods',
    location_id: 22,
    location_name: 'Branch',
    branch_label: 'Branch',
    address_line: 'Mandurriao, Iloilo City',
    storefront_open: true,
    is_primary_storefront: false,
    distance_km: 1.24,
    catalog_count: 8,
    matching_item_count: 2,
    match_reasons: ['store', 'item'],
    has_in_stock_match: true,
    storefront_cover_image_url: '/uploads/storefront-assets/t1/cover.png',
    storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
  };

  it('builds compact branded preview data from the exact pinned location', () => {
    const model = buildStoreMarkerPreviewModel(pin, {
      resolveAssetUrl: (value) => value ? `https://dgfy.ph${value}` : ''
    });

    expect(model.tenantName).toBe('Alpha Foods');
    expect(model.branchName).toBe('Branch');
    expect(model.address).toBe('Mandurriao, Iloilo City');
    expect(model.locationId).toBe(22);
    expect(model.coverImageUrl).toBe('https://dgfy.ph/uploads/storefront-assets/t1/cover.png');
    expect(model.profileImageUrl).toBe('https://dgfy.ph/uploads/storefront-assets/t1/profile.png');
    expect(model.distanceLabel).toBe('1.2 km away');
    expect(model.catalogLabel).toBe('8 storefront item(s)');
    expect(model.matchingLabel).toBe('2 matching item(s)');
    expect(model.matchBadges.map((badge) => badge.label)).toEqual(['Store + Item match', 'In-stock match']);
  });

  it('renders safe DOM text and invokes the action with the pinned store', () => {
    const onAction = vi.fn();
    const node = createStoreMarkerPreviewNode(pin, {
      resolveAssetUrl: (value) => value || '',
      onAction
    });

    expect(node.textContent).toContain('Alpha Foods');
    expect(node.textContent).toContain('Branch');
    expect(node.textContent).toContain('Mandurriao, Iloilo City');

    const action = node.querySelector('button');
    expect(action?.textContent).toBe('Open storefront');
    action.click();
    expect(onAction).toHaveBeenCalledWith(pin);
  });

  it('falls back cleanly when branding and address are missing', () => {
    const model = buildStoreMarkerPreviewModel({
      tenant_name: 'No Assets',
      location_name: '',
      address_line: '',
      storefront_open: false
    });

    expect(model.branchName).toBe('Storefront location');
    expect(model.address).toBe('Address unavailable');
    expect(model.coverImageUrl).toBe('');
    expect(model.profileImageUrl).toBe('');
    expect(model.statusLabel).toBe('Closed');
  });

  it('formats short and long distances for popup context', () => {
    expect(formatMarkerDistance(0.32)).toBe('320 m away');
    expect(formatMarkerDistance(4.56)).toBe('4.6 km away');
    expect(formatMarkerDistance(12.4)).toBe('12 km away');
    expect(formatMarkerDistance(null)).toBe('');
  });
});
