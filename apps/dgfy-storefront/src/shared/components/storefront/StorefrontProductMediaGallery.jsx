import React, { useMemo, useState } from 'react';
import { ArrowUpRight, BadgeCheck, ChefHat, ShieldAlert } from 'lucide-react';
import { StorefrontResponsiveImage } from './StorefrontResponsiveImage.jsx';
import { StorefrontGalleryLightbox } from './StorefrontGalleryLightbox.jsx';

const STOREFRONT_BODY_FONT = '"Source Sans 3", "Segoe UI", sans-serif';

const detailBadgeStyle = (background, color, border) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 999,
  background,
  color,
  border: border ? `1px solid ${border}` : 'none',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  fontFamily: STOREFRONT_BODY_FONT
});
const getGalleryEntryKey = (entry, index) => entry?.url || entry?.src || `gallery-entry-${index}`;

function StorefrontProductMediaGalleryContent({
  accentColor = '#15803d',
  accentSoft = '#f0fdf4',
  available,
  availabilityLabel,
  borderSoft = '#86efac',
  bodyFont = STOREFRONT_BODY_FONT,
  itemName,
  objectFit = 'cover',
  galleryEntries,
  sectionLabel,
  standardImageHeight
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImageKeys, setFailedImageKeys] = useState(() => new Set());
  const [failedThumbnailKeys, setFailedThumbnailKeys] = useState(() => new Set());
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const availableGalleryEntries = galleryEntries.filter((entry, index) => (
    !failedImageKeys.has(getGalleryEntryKey(entry, index))
  ));
  const displayedIndex = availableGalleryEntries.length > 0
    ? Math.min(activeIndex, availableGalleryEntries.length - 1)
    : 0;
  const activeImage = availableGalleryEntries[displayedIndex] || null;
  const activeImageKey = activeImage ? getGalleryEntryKey(activeImage, displayedIndex) : '';
  const activeImageUrl = activeImage?.largeUrl || activeImage?.src || activeImage?.url || '';
  const hasMultipleImages = availableGalleryEntries.length > 1;
  const lightboxImages = availableGalleryEntries
    .map((entry) => entry?.largeUrl || entry?.src || entry?.url || '')
    .filter(Boolean);

  const markImageAsFailed = () => {
    if (!activeImageKey) return;
    setFailedImageKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      nextKeys.add(activeImageKey);
      return nextKeys;
    });
  };

  const markThumbnailAsFailed = (entry, index) => {
    const entryKey = getGalleryEntryKey(entry, index);
    setFailedThumbnailKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      nextKeys.add(entryKey);
      return nextKeys;
    });
  };

  const navigateInline = (direction) => {
    setActiveIndex((previousIndex) => {
      if (!hasMultipleImages) return 0;
      return direction === 'next'
        ? Math.min(previousIndex + 1, availableGalleryEntries.length - 1)
        : Math.max(previousIndex - 1, 0);
    });
  };

  const navigateLightbox = (direction) => {
    setActiveIndex((previousIndex) => {
      const total = availableGalleryEntries.length;
      if (total <= 1) return 0;
      return direction === 'next'
        ? (previousIndex + 1) % total
        : (previousIndex - 1 + total) % total;
    });
  };

  return (
    <div style={{
      position: 'relative',
      borderRadius: 24,
      overflow: 'hidden',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      height: standardImageHeight,
      boxSizing: 'border-box',
      background: '#f8fafc',
      border: '1px solid rgba(226, 232, 240, 0.8)',
      boxShadow: '0 20px 48px rgba(15, 23, 42, 0.06)'
    }}>
      <button
        type="button"
        aria-label="View larger image"
        disabled={!activeImageUrl}
        onClick={() => setIsViewerOpen(true)}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          display: 'grid',
          placeItems: 'center',
          color: '#475569',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
          transition: 'transform 120ms ease',
          zIndex: 10
        }}
      >
        <ArrowUpRight size={20} />
      </button>

      {hasMultipleImages && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            disabled={displayedIndex === 0}
            onClick={() => navigateInline('previous')}
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              display: 'grid',
              placeItems: 'center',
              color: '#475569',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              cursor: displayedIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: displayedIndex === 0 ? 0.5 : 1,
              zIndex: 10
            }}
          >
            {'<'}
          </button>
          <button
            type="button"
            aria-label="Next slide"
            disabled={displayedIndex === availableGalleryEntries.length - 1}
            onClick={() => navigateInline('next')}
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              display: 'grid',
              placeItems: 'center',
              color: '#475569',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              cursor: displayedIndex === availableGalleryEntries.length - 1 ? 'not-allowed' : 'pointer',
              opacity: displayedIndex === availableGalleryEntries.length - 1 ? 0.5 : 1,
              zIndex: 10
            }}
          >
            {'>'}
          </button>
        </>
      )}

      {activeImageUrl ? (
        <StorefrontResponsiveImage
          key={activeImageKey}
          imageSources={{ ...activeImage, src: activeImageUrl }}
          sizes="(max-width: 640px) calc(100vw - 32px), 720px"
          alt={itemName}
          decoding="async"
          // Issue #282, Phase D: this is the product-detail LCP image --
          // fetchPriority="high" alone did nothing while
          // StorefrontResponsiveImage's default loading="lazy" still
          // applied underneath it.
          loading="eager"
          fetchPriority="high"
          width={1024}
          height={768}
          style={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', objectFit, display: 'block' }}
          onError={markImageAsFailed}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#64748b' }}>
          <ChefHat size={44} strokeWidth={1.5} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>No image available</span>
        </div>
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(15,23,42,0.1) 0%, transparent 40%)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ ...detailBadgeStyle(accentColor, '#fff'), fontFamily: bodyFont }}>{sectionLabel}</span>
        <span style={detailBadgeStyle(
          available ? accentSoft : 'rgba(254,242,242,0.95)',
          available ? accentColor : '#b91c1c',
          available ? borderSoft : '#fecaca'
        )}>
          {available ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}
          {availabilityLabel}
        </span>
      </div>

      {activeImageUrl && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          display: 'flex',
          maxWidth: 'calc(100% - 32px)',
          overflowX: 'auto',
          gap: 8,
          zIndex: 10
        }}>
          {availableGalleryEntries.map((entry, index) => {
            const entryKey = getGalleryEntryKey(entry, index);
            const thumbnailUrl = entry?.thumbnailUrl || entry?.src || entry?.url || '';
            const isActive = index === displayedIndex;
            const isThumbnailFailed = failedThumbnailKeys.has(entryKey);

            return (
              <button
                key={entryKey}
                type="button"
                aria-label={`Select image ${index + 1} of ${availableGalleryEntries.length}`}
                aria-pressed={isActive}
                onClick={() => setActiveIndex(index)}
                style={{
                  flex: '0 0 auto',
                  width: 48,
                  height: 48,
                  padding: 0,
                  borderRadius: 10,
                  border: `2px solid ${isActive ? accentColor : 'rgba(255,255,255,0.8)'}`,
                  overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                {isThumbnailFailed ? (
                  <span
                    aria-label="Image preview unavailable"
                    style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: '#94a3b8', fontSize: 18 }}
                  >
                    —
                  </span>
                ) : (
                  <StorefrontResponsiveImage
                    imageSources={{ ...entry, src: thumbnailUrl }}
                    sizes="48px"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={48}
                    height={48}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => markThumbnailAsFailed(entry, index)}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <StorefrontGalleryLightbox
        open={isViewerOpen && lightboxImages.length > 0}
        images={lightboxImages}
        currentIndex={displayedIndex}
        onClose={() => setIsViewerOpen(false)}
        onNavigate={navigateLightbox}
      />
    </div>
  );
}
export function StorefrontProductMediaGallery({
  imageGallery,
  imageSources,
  imageUrl,
  ...props
}) {
  const galleryEntries = useMemo(() => {
    if (Array.isArray(imageGallery) && imageGallery.length > 0) return imageGallery;
    if (!imageUrl) return [];

    return [{
      ...imageSources,
      url: imageUrl,
      isPrimary: true,
      sortOrder: 0
    }];
  }, [imageGallery, imageSources, imageUrl]);
  const gallerySignature = galleryEntries.map((entry, index) => getGalleryEntryKey(entry, index)).join('|');

  return (
    <StorefrontProductMediaGalleryContent
      key={gallerySignature}
      {...props}
      galleryEntries={galleryEntries}
    />
  );
}
