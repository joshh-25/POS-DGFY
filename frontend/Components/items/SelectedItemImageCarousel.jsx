import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const buildFileKey = (file, index) => `${file?.name || 'item-image'}-${file?.size || 0}-${index}`;

export default function SelectedItemImageCarousel({
  files = [],
  itemName = 'Item',
  disabled = false,
  onRemove
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedFiles = useMemo(
    () => (Array.isArray(files) ? files.filter(Boolean) : []),
    [files]
  );
  const previews = useMemo(() => {
    const canCreateObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    return normalizedFiles.map((file, index) => ({
      file,
      index,
      key: buildFileKey(file, index),
      url: canCreateObjectUrl ? URL.createObjectURL(file) : ''
    }));
  }, [normalizedFiles]);
  const activeEntry = previews[activeIndex] || previews[0] || null;
  const hasMultipleImages = previews.length > 1;

  useEffect(() => () => {
    previews.forEach((entry) => {
      if (entry.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(entry.url);
      }
    });
  }, [previews]);

  useEffect(() => {
    setActiveIndex((index) => {
      if (previews.length === 0) return 0;
      return Math.min(index, previews.length - 1);
    });
  }, [previews.length]);

  const goToImage = (nextIndex) => {
    if (!hasMultipleImages) return;
    setActiveIndex(((nextIndex % previews.length) + previews.length) % previews.length);
  };

  if (!activeEntry) return null;

  return (
    <div
      className="mt-3 max-w-sm space-y-2"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${itemName} selected image carousel`}
    >
      <div className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
        {activeEntry.url ? (
          <img
            src={activeEntry.url}
            alt={`${itemName} selected image ${activeIndex + 1}`}
            className="h-32 w-full object-cover sm:h-36"
          />
        ) : (
          <div className="grid h-32 place-items-center px-4 text-center text-xs text-slate-500 sm:h-36">
            {activeEntry.file?.name || `Selected image ${activeIndex + 1}`}
          </div>
        )}
        {hasMultipleImages && (
          <>
            <button
              type="button"
              aria-label="Previous selected item image"
              className="absolute left-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-900 shadow-sm hover:bg-white"
              onClick={() => goToImage(activeIndex - 1)}
              disabled={disabled}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next selected item image"
              className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-900 shadow-sm hover:bg-white"
              onClick={() => goToImage(activeIndex + 1)}
              disabled={disabled}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/65 px-2 py-1">
              {previews.map((entry, index) => (
                <button
                  key={`selected-item-carousel-dot-${entry.key}`}
                  type="button"
                  aria-label={`Show selected item image ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
                  onClick={() => goToImage(index)}
                  disabled={disabled}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
          {activeIndex + 1}/{previews.length} {activeEntry.file?.name || 'selected image'}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          onClick={() => onRemove && onRemove(activeIndex)}
          disabled={disabled || !onRemove}
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Remove
        </button>
      </div>
    </div>
  );
}
