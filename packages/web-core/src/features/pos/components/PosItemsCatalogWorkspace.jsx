import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, ListPlus, SlidersHorizontal, Tags } from 'lucide-react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import CategoryManagementWorkspace from './PosItemsCategoryManagementWorkspace.jsx';
import PosLineTabNavigation from './PosLineTabNavigation.jsx';
import { POS_MOBILE_STICKY_TAB_ROW_CLASS } from './PosPageSpacing.js';

const PosServicesOperationsWorkspace = lazyWithChunkRetry(() => import('./PosServicesOperationsWorkspace.jsx'));
const PosFnbModifiersWorkspace = lazyWithChunkRetry(() => import('./PosFnbModifiersWorkspace.jsx'));
const PosServiceOptionsWorkspace = lazyWithChunkRetry(() => import('./PosServiceOptionsWorkspace.jsx'));

export default function ItemsCatalogWorkspace({
  itemsWorkspaceComponent: ItemsWorkspaceComponent,
  canViewPos = false,
  canViewItems = null,
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
  const effectiveCanViewItems = canViewItems == null ? canViewPos : canViewItems;
  const canViewCatalog = effectiveCanViewItems || catalogOnlyAccess;
  const availableTabs = useMemo(() => [
    ...(canViewCatalog ? [{ id: 'items', label: 'Items', icon: ClipboardList }] : []),
    ...(canManageCategories ? [{ id: 'categories', label: 'Categories', icon: Tags }] : []),
    ...(!catalogOnlyAccess && normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'services' && canManageServiceOptions
      ? [{ id: 'service-options', label: 'Service add-ons', mobileLabel: 'Add-ons', icon: SlidersHorizontal }]
      : []),
    ...(!catalogOnlyAccess && normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'fnb' && canViewFnbModifiers
      ? [{ id: 'fnb-modifiers', label: 'Item Options & Modifiers', mobileLabel: 'Options', icon: ListPlus }]
      : []),
    ...(!catalogOnlyAccess && normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'services' && Object.values(serviceOperationsPermissions).some(Boolean)
      ? [{ id: 'service-operations', label: 'Service operations', mobileLabel: 'Operations', icon: CalendarDays }]
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
        <div
          data-testid="pos-items-sticky-tabs"
          className={`min-w-0 ${POS_MOBILE_STICKY_TAB_ROW_CLASS} max-[767px]:mb-3`}
        >
          <PosLineTabNavigation
            tabs={availableTabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            ariaLabel="Items workspace navigation"
            idPrefix="pos-items-tab"
            panelId={`pos-items-${visibleTab || 'unavailable'}-panel`}
            hideScrollbar
            mobileGridColumns={availableTabs.length}
          />
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
            canViewItems={effectiveCanViewItems}
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
