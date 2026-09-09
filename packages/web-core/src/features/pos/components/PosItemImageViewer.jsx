import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const ZOOM_LEVELS = [1, 1.5, 2];

export default function PosItemImageViewer({ preview, onClose }) {
  const gallery = Array.isArray(preview?.gallery) ? preview.gallery : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [imageMetrics, setImageMetrics] = useState(null);
  const imageRef = useRef(null);
  const resizeFrameRef = useRef(null);

  useEffect(() => {
    if (!preview) return undefined;
    setActiveIndex(0);
    setFallbackIndex(0);
    setZoomIndex(0);
    setImageMetrics(null);
    return undefined;
  }, [preview]);

  const activeEntry = gallery[activeIndex] || null;
  const candidates = useMemo(() => (
    activeEntry
      ? [activeEntry.previewSrc, ...(activeEntry.previewFallbacks || [])].filter(Boolean)
      : []
  ), [activeEntry]);
  const activeSrc = candidates[fallbackIndex] || '';
  const zoom = ZOOM_LEVELS[zoomIndex];
  const sellingPrice = Number(preview?.sellingPrice);
  const sellingPriceLabel = Number.isFinite(sellingPrice)
    ? `PHP ${sellingPrice.toFixed(2)}`
    : 'Price unavailable';

  const move = (direction) => {
    if (gallery.length < 2) return;
    setActiveIndex((current) => (current + direction + gallery.length) % gallery.length);
    setFallbackIndex(0);
    setZoomIndex(0);
    setImageMetrics(null);
  };

  useEffect(() => {
    if (!preview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gallery.length, onClose, preview]);

  const canUseZoomLevel = (level) => {
    if (level === 1) return true;
    if (!imageMetrics?.renderedWidth || !imageMetrics?.renderedHeight) return false;
    return imageMetrics.naturalWidth >= imageMetrics.renderedWidth * level
      && imageMetrics.naturalHeight >= imageMetrics.renderedHeight * level;
  };
  const zoomStyle = zoom === 1 || !imageMetrics
    ? undefined
    : {
        width: `${imageMetrics.renderedWidth * zoom}px`,
        height: `${imageMetrics.renderedHeight * zoom}px`,
        maxWidth: 'none',
        maxHeight: 'none'
      };

  useEffect(() => {
    if (!preview || !activeSrc || typeof window === 'undefined') return undefined;

    const requestFrame = window.requestAnimationFrame
      ? (callback) => window.requestAnimationFrame(callback)
      : (callback) => window.setTimeout(callback, 0);
    const cancelFrame = window.cancelAnimationFrame
      ? (frame) => window.cancelAnimationFrame(frame)
      : (frame) => window.clearTimeout(frame);
    const remeasureAfterResize = () => {
      // A zoomed image has explicit pixel dimensions. Reset it before reading
      // the new viewport fit so an orientation change cannot preserve stale
      // dimensions or leave the page horizontally overflowing.
      setZoomIndex(0);
      setImageMetrics(null);
      if (resizeFrameRef.current !== null) cancelFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestFrame(() => {
        resizeFrameRef.current = null;
        const image = imageRef.current;
        if (!image?.naturalWidth || !image?.naturalHeight) return;
        const bounds = image.getBoundingClientRect();
        setImageMetrics({
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          renderedWidth: bounds.width,
          renderedHeight: bounds.height
        });
      });
    };

    window.addEventListener('resize', remeasureAfterResize);
    window.addEventListener('orientationchange', remeasureAfterResize);
    return () => {
      window.removeEventListener('resize', remeasureAfterResize);
      window.removeEventListener('orientationchange', remeasureAfterResize);
      if (resizeFrameRef.current !== null) cancelFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    };
  }, [activeSrc, preview]);

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) onClose(); }} overlayClassName="bg-slate-950/85 backdrop-blur-none">
      <DialogContent
        aria-label={`${preview?.itemName || 'Item'} image preview`}
        className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-950 p-0 shadow-2xl sm:w-[calc(100vw-2rem)]"
      >
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold sm:text-base">{preview?.itemName || 'Item image'}</h2>
              {gallery.length > 1 ? <p className="text-xs text-slate-300">Image {activeIndex + 1} of {gallery.length}</p> : null}
            </div>
            <div className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1.5 text-right">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Selling price</p>
              <p className="text-sm font-bold text-white">{sellingPriceLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
              className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-40"
            ><Minus className="h-5 w-5" /></button>
            <span className="w-12 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoomIndex === ZOOM_LEVELS.length - 1 || !canUseZoomLevel(ZOOM_LEVELS[zoomIndex + 1])}
              onClick={() => setZoomIndex((current) => Math.min(ZOOM_LEVELS.length - 1, current + 1))}
              className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-40"
            ><Plus className="h-5 w-5" /></button>
            <button type="button" aria-label="Close image preview" onClick={onClose} className="ml-1 rounded-lg p-2 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">
          {activeSrc ? (
            <img
              ref={imageRef}
              key={`${activeIndex}-${fallbackIndex}`}
              src={activeSrc}
              alt={`${preview?.itemName || 'Item'} full-size view`}
              className="max-h-[58vh] max-w-full select-none object-contain"
              style={zoomStyle}
              onLoad={(event) => {
                const image = event.currentTarget;
                const bounds = image.getBoundingClientRect();
                setImageMetrics({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, renderedWidth: bounds.width, renderedHeight: bounds.height });
                setZoomIndex(0);
              }}
              onError={() => { setImageMetrics(null); setFallbackIndex((current) => current + 1); }}
            />
          ) : (
            <p className="rounded-lg bg-white/10 px-4 py-3 text-sm text-slate-200">Image preview is unavailable.</p>
          )}
          {gallery.length > 1 ? (
            <>
              <button type="button" aria-label="Previous image" onClick={() => move(-1)} className="absolute left-3 rounded-full bg-black/60 p-3 text-white hover:bg-black/80">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" aria-label="Next image" onClick={() => move(1)} className="absolute right-3 rounded-full bg-black/60 p-3 text-white hover:bg-black/80">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
        </div>

        {gallery.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto border-t border-white/10 p-3">
            {gallery.map((entry, index) => (
              <button
                key={`${entry.previewSrc}-${index}`}
                type="button"
                aria-label={`View image ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => { setActiveIndex(index); setFallbackIndex(0); setZoomIndex(0); setImageMetrics(null); }}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${index === activeIndex ? 'border-blue-400' : 'border-transparent'}`}
              >
                {entry.thumbnailSrc ? <img src={entry.thumbnailSrc} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-white/10 text-xs font-bold text-white">{index + 1}</span>}
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
