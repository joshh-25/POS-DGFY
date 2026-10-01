import { useCallback, useEffect, useRef } from 'react';

export default function PosLineTabNavigation({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = 'Sections',
  idPrefix = 'pos-tab',
  panelId,
  showIcons = true,
  hideScrollbar = false
}) {
  const availableTabs = Array.isArray(tabs) ? tabs : [];
  const tabsViewportRef = useRef(null);
  const activeTabIndex = availableTabs.findIndex((tab) => tab.id === activeTab);
  const getTabId = useCallback((tabId) => (
    typeof idPrefix === 'function' ? idPrefix(tabId) : `${idPrefix}-${tabId}`
  ), [idPrefix]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (activeTabIndex <= 0 || activeTabIndex >= availableTabs.length - 1) return undefined;

    const viewport = tabsViewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return undefined;

    const activeTabElement = document.getElementById(getTabId(activeTab));
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
  }, [activeTab, activeTabIndex, availableTabs.length, getTabId]);

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
      document.getElementById(getTabId(nextTab.id))?.focus();
    });
  };

  return (
    <nav
      ref={tabsViewportRef}
      aria-label={ariaLabel}
      className={`-mx-1 overflow-x-auto min-[1024px]:mx-0 ${hideScrollbar ? 'dgfy-pos-scrollbar-hidden' : ''}`}
    >
      <div role="tablist" aria-orientation="horizontal" className="flex min-w-max items-end gap-3 px-1 min-[1024px]:min-w-0 min-[1024px]:w-full min-[1024px]:gap-0 min-[1024px]:px-0">
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={getTabId(tab.id)}
              type="button"
              role="tab"
              data-testid={tab.testId || undefined}
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              className={[
                'relative inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2',
                'px-2 py-3 text-[14px] font-bold whitespace-nowrap text-[#0F172A] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]',
                'focus-visible:ring-offset-[-2px] sm:px-3 min-[1024px]:flex-1 min-[1024px]:justify-center min-[1024px]:px-2 xl:px-3',
                active
                  ? 'border-[#1A4E8D]'
                  : 'border-transparent hover:border-slate-300'
              ].join(' ')}
            >
              {showIcons && Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
