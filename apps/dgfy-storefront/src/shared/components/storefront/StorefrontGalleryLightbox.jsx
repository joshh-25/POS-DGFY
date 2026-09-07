import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import './StorefrontGalleryLightbox.css';

// Shared fullscreen viewer for Storefront galleries. It always navigates the
// complete image list supplied by the caller, independent of any inline
// preview or thumbnail cap.
const StorefrontGalleryLightbox = ({
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
      className="storefront-gallery-lightbox"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(event) => {
          stopPropagation(event);
          onClose();
        }}
        aria-label="Close image viewer"
        className="storefront-gallery-lightbox__close"
      >
        <X size={22} />
      </button>

      <div
        data-testid="storefront-gallery-lightbox-frame"
        className="storefront-gallery-lightbox__frame"
        style={{
          '--storefront-gallery-frame-width': 'min(88vw, 1100px)',
          '--storefront-gallery-frame-max-width': 'calc(100vw - 48px)',
          '--storefront-gallery-frame-height': '76vh',
          '--storefront-gallery-frame-max-height': 'calc(100vh - 96px)'
        }}
      >
        {hasMultipleImages && (
          <button
            type="button"
            onClick={(event) => {
              stopPropagation(event);
              onNavigate('previous');
            }}
            aria-label="Previous image"
            className="storefront-gallery-lightbox__nav storefront-gallery-lightbox__nav--previous"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        <img
          key={safeIndex}
          src={activeUrl}
          alt=""
          className="storefront-gallery-lightbox-image"
          onClick={stopPropagation}
        />

        {hasMultipleImages && (
          <button
            type="button"
            onClick={(event) => {
              stopPropagation(event);
              onNavigate('next');
            }}
            aria-label="Next image"
            className="storefront-gallery-lightbox__nav storefront-gallery-lightbox__nav--next"
          >
            <ChevronRight size={24} />
          </button>
        )}

        {hasMultipleImages && (
          <div
            onClick={stopPropagation}
            data-testid="storefront-gallery-lightbox-counter"
            className="storefront-gallery-lightbox__counter"
            aria-live="polite"
          >
            {safeIndex + 1} / {total}
          </div>
        )}
      </div>
    </div>
  );
};

export { StorefrontGalleryLightbox };
