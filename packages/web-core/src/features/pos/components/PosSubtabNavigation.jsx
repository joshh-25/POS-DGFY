import { useEffect, useRef } from 'react';

const DESKTOP_GRID_CLASSES = {
  4: 'min-[1024px]:grid-cols-4',
  5: 'min-[1024px]:grid-cols-5',
  6: 'min-[1024px]:grid-cols-6'
};

export default function PosSubtabNavigation({
  tabs = [],
  activeTab,
  onTabChange,
  ariaLabel = 'Subsections',
  idPrefix = 'pos-subtab',
  panelId,
  disabled = false,
  desktopColumns = 4,
  compactMobile = false
}) {
  const availableTabs = Array.isArray(tabs) ? tabs : [];
  const tabsViewportRef = useRef(null);
  const activeTabIndex = availableTabs.findIndex((tab) => tab.id === activeTab);
  const desktopGridClass = DESKTOP_GRID_CLASSES[desktopColumns] || DESKTOP_GRID_CLASSES[4];

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (activeTabIndex <= 0 || activeTabIndex >= availableTabs.length - 1) return undefined;

    const viewport = tabsViewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return undefined;

    const activeTabElement = document.getElementById(`${idPrefix}-${activeTab}`);
    if (!activeTabElement || !viewport.contains(activeTabElement)) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const viewportRect = viewport.getBoundingClientRect();
      const tabRect = activeTabElement.getBoundingClientRect();
      const tabCenter = tabRect.left - viewportRect.left + viewport.scrollLeft + (tabRect.width / 2);
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, tabCenter - (viewport.clientWidth / 2))),
        behavior: 'smooth'
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, activeTabIndex, availableTabs.length, idPrefix]);

  const handleKeyDown = (event, tabId) => {
    const navigationKeys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!navigationKeys.includes(event.key)) return;
    event.preventDefault();

    const currentIndex = availableTabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0 || availableTabs.length === 0) return;

    const isForwardKey = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const nextIndex = event.key === 'Home'
      ? 0
      : (event.key === 'End'
        ? availableTabs.length - 1
        : (currentIndex + (isForwardKey ? 1 : -1) + availableTabs.length) % availableTabs.length);
    const nextTab = availableTabs[nextIndex];
    onTabChange(nextTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`${idPrefix}-${nextTab.id}`)?.focus();
    });
  };

  return (
    <div ref={tabsViewportRef} role="tablist" aria-label={ariaLabel} className={`-mx-1 overflow-x-auto ${compactMobile ? 'pt-2' : ''}`}>
      <div className={`flex min-w-max gap-2 px-1 min-[1024px]:grid min-[1024px]:min-w-0 ${desktopGridClass} min-[1024px]:px-0`}>
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${idPrefix}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              disabled={disabled}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex min-h-10 min-w-36 w-max shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-center text-[13px] font-bold leading-4 shadow-sm transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 focus-visible:ring-offset-1 ${compactMobile ? 'max-[767px]:min-h-9 max-[767px]:py-1.5' : ''} sm:px-3 min-[1024px]:min-h-9 min-[1024px]:w-full min-[1024px]:shrink min-[1024px]:whitespace-normal min-[1024px]:px-4 min-[1024px]:py-0 ${active ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-[#1A4E8D]/20 hover:bg-[#164278]' : 'border-slate-200 bg-white text-slate-600 hover:border-[#9BBBE0] hover:bg-[#F5F9FF] hover:text-[#1A4E8D]'} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              <span className="min-w-0">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
