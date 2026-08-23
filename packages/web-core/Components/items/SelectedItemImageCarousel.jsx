import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { resolveAssetUrl } from '@/src/utils/assetUrl.js';

const buildFileKey = (file, index) => (
  `${file?.name || 'item-image'}-${file?.size || 0}-${file?.lastModified || 0}-${index}`
);

const buildSavedImageKey = (entry, index) => (
  `saved:${entry?.url || entry?.path || `image-${index}`}`
);

export default function SelectedItemImageCarousel({
  files = [],
  savedGallery = [],
  itemName = 'Item',
  disabled = false,
  showPrimaryToggle = false,
  onRemove,
  onSetSavedPrimary,
  onRemoveSaved,
  onSetPendingPrimary
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [primaryEntryKey, setPrimaryEntryKey] = useState('');
  const normalizedFiles = useMemo(
    () => (Array.isArray(files) ? files.filter(Boolean) : []),
    [files]
  );
  const normalizedSavedGallery = useMemo(
    () => (Array.isArray(savedGallery)
      ? savedGallery.filter((entry) => entry?.url || entry?.path)
      : []),
    [savedGallery]
  );
  const previews = useMemo(() => {
    const canCreateObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    return normalizedFiles.map((file, index) => ({
      kind: 'pending',
      file,
      pendingIndex: index,
      key: `pending:${buildFileKey(file, index)}`,
      label: file?.name || `selected image ${index + 1}`,
      url: canCreateObjectUrl ? URL.createObjectURL(file) : ''
    }));
  }, [normalizedFiles]);
  const savedEntries = useMemo(
    () => normalizedSavedGallery.map((entry, index) => ({
      kind: 'saved',
      savedIndex: index,
      key: buildSavedImageKey(entry, index),
      label: entry?.name || `saved image ${index + 1}`,
      url: resolveAssetUrl(entry?.url || entry?.path)
    })),
    [normalizedSavedGallery]
  );
  const baseEntries = useMemo(
    () => [...savedEntries, ...previews],
    [previews, savedEntries]
  );
  const fallbackPrimaryKey = baseEntries[0]?.key || '';
  const selectedPrimaryKey = baseEntries.some((entry) => entry.key === primaryEntryKey)
    ? primaryEntryKey
    : fallbackPrimaryKey;
  const orderedEntries = selectedPrimaryKey
    ? [
      baseEntries.find((entry) => entry.key === selectedPrimaryKey),
      ...baseEntries.filter((entry) => entry.key !== selectedPrimaryKey)
    ].filter(Boolean)
    : baseEntries;
  const resolvedActiveIndex = orderedEntries.length > 0
    ? Math.min(activeIndex, orderedEntries.length - 1)
    : 0;
  const activeEntry = orderedEntries[resolvedActiveIndex] || null;
  const hasMultipleImages = orderedEntries.length > 1;
  const combinedGallery = normalizedSavedGallery.length > 0;
  const imageLabel = combinedGallery ? 'item' : 'selected item';

  useEffect(() => () => {
    previews.forEach((entry) => {
      if (entry.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(entry.url);
      }
    });
  }, [previews]);

  const goToImage = (nextIndex) => {
    if (!hasMultipleImages) return;
    setActiveIndex(((nextIndex % orderedEntries.length) + orderedEntries.length) % orderedEntries.length);
  };

  const handleSetPrimary = (entry) => {
    if (!entry || entry.key === selectedPrimaryKey) return;
    setPrimaryEntryKey(entry.key);
    setActiveIndex(0);
    if (entry.kind === 'saved') {
      onSetSavedPrimary && onSetSavedPrimary(entry.savedIndex);
    } else {
      onSetPendingPrimary && onSetPendingPrimary(entry.file, entry.pendingIndex);
    }
  };

  const handleRemoveCurrent = () => {
    if (!activeEntry) return;
    if (activeEntry.kind === 'saved') {
      onRemoveSaved && onRemoveSaved(activeEntry.savedIndex);
      return;
    }
    onRemove && onRemove(activeEntry.pendingIndex);
  };

  if (!activeEntry) return null;

  const isPrimary = activeEntry.key === selectedPrimaryKey;
  const canRemoveCurrent = activeEntry.kind === 'saved' ? Boolean(onRemoveSaved) : Boolean(onRemove);
  const activeImageLabel = activeEntry.kind === 'saved'
    ? `${itemName} storefront image ${resolvedActiveIndex + 1}`
    : `${itemName} selected image ${resolvedActiveIndex + 1}`;

  return (
    <div
      className="mt-3 max-w-md space-y-2"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${itemName} ${combinedGallery ? 'item image gallery' : 'selected image carousel'}`}
    >
      <div className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
        {activeEntry.url ? (
          <img
            src={activeEntry.url}
            alt={activeImageLabel}
            className="h-32 w-full object-cover sm:h-36"
          />
        ) : (
          <div className="grid h-32 place-items-center px-4 text-center text-xs text-slate-500 sm:h-36">
            {activeEntry.label}
          </div>
        )}
        {hasMultipleImages && (
          <>
            <button
              type="button"
              aria-label={`Previous ${imageLabel} image`}
              className="absolute left-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-900 shadow-sm hover:bg-white"
              onClick={() => goToImage(resolvedActiveIndex - 1)}
              disabled={disabled}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Next ${imageLabel} image`}
              className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-900 shadow-sm hover:bg-white"
              onClick={() => goToImage(resolvedActiveIndex + 1)}
              disabled={disabled}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/65 px-2 py-1">
              {orderedEntries.map((entry, index) => (
                <button
                  key={`selected-item-carousel-dot-${entry.key}`}
                  type="button"
                  aria-label={`Show ${imageLabel} image ${index + 1}`}
                  aria-current={index === resolvedActiveIndex ? 'true' : undefined}
                  className={`h-1.5 rounded-full transition-all ${index === resolvedActiveIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
                  onClick={() => goToImage(index)}
                  disabled={disabled}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {hasMultipleImages && (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label={`${combinedGallery ? 'Item' : 'Selected item'} image thumbnails`}
        >
          {orderedEntries.map((entry, index) => (
            <button
              key={`selected-item-carousel-thumb-${entry.key}`}
              type="button"
              aria-label={`Focus ${imageLabel} image ${index + 1}`}
              aria-current={index === resolvedActiveIndex ? 'true' : undefined}
              className={`relative h-14 w-16 flex-shrink-0 overflow-hidden rounded-md border bg-white text-[10px] text-slate-500 transition ${index === resolvedActiveIndex ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300'}`}
              onClick={() => setActiveIndex(index)}
              disabled={disabled}
            >
              {entry.url ? (
                <img
                  src={entry.url}
                  alt=""
                  className="h-full w-full object-cover"
                  aria-hidden="true"
                />
              ) : (
                <span className="flex h-full items-center justify-center px-1 text-center">
                  {index + 1}
                </span>
              )}
              {showPrimaryToggle && entry.key === selectedPrimaryKey ? (
                <span className="absolute left-0.5 top-0.5 rounded bg-teal-600 px-1 text-[8px] font-bold text-white">Primary</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {showPrimaryToggle ? (
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <Switch
              checked={isPrimary}
              onCheckedChange={(checked) => {
                if (checked) handleSetPrimary(activeEntry);
              }}
              disabled={disabled || isPrimary}
              aria-label={`Make item image ${resolvedActiveIndex + 1} primary`}
              className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&[aria-checked=true]>span]:translate-x-4"
            />
            <span>Primary</span>
          </label>
        ) : null}
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          onClick={handleRemoveCurrent}
          disabled={disabled || !canRemoveCurrent}
          aria-label={`${combinedGallery ? 'Remove item image' : 'Remove selected item image'} ${resolvedActiveIndex + 1}`}
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Remove current image
        </button>
      </div>
      {combinedGallery && showPrimaryToggle ? (
        <p className="text-[10px] text-slate-400">Choose Primary on any image. The selected image will be used first in POS and Storefront.</p>
      ) : null}
    </div>
  );
}
