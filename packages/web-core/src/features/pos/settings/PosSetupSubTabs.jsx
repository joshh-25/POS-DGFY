import { useEffect, useRef } from 'react';
import { FileText, Monitor, Settings2, ShieldCheck } from 'lucide-react';

const POS_SETUP_SECTIONS = [
  { id: 'business', label: 'Business & Receipts', icon: FileText },
  { id: 'operations', label: 'Operations & Access', icon: Settings2 },
  { id: 'terminals', label: 'Terminals', icon: Monitor },
  { id: 'controls', label: 'Discounts & Automation', icon: ShieldCheck }
];

export default function PosSetupSubTabs({ activeSection, onChange }) {
  const sectionsViewportRef = useRef(null);
  const activeSectionIndex = POS_SETUP_SECTIONS.findIndex((section) => section.id === activeSection);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (activeSectionIndex <= 0 || activeSectionIndex >= POS_SETUP_SECTIONS.length - 1) return undefined;

    const viewport = sectionsViewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return undefined;

    const activeSectionElement = document.getElementById(`pos-setup-tab-${activeSection}`);
    if (!activeSectionElement || !viewport.contains(activeSectionElement)) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const viewportRect = viewport.getBoundingClientRect();
      const sectionRect = activeSectionElement.getBoundingClientRect();
      const sectionCenter = sectionRect.left - viewportRect.left + viewport.scrollLeft + (sectionRect.width / 2);
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, sectionCenter - (viewport.clientWidth / 2))),
        behavior: 'smooth'
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSection, activeSectionIndex]);

  const handleKeyDown = (event) => {
    const currentIndex = POS_SETUP_SECTIONS.findIndex((section) => section.id === activeSection);
    if (currentIndex < 0) return;

    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % POS_SETUP_SECTIONS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + POS_SETUP_SECTIONS.length) % POS_SETUP_SECTIONS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = POS_SETUP_SECTIONS.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    onChange(POS_SETUP_SECTIONS[nextIndex].id);
    requestAnimationFrame(() => {
      document.getElementById(`pos-setup-tab-${POS_SETUP_SECTIONS[nextIndex].id}`)?.focus();
    });
  };

  return (
    <div ref={sectionsViewportRef} role="tablist" aria-label="POS Setup sections" className="-mx-1 overflow-x-auto">
      <div className="flex min-w-max gap-2 px-1 min-[1200px]:grid min-[1200px]:min-w-0 min-[1200px]:grid-cols-4 min-[1200px]:px-0">
        {POS_SETUP_SECTIONS.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              id={`pos-setup-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`pos-setup-panel-${id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={handleKeyDown}
              className={`inline-flex min-h-10 min-w-36 w-max shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-center text-[13px] font-bold leading-4 shadow-sm transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 focus-visible:ring-offset-1 sm:px-3 min-[1200px]:min-h-9 min-[1200px]:w-full min-[1200px]:shrink min-[1200px]:px-4 ${
                isActive
                  ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-[#1A4E8D]/20 hover:bg-[#164278]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-[#9BBBE0] hover:bg-[#F5F9FF] hover:text-[#1A4E8D]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
