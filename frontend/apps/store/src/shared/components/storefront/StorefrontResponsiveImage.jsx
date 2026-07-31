import React from 'react';

export function StorefrontResponsiveImage({
  imageSources,
  sizes,
  style,
  width,
  height,
  loading = 'lazy',
  decoding = 'async',
  ...imageProps
}) {
  const placeholderUrl = imageSources?.placeholderUrl || '';
  const imageStyle = placeholderUrl
    ? {
        backgroundImage: `url("${placeholderUrl}")`,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        ...style
      }
    : style;

  return (
    <picture style={{ display: 'contents' }}>
      {imageSources?.avifSrcSet ? (
        <source type="image/avif" srcSet={imageSources.avifSrcSet} sizes={sizes} />
      ) : null}
      {imageSources?.webpSrcSet ? (
        <source type="image/webp" srcSet={imageSources.webpSrcSet} sizes={sizes} />
      ) : null}
      <img
        {...imageProps}
        src={imageSources?.src || ''}
        srcSet={imageSources?.srcSet}
        sizes={sizes}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        style={imageStyle}
      />
    </picture>
  );
}
