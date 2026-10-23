import { useRef } from 'react';
import usePosCenteredTabScroll from '../hooks/usePosCenteredTabScroll.js';

const DESKTOP_GRID_CLASSES = {
  1: 'min-[1200px]:grid-cols-1',
  2: 'min-[1200px]:grid-cols-2',
  3: 'min-[1200px]:grid-cols-3',
  4: 'min-[1200px]:grid-cols-4',
  5: 'min-[1200px]:grid-cols-5',
  6: 'min-[1200px]:grid-cols-6'
};

const SUBTAB_GAP_CLASS = 'gap-2';
const SUBTAB_TOP_SPACING_CLASS = 'sm:-mt-2';
const COMPACT_SUBTAB_TOP_SPACING_CLASS = '-mt-2 sm:-mt-4';

export default function PosSubtabNavigation({
  tabs = [],
  activeTab,
  onTabChange,
  ariaLabel = 'Subsections',
  idPrefix = 'pos-subtab',
  panelId,
  disabled = false,
  desktopColumns = 4,
  compactMobile = false,
  viewportClassName = ''
}) {
  const availableTabs = Array.isArray(tabs) ? tabs : [];
  const tabsViewportRef = useRef(null);
  const activeTabIndex = availableTabs.findIndex((tab) => tab.id === activeTab);
  const requestedDesktopColumns = Number.isInteger(desktopColumns) && desktopColumns > 0
    ? desktopColumns
    : 4;
  const visibleDesktopColumns = Math.max(1, Math.min(availableTabs.length || 1, requestedDesktopColumns));
  const desktopGridClass = DESKTOP_GRID_CLASSES[visibleDesktopColumns] || DESKTOP_GRID_CLASSES[4];
  const topSpacingClass = compactMobile
    ? COMPACT_SUBTAB_TOP_SPACING_CLASS
    : SUBTAB_TOP_SPACING_CLASS;

  const centerActiveTab = usePosCenteredTabScroll(tabsViewportRef, activeTab ? `${idPrefix}-${activeTab}` : '');

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
    <div
      ref={tabsViewportRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`-mx-1 ${topSpacingClass} overflow-x-auto ${compactMobile ? 'pt-2' : ''} ${viewportClassName}`}
    >
      <div className={`flex min-w-max ${SUBTAB_GAP_CLASS} px-1 min-[1200px]:grid min-[1200px]:min-w-0 ${desktopGridClass} min-[1200px]:px-1`}>
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const mobileLabel = tab.mobileLabel;
          return (
            <button
              key={tab.id}
              id={`${idPrefix}-${tab.id}`}
              type="button"
              role="tab"
              aria-label={mobileLabel ? tab.label : undefined}
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              disabled={disabled}
              onClick={() => {
                if (active) centerActiveTab();
                onTabChange(tab.id);
              }}
              className={`inline-flex min-h-10 min-w-36 w-max shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-center text-[13px] font-bold leading-4 shadow-sm transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 focus-visible:ring-offset-1 sm:px-3 min-[1200px]:min-h-9 min-[1200px]:w-full min-[1200px]:shrink min-[1200px]:whitespace-normal min-[1200px]:px-4 min-[1200px]:py-0 ${compactMobile ? 'max-[767px]:min-h-9 max-[767px]:py-1.5' : ''} ${active ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-[#1A4E8D]/20 hover:bg-[#164278]' : 'border-[#9BBBE0] bg-[#F5F9FF] text-[#1A4E8D] hover:border-[#7FA6D6] hover:bg-[#EAF2FF]'} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              {mobileLabel ? (
                <>
                  <span className="min-w-0 min-[1024px]:hidden">{mobileLabel}</span>
                  <span className="hidden min-[1024px]:inline">{tab.label}</span>
                </>
              ) : <span className="min-w-0">{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
