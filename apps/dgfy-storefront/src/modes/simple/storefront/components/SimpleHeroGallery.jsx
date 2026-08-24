import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const SimpleHeroGallery = ({
  STYLES,
  galleryImages = [],
  galleryImagesFull = [],
  galleryOverflowCount = 0,
  heroTheme,
  isMobileViewport = false,
  compactMobile = false
}) => {
  const previewImages = Array.isArray(galleryImages) ? galleryImages.filter(Boolean).slice(0, 4) : [];
  const fullImages = Array.isArray(galleryImagesFull) && galleryImagesFull.length > 0
    ? galleryImagesFull.filter(Boolean)
    : previewImages;
  const [activeImageIndex, setActiveImageIndex] = useState(null);

  useEffect(() => {
    if (activeImageIndex == null) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setActiveImageIndex(null);
      if (event.key === 'ArrowLeft') {
        setActiveImageIndex((current) => (current == null ? 0 : (current - 1 + fullImages.length) % fullImages.length));
      }
      if (event.key === 'ArrowRight') {
        setActiveImageIndex((current) => (current == null ? 0 : (current + 1) % fullImages.length));
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeImageIndex, fullImages.length]);

  if (previewImages.length === 0) return null;

  const openImage = (index) => setActiveImageIndex(Math.min(index, fullImages.length - 1));
  const resolvedOverflowCount = Math.max(0, Number(galleryOverflowCount) || Math.max(0, fullImages.length - previewImages.length));
  const accent = heroTheme?.accent || STYLES.colors.brand;
  const dark = heroTheme?.accentDark || STYLES.colors.brandDark;
  const totalGalleryImageCount = Math.max(previewImages.length + resolvedOverflowCount, fullImages.length);
  const storeDetailGalleryOverlayCount = Math.max(0, totalGalleryImageCount - 1);

  const galleryLightbox = activeImageIndex != null && fullImages[activeImageIndex] ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Storefront gallery"
      onClick={() => setActiveImageIndex(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15,23,42,0.78)' }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 'min(92vw, 860px)', height: 'min(84vh, 720px)' }}>
        <img src={fullImages[activeImageIndex]} alt={`Gallery image ${activeImageIndex + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, objectFit: 'contain', background: '#fff', boxShadow: '0 18px 48px rgba(0,0,0,0.25)' }} />
        <button type="button" onClick={() => setActiveImageIndex(null)} aria-label="Close gallery" style={{ position: 'absolute', top: -12, right: -12, width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0', borderRadius: '50%', background: '#fff', color: dark, cursor: 'pointer' }}>
          <X size={18} />
        </button>
        {fullImages.length > 1 ? (
          <>
            <button type="button" onClick={() => setActiveImageIndex((current) => (current - 1 + fullImages.length) % fullImages.length)} aria-label="Previous gallery image" style={{ position: 'absolute', left: -16, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0', borderRadius: '50%', background: '#fff', color: dark, cursor: 'pointer' }}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => setActiveImageIndex((current) => (current + 1) % fullImages.length)} aria-label="Next gallery image" style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0', borderRadius: '50%', background: '#fff', color: dark, cursor: 'pointer' }}>
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  ) : null;

  if (isMobileViewport && compactMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => openImage(0)}
          aria-label="View store photos"
          style={{ width: 100, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative', flexShrink: 0, border: `1px solid ${heroTheme?.accentSoft || '#dbeafe'}`, padding: 0, background: '#f8fafc', cursor: 'pointer' }}
        >
          <img src={previewImages[0]} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {storeDetailGalleryOverlayCount > 0 && (
            <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(15,23,42,0.56)', color: '#fff', fontSize: 18, fontWeight: 800, fontFamily: heroTheme?.bodyFont }}>
              +{storeDetailGalleryOverlayCount}
            </span>
          )}
        </button>
        {galleryLightbox}
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme?.bodyFont }}>
            Gallery
          </div>
          {isMobileViewport && fullImages.length > 1 ? (
            <button
              type="button"
              onClick={() => openImage(0)}
              style={{ border: 'none', background: 'transparent', color: accent, padding: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: heroTheme?.bodyFont }}
            >
              View all photos
            </button>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {previewImages.map((imageUrl, index) => {
            const isOverflowTile = index === previewImages.length - 1 && resolvedOverflowCount > 0;
            return (
              <button
                key={`${imageUrl}-${index}`}
                type="button"
                onClick={() => openImage(index)}
                aria-label={`View gallery image ${index + 1}`}
                style={{ position: 'relative', padding: 0, minWidth: 0, aspectRatio: '1 / 1', overflow: 'hidden', border: `1px solid ${heroTheme?.accentSoft || '#dbeafe'}`, borderRadius: 8, background: '#f8fafc', cursor: 'pointer' }}
              >
                <img src={imageUrl} alt="" loading="lazy" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                {isOverflowTile ? (
                  <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(15,23,42,0.56)', color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: heroTheme?.bodyFont }}>
                    +{resolvedOverflowCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {galleryLightbox}
    </>
  );
};

export { SimpleHeroGallery };
