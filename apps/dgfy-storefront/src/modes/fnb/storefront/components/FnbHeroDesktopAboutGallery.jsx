import React, { useState } from 'react';
import { StorefrontGalleryLightbox } from '../../../../shared/components/storefront/StorefrontGalleryLightbox.jsx';

const FnbHeroDesktopAboutGallery = ({
  STYLES,
  aboutText,
  galleryImages,
  galleryImagesFull,
  galleryOverflowCount = 0,
  hasAboutSection,
  hasAboutToggle,
  hasGallerySection,
  heroTheme
}) => {
  // Fullscreen viewer navigates the full, unsliced gallery list; fall back to the
  // (already-capped) preview array if the full list wasn't supplied for some reason.
  const lightboxImages = Array.isArray(galleryImagesFull) && galleryImagesFull.length > 0
    ? galleryImagesFull
    : galleryImages;
  const [isGalleryLightboxOpen, setIsGalleryLightboxOpen] = useState(false);
  const [galleryLightboxIndex, setGalleryLightboxIndex] = useState(0);

  const openGalleryLightbox = (startIndex = 0) => {
    setGalleryLightboxIndex(startIndex);
    setIsGalleryLightboxOpen(true);
  };
  const closeGalleryLightbox = () => setIsGalleryLightboxOpen(false);
  const navigateGalleryLightbox = (direction) => {
    setGalleryLightboxIndex((previousIndex) => {
      const total = lightboxImages.length;
      if (total === 0) return previousIndex;
      if (direction === 'previous') return (previousIndex - 1 + total) % total;
      return (previousIndex + 1) % total;
    });
  };

  return (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
      {hasAboutSection && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>About Us</div>
          <p style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: '#475569',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: hasAboutToggle ? 3 : 'unset',
            WebkitBoxOrient: 'vertical',
            overflow: hasAboutToggle ? 'hidden' : 'visible',
            fontFamily: heroTheme.bodyFont
          }}>
            {aboutText}
          </p>
        </div>
      )}

      {hasGallerySection && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>Gallery</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 2, overflowX: 'visible', paddingBottom: 0 }}>
            {galleryImages.slice(0, 4).map((url, index, visibleImages) => {
              const showOverflowOverlay = index === visibleImages.length - 1 && galleryOverflowCount > 0;
              return (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => openGalleryLightbox(index)}
                  aria-label="View store photos"
                  style={{ width: '100%', minWidth: 0, height: 72, borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#e2e8f0', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <img src={url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {showOverflowOverlay && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: '#ffffff',
                      fontSize: 18,
                      fontWeight: 800,
                      fontFamily: heroTheme.bodyFont
                    }}>
                      +{galleryOverflowCount}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <StorefrontGalleryLightbox
        open={isGalleryLightboxOpen}
        images={lightboxImages}
        currentIndex={galleryLightboxIndex}
        onClose={closeGalleryLightbox}
        onNavigate={navigateGalleryLightbox}
      />
    </div>
  );
};

export { FnbHeroDesktopAboutGallery };
