import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export default function StorefrontSectionInfo({ label, panelId, children, portal = false, placement = 'auto', tone = 'blue' }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const visible = open || hovered;
  const isAmber = tone === 'amber';

  useEffect(() => {
    if (!visible) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setHovered(false);
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible]);

  useEffect(() => {
    if (!portal || !visible || typeof window === 'undefined') {
      if (!visible) setTooltipPosition(null);
      return undefined;
    }

    const reposition = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const viewportPadding = 16;
      const boundary = buttonRef.current?.closest('[data-pos-tooltip-boundary]')?.getBoundingClientRect();
      // A left-pointing tooltip may need the space outside a narrow local card
      // to remain fully left of its anchor. Keep the local boundary for the
      // vertical fit, but use the viewport horizontally for that placement.
      const leftAligned = placement === 'left' || placement === 'below-left';
      const horizontalBoundary = leftAligned ? null : boundary;
      const boundaryLeft = horizontalBoundary
        ? Math.max(viewportPadding, horizontalBoundary.left + 8)
        : viewportPadding;
      const boundaryRight = horizontalBoundary
        ? Math.min(window.innerWidth - viewportPadding, horizontalBoundary.right - 8)
        : window.innerWidth - viewportPadding;
      const boundaryTop = boundary
        ? Math.max(viewportPadding, boundary.top + 8)
        : viewportPadding;
      const boundaryBottom = boundary
        ? Math.min(window.innerHeight - viewportPadding, boundary.bottom - 8)
        : window.innerHeight - viewportPadding;
      const tooltipWidth = Math.min(224, Math.max(0, boundaryRight - boundaryLeft));
      const belowTop = anchor.bottom + 8;
      const availableTooltipHeight = placement === 'below-left'
        ? Math.min(boundaryBottom - boundaryTop, window.innerHeight - belowTop - viewportPadding)
        : boundaryBottom - boundaryTop;
      const tooltipHeight = Math.min(128, Math.max(0, availableTooltipHeight));
      const preferredLeft = placement === 'left'
        ? anchor.left - tooltipWidth - 8
        : placement === 'below-left'
          ? anchor.right - tooltipWidth
          : anchor.left;
      const left = Math.min(
        Math.max(boundaryLeft, preferredLeft),
        Math.max(boundaryLeft, boundaryRight - tooltipWidth)
      );
      const top = placement === 'below-left'
        ? belowTop
        : belowTop + tooltipHeight <= boundaryBottom
        ? belowTop
        : Math.max(boundaryTop, anchor.top - tooltipHeight - 8);

      setTooltipPosition({ left, top, width: tooltipWidth, maxHeight: tooltipHeight });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [placement, portal, visible]);

  const tooltipContent = (
    <div
      id={panelId}
      role="tooltip"
      className={`box-border max-w-[calc(100vw-2rem)] overflow-y-auto break-words whitespace-normal rounded-lg border text-left shadow-lg ${isAmber
        ? 'border-amber-200 bg-amber-50 text-amber-800 shadow-amber-900/10'
        : 'border-blue-100 bg-white text-[#536B8C] shadow-slate-900/10'} ${portal
        ? 'max-h-32 w-56 px-2.5 py-2 text-[11px] leading-4'
        : 'w-[min(18rem,calc(100vw-3rem))] px-3 py-2.5 text-[12px] leading-5'}`}
    >
      {children}
    </div>
  );

  return (
    <span
      ref={containerRef}
      className="relative inline-flex shrink-0 align-middle"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        ref={buttonRef}
        aria-label={`More information about ${label}`}
        aria-expanded={visible}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={`grid h-5 w-5 place-items-center rounded-full border transition-colors focus-visible:outline-none ${isAmber
          ? 'focus-visible:ring-2 focus-visible:ring-amber-500'
          : 'focus-visible:ring-2 focus-visible:ring-[#1A4E8D]'} ${open
          ? isAmber
            ? 'border-amber-700 bg-amber-600 text-white hover:bg-amber-700'
            : 'border-[#1A4E8D] bg-[#1A4E8D] text-white hover:bg-[#153E73]'
          : isAmber
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-blue-200 bg-blue-50 text-[#1A4E8D] hover:bg-blue-100'}`}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      {visible && !portal ? <div className="absolute left-0 top-full z-50 mt-2">{tooltipContent}</div> : null}
      {visible && portal && tooltipPosition && typeof document !== 'undefined'
        ? createPortal(
          <div
            style={{ left: tooltipPosition.left, top: tooltipPosition.top, width: tooltipPosition.width, maxHeight: tooltipPosition.maxHeight }}
            className="pointer-events-none fixed z-[10000]"
          >
            {tooltipContent}
          </div>,
          document.body
        )
        : null}
    </span>
  );
}
