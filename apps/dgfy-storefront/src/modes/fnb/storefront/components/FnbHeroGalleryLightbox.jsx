import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const navButtonStyle = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(255, 255, 255, 0.16)',
  color: '#ffffff',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer'
};

// Shared fullscreen viewer for the FNB hero gallery, used by both the mobile
// merged hero image and the desktop 4-tile grid. Always navigates the full,
// unsliced image list (galleryImagesFull), independent of the 4-tile preview
// cap used for the inline grids/thumbnails.
const FnbHeroGalleryLightbox = ({
  currentIndex,
  images,
  onClose,
  onNavigate,
  open
}) => {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onNavigate('previous');
      if (event.key === 'ArrowRight') onNavigate('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, open]);

  if (!open || !Array.isArray(images) || images.length === 0) return null;

  const total = images.length;
  const safeIndex = ((currentIndex % total) + total) % total;
  const activeUrl = images[safeIndex];
  const hasMultipleImages = total > 1;

  const stopPropagation = (event) => event.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Store gallery viewer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2200,
        background: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          stopPropagation(event);
          onClose();
        }}
        aria-label="Close image viewer"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.16)',
          color: '#ffffff',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer'
        }}
      >
        <X size={22} />
      </button>

      {hasMultipleImages && (
        <button
          type="button"
          onClick={(event) => {
            stopPropagation(event);
            onNavigate('previous');
          }}
          aria-label="Previous image"
          style={{ ...navButtonStyle, left: 12 }}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {hasMultipleImages && (
        <button
          type="button"
          onClick={(event) => {
            stopPropagation(event);
            onNavigate('next');
          }}
          aria-label="Next image"
          style={{ ...navButtonStyle, right: 12 }}
        >
          <ChevronRight size={24} />
        </button>
      )}

      <div
        onClick={stopPropagation}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 64px',
          boxSizing: 'border-box',
          pointerEvents: 'none'
        }}
      >
        <img
          key={safeIndex}
          src={activeUrl}
          alt=""
          className="fnb-gallery-lightbox-image"
          style={{
            maxWidth: '100%',
            maxHeight: '80vh',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            borderRadius: 12,
            pointerEvents: 'auto'
          }}
        />
      </div>

      {hasMultipleImages && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 700,
            background: 'rgba(255, 255, 255, 0.16)',
            padding: '4px 12px',
            borderRadius: 999
          }}
        >
          {safeIndex + 1} / {total}
        </div>
      )}
    </div>
  );
};

export { FnbHeroGalleryLightbox };
