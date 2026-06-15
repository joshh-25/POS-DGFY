import { describe, expect, it } from 'vitest';
import { resolveAppAssetUrl, resolveAssetOrigin, resolveAssetUrl } from '../assetUrl.js';

describe('assetUrl utilities', () => {
  it('prefers VITE_ASSET_BASE_URL over API origins', () => {
    const origin = resolveAssetOrigin(
      {
        VITE_ASSET_BASE_URL: 'https://cdn.surebizcorp.com',
        VITE_API_BASE_URL: 'https://api.surebizcorp.com',
        VITE_API_URL: 'https://fallback.surebizcorp.com/api/v1'
      },
      'https://skupervisor.surebizcorp.com'
    );

    expect(origin).toBe('https://cdn.surebizcorp.com');
  });

  it('ignores relative VITE_API_URL and keeps relative /uploads path when no absolute origin exists', () => {
    const origin = resolveAssetOrigin(
      {
        VITE_API_URL: '/api/v1'
      },
      'https://skupervisor.surebizcorp.com'
    );

    expect(origin).toBe('');
    expect(resolveAssetUrl('/uploads/x.png', { assetOrigin: origin })).toBe('/uploads/x.png');
  });

  it('resolves backend-relative uploads path against explicit asset origin', () => {
    const url = resolveAssetUrl('/uploads/pos-catalog/item-1.png', {
      assetOrigin: 'https://api.surebizcorp.com'
    });
    expect(url).toBe('https://api.surebizcorp.com/uploads/pos-catalog/item-1.png');
  });

  it('resolves app-bundled assets against the desktop shell location', () => {
    const url = resolveAppAssetUrl('/pos-items/coffee.jpg', {
      baseHref: 'dgfypos://app/dist-apps/pos/index.html#/terminal'
    });

    expect(url).toBe('dgfypos://app/dist-apps/pos/pos-items/coffee.jpg');
  });
});
