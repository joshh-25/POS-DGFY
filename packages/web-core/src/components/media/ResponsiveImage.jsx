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
  const [failedResponsiveSourceKey, setFailedResponsiveSourceKey] = React.useState(null);
  const responsiveSourceKey = `${sources.src || ''}\u0000${sources.srcSet || ''}\u0000${sources.avifSrcSet || ''}\u0000${sources.webpSrcSet || ''}`;
  const responsiveSourcesFailed = failedResponsiveSourceKey === responsiveSourceKey;

  return (
    <picture style={{ display: 'contents' }}>
      {!responsiveSourcesFailed && sources.avifSrcSet ? <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} /> : null}
      {!responsiveSourcesFailed && sources.webpSrcSet ? <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} /> : null}
      <img
        {...imageProps}
        src={sources.src}
        srcSet={sources.srcSet}
        sizes={sizes}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        // React 18 forwards the lowercase HTML attribute, while React 19 accepts
        // the camel-cased prop (carried over from StorefrontResponsiveImage.jsx).
        // eslint-disable-next-line react/no-unknown-property
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
          // Let React remove its own <source> nodes on the next render. Mutating
          // the picture DOM here leaves React with stale child references and can
          // trigger a removeChild NotFoundError during a later unmount/update.
          setFailedResponsiveSourceKey(responsiveSourceKey);
          onError?.(event);
        }}
      />
    </picture>
  );
});

export default ResponsiveImage;
