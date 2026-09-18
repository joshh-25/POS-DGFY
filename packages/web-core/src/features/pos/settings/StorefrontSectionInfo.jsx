import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

export default function StorefrontSectionInfo({ label, panelId, children }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef(null);
  const visible = open || hovered;

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

  return (
    <span
      ref={containerRef}
      className="relative inline-flex shrink-0 align-middle"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setOpen(false); }}
    >
      <button
        type="button"
        aria-label={`More information about ${label}`}
        aria-expanded={visible}
        aria-controls={panelId}
        title={`More information about ${label}`}
        onClick={() => setOpen((current) => !current)}
        className="grid h-5 w-5 place-items-center rounded-full border border-blue-200 bg-blue-50 text-[#1A4E8D] transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      {visible ? (
        <div id={panelId} role="tooltip" className="absolute left-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-[12px] leading-5 text-[#536B8C] shadow-lg shadow-slate-900/10">
          {children}
        </div>
      ) : null}
    </span>
  );
}
