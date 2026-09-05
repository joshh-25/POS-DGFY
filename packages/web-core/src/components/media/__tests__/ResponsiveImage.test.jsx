/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { ResponsiveImage } from '../ResponsiveImage.jsx';

afterEach(cleanup);

describe('ResponsiveImage', () => {
  // Moved from apps/dgfy-storefront's storefrontLoadFailurePresentation.test.js
  // (#1635 RF-3) -- that test asserted this behavior as a source-text check
  // against StorefrontResponsiveImage.jsx, which broke once fetchPriority
  // handling moved here as part of extracting the shared ResponsiveImage shell
  // both POS and Storefront now render through. Assert the actual DOM contract
  // instead of a source-text implementation detail.
  it('forwards fetchPriority without triggering the React unknown-prop warning', () => {
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = render(
        <ResponsiveImage sources={{ src: 'https://cdn.example.test/thumb.jpg' }} fetchPriority="high" />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // HTML attribute names are case-insensitive in jsdom, so this read alone
      // doesn't prove the lowercase attribute was used -- the warnSpy assertion
      // below is what actually guards against passing the raw camelCased prop.
      expect(img.getAttribute('fetchpriority')).toBe('high');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('renders avif/webp <source> elements only when their srcSet is present', () => {
    const { container, rerender } = render(
      <ResponsiveImage sources={{ src: 'https://cdn.example.test/thumb.jpg' }} />
    );
    expect(container.querySelectorAll('source')).toHaveLength(0);

    rerender(
      <ResponsiveImage
        sources={{
          src: 'https://cdn.example.test/thumb.jpg',
          avifSrcSet: 'https://cdn.example.test/thumb.avif 400w',
          webpSrcSet: 'https://cdn.example.test/thumb.webp 400w'
        }}
      />
    );
    const sources = container.querySelectorAll('source');
    expect(sources).toHaveLength(2);
    expect(sources[0].getAttribute('type')).toBe('image/avif');
    expect(sources[1].getAttribute('type')).toBe('image/webp');
  });
});
