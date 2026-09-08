import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { getFolders } from '@/services/itemService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { fetchPosCatalog } from '../services/posService';
import { preserveCatalogRows } from '../services/posCatalogReadCoordinator.js';
import { loadOfflinePosSnapshot, saveOfflinePosSnapshot } from '../services/offlinePosSnapshotStore.js';
import { buildOfflinePosScopeKey } from '../services/offlinePosScope.js';
import {
    loadPosCatalogImageFailures,
    savePosCatalogImageFailures
} from '../services/posCatalogImageFailureStore.js';
import {
    normalizeLowStockDisplayThreshold
} from '../utils/posCatalogAvailability.js';
import { subscribeToPosCatalogUpdates, subscribeToRemotePosCatalogUpdates } from '../utils/posCatalogRefresh.js';
import { getPosTextSizeScale } from '../utils/posTextSizePreference.js';
import { isPosTabletViewport } from '../utils/posTabletViewport.js';
import {
    buildCatalogRequestKey,
    buildCatalogRequestParams,
    CATALOG_DESKTOP_CARD_HEIGHT_PX,
    CATALOG_DESKTOP_CARD_MIN_WIDTH_PX,
    filterAvailableCatalog,
    filterAvailableCatalogFolders,
    filterCatalogByFolder,
    getCatalogGridMeasurement,
    getCatalogPageSize,
    getNextCatalogImageUrls,
    getTotalCatalogPages,
    getVisibleCatalogItems,
    getVisibleCatalogRange,
    normalizePosFolders
} from '../utils/posCatalogWorkflow.js';

export {
    CATALOG_DESKTOP_CARD_HEIGHT_PX,
    CATALOG_DESKTOP_CARD_MIN_WIDTH_PX,
    CATALOG_GRID_GAP_PX,
    CATALOG_MOBILE_CARD_HEIGHT_PX,
    CATALOG_TABLET_CARD_HEIGHT_PX,
    CATALOG_TABLET_CARD_MIN_WIDTH_PX
} from '../utils/posCatalogWorkflow.js';

export const usePosCatalogWorkflow = ({
    sessionLocked = false,
    canViewHistory = true,
    selectedLocationId = null,
    offlineSnapshotScope = {},
    currentViewMode = 'checkout',
    sidebarCollapsed = false,
    isDgfyPosSurface = false,
    receiptSettings = {},
    setReceiptSettings = () => {},
    setLowStockDisplayThreshold = () => {}
} = {}) => {
    const catalogImageFailureScope = useMemo(() => ({
        tenantId: offlineSnapshotScope?.tenantId ?? offlineSnapshotScope?.tenant_id,
        terminalId: offlineSnapshotScope?.terminalId ?? offlineSnapshotScope?.terminal_id,
        locationId: offlineSnapshotScope?.locationId ?? offlineSnapshotScope?.location_id,
        userId: offlineSnapshotScope?.userId ?? offlineSnapshotScope?.user_id
    }), [
        offlineSnapshotScope?.locationId,
        offlineSnapshotScope?.location_id,
        offlineSnapshotScope?.tenantId,
        offlineSnapshotScope?.tenant_id,
        offlineSnapshotScope?.terminalId,
        offlineSnapshotScope?.terminal_id,
        offlineSnapshotScope?.userId,
        offlineSnapshotScope?.user_id
    ]);
    const catalogImageFailureScopeKey = useMemo(
        () => buildOfflinePosScopeKey(catalogImageFailureScope),
        [catalogImageFailureScope]
    );
    const [catalog, setCatalog] = useState([]);
    const [catalogImageErrors, setCatalogImageErrorsState] = useState(
        () => loadPosCatalogImageFailures(catalogImageFailureScope)
    );
    const [catalogError, setCatalogError] = useState('');
    const [posFolders, setPosFolders] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
    const [posFoldersLoading, setPosFoldersLoading] = useState(true);
    const [posFoldersError, setPosFoldersError] = useState('');
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogRefreshing, setCatalogRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    // Keep the controlled search field urgent while the large catalog tree and
    // network query follow at concurrent priority. This is especially visible
    // on the fixed Chrome 80-84 iMin WebView when typing or holding backspace.
    const deferredSearch = useDeferredValue(search);
    const [isTabletViewport, setIsTabletViewport] = useState(false);
    const [catalogPage, setCatalogPage] = useState(1);
    const [catalogCapacityViewport, setCatalogCapacityViewport] = useState(null);
    const [catalogGridLayout, setCatalogGridLayout] = useState({
        columns: 1,
        rows: 1,
        pageSize: 1,
        minimumCardWidth: CATALOG_DESKTOP_CARD_MIN_WIDTH_PX,
        cardHeight: CATALOG_DESKTOP_CARD_HEIGHT_PX,
        textSizeScale: 1
    });

    const catalogSnapshotRef = useRef([]);
    const receiptSettingsSnapshotRef = useRef({});
    const catalogHasLoadedRef = useRef(false);
    const catalogRefreshDebounceRef = useRef(null);
    const catalogRequestInFlightKeyRef = useRef('');
    const catalogRequestSequenceRef = useRef(0);
    const catalogReadRerunRef = useRef(false);
    const loadCatalogRef = useRef(null);
    const catalogSectionRef = useRef(null);
    const catalogViewportRef = useRef(null);
    const folderStripRef = useRef(null);
    const folderStripDragStateRef = useRef(null);
    const folderStripDragMovedRef = useRef(false);
    const catalogGridRef = useRef(null);
    const searchBackspaceTimeoutRef = useRef(null);
    const searchBackspaceIntervalRef = useRef(null);
    const catalogSwipeStartXRef = useRef(null);
    const catalogSwipePointerIdRef = useRef(null);
    const catalogImageFailuresDirtyRef = useRef(false);

    const catalogCapacityViewportRef = useCallback((viewport) => {
        setCatalogCapacityViewport((current) => (current === viewport ? current : viewport));
    }, []);

    const setCatalogImageErrors = useCallback((nextOrUpdater) => {
        setCatalogImageErrorsState((previous) => {
            const next = typeof nextOrUpdater === 'function'
                ? nextOrUpdater(previous)
                : nextOrUpdater;
            catalogImageFailuresDirtyRef.current = true;
            return next instanceof Set ? new Set(next) : new Set(Array.isArray(next) ? next : []);
        });
    }, []);

    useEffect(() => {
        catalogImageFailuresDirtyRef.current = false;
        setCatalogImageErrorsState(loadPosCatalogImageFailures(catalogImageFailureScope));
    }, [catalogImageFailureScope, catalogImageFailureScopeKey]);

    useEffect(() => {
        if (!catalogImageFailuresDirtyRef.current || !catalogImageFailureScopeKey) return;
        savePosCatalogImageFailures(catalogImageFailureScope, catalogImageErrors);
        catalogImageFailuresDirtyRef.current = false;
    }, [catalogImageErrors, catalogImageFailureScope, catalogImageFailureScopeKey]);

    useEffect(() => {
        catalogSnapshotRef.current = catalog;
    }, [catalog]);

    useEffect(() => {
        receiptSettingsSnapshotRef.current = receiptSettings;
    }, [receiptSettings]);

    useEffect(() => {
        if (!sessionLocked) return;
        catalogRequestInFlightKeyRef.current = '';
        catalogRequestSequenceRef.current += 1;
        catalogHasLoadedRef.current = false;
        setCatalog([]);
        setCatalogError('');
        setCatalogLoading(false);
        setCatalogRefreshing(false);
    }, [sessionLocked]);

    const saveCatalogSnapshot = useCallback((
        nextCatalog = catalogSnapshotRef.current,
        nextReceiptSettings = receiptSettingsSnapshotRef.current
    ) => {
        saveOfflinePosSnapshot(offlineSnapshotScope, {
            catalog: Array.isArray(nextCatalog) ? nextCatalog : [],
            receiptSettings: nextReceiptSettings
        });
    }, [offlineSnapshotScope]);

    const loadCatalog = useCallback(async () => {
        if (sessionLocked) {
            catalogRequestInFlightKeyRef.current = '';
            catalogRequestSequenceRef.current += 1;
            setCatalog([]);
            setCatalogError('');
            setCatalogLoading(false);
            setCatalogRefreshing(false);
            return;
        }
        if (!canViewHistory) {
            catalogRequestInFlightKeyRef.current = '';
            catalogRequestSequenceRef.current += 1;
            catalogHasLoadedRef.current = false;
            setCatalog([]);
            setCatalogError('You need POS view permission to load the POS catalog.');
            setCatalogLoading(false);
            setCatalogRefreshing(false);
            return;
        }
        const requestKey = buildCatalogRequestKey(deferredSearch, selectedLocationId);
        if (catalogRequestInFlightKeyRef.current === requestKey) {
            catalogReadRerunRef.current = true;
            return;
        }
        catalogRequestInFlightKeyRef.current = requestKey;
        const requestSequence = catalogRequestSequenceRef.current + 1;
        catalogRequestSequenceRef.current = requestSequence;
        const isInitialLoad = !catalogHasLoadedRef.current;
        setCatalogLoading(isInitialLoad);
        setCatalogRefreshing(!isInitialLoad);
        setCatalogError('');
        try {
            const data = await fetchPosCatalog(buildCatalogRequestParams(deferredSearch, selectedLocationId));
            if (catalogRequestSequenceRef.current !== requestSequence) return;
            setCatalog((previous) => preserveCatalogRows(previous, data || []));
            if (!deferredSearch) {
                saveCatalogSnapshot(data || []);
            }
        } catch (error) {
            if (catalogRequestSequenceRef.current !== requestSequence) return;
            const offlineSnapshot = loadOfflinePosSnapshot(offlineSnapshotScope);
            if (!error?.response && offlineSnapshot?.catalog?.length) {
                setCatalog(offlineSnapshot.catalog);
                setReceiptSettings((current) => Object.keys(current || {}).length > 0
                    ? current
                    : (offlineSnapshot.receipt_settings || {}));
                setLowStockDisplayThreshold(normalizeLowStockDisplayThreshold(
                    offlineSnapshot.receipt_settings?.inventory_low_stock_display_threshold
                ));
                setCatalogError('Offline mode: showing the last synced catalog. Stock is verified again when transactions sync.');
                return;
            }
            const apiMessage = error?.response?.data?.message;
            const message = error?.response?.status === 403
                ? (apiMessage || 'You need POS view permission to load the POS catalog.')
                : (apiMessage || 'Failed to load POS catalog');
            setCatalogError(message);
            toast.error(message);
        } finally {
            if (catalogRequestSequenceRef.current === requestSequence) {
                catalogHasLoadedRef.current = true;
                setCatalogLoading(false);
                setCatalogRefreshing(false);
            }
            if (catalogRequestInFlightKeyRef.current === requestKey) {
                catalogRequestInFlightKeyRef.current = '';
                if (catalogReadRerunRef.current) {
                    catalogReadRerunRef.current = false;
                    void loadCatalogRef.current?.();
                }
            }
        }
    }, [canViewHistory, deferredSearch, offlineSnapshotScope, saveCatalogSnapshot, selectedLocationId, sessionLocked, setLowStockDisplayThreshold, setReceiptSettings]);
    loadCatalogRef.current = loadCatalog;
    useEffect(() => () => {
        catalogRequestSequenceRef.current++;
        catalogReadRerunRef.current = false;
        loadCatalogRef.current = null;
    }, []);

    const loadPosFolders = useCallback(async () => {
        if (sessionLocked) {
            setPosFolders([]);
            setPosFoldersLoading(false);
            setPosFoldersError('');
            return;
        }
        setPosFoldersLoading(true);
        setPosFoldersError('');
        try {
            const rows = await getFolders();
            setPosFolders(normalizePosFolders(rows));
        } catch (error) {
            setPosFolders([]);
            setPosFoldersError(error?.response?.data?.message || 'Failed to load POS categories.');
        } finally {
            setPosFoldersLoading(false);
        }
    }, [sessionLocked]);

    const refreshCatalogAfterInvalidation = useCallback(() => {
        if (catalogRefreshDebounceRef.current) {
            window.clearTimeout(catalogRefreshDebounceRef.current);
        }
        catalogRefreshDebounceRef.current = window.setTimeout(() => {
            catalogRefreshDebounceRef.current = null;
            loadPosFolders();
            loadCatalog();
        }, 150);
    }, [loadCatalog, loadPosFolders]);

    useEffect(() => {
        if (sessionLocked) return;
        loadPosFolders();
    }, [loadPosFolders, sessionLocked]);

    useEffect(() => {
        if (sessionLocked) return undefined;
        return subscribeToPosCatalogUpdates(refreshCatalogAfterInvalidation);
    }, [refreshCatalogAfterInvalidation, sessionLocked]);

    useEffect(() => {
        if (sessionLocked || !canViewHistory) return undefined;
        return subscribeToRemotePosCatalogUpdates();
    }, [canViewHistory, sessionLocked]);

    useEffect(() => {
        if (sessionLocked || !canViewHistory) return undefined;
        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') refreshCatalogAfterInvalidation();
        };
        const refreshWhenOnline = () => refreshCatalogAfterInvalidation();
        const fallbackRefresh = window.setInterval(refreshIfVisible, 60000);
        document.addEventListener('visibilitychange', refreshIfVisible);
        window.addEventListener('online', refreshWhenOnline);
        return () => {
            window.clearInterval(fallbackRefresh);
            document.removeEventListener('visibilitychange', refreshIfVisible);
            window.removeEventListener('online', refreshWhenOnline);
            if (catalogRefreshDebounceRef.current) {
                window.clearTimeout(catalogRefreshDebounceRef.current);
                catalogRefreshDebounceRef.current = null;
            }
        };
    }, [canViewHistory, refreshCatalogAfterInvalidation, sessionLocked]);

    useEffect(() => {
        if (sessionLocked) return undefined;
        const timeout = setTimeout(() => {
            loadCatalog();
        }, 250);
        return () => clearTimeout(timeout);
    }, [loadCatalog, sessionLocked]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const syncTabletViewport = () => {
            setIsTabletViewport(isPosTabletViewport({
                viewportWidth: window.innerWidth,
                isDgfyPosSurface,
                windowObj: window
            }));
        };
        syncTabletViewport();
        window.addEventListener('resize', syncTabletViewport);
        return () => window.removeEventListener('resize', syncTabletViewport);
    }, [isDgfyPosSurface]);

    const catalogPageSize = getCatalogPageSize(catalogGridLayout.pageSize);
    const availableCatalog = useMemo(
        () => filterAvailableCatalog(Array.isArray(catalog) ? catalog : []),
        [catalog]
    );
    const availableCategories = useMemo(
        () => filterAvailableCatalogFolders(Array.isArray(posFolders) ? posFolders : [], availableCatalog),
        [availableCatalog, posFolders]
    );
    const catalogForDisplay = useMemo(
        () => filterCatalogByFolder(availableCatalog, selectedFolderId),
        [availableCatalog, selectedFolderId]
    );
    const totalCatalogPages = useMemo(
        () => getTotalCatalogPages(catalogForDisplay.length, catalogPageSize),
        [catalogForDisplay.length, catalogPageSize]
    );
    const visibleCatalogItems = useMemo(
        () => getVisibleCatalogItems(catalogForDisplay, catalogPage, catalogPageSize),
        [catalogForDisplay, catalogPage, catalogPageSize]
    );
    const nextCatalogImageUrls = useMemo(
        () => getNextCatalogImageUrls(
            catalogForDisplay,
            catalogPage,
            catalogPageSize,
            totalCatalogPages,
            catalogImageErrors
        ),
        [catalogForDisplay, catalogImageErrors, catalogPage, catalogPageSize, totalCatalogPages]
    );
    const visibleCatalogRange = useMemo(
        () => getVisibleCatalogRange(catalogForDisplay.length, catalogPage, catalogPageSize, visibleCatalogItems.length),
        [catalogForDisplay.length, catalogPage, catalogPageSize, visibleCatalogItems.length]
    );

    useEffect(() => {
        if (typeof window === 'undefined' || nextCatalogImageUrls.length === 0) return undefined;

        const preloadNextPageImages = () => {
            nextCatalogImageUrls.forEach((imageUrl) => {
                const image = new window.Image();
                image.decoding = 'async';
                image.fetchPriority = 'low';
                image.src = imageUrl;
            });
        };

        if (typeof window.requestIdleCallback === 'function') {
            const idleCallbackId = window.requestIdleCallback(preloadNextPageImages, { timeout: 1200 });
            return () => window.cancelIdleCallback?.(idleCallbackId);
        }

        const timeoutId = window.setTimeout(preloadNextPageImages, 200);
        return () => window.clearTimeout(timeoutId);
    }, [nextCatalogImageUrls]);

    const handleCatalogPageChange = useCallback((direction) => {
        setCatalogPage((previous) => {
            if (direction === 'previous') {
                return Math.max(1, previous - 1);
            }
            return Math.min(totalCatalogPages, previous + 1);
        });
    }, [totalCatalogPages]);

    const handleCatalogSwipeStart = useCallback((clientX, pointerId = null) => {
        catalogSwipeStartXRef.current = clientX;
        catalogSwipePointerIdRef.current = pointerId;
    }, []);

    const handleCatalogSwipeEnd = useCallback((clientX, pointerId = null) => {
        if (
            pointerId != null
            && catalogSwipePointerIdRef.current != null
            && pointerId !== catalogSwipePointerIdRef.current
        ) {
            return;
        }

        const swipeStartX = catalogSwipeStartXRef.current;
        catalogSwipeStartXRef.current = null;
        catalogSwipePointerIdRef.current = null;

        if (typeof swipeStartX !== 'number') return;

        const deltaX = clientX - swipeStartX;
        const swipeThreshold = 48;
        if (Math.abs(deltaX) < swipeThreshold) return;

        if (deltaX < 0 && catalogPage < totalCatalogPages) {
            handleCatalogPageChange('next');
            return;
        }

        if (deltaX > 0 && catalogPage > 1) {
            handleCatalogPageChange('previous');
        }
    }, [catalogPage, handleCatalogPageChange, totalCatalogPages]);

    const handleFolderStripPointerDown = useCallback((event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;

        const strip = event.currentTarget;
        if (strip.scrollWidth <= strip.clientWidth) return;

        folderStripDragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: strip.scrollLeft,
            hasPointerCapture: false
        };
        folderStripDragMovedRef.current = false;
    }, []);

    const handleFolderStripPointerMove = useCallback((event) => {
        const drag = folderStripDragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - drag.startX;
        if (!folderStripDragMovedRef.current && Math.abs(deltaX) < 4) return;

        folderStripDragMovedRef.current = true;
        if (!drag.hasPointerCapture) {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.hasPointerCapture = true;
        }
        event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX;
        event.preventDefault();
    }, []);

    const handleFolderStripPointerEnd = useCallback((event) => {
        const drag = folderStripDragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        folderStripDragStateRef.current = null;

        if (folderStripDragMovedRef.current && typeof window !== 'undefined') {
            window.setTimeout(() => {
                folderStripDragMovedRef.current = false;
            }, 0);
        }
    }, []);

    const handleFolderStripClickCapture = useCallback((event) => {
        if (!folderStripDragMovedRef.current) return;

        event.preventDefault();
        event.stopPropagation();
        folderStripDragMovedRef.current = false;
    }, []);

    const handleFolderStripWheel = useCallback((event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

        const strip = event.currentTarget;
        const maxScrollLeft = strip.scrollWidth - strip.clientWidth;
        if (maxScrollLeft <= 0) return;

        const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, strip.scrollLeft + event.deltaY));
        if (nextScrollLeft === strip.scrollLeft) return;

        strip.scrollLeft = nextScrollLeft;
        event.preventDefault();
    }, []);

    const toggleFolderFilter = useCallback((folderId) => {
        setSelectedFolderId((previous) => (previous === folderId ? null : folderId));
    }, []);

    const clearSearchBackspaceTimers = useCallback(() => {
        if (searchBackspaceTimeoutRef.current) {
            window.clearTimeout(searchBackspaceTimeoutRef.current);
            searchBackspaceTimeoutRef.current = null;
        }
        if (searchBackspaceIntervalRef.current) {
            window.clearInterval(searchBackspaceIntervalRef.current);
            searchBackspaceIntervalRef.current = null;
        }
    }, []);

    const handleSearchBackspaceStart = useCallback((event) => {
        event.preventDefault();
        if (!search) return;
        setSearch((previous) => (previous ? previous.slice(0, -1) : previous));
        clearSearchBackspaceTimers();
        searchBackspaceTimeoutRef.current = window.setTimeout(() => {
            searchBackspaceIntervalRef.current = window.setInterval(() => {
                setSearch((previous) => {
                    if (!previous) {
                        clearSearchBackspaceTimers();
                        return previous;
                    }
                    return previous.slice(0, -1);
                });
            }, 70);
        }, 280);
    }, [clearSearchBackspaceTimers, search]);

    const handleSearchBackspaceEnd = useCallback(() => {
        clearSearchBackspaceTimers();
    }, [clearSearchBackspaceTimers]);

    useEffect(() => {
        if (typeof window === 'undefined' || currentViewMode !== 'checkout') return undefined;
        const viewport = catalogCapacityViewport;
        if (!viewport) return undefined;

        let animationFrameId = null;
        const measureCapacity = () => {
            animationFrameId = null;
            const width = viewport.clientWidth;
            const height = viewport.clientHeight;
            if (width <= 0 || height <= 0) return;

            const isMobileViewport = window.matchMedia?.('(max-width: 639px)')?.matches === true;
            const textSizeScale = getPosTextSizeScale(
                document.body?.getAttribute('data-pos-text-size')
            );
            const nextLayout = getCatalogGridMeasurement({
                width,
                height,
                isMobileViewport,
                isTabletViewport,
                isDgfyPosSurface,
                textSizeScale
            });

            setCatalogGridLayout((previous) => {
                if (
                    previous.columns === nextLayout.columns
                    && previous.rows === nextLayout.rows
                    && previous.pageSize === nextLayout.pageSize
                    && previous.minimumCardWidth === nextLayout.minimumCardWidth
                    && previous.cardHeight === nextLayout.cardHeight
                    && previous.textSizeScale === nextLayout.textSizeScale
                ) {
                    return previous;
                }
                return nextLayout;
            });
        };
        const scheduleCapacityMeasurement = () => {
            if (animationFrameId !== null) return;
            animationFrameId = window.requestAnimationFrame(measureCapacity);
        };
        const resizeObserver = typeof window.ResizeObserver === 'function'
            ? new window.ResizeObserver(scheduleCapacityMeasurement)
            : null;
        const textSizeObserver = typeof window.MutationObserver === 'function'
            ? new window.MutationObserver(scheduleCapacityMeasurement)
            : null;
        resizeObserver?.observe(viewport);
        textSizeObserver?.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-pos-text-size']
        });
        window.addEventListener('resize', scheduleCapacityMeasurement);
        scheduleCapacityMeasurement();

        return () => {
            resizeObserver?.disconnect();
            textSizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleCapacityMeasurement);
            if (animationFrameId !== null) {
                window.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [catalogCapacityViewport, currentViewMode, isDgfyPosSurface, isTabletViewport, sidebarCollapsed]);

    useEffect(() => {
        setCatalogPage(1);
    }, [catalogGridLayout.columns, catalogGridLayout.rows, catalogGridLayout.textSizeScale, catalogPageSize]);

    useEffect(() => {
        setCatalogPage(1);
    }, [deferredSearch, selectedFolderId, selectedLocationId]);

    useEffect(() => {
        if (catalogPage > totalCatalogPages) {
            setCatalogPage(totalCatalogPages);
        }
    }, [catalogPage, totalCatalogPages]);

    useEffect(() => {
        const viewport = catalogCapacityViewport;
        if (!viewport) return;
        viewport.scrollTo({ top: 0, behavior: 'smooth' });
    }, [catalogCapacityViewport, catalogPage, deferredSearch, selectedFolderId, selectedLocationId]);

    useEffect(() => {
        if (!selectedFolderId) return;
        const stillExists = availableCategories.some((folder) => Number(folder.folder_id) === Number(selectedFolderId));
        if (!stillExists) {
            setSelectedFolderId(null);
        }
    }, [availableCategories, selectedFolderId]);

    useEffect(() => () => {
        if (searchBackspaceTimeoutRef.current) {
            window.clearTimeout(searchBackspaceTimeoutRef.current);
            searchBackspaceTimeoutRef.current = null;
        }
        if (searchBackspaceIntervalRef.current) {
            window.clearInterval(searchBackspaceIntervalRef.current);
            searchBackspaceIntervalRef.current = null;
        }
    }, []);

    return {
        catalog,
        setCatalog,
        catalogImageErrors,
        setCatalogImageErrors,
        catalogError,
        catalogLoading,
        catalogRefreshing,
        posFolders,
        selectedFolderId,
        setSelectedFolderId,
        mobileSearchExpanded,
        setMobileSearchExpanded,
        posFoldersLoading,
        posFoldersError,
        search,
        setSearch,
        isTabletViewport,
        catalogPage,
        setCatalogPage,
        catalogGridLayout,
        catalogSectionRef,
        catalogViewportRef,
        catalogCapacityViewportRef,
        folderStripRef,
        catalogGridRef,
        catalogSwipeStartXRef,
        catalogSwipePointerIdRef,
        availableCatalog,
        availableCategories,
        catalogPageSize,
        catalogForDisplay,
        totalCatalogPages,
        visibleCatalogItems,
        nextCatalogImageUrls,
        visibleCatalogRange,
        loadCatalog,
        loadPosFolders,
        saveCatalogSnapshot,
        refreshCatalogAfterInvalidation,
        handleCatalogPageChange,
        handleCatalogSwipeStart,
        handleCatalogSwipeEnd,
        handleFolderStripPointerDown,
        handleFolderStripPointerMove,
        handleFolderStripPointerEnd,
        handleFolderStripClickCapture,
        handleFolderStripWheel,
        toggleFolderFilter,
        handleSearchBackspaceStart,
        handleSearchBackspaceEnd
    };
};
