import React from 'react';

// Shared presentational shell for a responsive `<picture>`/`<img>` pair. No data
// resolution happens here -- callers pass a `sources` object already built by
// `buildImageVariantSources` (packages/web-core/src/utils/imageVariantSources.js)
// or by one of the feature-specific resolvers (e.g. `resolvePosCatalogImageSources`,
// `resolveStorefrontImageSources`). This is the union of
// `POSCheckoutTerminalView.jsx`'s former local `PosResponsiveImage` and
// `StorefrontResponsiveImage.jsx`'s standalone implementation.
export const ResponsiveImage = React.memo(function ResponsiveImage({
  sources = {},
  sizes,
  style,
  width,
  height,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  onError,
  ...imageProps
}) {
  const placeholder = sources.placeholderSrc || sources.placeholderUrl || '';
  return (
    <picture style={{ display: 'contents' }}>
      {sources.avifSrcSet ? <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} /> : null}
      {sources.webpSrcSet ? <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} /> : null}
      <img
        {...imageProps}
        src={sources.src}
        srcSet={sources.srcSet}
        sizes={sizes}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        // eslint-disable-next-line react/no-unknown-property -- React 18 forwards the lowercase
        // HTML attribute, React 19 accepts the camel-cased prop (carried over from
        // StorefrontResponsiveImage.jsx's own comment, same reasoning applies here).
        fetchpriority={fetchPriority}
        style={{
          backgroundColor: '#F1F5F9',
          backgroundImage: placeholder ? `url(${placeholder})` : undefined,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          ...style
        }}
        onError={(event) => {
          event.currentTarget.parentElement?.querySelectorAll('source').forEach((s) => s.remove());
          onError?.(event);
        }}
      />
    </picture>
  );
});

export default ResponsiveImage;
