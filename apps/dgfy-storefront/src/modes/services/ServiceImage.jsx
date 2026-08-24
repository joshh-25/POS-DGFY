import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

import { StorefrontResponsiveImage } from '../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../../shared/utils/storefrontImageSources.js';

const DEFAULT_FALLBACK_LABEL = 'No service image';

/**
 * Shared Services image surface. It keeps responsive sources, crop behavior,
 * and missing/failed-image presentation consistent across the Services flow.
 */
export function ServiceImage({
  item,
  imageSources,
  alt = '',
  sizes,
  width,
  height,
  loading = 'lazy',
  decoding = 'async',
  fallbackLabel = DEFAULT_FALLBACK_LABEL,
  fallbackLabelStyle,
  fallbackIcon,
  fallbackStyle,
  style,
  onError
}) {
  const [hasError, setHasError] = useState(false);
  const resolvedSources = imageSources || resolveStorefrontImageSources(item, { preferred: 'medium' });
  const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    ...style
  };

  if (!resolvedSources?.src || hasError) {
    return (
      <div
        role={fallbackLabel ? 'img' : undefined}
        aria-label={fallbackLabel || undefined}
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          alignContent: 'center',
          gap: 6,
          boxSizing: 'border-box',
          color: '#64748b',
          background: '#f8fafc',
          ...fallbackStyle
        }}
      >
        {fallbackIcon || <ImageOff size={20} strokeWidth={1.8} aria-hidden="true" />}
        {fallbackLabel ? <span style={{ maxWidth: 'calc(100% - 8px)', overflow: 'hidden', textAlign: 'center', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, ...fallbackLabelStyle }}>{fallbackLabel}</span> : null}
      </div>
    );
  }

  return (
    <StorefrontResponsiveImage
      alt={alt}
      imageSources={resolvedSources}
      sizes={sizes}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      style={imageStyle}
      onError={(event) => {
        setHasError(true);
        onError?.(event);
      }}
    />
  );
}

export { DEFAULT_FALLBACK_LABEL };
