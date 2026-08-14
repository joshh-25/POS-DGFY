import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveAssetUrl } from '@/src/utils/assetUrl.js';

const normalizeGalleryEntryKey = (entry, index) => `${entry?.url || entry?.path || 'storefront-image'}-${index}`;

export default function StorefrontImageCarousel({
  gallery = [],
  itemName = 'Item',
  variant = 'wizard',
  onSetPrimary,
  onRemove
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedGallery = useMemo(
    () => (Array.isArray(gallery) ? gallery.filter((entry) => entry?.url || entry?.path) : []),
    [gallery]
  );
  const activeEntry = normalizedGallery[activeIndex] || normalizedGallery[0] || null;
  const hasMultipleImages = normalizedGallery.length > 1;
  const isTableVariant = variant === 'table';

  useEffect(() => {
    setActiveIndex((index) => {
      if (normalizedGallery.length === 0) return 0;
      return Math.min(index, normalizedGallery.length - 1);
    });
  }, [normalizedGallery.length]);

  const goToImage = (nextIndex) => {
    if (!hasMultipleImages) return;
    setActiveIndex(((nextIndex % normalizedGallery.length) + normalizedGallery.length) % normalizedGallery.length);
  };

  if (!activeEntry) {
    return <span className="text-xs text-slate-500">No image</span>;
  }

  return (
    <div
      className={isTableVariant ? 'w-24 space-y-1' : 'max-w-sm space-y-2'}
      role={hasMultipleImages ? 'region' : undefined}
      aria-roledescription={hasMultipleImages ? 'carousel' : undefined}
      aria-label={hasMultipleImages ? `${itemName} item image carousel` : undefined}
    >
      <div className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
        <img
          src={resolveAssetUrl(activeEntry.url || activeEntry.path)}
          alt={`${itemName} storefront image ${activeIndex + 1}`}
          className={isTableVariant ? 'h-16 w-24 object-cover' : 'h-32 w-full object-cover sm:h-36'}
        />
        {activeIndex === 0 && (
          <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Primary
          </span>
        )}
        {hasMultipleImages && (
          <>
            <button
              type="button"
              aria-label="Previous item image"
              className="absolute left-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-900 shadow-sm hover:bg-white"
              onClick={() => goToImage(activeIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next item image"
              className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-900 shadow-sm hover:bg-white"
              onClick={() => goToImage(activeIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/65 px-2 py-1">
              {normalizedGallery.map((entry, index) => (
                <button
                  key={`item-carousel-dot-${normalizeGalleryEntryKey(entry, index)}`}
                  type="button"
                  aria-label={`Show item image ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
                  onClick={() => goToImage(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 text-[11px] text-slate-500">
          {activeIndex + 1}/{normalizedGallery.length}
        </span>
        {activeIndex > 0 && (
          <button
            type="button"
            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
            onClick={() => onSetPrimary && onSetPrimary(activeIndex)}
            disabled={!onSetPrimary}
          >
            Set first
          </button>
        )}
        <button
          type="button"
          className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
          onClick={() => onRemove && onRemove(activeIndex)}
          disabled={!onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
