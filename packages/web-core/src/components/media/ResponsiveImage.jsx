import React from 'react';
import { resolveNextAssetImageFallback } from '../../utils/assetUrl.js';

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
  fallbackSrcs = [],
  hideOnError = false,
  onError,
  ...imageProps
}) {
  const placeholder = sources.placeholderSrc || sources.placeholderUrl || '';
  const normalizedFallbackSrcs = React.useMemo(() => (
    (Array.isArray(fallbackSrcs) ? fallbackSrcs : [fallbackSrcs])
      .map((candidate) => String(candidate || '').trim())
      .filter(Boolean)
  ), [fallbackSrcs]);
  const responsiveSourceKey = `${sources.src || ''}\u0000${sources.srcSet || ''}\u0000${sources.avifSrcSet || ''}\u0000${sources.webpSrcSet || ''}\u0000${normalizedFallbackSrcs.join('\u0000')}`;
  const [fallbackState, setFallbackState] = React.useState({ sourceKey: '', index: 0, sourcesFailed: false, imageFailed: false });
  const stateForSource = fallbackState.sourceKey === responsiveSourceKey
    ? fallbackState
    : { sourceKey: responsiveSourceKey, index: 0, sourcesFailed: false, imageFailed: false };
  const activeFallbackSrc = stateForSource.index > 0
    ? normalizedFallbackSrcs[stateForSource.index - 1] || ''
    : '';
  const responsiveSourcesFailed = stateForSource.sourcesFailed || Boolean(activeFallbackSrc);
  const imageSrc = activeFallbackSrc || sources.src;

  return (
    <picture style={{ display: 'contents' }}>
      {!responsiveSourcesFailed && sources.avifSrcSet ? <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} /> : null}
      {!responsiveSourcesFailed && sources.webpSrcSet ? <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} /> : null}
      <img
        {...imageProps}
        src={imageSrc}
        hidden={hideOnError && stateForSource.imageFailed}
        srcSet={responsiveSourcesFailed ? undefined : sources.srcSet}
        sizes={sizes}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        // React 18 forwards the lowercase HTML attribute, React 19 accepts the camel-cased
        // prop (carried over from StorefrontResponsiveImage.jsx's own comment, same reasoning
        // applies here). #1712: the directive below must be the comment line immediately
        // above the JSX attribute -- `eslint-disable-next-line` only suppresses the single
        // line directly following the comment it's written on, so with two more prose-comment
        // lines in between (as this block previously had) it silently suppressed nothing and
        // this file carried a live, uncaught `react/no-unknown-property` error.
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
          const currentTarget = event.currentTarget;
          const nextFallback = resolveNextAssetImageFallback({
            currentUrl: currentTarget?.currentSrc || currentTarget?.src || imageSrc,
            candidates: normalizedFallbackSrcs,
            startIndex: stateForSource.index,
            baseHref: currentTarget?.ownerDocument?.baseURI || ''
          });
          setFallbackState({
            sourceKey: responsiveSourceKey,
            index: nextFallback?.nextIndex || stateForSource.index,
            sourcesFailed: true,
            imageFailed: !nextFallback
          });
          if (!nextFallback) onError?.(event);
        }}
      />
    </picture>
  );
});

export default ResponsiveImage;
