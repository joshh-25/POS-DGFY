import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, ListPlus, SlidersHorizontal, Tags } from 'lucide-react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import CategoryManagementWorkspace from './PosItemsCategoryManagementWorkspace.jsx';

const PosServicesOperationsWorkspace = lazyWithChunkRetry(() => import('./PosServicesOperationsWorkspace.jsx'));
const PosFnbModifiersWorkspace = lazyWithChunkRetry(() => import('./PosFnbModifiersWorkspace.jsx'));
const PosServiceOptionsWorkspace = lazyWithChunkRetry(() => import('./PosServiceOptionsWorkspace.jsx'));

export default function ItemsCatalogWorkspace({
  itemsWorkspaceComponent: ItemsWorkspaceComponent,
  canViewPos = false,
  catalogOnlyAccess = false,
  effectiveCapabilities = [],
  canManageCategories = false,
  canManageServiceCatalog = false,
  canManageServiceOptions = false,
  canViewFnbModifiers = false,
  canManageFnbModifiers = false,
  locations = [],
  locationsLoading = false,
  serviceOperationsPermissions = {},
  shiftState,
  activeTerminalId = '',
  operatingLocationId = null,
  isOnline = true,
  sectionId,
  ...itemsWorkspaceProps
}) {
  const canViewCatalog = canViewPos || catalogOnlyAccess;
  const availableTabs = useMemo(() => [
    ...(canViewCatalog ? [{ id: 'items', label: 'Items', icon: ClipboardList }] : []),
    ...(canManageCategories ? [{ id: 'categories', label: 'Categories', icon: Tags }] : []),
    ...(!catalogOnlyAccess && normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'services' && canManageServiceOptions
      ? [{ id: 'service-options', label: 'Service add-ons', icon: SlidersHorizontal }]
      : []),
    ...(!catalogOnlyAccess && normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'fnb' && canViewFnbModifiers
      ? [{ id: 'fnb-modifiers', label: 'Item Options & Modifiers', icon: ListPlus }]
      : []),
    ...(!catalogOnlyAccess && normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'services' && Object.values(serviceOperationsPermissions).some(Boolean)
      ? [{ id: 'service-operations', label: 'Service operations', icon: CalendarDays }]
      : [])
  ], [canManageCategories, canManageServiceOptions, canViewCatalog, canViewFnbModifiers, catalogOnlyAccess, itemsWorkspaceProps.workflowMode, serviceOperationsPermissions]);
  const defaultTab = canViewCatalog ? 'items' : 'categories';
  const [selectedTab, setSelectedTab] = useState(defaultTab);
  const [renderedTab, setRenderedTab] = useState(defaultTab);
  const [paneInlineStyle, setPaneInlineStyle] = useState({
    opacity: 1,
    transition: 'transform 150ms ease, opacity 150ms ease'
  });
  const animationTimersRef = useRef([]);
  const activeTab = availableTabs.some((tab) => tab.id === selectedTab)
    ? selectedTab
    : (availableTabs[0]?.id || '');
  const isIminRuntime = isIminWrapperRuntime();
  const visibleTab = availableTabs.some((tab) => tab.id === renderedTab)
    ? renderedTab
    : activeTab;
  const isItemsTab = visibleTab === 'items';
  const isFnbModifiersTab = visibleTab === 'fnb-modifiers';

  const resolveTabIndex = useCallback((tabId) => (
    availableTabs.findIndex((tab) => tab.id === tabId)
  ), [availableTabs]);

  const clearAnimationTimers = useCallback(() => {
    animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    animationTimersRef.current = [];
  }, []);

  useEffect(() => () => clearAnimationTimers(), [clearAnimationTimers]);

  useEffect(() => {
    if (!activeTab || availableTabs.some((tab) => tab.id === renderedTab)) return;
    clearAnimationTimers();
    setRenderedTab(activeTab);
    setPaneInlineStyle({ opacity: 1, transition: 'none' });
  }, [activeTab, availableTabs, clearAnimationTimers, renderedTab]);

  const handleTabChange = useCallback((nextTab) => {
    if (!nextTab || nextTab === activeTab) return;
    clearAnimationTimers();

    if (isIminRuntime) {
      setSelectedTab(nextTab);
      setRenderedTab(nextTab);
      setPaneInlineStyle({ opacity: 1, transition: 'none' });
      return;
    }

    const movingForward = resolveTabIndex(nextTab) > resolveTabIndex(activeTab);
    const exitOffset = movingForward ? -28 : 28;
    const enterOffset = movingForward ? 28 : -28;

    setSelectedTab(nextTab);
    setPaneInlineStyle({
      transform: `translateX(${exitOffset}px)`,
      opacity: 0,
      transition: 'transform 150ms ease, opacity 150ms ease'
    });

    const swapTimer = window.setTimeout(() => {
      setRenderedTab(nextTab);
      setPaneInlineStyle({
        transform: `translateX(${enterOffset}px)`,
        opacity: 0,
        transition: 'none'
      });

      const enterTimer = window.setTimeout(() => {
        setPaneInlineStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: 'transform 150ms ease, opacity 150ms ease'
        });

        const settleTimer = window.setTimeout(() => {
          setPaneInlineStyle({ opacity: 1, transition: 'none' });
        }, 150);
        animationTimersRef.current.push(settleTimer);
      }, 16);

      animationTimersRef.current.push(enterTimer);
    }, 150);

    animationTimersRef.current.push(swapTimer);
  }, [activeTab, clearAnimationTimers, isIminRuntime, resolveTabIndex]);

  const handleTabKeyDown = useCallback((event, tabId) => {
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
    handleTabChange(nextTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`pos-items-tab-${nextTab.id}`)?.focus();
    });
  }, [availableTabs, handleTabChange]);

  if (availableTabs.length === 0) {
    return (
      <p id={sectionId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You need POS view or category-management permission to access Items.
      </p>
    );
  }

  return (
    <div id={sectionId} className="pos-items-catalog-workspace flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-4 overflow-hidden">
      {availableTabs.length > 1 ? (
        <div className="pos-items-mobile-tab-strip -mx-1 overflow-x-auto border-b border-slate-200">
          <div
            role="tablist"
            aria-label="Items workspace navigation"
            className="pos-items-mobile-tab-list -mb-px flex min-w-max items-end gap-3 px-1 min-[1200px]:min-w-0 min-[1200px]:w-full min-[1200px]:gap-0 min-[1200px]:px-0"
          >
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`pos-items-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={active ? `pos-items-${tab.id}-panel` : undefined}
                  tabIndex={active ? 0 : -1}
                  onClick={() => handleTabChange(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                  className={`pos-items-mobile-tab relative inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-[14px] font-bold whitespace-nowrap text-[#0F172A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-[-2px] sm:px-3 min-[1200px]:flex-1 min-[1200px]:justify-center min-[1200px]:px-2 xl:px-3 ${
                    active ? 'border-[#1A4E8D]' : 'border-transparent hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        id={`pos-items-${visibleTab || 'unavailable'}-panel`}
        role={availableTabs.length > 1 ? 'tabpanel' : 'region'}
        aria-labelledby={availableTabs.length > 1 && visibleTab ? `pos-items-tab-${visibleTab}` : undefined}
        aria-label={availableTabs.length === 1 ? availableTabs[0].label : undefined}
        style={paneInlineStyle}
        className={isItemsTab || visibleTab === 'categories' || isFnbModifiersTab
          ? 'flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden'
          : 'dgfy-pos-scroll-region min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y'}
      >
        {visibleTab === 'categories' ? (
          isOnline ? (
            <CategoryManagementWorkspace />
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-bold">Category management is available online only.</p>
              <p className="mt-1">Reconnect to create, edit, activate, deactivate, delete, or reassign categories.</p>
            </div>
          )
        ) : visibleTab === 'service-options' ? (
          <Suspense fallback={null}>
            <PosServiceOptionsWorkspace
              isOnline={isOnline}
              canManageServiceOptions={canManageServiceOptions}
              sectionId={`pos-items-${visibleTab}-panel`}
            />
          </Suspense>
        ) : visibleTab === 'fnb-modifiers' ? (
          <Suspense fallback={null}>
            <PosFnbModifiersWorkspace
              isOnline={isOnline}
              canManage={canManageFnbModifiers}
              locations={locations}
              operatingLocationId={operatingLocationId}
              locationsLoading={locationsLoading}
              sectionId={`pos-items-${visibleTab}-panel`}
            />
          </Suspense>
        ) : visibleTab === 'service-operations' ? (
          <Suspense fallback={null}>
            <PosServicesOperationsWorkspace
              permissions={serviceOperationsPermissions}
              isOnline={isOnline}
              settlementContext={{ shiftId: shiftState?.shift?.pos_terminal_shift_id, terminalId: activeTerminalId, locationId: shiftState?.shift?.location_id || operatingLocationId }}
            />
          </Suspense>
        ) : (
          <ItemsWorkspaceComponent
            {...itemsWorkspaceProps}
            canViewPos={canViewPos}
            catalogOnlyAccess={catalogOnlyAccess}
            effectiveCapabilities={effectiveCapabilities}
            canManageCategories={canManageCategories}
            canManageServiceCatalog={canManageServiceCatalog}
            canManageFnbModifiers={canManageFnbModifiers}
            operatingLocationId={operatingLocationId}
            availableLocations={locations}
            locationsLoading={locationsLoading}
            isOnline={isOnline}
          />
        )}
      </div>
    </div>
  );
}
