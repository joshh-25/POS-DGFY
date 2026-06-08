import React, { useDeferredValue, useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, LayoutGrid, List, Package, Loader2, Clock, Check, X, ArrowUpDown, ArrowLeft, Folder, ListChecks, Info } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ItemCard from '@/components/items/ItemCard';
import ItemDetailsModal from '@/components/items/ItemDetailsModal';
import ItemFormModal from '@/components/items/ItemFormModal';
import ProductCreateWizard from '@/components/products/ProductCreateWizard';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import CSVImportModal from '@/components/items/CSVImportModal';
import ImportExportModal from '@/components/items/ImportExportModal';
import CSVExportModal from '@/components/items/CSVExportModal';
import { getStockStatus } from '@/components/data/dummyData';
import {
  useInventoryItems,
  useInventoryCreateItem,
  useInventoryUpdateItem,
  useInventoryDeleteItem,
  useInventoryCreateItemDraft,
  useInventoryFinalizeItem,
  useInventoryFolders,
  getInventoryItemById,
  deleteInventoryFolder
} from '@/src/features/inventory';
import { getCurrentUser } from '@/services/userService.js';
import { toast } from 'sonner';
import { cn } from "@/lib/utils.js";
import { formatNumber } from '@/lib/numberUtils.js';
import { getNextExpiryDate, getDaysUntilExpiry } from '@/components/utils/expiryHelpers.js';
import { getMsmeCategoryView, isManufactured, getEffectiveCategory } from '@/components/utils/categoryHelpers';
import { calculateTotalProductCost } from '@/components/items/details/helpers';
import FolderCard from '@/components/items/FolderCard';
import CreateFolderCard from '@/components/items/CreateFolderCard';
import MoveToFolderModal from '@/components/items/MoveToFolderModal';
import { useItemSelection } from '@/hooks/useItemSelection';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { usePermission } from '@/hooks/usePermission';
import { normalizeApiError } from '@/src/utils/errorHandler.js';
import { resolveAssetUrl } from '@/src/utils/assetUrl.js';
import { useNavigate } from 'react-router-dom';
import {
  getPosCatalogOverrides,
  updatePosCatalogOverride,
  updateBulkPosCatalogOverrides,
  uploadPosCatalogImage,
  uploadBulkPosCatalogImages,
  deletePosCatalogImage,
  POS_READINESS_INCOMPLETE
} from '@/services/posCatalogService.js';
import {
  getStorefrontCatalogOverrides,
  updateStorefrontCatalogOverride,
  updateBulkStorefrontCatalogOverrides,
  uploadStorefrontCatalogImage,
  uploadStorefrontCatalogImages,
  updateStorefrontCatalogGallery,
  deleteStorefrontCatalogGalleryImage,
  uploadBulkStorefrontCatalogImages,
  deleteStorefrontCatalogImage
} from '@/services/storefrontCatalogService.js';
import { replaceItemSuppliers } from '@/src/services/itemService.js';
import { useWorkflowMode } from '@/src/features/settings/WorkflowModeContext.jsx';
import { isMsmeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import {
  hasExplicitSalePrice,
  isPureServiceItem,
  resolveItemFinancialPolicy
} from '@/src/features/inventory/itemFinancialPolicy.js';

const MSME_ITEM_PRESET = Object.freeze({
  SELLABLE_POS: 'sellable_pos',
  INVENTORY_ONLY: 'inventory_only'
});

const MSME_RESTRICTED_CATEGORY_FILTERS = new Set(['raw_material', 'packaging', 'finished_goods', 'work_in_progress']);

export default function Items() {
  const navigate = useNavigate();
  const { items, loading, error, refetch } = useInventoryItems({ limit: 1000 });
  const { items: skuSeedItems = [] } = useInventoryItems({ fields: 'dropdown', limit: 10000 });
  const { createItem } = useInventoryCreateItem();
  const { updateItem } = useInventoryUpdateItem();
  const { deleteItem, loading: deleting } = useInventoryDeleteItem();
  const { createItemDraft } = useInventoryCreateItemDraft();
  const {
    can,
    tenantPlan,
    loading: permissionsLoading,
    canCreate,
    canEdit,
    canDelete: canDeletePermission,
    canImport: canImportPermission,
    canExport: canExportPermission
  } = usePermission();
  const { workflowMode } = useWorkflowMode();
  const isMsmeMode = isMsmeWorkflowMode(workflowMode);
  const skuSuggestionItems = useMemo(() => {
    const mergedById = new Map();
    [...items, ...skuSeedItems].forEach((item) => {
      const key = item?.item_id ?? item?.id ?? `sku-${item?.sku_code ?? ''}-${item?.name ?? ''}`;
      mergedById.set(key, item);
    });
    return Array.from(mergedById.values());
  }, [items, skuSeedItems]);

  const { finalizeItem } = useInventoryFinalizeItem();
  const {
    folders: apiFolders,
    createFolder: createApiFolder,
    updateFolder: updateApiFolder,
    refetch: refetchFolders
  } = useInventoryFolders();

  // Helper to load initial state from localStorage or defaults
  const getInitialState = (key, defaultValue) => {
    const saved = localStorage.getItem(`items_${key}`);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  };

  // Helper to load initial state specifically for filters that might be overridden by URL params
  const getInitialFilterState = (key, defaultValue, urlParamName = null, urlParamValue = null, mappedValue = null) => {
    // Check URL params first
    if (urlParamName) {
      const params = new URLSearchParams(window.location.search);
      const paramValue = params.get(urlParamName);
      if (paramValue === urlParamValue) {
        return mappedValue || paramValue;
      }
    }

    // Then check local storage
    const saved = localStorage.getItem(`items_${key}`);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  };

  const [searchQuery, setSearchQuery] = useState(() => getInitialState('searchQuery', ''));
  const [categoryFilter, setCategoryFilter] = useState(() => getInitialState('categoryFilter', 'all'));

  // Status filter can be set via URL ?filter=low
  const [statusFilter, setStatusFilter] = useState(() =>
    getInitialFilterState('statusFilter', 'all', 'filter', 'low', 'critical')
  );

  // FIFO filter can be set via URL ?filter=expiring
  const [fifoFilter, setFifoFilter] = useState(() =>
    getInitialFilterState('fifoFilter', 'all', 'filter', 'expiring', 'expiring')
  );

  const [sortBy, setSortBy] = useState(() => getInitialState('sortBy', 'name'));
  const [viewMode, setViewMode] = useState(() => getInitialState('viewMode', 'grid'));
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showProductWizard, setShowProductWizard] = useState(false);
  const [msmeItemPreset, setMsmeItemPreset] = useState(MSME_ITEM_PRESET.INVENTORY_ONLY);
  const [activeCreatePreset, setActiveCreatePreset] = useState(MSME_ITEM_PRESET.INVENTORY_ONLY);
  const [folderFilter, setFolderFilter] = useState(() => getInitialState('folderFilter', 'all'));
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteErrors, setDeleteErrors] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [currentFolder, setCurrentFolder] = useState(() => getInitialState('currentFolder', null));
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [showFolderDeleteDialog, setShowFolderDeleteDialog] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [posCatalogOverrides, setPosCatalogOverrides] = useState({});
  const [storefrontCatalogOverrides, setStorefrontCatalogOverrides] = useState({});
  const [showPosChecklistModal, setShowPosChecklistModal] = useState(false);
  const [posChecklistSearch, setPosChecklistSearch] = useState('');
  const [posChecklistCategory, setPosChecklistCategory] = useState('all');
  const [posChecklistStatus, setPosChecklistStatus] = useState('all');
  const [posChecklistSelectedIds, setPosChecklistSelectedIds] = useState(new Set());
  const [bulkPosToggleLoading, setBulkPosToggleLoading] = useState(false);
  const [bulkStorefrontToggleLoading, setBulkStorefrontToggleLoading] = useState(false);
  const [bulkPosImageFiles, setBulkPosImageFiles] = useState([]);
  const [bulkStorefrontImageFiles, setBulkStorefrontImageFiles] = useState([]);
  const [bulkImageUploadLoading, setBulkImageUploadLoading] = useState(false);
  const [guidedPosReadyItemId, setGuidedPosReadyItemId] = useState(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = useMemo(
    () => String(deferredSearchQuery || '').trim().toLowerCase(),
    [deferredSearchQuery]
  );
  const deferredPosChecklistSearch = useDeferredValue(posChecklistSearch);
  const normalizedPosChecklistSearch = useMemo(
    () => String(deferredPosChecklistSearch || '').trim().toLowerCase(),
    [deferredPosChecklistSearch]
  );

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor) // For mobile support
  );

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error('Failed to fetch current user:', error);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!isMsmeMode) return;
    if (MSME_RESTRICTED_CATEGORY_FILTERS.has(categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, isMsmeMode]);

  const resolveCategoryFilterValue = useCallback((item) => {
    if (isMsmeMode) {
      return getMsmeCategoryView(item);
    }
    return getEffectiveCategory(item);
  }, [isMsmeMode]);

  const canConfigurePosCatalog = can('items:edit');
  const canConfigureStorefrontCatalog = can('items:edit');
  const canViewPosCatalog = can('pos:view');
  const hasPremiumFeatureAccess = useMemo(() => {
    if (tenantPlan !== 'premium') return false;

    const subscriptionStatus = String(currentUser?.company?.subscription_status || '').toLowerCase();
    if (subscriptionStatus === 'active') return true;

    if (subscriptionStatus === 'past_due') {
      const gracePeriodEnd = currentUser?.company?.grace_period_end;
      if (!gracePeriodEnd) return false;
      const graceDate = new Date(gracePeriodEnd);
      return Number.isFinite(graceDate.getTime()) && graceDate > new Date();
    }

    return false;
  }, [currentUser?.company?.grace_period_end, currentUser?.company?.subscription_status, tenantPlan]);

  const shouldLoadPosCatalogOverrides = !permissionsLoading && canViewPosCatalog && hasPremiumFeatureAccess;
  const shouldLoadStorefrontCatalogOverrides = !permissionsLoading && canConfigureStorefrontCatalog;

  const getDefaultPosVisibility = useCallback((item) => (
    item?.category === 'product' && item?.product_type === 'finished_goods'
  ), []);

  const getDefaultStorefrontVisibility = useCallback((item) => (
    item?.category === 'product' && item?.product_type === 'finished_goods'
  ), []);

  const fetchPosOverrides = useCallback(async () => {
    if (!shouldLoadPosCatalogOverrides) {
      setPosCatalogOverrides({});
      return;
    }

    try {
      const rows = await getPosCatalogOverrides({ limit: 1000 });
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        map[row.item_id] = row;
      });
      setPosCatalogOverrides(map);
    } catch (error) {
      if (error?.response?.status === 403) {
        setPosCatalogOverrides({});
        return;
      }
      console.warn('Failed to load POS catalog overrides:', error);
    }
  }, [shouldLoadPosCatalogOverrides]);

  useEffect(() => {
    fetchPosOverrides();
  }, [fetchPosOverrides]);

  const fetchStorefrontOverrides = useCallback(async () => {
    if (!shouldLoadStorefrontCatalogOverrides) {
      setStorefrontCatalogOverrides({});
      return;
    }

    try {
      const rows = await getStorefrontCatalogOverrides({ limit: 1000 });
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        map[row.item_id] = row;
      });
      setStorefrontCatalogOverrides(map);
    } catch (error) {
      if (error?.response?.status === 403) {
        setStorefrontCatalogOverrides({});
        return;
      }
      console.warn('Failed to load storefront catalog overrides:', error);
    }
  }, [shouldLoadStorefrontCatalogOverrides]);

  useEffect(() => {
    fetchStorefrontOverrides();
  }, [fetchStorefrontOverrides]);

  const resolvePosConfig = useCallback((item) => {
    const itemId = item?.item_id || item?.id;
    const override = posCatalogOverrides[itemId];
    return {
      pos_visible: override ? override.pos_visible !== false : getDefaultPosVisibility(item),
      pos_image_url: resolveAssetUrl(override?.pos_image_url) || null,
      pos_readiness: override?.pos_readiness || null
    };
  }, [getDefaultPosVisibility, posCatalogOverrides]);

  const resolveStorefrontConfig = useCallback((item) => {
    const itemId = item?.item_id || item?.id;
    const override = storefrontCatalogOverrides[itemId];
    return {
      storefront_visible: override ? override.storefront_visible !== false : getDefaultStorefrontVisibility(item),
      storefront_image_path: override?.storefront_image_path || null,
      storefront_image_url: resolveAssetUrl(override?.storefront_image_url) || null,
      storefront_image_gallery: Array.isArray(override?.storefront_image_gallery) ? override.storefront_image_gallery : [],
      location_availability: Array.isArray(override?.location_availability) ? override.location_availability : []
    };
  }, [getDefaultStorefrontVisibility, storefrontCatalogOverrides]);

  const handleTogglePosVisibility = async (item, nextVisible) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId) return;
    if (nextVisible && !hasExplicitSalePrice(item)) {
      toast.error('Set a selling price before enabling POS visibility.');
      return;
    }

    try {
      const updated = await updatePosCatalogOverride(itemId, { pos_visible: Boolean(nextVisible) });
      setPosCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(`POS visibility ${nextVisible ? 'enabled' : 'disabled'} for ${item.name}`);
    } catch (error) {
      if (error?.reason_code === POS_READINESS_INCOMPLETE) {
        const missing = Array.isArray(error?.missing_requirements) ? error.missing_requirements : [];
        const nextState = {
          ...(posCatalogOverrides[itemId] || {}),
          pos_readiness: error?.readiness_snapshot || {
            ready: false,
            missing_requirements: missing
          }
        };
        setPosCatalogOverrides((prev) => ({
          ...prev,
          [itemId]: nextState
        }));
        const headline = missing.length > 0
          ? `Cannot enable POS yet: ${missing.length} requirement${missing.length === 1 ? '' : 's'} missing.`
          : 'Cannot enable POS yet until readiness requirements are completed.';
        toast.error(headline);
        return;
      }
      toast.error(error?.response?.data?.message || error?.message || 'Failed to update POS visibility');
    }
  };

  const handleUploadPosImage = async (item, file) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId || !file) return;

    try {
      const updated = await uploadPosCatalogImage(itemId, file);
      setPosCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(`POS image updated for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload POS image');
    }
  };

  const handleDeletePosImage = async (item) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId) return;

    try {
      const updated = await deletePosCatalogImage(itemId);
      setPosCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...(updated || {}), pos_image_url: null }
      }));
      toast.success(`POS image removed for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove POS image');
    }
  };

  const handleToggleStorefrontVisibility = async (item, nextVisible) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId || !canConfigureStorefrontCatalog) return;
    if (nextVisible && !hasExplicitSalePrice(item)) {
      toast.error('Set a selling price before enabling Storefront visibility.');
      return;
    }

    try {
      const updated = await updateStorefrontCatalogOverride(itemId, { storefront_visible: Boolean(nextVisible) });
      setStorefrontCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(`Storefront visibility ${nextVisible ? 'enabled' : 'disabled'} for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to update storefront visibility');
    }
  };

  const handleToggleStorefrontLocationAvailability = async (item, locationId, nextAvailable) => {
    const itemId = item?.item_id || item?.id;
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!itemId || !canConfigureStorefrontCatalog || !Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) return;

    const currentConfig = resolveStorefrontConfig(item);
    const currentRows = Array.isArray(currentConfig.location_availability) ? currentConfig.location_availability : [];
    const hasLocationRow = currentRows.some((row) => Number(row?.location_id) === normalizedLocationId);
    const nextRows = hasLocationRow
      ? currentRows.map((row) => (
        Number(row?.location_id) === normalizedLocationId
          ? { ...row, storefront_available: Boolean(nextAvailable) }
          : row
      ))
      : [
        ...currentRows,
        {
          location_id: normalizedLocationId,
          storefront_available: Boolean(nextAvailable)
        }
      ];

    try {
      const updated = await updateStorefrontCatalogOverride(itemId, {
        location_availability: nextRows.map((row) => ({
          location_id: row.location_id,
          storefront_available: row.storefront_available !== false
        }))
      });
      setStorefrontCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(`Storefront branch availability updated for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to update storefront branch availability');
    }
  };

  const applyStorefrontLocationAvailabilityPatch = async (item, rows = []) => {
    const itemId = Number(item?.item_id || item?.id || 0);
    const normalizedRows = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        location_id: Number.parseInt(row?.location_id, 10),
        storefront_available: row?.storefront_available !== false
      }))
      .filter((row) => Number.isInteger(row.location_id) && row.location_id > 0);
    if (!itemId || normalizedRows.length === 0 || !canConfigureStorefrontCatalog) return null;

    const updated = await updateStorefrontCatalogOverride(itemId, {
      location_availability: normalizedRows
    });
    setStorefrontCatalogOverrides((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), ...updated }
    }));
    return updated;
  };

  const handleUploadStorefrontImage = async (item, files) => {
    const itemId = item?.item_id || item?.id;
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);
    if (!itemId || normalizedFiles.length === 0 || !canConfigureStorefrontCatalog) return;

    try {
      const updated = normalizedFiles.length > 1
        ? await uploadStorefrontCatalogImages(itemId, normalizedFiles)
        : await uploadStorefrontCatalogImage(itemId, normalizedFiles[0]);
      setStorefrontCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(normalizedFiles.length > 1 ? `Item gallery updated for ${item.name}` : `Item image updated for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload item image');
    }
  };

  const normalizeStorefrontGallery = (storefrontConfig = {}) => {
    const entries = Array.isArray(storefrontConfig?.storefront_image_gallery)
      ? storefrontConfig.storefront_image_gallery
      : [];
    const primaryUrl = storefrontConfig?.storefront_image_url || null;
    const gallery = entries
      .map((entry, index) => ({
        path: entry?.path || null,
        url: entry?.url || entry?.image_url || entry,
        is_primary: index === 0,
        sort_order: index
      }))
      .filter((entry) => entry.url || entry.path);
    if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
      gallery.unshift({ path: storefrontConfig?.storefront_image_path || null, url: primaryUrl, is_primary: true, sort_order: 0 });
    }
    return gallery.map((entry, index) => ({
      ...entry,
      is_primary: index === 0,
      sort_order: index
    }));
  };

  const handleSetPrimaryStorefrontImage = async (item, imageIndex) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId || !canConfigureStorefrontCatalog) return;
    const current = normalizeStorefrontGallery(resolveStorefrontConfig(item));
    const normalizedImageIndex = Number.parseInt(imageIndex, 10);
    if (!Number.isInteger(normalizedImageIndex) || normalizedImageIndex <= 0 || normalizedImageIndex >= current.length) return;
    const nextGallery = [
      current[normalizedImageIndex],
      ...current.filter((_, index) => index !== normalizedImageIndex)
    ].map((entry, index) => ({ ...entry, is_primary: index === 0, sort_order: index }));

    try {
      const updated = await updateStorefrontCatalogGallery(itemId, nextGallery);
      setStorefrontCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(`Primary storefront image updated for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update primary item image');
    }
  };

  const handleDeleteStorefrontImage = async (item, imageIndex = null) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId || !canConfigureStorefrontCatalog) return;

    try {
      const normalizedImageIndex = Number.parseInt(imageIndex, 10);
      const updated = Number.isInteger(normalizedImageIndex) && normalizedImageIndex >= 0
        ? await deleteStorefrontCatalogGalleryImage(itemId, normalizedImageIndex)
        : await deleteStorefrontCatalogImage(itemId);
      setStorefrontCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: Number.isInteger(normalizedImageIndex) && normalizedImageIndex >= 0
          ? { ...(prev[itemId] || {}), ...(updated || {}) }
          : { ...(prev[itemId] || {}), ...(updated || {}), storefront_image_url: null, storefront_image_gallery: null }
      }));
      toast.success(Number.isInteger(normalizedImageIndex) ? `Item gallery image removed for ${item.name}` : `Item image removed for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove item image');
    }
  };

  const posChecklistItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesSearch = normalizedPosChecklistSearch.length === 0
          || (item.name || '').toLowerCase().includes(normalizedPosChecklistSearch)
          || (item.sku_code || '').toLowerCase().includes(normalizedPosChecklistSearch);
        const filterCategory = resolveCategoryFilterValue(item);
        const matchesCategory = posChecklistCategory === 'all' || filterCategory === posChecklistCategory || item.category === posChecklistCategory;
        const status = String(item.status || '').toLowerCase();
        const matchesStatus = posChecklistStatus === 'all' || status === posChecklistStatus;
        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [items, normalizedPosChecklistSearch, posChecklistCategory, posChecklistStatus, resolveCategoryFilterValue]);

  const checklistSelectedCount = posChecklistSelectedIds.size;
  const checklistFilteredCount = posChecklistItems.length;

  const buildBulkImagePreview = useCallback((files = [], surface = 'pos') => {
    const skuToItem = new Map(items.map((item) => [
      String(item?.sku_code || '').trim().toUpperCase(),
      item
    ]));
    const skuCounts = new Map();
    files.forEach((file) => {
      const filename = file?.name || '';
      const dotIndex = filename.lastIndexOf('.');
      const skuCode = (dotIndex > 0 ? filename.slice(0, dotIndex) : filename).trim().toUpperCase();
      if (!skuCode) return;
      skuCounts.set(skuCode, (skuCounts.get(skuCode) || 0) + 1);
    });
    return files.map((file) => {
      const filename = file?.name || '';
      const dotIndex = filename.lastIndexOf('.');
      const skuCode = (dotIndex > 0 ? filename.slice(0, dotIndex) : filename).trim();
      const skuKey = skuCode.toUpperCase();
      const duplicate = (skuCounts.get(skuKey) || 0) > 1;
      const item = skuToItem.get(skuKey);
      const storefrontConfig = item ? resolveStorefrontConfig(item) : null;
      const storefrontVisible = storefrontConfig?.storefront_visible !== false;
      const priceMissing = item ? !hasExplicitSalePrice(item) : false;
      const blocked = surface === 'storefront' && item && storefrontVisible && priceMissing;
      return {
        filename,
        sku_code: skuCode,
        item,
        duplicate,
        blocked,
        status: duplicate
          ? 'duplicate'
          : !item
            ? 'unmatched'
            : blocked
              ? 'blocked'
              : 'matched'
      };
    });
  }, [items, resolveStorefrontConfig]);

  const bulkPosImagePreview = useMemo(
    () => buildBulkImagePreview(bulkPosImageFiles, 'pos'),
    [buildBulkImagePreview, bulkPosImageFiles]
  );

  const bulkStorefrontImagePreview = useMemo(
    () => buildBulkImagePreview(bulkStorefrontImageFiles, 'storefront'),
    [buildBulkImagePreview, bulkStorefrontImageFiles]
  );

  const renderBulkImagePreviewRows = (previewRows = []) => {
    if (!previewRows.length) return null;
    return (
      <div className="mt-3 max-h-28 overflow-auto rounded border border-slate-100 bg-slate-50">
        {previewRows.slice(0, 12).map((entry, index) => (
          <div key={`${entry.filename}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-2 py-1 text-xs last:border-b-0">
            <span className="truncate text-slate-700">{entry.filename}</span>
            <span className={cn(
              'shrink-0 font-medium',
              entry.status === 'matched' && 'text-emerald-700',
              entry.status === 'blocked' && 'text-amber-700',
              ['duplicate', 'unmatched'].includes(entry.status) && 'text-red-700'
            )}>
              {entry.status === 'matched'
                ? `matches ${entry.item?.sku_code || entry.sku_code}`
                : entry.status}
            </span>
          </div>
        ))}
        {previewRows.length > 12 && (
          <div className="px-2 py-1 text-xs text-slate-500">
            {previewRows.length - 12} more file{previewRows.length - 12 === 1 ? '' : 's'} queued.
          </div>
        )}
      </div>
    );
  };

  const uploadBulkCatalogImages = async (surface) => {
    const files = surface === 'storefront' ? bulkStorefrontImageFiles : bulkPosImageFiles;
    if (!files.length) {
      toast.error('Choose one or more SKU-named image files first.');
      return;
    }
    setBulkImageUploadLoading(true);
    try {
      const result = surface === 'storefront'
        ? await uploadBulkStorefrontCatalogImages(files)
        : await uploadBulkPosCatalogImages(files);
      const uploaded = result?.summary?.uploaded || 0;
      const blocked = result?.summary?.blocked_readiness || 0;
      const failed = (result?.summary?.failed || 0)
        + (result?.summary?.unmatched || 0)
        + (result?.summary?.duplicate_filename || 0);
      toast[failed || blocked ? 'warning' : 'success'](
        `${surface === 'storefront' ? 'Storefront' : 'POS'} images: ${uploaded} uploaded, ${blocked} blocked, ${failed} failed or unmatched.`
      );
      if (surface === 'storefront') {
        setBulkStorefrontImageFiles([]);
      } else {
        setBulkPosImageFiles([]);
      }
      await Promise.all([fetchPosOverrides(), fetchStorefrontOverrides()]);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to upload bulk catalog images.');
    } finally {
      setBulkImageUploadLoading(false);
    }
  };

  const toggleChecklistSelection = (itemId) => {
    setPosChecklistSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAllFilteredChecklistItems = () => {
    setPosChecklistSelectedIds(new Set(posChecklistItems.map((item) => item.item_id || item.id).filter(Boolean)));
  };

  const clearChecklistSelection = () => {
    setPosChecklistSelectedIds(new Set());
  };

  const applyBulkPosVisibility = async (nextVisible) => {
    const targetIds = Array.from(posChecklistSelectedIds);
    if (targetIds.length === 0) {
      toast.error('Select at least one item first.');
      return;
    }

    setBulkPosToggleLoading(true);
    try {
      const result = await updateBulkPosCatalogOverrides({
        itemIds: targetIds,
        posVisible: Boolean(nextVisible)
      });
      const updatedRows = Array.isArray(result?.results)
        ? result.results.filter((entry) => entry.status === 'updated')
        : [];

      if (updatedRows.length > 0) {
        setPosCatalogOverrides((prev) => {
          const next = { ...prev };
          updatedRows.forEach(({ item_id, data }) => {
            next[item_id] = { ...(next[item_id] || {}), ...(data || { pos_visible: Boolean(nextVisible) }) };
          });
          return next;
        });
      }

      const blocked = result?.summary?.blocked || 0;
      const failed = result?.summary?.failed || 0;
      const notFound = result?.summary?.not_found || 0;
      if (blocked + failed + notFound === 0) {
        toast.success(`Updated POS visibility for ${updatedRows.length} item${updatedRows.length !== 1 ? 's' : ''}.`);
      } else {
        toast.warning(`Updated ${updatedRows.length} item${updatedRows.length !== 1 ? 's' : ''}; ${blocked} blocked, ${failed + notFound} failed or missing.`);
      }
      clearChecklistSelection();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to apply bulk POS visibility update.');
    } finally {
      setBulkPosToggleLoading(false);
    }
  };

  const applyBulkStorefrontVisibility = async (nextVisible) => {
    const targetIds = Array.from(posChecklistSelectedIds);
    if (targetIds.length === 0) {
      toast.error('Select at least one item first.');
      return;
    }

    setBulkStorefrontToggleLoading(true);
    try {
      const result = await updateBulkStorefrontCatalogOverrides({
        itemIds: targetIds,
        storefrontVisible: Boolean(nextVisible)
      });
      const updatedRows = Array.isArray(result?.results)
        ? result.results.filter((entry) => entry.status === 'updated')
        : [];

      if (updatedRows.length > 0) {
        setStorefrontCatalogOverrides((prev) => {
          const next = { ...prev };
          updatedRows.forEach(({ item_id, data }) => {
            next[item_id] = { ...(next[item_id] || {}), ...(data || { storefront_visible: Boolean(nextVisible) }) };
          });
          return next;
        });
      }

      const blocked = result?.summary?.blocked || 0;
      const failed = result?.summary?.failed || 0;
      const notFound = result?.summary?.not_found || 0;
      if (blocked + failed + notFound === 0) {
        toast.success(`Updated Storefront visibility for ${updatedRows.length} item${updatedRows.length !== 1 ? 's' : ''}.`);
      } else {
        toast.warning(`Updated ${updatedRows.length} item${updatedRows.length !== 1 ? 's' : ''}; ${blocked} blocked, ${failed + notFound} failed or missing.`);
      }
      clearChecklistSelection();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to apply bulk Storefront visibility update.');
    } finally {
      setBulkStorefrontToggleLoading(false);
    }
  };

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('items_searchQuery', JSON.stringify(searchQuery));
    localStorage.setItem('items_categoryFilter', JSON.stringify(categoryFilter));
    localStorage.setItem('items_statusFilter', JSON.stringify(statusFilter));
    localStorage.setItem('items_fifoFilter', JSON.stringify(fifoFilter));
    localStorage.setItem('items_sortBy', JSON.stringify(sortBy));
    localStorage.setItem('items_viewMode', JSON.stringify(viewMode));
    localStorage.setItem('items_folderFilter', JSON.stringify(folderFilter));
    localStorage.setItem('items_currentFolder', JSON.stringify(currentFolder));
  }, [searchQuery, categoryFilter, statusFilter, fifoFilter, sortBy, viewMode, folderFilter, currentFolder]);



  const [transientFolders, setTransientFolders] = useState(new Set());

  const folderEntries = useMemo(() => {
    const map = new Map();

    if (apiFolders && Array.isArray(apiFolders)) {
      apiFolders.forEach((folder) => {
        if (!folder?.name) return;
        map.set(folder.name, {
          name: folder.name,
          folder_id: folder.folder_id,
          description: folder.description || '',
          show_in_pos_filter: folder.show_in_pos_filter !== false,
          isPersistent: true
        });
      });
    }

    transientFolders.forEach((folderName) => {
      if (!folderName) return;
      if (!map.has(folderName)) {
        map.set(folderName, {
          name: folderName,
          folder_id: null,
          description: '',
          show_in_pos_filter: true,
          isPersistent: false
        });
      }
    });

    items.forEach((item) => {
      if (!item.product_folder) return;
      if (!map.has(item.product_folder)) {
        map.set(item.product_folder, {
          name: item.product_folder,
          folder_id: null,
          description: '',
          show_in_pos_filter: true,
          isPersistent: false
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [apiFolders, items, transientFolders]);

  const folders = useMemo(() => folderEntries.map((entry) => entry.name), [folderEntries]);
  const productFolders = folders;
  const folderByName = useMemo(() => new Map(folderEntries.map((entry) => [entry.name, entry])), [folderEntries]);

  const doesItemMatchFolder = useCallback((item, folderName) => {
    if (!folderName) return false;
    const folder = folderByName.get(folderName);
    if (folder?.folder_id) {
      return Number(item?.folder_id) === Number(folder.folder_id) || item?.product_folder === folderName;
    }
    return item?.product_folder === folderName;
  }, [folderByName]);

  const buildFolderAssignmentPayload = useCallback((folderName) => {
    if (!folderName) {
      return { folder_id: null, product_folder: null };
    }

    const folder = folderByName.get(folderName);
    if (folder?.folder_id) {
      return { folder_id: folder.folder_id, product_folder: folder.name };
    }

    return { product_folder: folderName };
  }, [folderByName]);

  const resolveItemFolderName = useCallback((item) => {
    if (!item) return null;
    if (item.product_folder) return item.product_folder;

    if (item.folder_id) {
      const matchingFolder = folderEntries.find((entry) => Number(entry.folder_id) === Number(item.folder_id));
      return matchingFolder?.name || null;
    }

    return null;
  }, [folderEntries]);

  const isItemUncategorized = useCallback((item) => !resolveItemFolderName(item), [resolveItemFolderName]);

  const folderCounts = useMemo(() => {
    const counts = {};
    folderEntries.forEach((folder) => {
      counts[folder.name] = 0;
    });
    items.forEach((item) => {
      if (item.status === 'draft') return;
      folderEntries.forEach((folder) => {
        if (doesItemMatchFolder(item, folder.name)) {
          counts[folder.name] = (counts[folder.name] || 0) + 1;
        }
      });
    });
    return counts;
  }, [items, folderEntries, doesItemMatchFolder]);

  const isLikelyPosSellable = useCallback((item) => (
    resolveItemFinancialPolicy({ workflowMode, item }).show_sale_price
  ), [workflowMode]);

  const buildFallbackPosReadiness = useCallback((item) => {
    // Non-authoritative UI fallback only. Primary readiness contract comes from backend
    // /pos/catalog-overrides payloads and gate decisions.
    const posConfig = resolvePosConfig(item);
    const defaultSalePrice = Number(item?.default_sale_price ?? 0);
    const currentStock = Number(item?.current_stock ?? 0);
    const stockExempt = isPureServiceItem(item);
    const checks = {
      pos_visible: posConfig.pos_visible !== false,
      has_sale_price: Number.isFinite(defaultSalePrice) && defaultSalePrice > 0,
      stock_non_negative: Number.isFinite(currentStock) && currentStock >= 0,
      status_active: String(item?.status || '').toLowerCase() === 'active',
      has_available_stock: stockExempt || (Number.isFinite(currentStock) && currentStock > 0)
    };

    const missingRequirements = [];
    if (!checks.pos_visible) missingRequirements.push({ code: 'POS_VISIBILITY_DISABLED', label: 'Enable POS visibility' });
    if (!checks.has_sale_price) missingRequirements.push({ code: 'SALE_PRICE_MISSING', label: 'Set a sale price' });
    if (!checks.stock_non_negative) missingRequirements.push({ code: 'STOCK_INVALID', label: 'Fix stock value' });
    if (!checks.status_active) missingRequirements.push({ code: 'ITEM_NOT_ACTIVE', label: 'Activate item' });
    if (!stockExempt && !checks.has_available_stock) missingRequirements.push({ code: 'STOCK_UNAVAILABLE', label: 'Add available stock' });

    const checkValues = Object.values(checks);
    const score = Math.round((checkValues.filter(Boolean).length / checkValues.length) * 100);
    return {
      ready: missingRequirements.length === 0,
      state: missingRequirements.length === 0 ? 'ready' : 'needs_attention',
      score,
      checks,
      missing_requirements: missingRequirements
    };
  }, [resolvePosConfig]);

  const getPosReadinessForItem = useCallback((item) => {
    const existing = resolvePosConfig(item)?.pos_readiness;
    if (existing && typeof existing === 'object') {
      return existing;
    }
    return buildFallbackPosReadiness(item);
  }, [buildFallbackPosReadiness, resolvePosConfig]);

  const getCatalogRecommendationForItem = useCallback((item) => {
    const itemId = item?.item_id || item?.id;
    const backendRecommendation = posCatalogOverrides[itemId]?.catalog_setup_recommendation
      || storefrontCatalogOverrides[itemId]?.catalog_setup_recommendation;
    if (backendRecommendation?.label) return backendRecommendation;

    const preset = String(item?.mode_item_preset || '').toLowerCase();
    const category = String(item?.category || '').toLowerCase();
    const productType = String(item?.product_type || '').toLowerCase();
    const finishedGoods = category === 'product' && productType === 'finished_goods';
    const placeholderModes = new Set([
      'retail',
      'hospitality',
      'healthcare',
      'ticketing_transport',
      'logistics_distribution',
      'education_institutions'
    ]);
    if (placeholderModes.has(workflowMode)) {
      return {
        code: 'placeholder_conservative_default',
        label: 'Placeholder mode: conservative default'
      };
    }
    if (
      ['finished_product', 'product', 'service', 'physical_add_on', 'menu_item', 'packaged_beverage'].includes(preset)
      || finishedGoods
    ) {
      return { code: 'recommended_for_pos_storefront', label: 'Recommended for POS and Storefront' };
    }
    return { code: 'keep_internal', label: 'Keep internal' };
  }, [posCatalogOverrides, storefrontCatalogOverrides, workflowMode]);

  const posReadinessByItemId = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      const itemId = item?.item_id || item?.id;
      if (!itemId) return;
      map[itemId] = getPosReadinessForItem(item);
    });
    return map;
  }, [getPosReadinessForItem, items]);

  const totalPosNeedsAttentionCount = useMemo(() => (
    Object.values(posReadinessByItemId).filter((entry) => entry?.ready !== true).length
  ), [posReadinessByItemId]);

  const openItemInTerminal = useCallback((item) => {
    const query = encodeURIComponent(item?.name || item?.sku_code || '');
    navigate(`/terminal?catalog_search=${query}&catalog_focus=item`);
  }, [navigate]);

  const launchPosReadinessFlow = useCallback((item) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId) return;
    setGuidedPosReadyItemId(itemId);
    setPosChecklistSearch(String(item?.name || item?.sku_code || ''));
    setPosChecklistCategory('all');
    setPosChecklistStatus('all');
    setPosChecklistSelectedIds(new Set([itemId]));
    setShowPosChecklistModal(true);
  }, []);

  const checklistNeedsAttentionIds = useMemo(() => (
    posChecklistItems
      .map((item) => item?.item_id || item?.id)
      .filter((itemId) => itemId && !posReadinessByItemId[itemId]?.ready)
  ), [posChecklistItems, posReadinessByItemId]);

  const selectChecklistNeedsAttention = useCallback(() => {
    setPosChecklistSelectedIds(new Set(checklistNeedsAttentionIds));
  }, [checklistNeedsAttentionIds]);

  const handleToggleFolderFilter = (folderName) => {
    setFolderFilter((prev) => (prev === folderName ? 'all' : folderName));
  };

  const handleToggleFolderPosFilter = async (folder, nextValue) => {
    if (!folder?.folder_id) {
      toast.error('Only saved folders can update POS filter visibility.');
      return;
    }

    try {
      await updateApiFolder(folder.folder_id, { show_in_pos_filter: Boolean(nextValue) });
      toast.success(`POS folder filter ${nextValue ? 'enabled' : 'disabled'} for ${folder.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update folder POS filter visibility');
    }
  };

  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        const matchesSearch = normalizedSearchQuery.length === 0
          || item.name.toLowerCase().includes(normalizedSearchQuery)
          || (item.sku_code || '').toLowerCase().includes(normalizedSearchQuery);

        // Category filter matches effective category
        const effectiveCategory = resolveCategoryFilterValue(item);
        const matchesCategory = categoryFilter === 'all' ||
          effectiveCategory === categoryFilter ||
          item.category === categoryFilter;

        // Folder navigation - if inside a folder, show only items in that folder
        let matchesFolder = true;
        if (currentFolder !== null) {
          matchesFolder = doesItemMatchFolder(item, currentFolder);
        } else if (folderFilter !== 'all') {
          matchesFolder = doesItemMatchFolder(item, folderFilter);
        }

        // Handle draft status filter
        if (statusFilter === 'draft') {
          return matchesSearch && matchesCategory && matchesFolder && item.status === 'draft';
        }

        const status = getStockStatus(item);
        const matchesStatus = statusFilter === 'all' ||
          (statusFilter === 'critical' && (status === 'critical' || status === 'warning')) ||
          status === statusFilter;

        // Handle FIFO filter
        let matchesFifo = true;
        if (fifoFilter === 'enabled') {
          matchesFifo = item.fifo_enabled === true;
        } else if (fifoFilter === 'disabled') {
          matchesFifo = item.fifo_enabled === false;
        } else if (fifoFilter === 'expiring') {
          // Show items with FIFO enabled and batches expiring within 30 days
          if (item.fifo_enabled && item.fifo_batches && item.fifo_batches.length > 0) {
            const nextExpiry = getNextExpiryDate(item);
            if (nextExpiry) {
              const daysUntilExpiry = getDaysUntilExpiry(nextExpiry);
              matchesFifo = daysUntilExpiry !== null && daysUntilExpiry <= 30;
            } else {
              matchesFifo = false;
            }
          } else {
            matchesFifo = false;
          }
        }

        return matchesSearch && matchesCategory && matchesStatus && matchesFolder && matchesFifo && item.status !== 'draft';
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'stock':
            return a.current_stock - b.current_stock;
          case 'stock_desc':
            return b.current_stock - a.current_stock;
          case 'updated':
            return new Date(b.updated_at || b.last_updated) - new Date(a.updated_at || a.last_updated);
          default:
            return 0;
        }
      });
  }, [items, normalizedSearchQuery, categoryFilter, statusFilter, sortBy, folderFilter, fifoFilter, currentFolder, doesItemMatchFolder, resolveCategoryFilterValue]);

  // Item Selection Hook
  const { selectedIds, toggleSelection, clearSelection, count: selectedCount } = useItemSelection(filteredItems);

  // Clear selection when filters or folder changes
  useEffect(() => {
    clearSelection();
  }, [searchQuery, categoryFilter, statusFilter, folderFilter, currentFolder, clearSelection]);

  // Hide the selection bar and suppress Escape handler whenever any modal is open
  const isAnyModalOpen =
    showDetailsModal || showFormModal || showProductWizard || showMoveModal ||
    showDeleteDialog || showFolderDeleteDialog ||
    showImportModal || showExportModal || showImportExportModal || showPosChecklistModal;

  useEffect(() => {
    setPosChecklistSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(items.map((item) => item.item_id || item.id).filter(Boolean));
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // Escape key clears selection when the bar is visible and no modal is open
  useEffect(() => {
    if (selectedCount === 0 || isAnyModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') clearSelection();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCount, isAnyModalOpen, clearSelection]);

  const handleView = async (item) => {
    try {
      // Fetch complete item data with all associations for ALL item categories
      const fullItemData = await getInventoryItemById(item.item_id);
      setSelectedItem(fullItemData);
    } catch (error) {
      console.error('Failed to load item data:', error);
      toast.error('Failed to load complete item data');
      setSelectedItem(item); // Fallback to basic data
    }
    setShowDetailsModal(true);
  };

  const handleEdit = async (item) => {
    if (isMsmeMode && isManufactured(item) && item?.product_type === 'work_in_progress') {
      toast.info('Advanced manufactured product editing is available in Manufacturing mode. Switch mode to edit this item.');
      return;
    }
    if (!isMsmeMode && isManufactured(item)) {
      try {
        // Fetch complete item data with all associations
        const fullItemData = await getInventoryItemById(item.item_id || item.id);
        handleCreateProduct(fullItemData);
      } catch (error) {
        console.error('Failed to load product data:', error);
        toast.error('Failed to load product data for editing');
      }
    } else {
      try {
        const fullItemData = await getInventoryItemById(item.item_id || item.id);
        setEditingItem(fullItemData);
      } catch (error) {
        console.error('Failed to load item data for editing:', error);
        toast.error('Failed to load complete item data');
        setEditingItem(item);
      }
      setShowFormModal(true);
    }
  };

  const handleCreate = (presetOverride = null) => {
    const nextPreset = presetOverride || msmeItemPreset;
    setActiveCreatePreset(nextPreset);
    setEditingItem(null);
    setShowFormModal(true);
  };

  const handleCreateProduct = (product = null) => {
    setEditingProduct(product);
    setShowProductWizard(true);
  };

  const handleProductSubmit = async (productData) => {
    try {
      const {
        storefront_location_availability: storefrontLocationAvailabilityPatch = [],
        ...productPayload
      } = productData || {};
      let savedProduct = null;
      if (editingProduct) {
        // If finalizing a draft, use finalizeItem with the updated data
        if (editingProduct.status === 'draft' && productPayload.status === 'active') {
          savedProduct = await finalizeItem(editingProduct.item_id, productPayload);
          toast.success('Product finalized successfully');
        } else {
          // Regular update (draft->draft or active->active)
          savedProduct = await updateItem(editingProduct.item_id, productPayload);
          toast.success('Product updated successfully');
        }
      } else {
        // Creating new product
        savedProduct = await createItem(productPayload);
        toast.success('Product created successfully');
      }
      await applyStorefrontLocationAvailabilityPatch(savedProduct || editingProduct, storefrontLocationAvailabilityPatch);
      refetch();
      setShowProductWizard(false);
      setEditingProduct(null);
      if (isLikelyPosSellable(savedProduct || editingProduct || productPayload)) {
        launchPosReadinessFlow(savedProduct || editingProduct || productPayload);
        toast.message('Product saved. Complete POS readiness checks before checkout.');
      }
    } catch (error) {
      console.error('Save product error:', error);
      const errorMessage = error.response?.data?.errors?.map(e => e.message).join(', ') ||
        error.response?.data?.message ||
        error.message ||
        'Failed to save product';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
      throw error;
    }
  };

  const handleProductSaveDraft = async (productData) => {
    try {
      const {
        storefront_location_availability: storefrontLocationAvailabilityPatch = [],
        ...productPayload
      } = productData || {};
      let savedProduct = null;
      if (editingProduct) {
        savedProduct = await updateItem(editingProduct.item_id, productPayload);
        toast.success('Product draft updated successfully');
      } else {
        savedProduct = await createItemDraft(productPayload);
        toast.success('Product draft saved successfully');
      }
      await applyStorefrontLocationAvailabilityPatch(savedProduct || editingProduct, storefrontLocationAvailabilityPatch);
      refetch();
      setShowProductWizard(false);
      setEditingProduct(null);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ')
        || error.message
        || 'Failed to save draft';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
      throw error;
    }
  };

  const handleSave = async (itemData) => {
    try {
      const {
        supplier_links: supplierLinks = [],
        supplier_links_dirty: supplierLinksDirty = false,
        storefront_location_availability: storefrontLocationAvailabilityPatch = [],
        ...itemPayload
      } = itemData || {};
      const isEditingExistingItem = Boolean(editingItem);
      if (
        isEditingExistingItem
        && isMsmeMode
        && Object.keys(itemPayload).length === 0
        && !supplierLinksDirty
      ) {
        toast.message('No item changes detected.');
        setShowFormModal(false);
        setActiveCreatePreset(MSME_ITEM_PRESET.INVENTORY_ONLY);
        setEditingItem(null);
        return;
      }

      let savedItem = null;
      if (isEditingExistingItem) {
        if (Object.keys(itemPayload).length > 0) {
          savedItem = await updateItem(editingItem.item_id, itemPayload);
          toast.success('Item updated successfully');
        } else {
          savedItem = editingItem;
        }
      } else {
        savedItem = await createItem(itemPayload);
        toast.success('Item created successfully');
      }

      const targetItemId = Number(savedItem?.item_id || savedItem?.id || editingItem?.item_id || 0);
      await applyStorefrontLocationAvailabilityPatch(savedItem || editingItem, storefrontLocationAvailabilityPatch);

      if (isMsmeMode && supplierLinksDirty && Number.isInteger(targetItemId) && targetItemId > 0) {
        try {
          await replaceItemSuppliers(targetItemId, supplierLinks);
          toast.success('Item supplier links synced.');
        } catch (supplierSyncError) {
          toast.warning('Item saved, but supplier sync failed. Please retry from item edit.');
        }
      }

      const createdViaMsmeSellablePreset = (
        isMsmeMode
        && !isEditingExistingItem
        && activeCreatePreset === MSME_ITEM_PRESET.SELLABLE_POS
      );

      if (createdViaMsmeSellablePreset) {
        const createdItemId = Number(savedItem?.item_id || savedItem?.id || 0);
        if (Number.isInteger(createdItemId) && createdItemId > 0) {
          try {
            const updatedOverride = await updatePosCatalogOverride(createdItemId, { pos_visible: true });
            setPosCatalogOverrides((prev) => ({
              ...prev,
              [createdItemId]: { ...(prev[createdItemId] || {}), ...updatedOverride }
            }));
            toast.success('Item created and set to show in POS.');
          } catch (overrideError) {
            if (overrideError?.reason_code === POS_READINESS_INCOMPLETE) {
              toast.warning('Item created. POS visibility is blocked until readiness requirements are completed.');
            } else {
              toast.warning('Item was created, but auto-show in POS failed. Use "Fix POS Setup" to enable it.');
            }
          }
        }
      }

      refetch();
      setShowFormModal(false);
      const candidate = savedItem || editingItem || itemData;
      if (isLikelyPosSellable(candidate) || createdViaMsmeSellablePreset) {
        launchPosReadinessFlow(candidate);
        toast.message('Review POS readiness before selling this item in terminal.');
      }
      setActiveCreatePreset(MSME_ITEM_PRESET.INVENTORY_ONLY);
      setEditingItem(null);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || error.message || 'Failed to save item';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
      throw error;
    }
  };

  const handleSaveDraft = async (itemData) => {
    try {
      const {
        supplier_links: _supplierLinks = [],
        supplier_links_dirty: _supplierLinksDirty = false,
        storefront_location_availability: storefrontLocationAvailabilityPatch = [],
        ...draftPayload
      } = itemData || {};
      const savedDraft = await createItemDraft(draftPayload);
      await applyStorefrontLocationAvailabilityPatch(savedDraft, storefrontLocationAvailabilityPatch);
      toast.success('Item draft saved successfully');
      refetch();
      setShowFormModal(false);
      setActiveCreatePreset(MSME_ITEM_PRESET.INVENTORY_ONLY);
      setEditingItem(null);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || error.message || 'Failed to save draft';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
      throw error;
    }
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteErrors(null);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      await deleteItem(itemToDelete.item_id);
      toast.success('Item deleted successfully');
      setShowDeleteDialog(false);
      setItemToDelete(null);
      setDeleteErrors(null);
      refetch();
    } catch (error) {
      // Check if error response has details array
      const errorDetails = error.response?.data?.details;
      if (errorDetails && Array.isArray(errorDetails)) {
        setDeleteErrors(errorDetails);
      } else {
        if (!normalizeApiError(error).isGlobalCandidate) {
          toast.error(error.response?.data?.message || error.message || 'Failed to delete item');
        }
        setShowDeleteDialog(false);
        setItemToDelete(null);
      }
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setItemToDelete(null);
    setDeleteErrors(null);
  };

  // Folder handlers
  const handleCreateFolder = async (folderName) => {
    if (folders.includes(folderName)) {
      toast.error(`Folder "${folderName}" already exists`);
      return;
    }

    try {
      await createApiFolder(folderName, '');
      toast.success(`Folder "${folderName}" created successfully.`);
      // No need for transient set as apiFolders will update
    } catch (error) {
      console.error('Failed to create folder:', error);
      // Fallback to transient if API fails (or if implementation specific)
      setTransientFolders(prev => new Set(prev).add(folderName));
      toast.warning(`Folder created locally only (API error: ${error.message})`);
    }

    setCurrentFolder(folderName);
  };

  const handleEnterFolder = (folderName) => {
    setCurrentFolder(folderName);
  };

  const handleExitFolder = () => {
    setCurrentFolder(null);
  };

  const handleDeleteFolderClick = (folderInput) => {
    const folderName = typeof folderInput === 'string' ? folderInput : folderInput?.name;
    if (!folderName) return;
    const apiFolder = apiFolders?.find(f => f.name === folderName);
    // Build folder object — use API data if available, otherwise construct from name
    const folder = apiFolder || { name: folderName, item_count: folderCounts[folderName] || 0 };
    setFolderToDelete(folder);
    setShowFolderDeleteDialog(true);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    setDeletingFolder(true);
    try {
      if (folderToDelete.folder_id) {
        // API folder — delete via backend
        await deleteInventoryFolder(folderToDelete.folder_id);
      } else {
        // Legacy folder (derived from item product_folder field) — clear product_folder on all items
        const itemsInFolder = items.filter(item => doesItemMatchFolder(item, folderToDelete.name));
        for (const item of itemsInFolder) {
          await updateItem(item.item_id, { product_folder: null, folder_id: null });
        }
        // Remove from transient folders if present
        setTransientFolders(prev => {
          const next = new Set(prev);
          next.delete(folderToDelete.name);
          return next;
        });
      }
      toast.success(`Folder "${folderToDelete.name}" deleted successfully`);
      // If we're inside the deleted folder, navigate out
      if (currentFolder === folderToDelete.name) {
        setCurrentFolder(null);
      }
      setShowFolderDeleteDialog(false);
      setFolderToDelete(null);
      refetchFolders();
      refetch();
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.response?.data?.message || error.message || 'Failed to delete folder');
      }
    } finally {
      setDeletingFolder(false);
    }
  };

  const handleCancelDeleteFolder = () => {
    setShowFolderDeleteDialog(false);
    setFolderToDelete(null);
  };

  const openMoveModal = (item) => {
    setItemToMove(item);
    setShowMoveModal(true);
  };

  const handleMoveItem = async (targetFolder) => {
    // Determine items to move: either bulk selection or single item
    const itemsToMoveIds = selectedIds.size > 0
      ? Array.from(selectedIds)
      : (itemToMove ? [itemToMove.item_id || itemToMove.id] : []);

    if (itemsToMoveIds.length === 0) return;

    try {
      const payload = buildFolderAssignmentPayload(targetFolder);
      const movePromises = itemsToMoveIds.map(id => updateItem(id, payload));

      await Promise.all(movePromises);

      const count = itemsToMoveIds.length;
      const folderName = targetFolder || 'Uncategorized';
      toast.success(`Moved ${count} item${count !== 1 ? 's' : ''} to ${folderName}`);

      refetch();

      setShowMoveModal(false);
      setItemToMove(null);
      clearSelection();
    } catch (error) {
      console.error('Failed to move items:', error);
      toast.error('Failed to move items');
    }
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const item = items.find(i => (i.item_id || i.id) === active.id);
    setActiveDragItem(item);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveDragItem(null);

    // If active.id (item) is dropped over over.id (folder)
    if (over && active.id !== over.id) {
      const targetFolder = over.id;
      const activeId = active.id;

      // Check if multiple items are selected and the dragged item is one of them
      const isMultiDrag = selectedIds.has(activeId) && selectedIds.size > 1;

      const itemsToMoveIds = isMultiDrag
        ? Array.from(selectedIds)
        : [activeId];

      // Filter out items that are already in the target folder
      const itemsToMove = items.filter(item =>
        itemsToMoveIds.includes(item.item_id || item.id) &&
        !doesItemMatchFolder(item, targetFolder)
      );

      if (itemsToMove.length === 0) return;

      try {
        const payload = buildFolderAssignmentPayload(targetFolder);
        const movePromises = itemsToMove.map(item =>
          updateItem(item.item_id || item.id, payload)
        );

        await Promise.all(movePromises);

        const count = itemsToMove.length;
        toast.success(`Moved ${count} item${count !== 1 ? 's' : ''} to ${targetFolder}`);

        refetch();
        if (isMultiDrag) clearSelection();

      } catch (err) {
        console.error('Drag move failed', err);
        toast.error('Failed to move items');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-red-800 font-medium">Error loading items</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Breadcrumb Navigation - shown when inside a folder */}
        {currentFolder && (
          <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExitFolder}
              className="flex items-center gap-2 bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to All Items
            </Button>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="text-sm">Items</span>
              <span>/</span>
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-teal-600" />
                <span className="font-medium text-slate-900">{currentFolder}</span>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {currentFolder || 'Inventory Items'}
            </h1>
            <p className="text-slate-500 mt-1">
              {currentFolder
                ? `${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''} in this folder`
                : `${filteredItems.length} items found`
              }
            </p>
            {isMsmeMode && (
              <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                MSME mode uses one simple item flow. Choose <span className="font-semibold">Sell in POS (auto-show)</span> to make items available in POS by default, or <span className="font-semibold">Inventory only</span> for stock tracking only.
              </p>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            {(canImportPermission('items') || canExportPermission('items')) && (
              <Button variant="outline" className="shrink-0" onClick={() => setShowImportExportModal(true)}>
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Import / Export
              </Button>
            )}
            {canConfigurePosCatalog && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => {
                    setGuidedPosReadyItemId(null);
                    setShowPosChecklistModal(true);
                  }}
                >
                  <ListChecks className="w-4 h-4 mr-2" />
                  {isMsmeMode ? `POS Setup (${totalPosNeedsAttentionCount})` : `Fix POS Setup (${totalPosNeedsAttentionCount})`}
                </Button>
                {!isMsmeMode && (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                    title="Checks POS sell-readiness requirements: POS visibility, menu image, folder assignment/filter visibility, sale price, active status, and stock validity."
                    aria-label="What Fix POS Setup checks"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            {!isMsmeMode && (categoryFilter === 'finished_goods' || categoryFilter === 'work_in_progress' || categoryFilter === 'product') && canCreate('items') && (
              <Button onClick={() => handleCreateProduct()} className="bg-teal-600 hover:bg-teal-700">
                <Package className="w-4 h-4 mr-2" />
                Create Product
              </Button>
            )}
            {canCreate('items') && isMsmeMode && (
              <>
                <Select value={msmeItemPreset} onValueChange={setMsmeItemPreset}>
                  <SelectTrigger className="w-full min-w-[220px] shrink-0 sm:w-52">
                    <SelectValue placeholder="Choose item type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MSME_ITEM_PRESET.SELLABLE_POS}>Sell in POS (auto-show)</SelectItem>
                    <SelectItem value={MSME_ITEM_PRESET.INVENTORY_ONLY}>Inventory only</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => handleCreate(msmeItemPreset)} className="shrink-0 bg-teal-600 hover:bg-teal-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </>
            )}
            {canCreate('items') && !isMsmeMode && (
              <Button
                onClick={() => handleCreate()}
                variant={(categoryFilter === 'finished_goods' || categoryFilter === 'work_in_progress' || categoryFilter === 'product') ? 'outline' : 'default'}
                className={(categoryFilter !== 'finished_goods' && categoryFilter !== 'work_in_progress' && categoryFilter !== 'product') ? "bg-teal-600 hover:bg-teal-700" : ""}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Item
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="relative flex-1 w-full">
              <span className="text-xs font-medium text-slate-500 mb-1 block">Search</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Category</span>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="w-4 h-4 mr-2 text-slate-400" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {isMsmeMode ? (
                      <>
                        <SelectItem value="product">Products</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="raw_material">Raw Material</SelectItem>
                        <SelectItem value="packaging">Packaging</SelectItem>
                        <SelectItem value="work_in_progress">Work In Progress</SelectItem>
                        <SelectItem value="finished_goods">Finished Goods</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Status</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Drafts</SelectItem>
                    <SelectItem value="critical">Low Stock</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="surplus">Surplus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">FIFO</span>
                <Select value={fifoFilter} onValueChange={setFifoFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="FIFO Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Items</SelectItem>
                    <SelectItem value="enabled">FIFO Enabled</SelectItem>
                    <SelectItem value="disabled">FIFO Disabled</SelectItem>
                    <SelectItem value="expiring">Expiring Soon</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Sort By</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name A-Z</SelectItem>
                    <SelectItem value="stock">Stock (Low to High)</SelectItem>
                    <SelectItem value="stock_desc">Stock (High to Low)</SelectItem>
                    <SelectItem value="updated">Last Updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Tabs value={viewMode} onValueChange={setViewMode} className="hidden sm:block">
                <TabsList>
                  <TabsTrigger value="grid"><LayoutGrid className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="list"><List className="w-4 h-4" /></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {currentFolder === null && productFolders.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">Folder Filters</span>
                {folderFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFolderFilter('all')}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Clear folder filter
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {productFolders.map((folder) => {
                  const active = folderFilter === folder;
                  return (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => handleToggleFolderFilter(folder)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                        active
                          ? "border-teal-300 bg-teal-50 text-teal-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      {folder}
                      {active && <X className="h-3 w-3 opacity-70" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Items Grid/List */}
        {viewMode === 'grid' ? (
          currentFolder === null ? (
            /* Root view - show folders first, then uncategorized items */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* Create Folder Card */}
              <CreateFolderCard onCreateFolder={handleCreateFolder} />

              {/* Folder Cards */}
              {folderEntries.map((folder) => (
                <FolderCard
                  key={folder.name}
                  name={folder.name}
                  itemCount={folderCounts[folder.name] || 0}
                  onClick={() => handleEnterFolder(folder.name)}
                  onDelete={() => handleDeleteFolderClick(folder)}
                  canDelete={canDeletePermission('items')}
                  showInPosFilter={folder.show_in_pos_filter !== false}
                  canTogglePosFilter={canEdit('items') && Boolean(folder.folder_id)}
                  onTogglePosFilter={(nextValue) => handleToggleFolderPosFilter(folder, nextValue)}
                />
              ))}

              {/* Uncategorized Items */}
              {filteredItems
                .filter(item => isItemUncategorized(item))
                .map(item => {
                  const posConfigResolved = resolvePosConfig(item);
                  const storefrontConfigResolved = resolveStorefrontConfig(item);
                  return (
                    <ItemCard
                      key={item.item_id || item.id}
                      item={item}
                      onView={handleView}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onMoveToFolder={openMoveModal}
                      posReadiness={posReadinessByItemId[item.item_id || item.id]}
                      posVisible={posConfigResolved.pos_visible !== false}
                      showPosVisibilityControl={canViewPosCatalog && hasPremiumFeatureAccess}
                      canTogglePosVisibility={canConfigurePosCatalog}
                      onTogglePosVisibility={handleTogglePosVisibility}
                      storefrontVisible={storefrontConfigResolved.storefront_visible !== false}
                      showStorefrontVisibilityControl={canConfigureStorefrontCatalog}
                      canToggleStorefrontVisibility={canConfigureStorefrontCatalog}
                      onToggleStorefrontVisibility={handleToggleStorefrontVisibility}
                      onOpenInTerminal={openItemInTerminal}
                      isMsmeMode={isMsmeMode}
                      workflowMode={workflowMode}
                      isSelected={selectedIds.has(item.item_id || item.id)}
                      onSelect={toggleSelection}
                    />
                  );
                })}
            </div>
          ) : filteredItems.length === 0 ? (
            /* Inside empty folder */
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">This folder is empty.</p>
              <p className="text-sm text-slate-400 mt-1">Use item editing to assign items to this folder.</p>
            </div>
          ) : (
            /* Inside folder with items */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map(item => {
                const posConfigResolved = resolvePosConfig(item);
                const storefrontConfigResolved = resolveStorefrontConfig(item);
                return (
                  <ItemCard
                    key={item.item_id || item.id}
                    item={item}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    onMoveToFolder={openMoveModal}
                    posReadiness={posReadinessByItemId[item.item_id || item.id]}
                    posVisible={posConfigResolved.pos_visible !== false}
                    showPosVisibilityControl={canViewPosCatalog && hasPremiumFeatureAccess}
                    canTogglePosVisibility={canConfigurePosCatalog}
                    onTogglePosVisibility={handleTogglePosVisibility}
                    storefrontVisible={storefrontConfigResolved.storefront_visible !== false}
                    showStorefrontVisibilityControl={canConfigureStorefrontCatalog}
                    canToggleStorefrontVisibility={canConfigureStorefrontCatalog}
                    onToggleStorefrontVisibility={handleToggleStorefrontVisibility}
                    onOpenInTerminal={openItemInTerminal}
                    isMsmeMode={isMsmeMode}
                    workflowMode={workflowMode}
                    isSelected={selectedIds.has(item.item_id || item.id)}
                    onSelect={toggleSelection}
                  />
                );
              })}
            </div>
          )
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className={cn('w-full', canConfigureStorefrontCatalog ? 'min-w-[1320px]' : 'min-w-[1240px]')}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-600">Item</th>
                  <th className="text-left p-4 font-medium text-slate-600">Category</th>
                  <th className="text-left p-4 font-medium text-slate-600">FIFO</th>
                  <th className="text-left p-4 font-medium text-slate-600">Next Expiry</th>
                  <th className="text-left p-4 font-medium text-slate-600">Stock Level</th>
                  <th className="text-left p-4 font-medium text-slate-600">Status</th>
                  <th className="text-left p-4 font-medium text-slate-600">POS Visible</th>
                  {canConfigureStorefrontCatalog && (
                    <th className="text-left p-4 font-medium text-slate-600">Storefront Visible</th>
                  )}
                  <th className="text-left p-4 font-medium text-slate-600">Unit Cost</th>
                  <th className="text-left p-4 font-medium text-slate-600">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => {
                  const status = getStockStatus(item);
                  const statusColors = {
                    critical: "bg-red-100 text-red-700",
                    warning: "bg-amber-100 text-amber-700",
                    healthy: "bg-emerald-100 text-emerald-700",
                    surplus: "bg-blue-100 text-blue-700"
                  };

                  // Calculate expiry information
                  const nextExpiry = getNextExpiryDate(item);
                  const daysUntilExpiry = nextExpiry ? getDaysUntilExpiry(nextExpiry) : null;
                  const posConfigResolved = resolvePosConfig(item);
                  const posVisible = posConfigResolved.pos_visible !== false;
                  const storefrontConfigResolved = resolveStorefrontConfig(item);
                  const storefrontVisible = storefrontConfigResolved.storefront_visible !== false;

                  return (
                    <tr
                      key={item.item_id || item.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => handleView(item)}
                    >
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-sm text-slate-500">{item.sku_code}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="capitalize text-slate-600">{item.category}</span>
                      </td>
                      <td className="p-4">
                        {item.fifo_enabled ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            <Check className="w-3 h-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                            <X className="w-3 h-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        {nextExpiry ? (
                          <Badge variant="outline" className={cn(
                            "flex items-center gap-1",
                            daysUntilExpiry < 0
                              ? "bg-red-50 text-red-700 border-red-200"
                              : daysUntilExpiry <= 7
                                ? "bg-red-50 text-red-700 border-red-200"
                                : daysUntilExpiry <= 30
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}>
                            <Clock className="w-3 h-3" />
                            {daysUntilExpiry < 0 ? 'Expired' : `${daysUntilExpiry}d left`}
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-slate-900">
                          {parseFloat(item.current_stock || 0)} / {parseFloat(item.max_capacity || 0)} {item.unit_of_measure}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColors[status])}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td
                        className="p-4"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={posVisible}
                            onCheckedChange={(nextValue) => handleTogglePosVisibility(item, nextValue)}
                            disabled={!canConfigurePosCatalog}
                            aria-label={`Toggle POS visibility for ${item.name}`}
                          />
                          <span className="text-xs text-slate-500">{posVisible ? 'On' : 'Off'}</span>
                        </div>
                      </td>
                      {canConfigureStorefrontCatalog && (
                        <td
                          className="p-4"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={storefrontVisible}
                              onCheckedChange={(nextValue) => handleToggleStorefrontVisibility(item, nextValue)}
                              aria-label={`Toggle storefront visibility for ${item.name}`}
                            />
                            <span className="text-xs text-slate-500">{storefrontVisible ? 'On' : 'Off'}</span>
                          </div>
                        </td>
                      )}
                      <td className="p-4 font-medium text-slate-900">₱{formatNumber(calculateTotalProductCost(item), 2)}</td>
                      <td className="p-4 text-slate-600">{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : (item.last_updated || 'N/A')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modals */}
        <Dialog
          open={showPosChecklistModal}
          onOpenChange={(open) => {
            setShowPosChecklistModal(open);
            if (!open) {
              setGuidedPosReadyItemId(null);
              clearChecklistSelection();
            }
          }}
        >
          <DialogContent className="sm:max-w-7xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Catalog Setup</DialogTitle>
              <DialogDescription>
                Resolve POS and Storefront readiness, visibility, and SKU-named image setup from one workflow.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 p-6 pt-0">
              {guidedPosReadyItemId && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
                  Guided mode: item #{guidedPosReadyItemId}. Complete missing readiness fields, then preview in terminal.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <Input
                    placeholder="Search by item name or SKU..."
                    value={posChecklistSearch}
                    onChange={(e) => setPosChecklistSearch(e.target.value)}
                  />
                </div>
                <Select value={posChecklistCategory} onValueChange={setPosChecklistCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {isMsmeMode ? (
                      <>
                        <SelectItem value="product">Products</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="raw_material">Raw Material</SelectItem>
                        <SelectItem value="packaging">Packaging</SelectItem>
                        <SelectItem value="work_in_progress">Work In Progress</SelectItem>
                        <SelectItem value="finished_goods">Finished Goods</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Select value={posChecklistStatus} onValueChange={setPosChecklistStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{checklistFilteredCount}</span> filtered item(s),
                  selected <span className="font-semibold text-slate-900">{checklistSelectedCount}</span>,
                  needs attention <span className="font-semibold text-amber-700">{checklistNeedsAttentionIds.length}</span>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectChecklistNeedsAttention}
                    disabled={checklistNeedsAttentionIds.length === 0}
                  >
                    Select Needs Attention
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllFilteredChecklistItems}
                    disabled={checklistFilteredCount === 0}
                  >
                    Select All Filtered
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearChecklistSelection}
                    disabled={checklistSelectedCount === 0}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => applyBulkPosVisibility(true)}
                    disabled={bulkPosToggleLoading || checklistSelectedCount === 0}
                  >
                    Enable POS
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyBulkPosVisibility(false)}
                    disabled={bulkPosToggleLoading || checklistSelectedCount === 0}
                  >
                    Disable POS
                  </Button>
                  {canConfigureStorefrontCatalog && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => applyBulkStorefrontVisibility(true)}
                        disabled={bulkStorefrontToggleLoading || checklistSelectedCount === 0}
                      >
                        Enable Storefront
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyBulkStorefrontVisibility(false)}
                        disabled={bulkStorefrontToggleLoading || checklistSelectedCount === 0}
                      >
                        Disable Storefront
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">POS Images by SKU Filename</p>
                      <p className="text-xs text-slate-500">Example: FG-001.jpg matches sku_code FG-001 and keeps POS visibility unchanged.</p>
                    </div>
                    <label className="cursor-pointer rounded border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">
                      Choose Images
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => setBulkPosImageFiles(Array.from(event.target.files || []))}
                      />
                    </label>
                  </div>
                  {bulkPosImagePreview.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <Badge variant="outline">{bulkPosImagePreview.filter((entry) => entry.status === 'matched').length} matched</Badge>
                      <Badge variant="outline">{bulkPosImagePreview.filter((entry) => entry.status === 'unmatched').length} unmatched</Badge>
                      <Badge variant="outline">{bulkPosImagePreview.filter((entry) => entry.status === 'duplicate').length} duplicate</Badge>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => uploadBulkCatalogImages('pos')}
                        disabled={bulkImageUploadLoading}
                      >
                        Upload POS Images
                      </Button>
                    </div>
                  )}
                  {renderBulkImagePreviewRows(bulkPosImagePreview)}
                </div>
                {canConfigureStorefrontCatalog && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Item Images by SKU Filename</p>
                        <p className="text-xs text-slate-500">Visible items without customer prices are previewed as blocked; hidden items can store images.</p>
                      </div>
                      <label className="cursor-pointer rounded border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">
                        Choose Images
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => setBulkStorefrontImageFiles(Array.from(event.target.files || []))}
                        />
                      </label>
                    </div>
                    {bulkStorefrontImagePreview.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <Badge variant="outline">{bulkStorefrontImagePreview.filter((entry) => entry.status === 'matched').length} matched</Badge>
                        <Badge variant="outline">{bulkStorefrontImagePreview.filter((entry) => entry.status === 'unmatched').length} unmatched</Badge>
                        <Badge variant="outline">{bulkStorefrontImagePreview.filter((entry) => entry.status === 'duplicate').length} duplicate</Badge>
                        <Badge variant="outline">{bulkStorefrontImagePreview.filter((entry) => entry.status === 'blocked').length} blocked</Badge>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => uploadBulkCatalogImages('storefront')}
                          disabled={bulkImageUploadLoading}
                        >
                        Upload Item Images
                      </Button>
                    </div>
                  )}
                    {renderBulkImagePreviewRows(bulkStorefrontImagePreview)}
                  </div>
                )}
              </div>

              <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-left w-12">Sel</th>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-left">Category</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Recommendation</th>
                      <th className="p-3 text-left">Readiness</th>
                      <th className="p-3 text-left">Missing</th>
                      <th className="p-3 text-left">POS Visible</th>
                      <th className="p-3 text-left">Menu Image</th>
                      {canConfigureStorefrontCatalog && (
                        <>
                          <th className="p-3 text-left">Storefront Visible</th>
                          <th className="p-3 text-left">Item Image</th>
                        </>
                      )}
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {posChecklistItems.map((item) => {
                      const itemId = item.item_id || item.id;
                      const effectiveCategory = resolveCategoryFilterValue(item) || getEffectiveCategory(item);
                      const posConfigResolved = resolvePosConfig(item);
                      const posVisible = posConfigResolved.pos_visible !== false;
                      const posImageUrl = posConfigResolved.pos_image_url || null;
                      const storefrontConfigResolved = resolveStorefrontConfig(item);
                      const storefrontVisible = storefrontConfigResolved.storefront_visible !== false;
                      const storefrontImageUrl = storefrontConfigResolved.storefront_image_url || null;
                      const storefrontImageGallery = normalizeStorefrontGallery(storefrontConfigResolved);
                      const checked = posChecklistSelectedIds.has(itemId);
                      const readiness = posReadinessByItemId[itemId] || buildFallbackPosReadiness(item);
                      const recommendation = getCatalogRecommendationForItem(item);
                      const missingCount = Array.isArray(readiness?.missing_requirements) ? readiness.missing_requirements.length : 0;
                      const readinessReady = readiness?.ready === true;

                      return (
                        <tr
                          key={itemId}
                          className={cn(
                            'hover:bg-slate-50',
                            guidedPosReadyItemId === itemId && 'bg-teal-50/50'
                          )}
                        >
                          <td className="p-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleChecklistSelection(itemId)}
                            />
                          </td>
                          <td className="p-3">
                            <p className="font-medium text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.sku_code}</p>
                          </td>
                          <td className="p-3 capitalize text-slate-700">{effectiveCategory}</td>
                          <td className="p-3 capitalize text-slate-700">{item.status || 'active'}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={recommendation.code === 'keep_internal'
                                ? 'bg-slate-50 text-slate-600 border-slate-200'
                                : recommendation.code === 'placeholder_conservative_default'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-teal-50 text-teal-700 border-teal-200'}
                            >
                              {recommendation.label}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={readinessReady
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'}
                            >
                              {readinessReady ? `Ready (${readiness?.score ?? 100}%)` : `Needs attention (${readiness?.score ?? 0}%)`}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-slate-600">
                            {missingCount === 0
                              ? 'None'
                              : `${missingCount} requirement${missingCount === 1 ? '' : 's'}`}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={posVisible}
                                onCheckedChange={(nextValue) => handleTogglePosVisibility(item, nextValue)}
                                disabled={!canConfigurePosCatalog}
                                aria-label={`Toggle POS visibility for ${item.name}`}
                              />
                              <span className="text-xs text-slate-500">{posVisible ? 'On' : 'Off'}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-2">
                              {posImageUrl ? (
                                <img
                                  src={posImageUrl}
                                  alt={`${item.name} POS menu`}
                                  className="h-16 w-20 rounded-md border border-slate-200 object-cover"
                                />
                              ) : (
                                <span className="text-xs text-slate-500">No image</span>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <label className="cursor-pointer rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                                  Upload
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) {
                                        handleUploadPosImage(item, file);
                                      }
                                      event.target.value = '';
                                    }}
                                  />
                                </label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeletePosImage(item)}
                                  disabled={!posImageUrl}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </td>
                          {canConfigureStorefrontCatalog && (
                            <>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={storefrontVisible}
                                    onCheckedChange={(nextValue) => handleToggleStorefrontVisibility(item, nextValue)}
                                    aria-label={`Toggle storefront visibility for ${item.name}`}
                                  />
                                  <span className="text-xs text-slate-500">{storefrontVisible ? 'On' : 'Off'}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="space-y-2">
                                  {storefrontImageGallery.length > 0 ? (
                                    <div className="flex max-w-xs flex-wrap gap-2">
                                      {storefrontImageGallery.map((entry, index) => (
                                        <div key={`${entry.url || entry.path}-${index}`} className="space-y-1">
                                          <div className="relative">
                                            <img
                                              src={resolveAssetUrl(entry.url || entry.path)}
                                              alt={`${item.name} storefront image ${index + 1}`}
                                              className="h-16 w-20 rounded-md border border-slate-200 object-cover"
                                            />
                                            {index === 0 && (
                                              <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                                Primary
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex gap-1">
                                            {index > 0 && (
                                              <button
                                                type="button"
                                                className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                                                onClick={() => handleSetPrimaryStorefrontImage(item, index)}
                                              >
                                                Set first
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                                              onClick={() => handleDeleteStorefrontImage(item, index)}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-500">No image</span>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    <label className="cursor-pointer rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                                      Add Images
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(event) => {
                                          const files = Array.from(event.target.files || []);
                                          if (files.length) {
                                            handleUploadStorefrontImage(item, files);
                                          }
                                          event.target.value = '';
                                        }}
                                      />
                                    </label>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteStorefrontImage(item)}
                                      disabled={storefrontImageGallery.length === 0 && !storefrontImageUrl}
                                    >
                                      Remove All
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </>
                          )}
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => launchPosReadinessFlow(item)}
                              >
                                Guide
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => openItemInTerminal(item)}
                              >
                                Preview in Terminal
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {posChecklistItems.length === 0 && (
                      <tr>
                        <td colSpan={canConfigureStorefrontCatalog ? 12 : 10} className="p-6 text-center text-slate-500">
                          No items match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ItemDetailsModal
          item={selectedItem}
          open={showDetailsModal}
          workflowMode={workflowMode}
          onClose={() => setShowDetailsModal(false)}
          onRefresh={async () => {
            if (!selectedItem) return;
            try {
              const refreshed = await getInventoryItemById(selectedItem.item_id);
              setSelectedItem(refreshed);
            } catch (e) {
              console.error('Failed to refresh item after write-off:', e);
            }
            refetch();
          }}
        />
        <ItemFormModal
          item={editingItem}
          open={showFormModal}
          onClose={() => {
            setShowFormModal(false);
            setEditingItem(null);
            setActiveCreatePreset(MSME_ITEM_PRESET.INVENTORY_ONLY);
          }}
          onSave={handleSave}
          onSaveDraft={handleSaveDraft}
          folders={folders}
          existingItems={skuSuggestionItems}
          workflowMode={workflowMode}
          msmeMode={isMsmeMode}
          createPreset={isMsmeMode && !editingItem ? activeCreatePreset : MSME_ITEM_PRESET.INVENTORY_ONLY}
          posConfig={editingItem ? resolvePosConfig(editingItem) : null}
          storefrontConfig={editingItem ? resolveStorefrontConfig(editingItem) : null}
          showStorefrontCatalogControls={canConfigureStorefrontCatalog}
          onTogglePosVisibility={handleTogglePosVisibility}
          onUploadPosImage={handleUploadPosImage}
          onDeletePosImage={handleDeletePosImage}
          onToggleStorefrontVisibility={handleToggleStorefrontVisibility}
          onToggleStorefrontLocationAvailability={handleToggleStorefrontLocationAvailability}
          onUploadStorefrontImage={handleUploadStorefrontImage}
          onSetPrimaryStorefrontImage={handleSetPrimaryStorefrontImage}
          onDeleteStorefrontImage={handleDeleteStorefrontImage}
          onOpenBulkPosSetup={() => {
            if (editingItem) {
              launchPosReadinessFlow(editingItem);
            } else {
              setGuidedPosReadyItemId(null);
              setShowPosChecklistModal(true);
            }
          }}
        />
        <MoveToFolderModal
          open={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          folders={folders}
          currentFolder={resolveItemFolderName(itemToMove)}
          itemName={itemToMove?.name}
          onMove={handleMoveItem}
        />
        {showProductWizard && (
          <ProductCreateWizard
            open={showProductWizard}
            onClose={() => {
              setShowProductWizard(false);
              setEditingProduct(null);
            }}
            onSubmit={handleProductSubmit}
            onSaveDraft={handleProductSaveDraft}
            product={editingProduct}
            items={skuSuggestionItems}
            workflowMode={workflowMode}
            folders={productFolders}
            posConfig={editingProduct ? resolvePosConfig(editingProduct) : null}
            storefrontConfig={editingProduct ? resolveStorefrontConfig(editingProduct) : null}
            showStorefrontCatalogControls={canConfigureStorefrontCatalog}
            onTogglePosVisibility={handleTogglePosVisibility}
            onUploadPosImage={handleUploadPosImage}
            onDeletePosImage={handleDeletePosImage}
            onToggleStorefrontVisibility={handleToggleStorefrontVisibility}
            onToggleStorefrontLocationAvailability={handleToggleStorefrontLocationAvailability}
            onUploadStorefrontImage={handleUploadStorefrontImage}
            onSetPrimaryStorefrontImage={handleSetPrimaryStorefrontImage}
            onDeleteStorefrontImage={handleDeleteStorefrontImage}
            onOpenBulkPosSetup={() => {
              if (editingProduct) {
                launchPosReadinessFlow(editingProduct);
              } else {
                setGuidedPosReadyItemId(null);
                setShowPosChecklistModal(true);
              }
            }}
          />
        )}
        <DeleteConfirmDialog
          open={showDeleteDialog}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title="Delete Item"
          description={
            <>
              Are you sure you want to delete <strong>{itemToDelete?.name}</strong>?
              This will set the item status to inactive. This action cannot be undone.
            </>
          }
          confirmText="Delete Item"
          variant="destructive"
          loading={deleting}
          errors={deleteErrors}
        />
        <DeleteConfirmDialog
          open={showFolderDeleteDialog}
          onClose={handleCancelDeleteFolder}
          onConfirm={handleConfirmDeleteFolder}
          title="Delete Folder"
          description={
            <>
              Are you sure you want to delete the folder <strong>{folderToDelete?.name}</strong>?
              {folderToDelete?.item_count > 0 && (
                <> This folder contains {folderToDelete.item_count} item(s) that will be moved out of the folder.</>
              )}
            </>
          }
          confirmText="Delete Folder"
          variant="destructive"
          loading={deletingFolder}
        />
        <CSVImportModal
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={refetch}
        />
        <ImportExportModal
          open={showImportExportModal}
          onClose={() => setShowImportExportModal(false)}
          onImport={() => setShowImportModal(true)}
          onExport={() => setShowExportModal(true)}
        />
        <CSVExportModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          items={items}
          filters={{
            category: categoryFilter,
            search: searchQuery,
            fifo: fifoFilter,
            folder: folderFilter
          }}
          filteredCount={filteredItems.length}
        />

        {/* Bulk Actions Bar — hidden when any modal is open */}
        {selectedCount > 0 && !isAnyModalOpen && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
            <div className="flex items-center gap-3">
              <span className="bg-white/20 text-white px-2.5 py-0.5 rounded-md text-sm font-medium">
                {selectedCount}
              </span>
              <span className="font-medium">Selected</span>
            </div>
            <div className="h-4 w-px bg-white/20" />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="bg-white text-slate-900 hover:bg-slate-100 border-0"
                onClick={() => {
                  setItemToMove(null); // Ensure we are in bulk mode
                  setShowMoveModal(true);
                }}
              >
                <Folder className="w-4 h-4 mr-2 text-amber-600" />
                Move to Folder
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/20 h-8 w-8 rounded-lg -mr-2"
                onClick={clearSelection}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <DragOverlay>
          {activeDragItem ? (
            <div className="opacity-90 rotate-2 scale-105 cursor-grabbing w-[300px]">
              <ItemCard
                item={activeDragItem}
                // Pass minimal props or disable interactivity
                onView={() => { }}
                onEdit={() => { }}
                onDelete={() => { }}
                onMoveToFolder={() => { }}
                posReadiness={posReadinessByItemId[activeDragItem.item_id || activeDragItem.id]}
                showPosVisibilityControl={false}
                showStorefrontVisibilityControl={false}
                isMsmeMode={isMsmeMode}
                workflowMode={workflowMode}
              />
            </div>
          ) : null}
        </DragOverlay>

      </div>
    </DndContext>
  );
}
