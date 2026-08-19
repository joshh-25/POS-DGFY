import { calculateCatalogGridCapacity } from './catalogGridCapacity.js';
import { isSellAvailableCatalogItem } from './posCatalogAvailability.js';
import { resolvePosCatalogImageSources } from './posCheckoutTerminalUtils.js';

export const CATALOG_GRID_GAP_PX = 8;
export const CATALOG_DESKTOP_CARD_HEIGHT_PX = 176;
export const CATALOG_DESKTOP_CARD_MIN_WIDTH_PX = 176;
export const CATALOG_MOBILE_CARD_HEIGHT_PX = 120;
export const CATALOG_TABLET_CARD_HEIGHT_PX = 112;
export const CATALOG_TABLET_CARD_MIN_WIDTH_PX = 160;

export const normalizePosFolders = (rows) => (Array.isArray(rows) ? rows : [])
    .filter((folder) => folder?.show_in_pos_filter !== false)
    .map((folder) => ({
        ...folder,
        folder_id: Number(folder?.folder_id)
    }))
    .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

export const filterAvailableCatalog = (catalog) => (
    (Array.isArray(catalog) ? catalog : []).filter(isSellAvailableCatalogItem)
);

export const filterAvailableCatalogFolders = (folders, availableCatalog) => {
    const safeFolders = Array.isArray(folders) ? folders : [];
    const safeCatalog = Array.isArray(availableCatalog) ? availableCatalog : [];
    return safeFolders.filter((folder) => {
        const folderId = Number(folder?.folder_id);
        if (!Number.isInteger(folderId) || folderId <= 0) return false;
        return safeCatalog.some((item) => Number(item?.folder_id) === folderId);
    });
};

export const filterCatalogByFolder = (catalog, selectedFolderId) => {
    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    if (!selectedFolderId) return safeCatalog;
    return safeCatalog.filter((item) => Number(item?.folder_id) === Number(selectedFolderId));
};

export const getCatalogPageSize = (gridPageSize) => Math.max(1, Number(gridPageSize || 0) * 2);

export const getTotalCatalogPages = (catalogLength, catalogPageSize) => (
    Math.max(1, Math.ceil(Number(catalogLength || 0) / Math.max(1, Number(catalogPageSize || 0))))
);

export const getVisibleCatalogItems = (catalog, catalogPage, catalogPageSize) => {
    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    const pageStart = (Math.max(1, Number(catalogPage || 1)) - 1) * Math.max(1, Number(catalogPageSize || 0));
    return safeCatalog.slice(pageStart, pageStart + Math.max(1, Number(catalogPageSize || 0)));
};

export const getVisibleCatalogRange = (catalogLength, catalogPage, catalogPageSize, visibleItemCount) => {
    if (Number(catalogLength || 0) === 0) return { start: 0, end: 0 };
    const start = (Math.max(1, Number(catalogPage || 1)) - 1) * Math.max(1, Number(catalogPageSize || 0)) + 1;
    return {
        start,
        end: start + Math.max(0, Number(visibleItemCount || 0)) - 1
    };
};

export const getNextCatalogImageUrls = (catalog, catalogPage, catalogPageSize, totalCatalogPages) => {
    if (Number(catalogPage || 1) >= Number(totalCatalogPages || 1)) return [];
    const nextPageStart = Math.max(1, Number(catalogPage || 1)) * Math.max(1, Number(catalogPageSize || 0));
    return Array.from(new Set(
        (Array.isArray(catalog) ? catalog : [])
            .slice(nextPageStart, nextPageStart + Math.max(1, Number(catalogPageSize || 0)))
            .map((item) => resolvePosCatalogImageSources(item).src)
            .filter(Boolean)
    ));
};

export const buildCatalogRequestKey = (search, selectedLocationId) => (
    `${String(search || '').trim()}::${String(selectedLocationId || '')}`
);

export const buildCatalogRequestParams = (search, selectedLocationId) => {
    const params = { search: search || '', limit: 200 };
    if (selectedLocationId) params.location_id = selectedLocationId;
    return params;
};

export const getCatalogGridMeasurement = ({
    width,
    height,
    isMobileViewport,
    isTabletViewport,
    isDgfyPosSurface,
    textSizeScale
}) => {
    const safeTextSizeScale = Number.isFinite(Number(textSizeScale)) ? Number(textSizeScale) : 1;
    const baseMinimumCardWidth = isTabletViewport
        ? CATALOG_TABLET_CARD_MIN_WIDTH_PX
        : CATALOG_DESKTOP_CARD_MIN_WIDTH_PX;
    const minimumCardWidth = isMobileViewport
        ? width
        : Math.round(baseMinimumCardWidth * safeTextSizeScale);
    const baseCardHeight = isMobileViewport
        ? CATALOG_MOBILE_CARD_HEIGHT_PX
        : isDgfyPosSurface && isTabletViewport
            ? CATALOG_TABLET_CARD_HEIGHT_PX
            : CATALOG_DESKTOP_CARD_HEIGHT_PX;
    const cardHeight = Math.round(baseCardHeight * safeTextSizeScale);
    const capacity = calculateCatalogGridCapacity({
        width,
        height,
        minimumCardWidth,
        cardHeight,
        gap: CATALOG_GRID_GAP_PX
    });
    return { ...capacity, minimumCardWidth, cardHeight, textSizeScale: safeTextSizeScale };
};
