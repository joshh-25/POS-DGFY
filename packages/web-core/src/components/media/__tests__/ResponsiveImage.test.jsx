/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { ResponsiveImage } from '../ResponsiveImage.jsx';
import { StorefrontCoverImage } from '../StorefrontCoverImage.jsx';
import { normalizeCoverPhotoTransform } from '@sieitzz/shared-constants/coverPhotoTransform';

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

  it('removes failed responsive sources through React during image fallback', () => {
    const { container, rerender, unmount } = render(
      <ResponsiveImage
        sources={{
          src: 'https://cdn.example.test/thumb.jpg',
          avifSrcSet: 'https://cdn.example.test/thumb.avif 400w',
          webpSrcSet: 'https://cdn.example.test/thumb.webp 400w'
        }}
      />
    );

    const image = container.querySelector('img');
    expect(container.querySelectorAll('source')).toHaveLength(2);
    fireEvent.error(image);
    expect(container.querySelectorAll('source')).toHaveLength(0);

    // The failed image can be replaced or unmounted without React trying to
    // remove DOM nodes that an event handler removed imperatively.
    rerender(
      <ResponsiveImage
        sources={{
          src: 'https://cdn.example.test/replacement.jpg',
          avifSrcSet: 'https://cdn.example.test/replacement.avif 400w',
          webpSrcSet: 'https://cdn.example.test/replacement.webp 400w'
        }}
      />
    );
    expect(container.querySelectorAll('source')).toHaveLength(2);
    expect(() => unmount()).not.toThrow();
  });

  it('keeps fallback replacement and parent rerenders inside React ownership', () => {
    const onError = vi.fn();
    const sources = {
      src: 'https://cdn.example.test/thumb.jpg',
      srcSet: 'https://cdn.example.test/thumb.jpg 400w',
      avifSrcSet: 'https://cdn.example.test/thumb.avif 400w',
      webpSrcSet: 'https://cdn.example.test/thumb.webp 400w'
    };
    const { container, rerender, unmount } = render(
      <ResponsiveImage
        sources={sources}
        fallbackSrcs={['https://cdn.example.test/large.jpg', 'https://cdn.example.test/icon.png']}
        onError={onError}
      />
    );

    const firstImage = container.querySelector('img');
    fireEvent.error(firstImage);
    expect(container.querySelector('img').getAttribute('src')).toBe('https://cdn.example.test/large.jpg');
    expect(container.querySelector('img').getAttribute('srcset')).toBeNull();
    expect(container.querySelectorAll('source')).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();

    rerender(
      <ResponsiveImage
        sources={{ ...sources }}
        fallbackSrcs={['https://cdn.example.test/large.jpg', 'https://cdn.example.test/icon.png']}
        className="after-unrelated-rerender"
        onError={onError}
      />
    );
    expect(container.querySelector('img').getAttribute('src')).toBe('https://cdn.example.test/large.jpg');
    expect(() => unmount()).not.toThrow();
  });

  it('reports the final fallback failure only after every candidate is exhausted', () => {
    const onError = vi.fn();
    const { container } = render(
      <ResponsiveImage
        sources={{ src: 'https://cdn.example.test/thumb.jpg' }}
        fallbackSrcs={['https://cdn.example.test/large.jpg', 'https://cdn.example.test/icon.png']}
        onError={onError}
      />
    );

    fireEvent.error(container.querySelector('img'));
    fireEvent.error(container.querySelector('img'));
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img').getAttribute('src')).toBe('https://cdn.example.test/icon.png');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('hides the image declaratively after the final fallback fails', () => {
    const { container } = render(
      <ResponsiveImage
        sources={{ src: 'https://cdn.example.test/thumb.jpg' }}
        hideOnError
      />
    );

    const image = container.querySelector('img');
    expect(image.hidden).toBe(false);
    fireEvent.error(image);
    expect(image.hidden).toBe(true);
  });

  it('preserves a caller-provided hidden state when fallback hiding is disabled', () => {
    const { container } = render(
      <ResponsiveImage
        sources={{ src: 'https://cdn.example.test/thumb.jpg' }}
        hidden
      />
    );

    expect(container.querySelector('img').hidden).toBe(true);
  });

  it('normalizes saved aliases and clamps unsafe cover-photo values', () => {
    expect(normalizeCoverPhotoTransform(JSON.stringify({ positionX: 140.123456, positionY: -140, zoom: 3 }))).toEqual({
      x: 100,
      y: -100,
      scale: 2.5
    });
    expect(normalizeCoverPhotoTransform({ x: 28.123456, y: -16.987654, scale: 1.234567 })).toEqual({
      x: 28.1235,
      y: -16.9877,
      scale: 1.2346
    });
  });

  it('renders the cover-photo transform through the same image element', () => {
    const { container } = render(
      <StorefrontCoverImage
        sources={{ src: 'https://cdn.example.test/cover.jpg' }}
        transform={{ x: 28.5, y: -16, scale: 1.75 }}
        alt="Cover photo"
      />
    );

    const image = container.querySelector('img');
    expect(image.style.objectPosition).toBe('35.75% 58%');
    expect(image.style.transform).toBe('scale(1.75)');
    expect(image.style.transformOrigin).toBe('center center');
  });
});
