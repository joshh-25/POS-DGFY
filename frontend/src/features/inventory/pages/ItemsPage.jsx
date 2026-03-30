import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, LayoutGrid, List, Package, Loader2, Clock, Check, X, ArrowUpDown, ArrowLeft, Folder, ListChecks } from 'lucide-react';
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
import { isManufactured, getEffectiveCategory } from '@/components/utils/categoryHelpers';
import { calculateTotalProductCost } from '@/components/items/details/helpers';
import FolderCard from '@/components/items/FolderCard';
import CreateFolderCard from '@/components/items/CreateFolderCard';
import MoveToFolderModal from '@/components/items/MoveToFolderModal';
import { useItemSelection } from '@/hooks/useItemSelection';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { usePermission } from '@/hooks/usePermission';
import { normalizeApiError } from '@/src/utils/errorHandler.js';
import {
  getPosCatalogOverrides,
  updatePosCatalogOverride,
  uploadPosCatalogImage,
  deletePosCatalogImage
} from '@/services/posCatalogService.js';

export default function Items() {
  const { items, loading, error, refetch } = useInventoryItems({ limit: 1000 });
  const { createItem } = useInventoryCreateItem();
  const { updateItem } = useInventoryUpdateItem();
  const { deleteItem, loading: deleting } = useInventoryDeleteItem();
  const { createItemDraft } = useInventoryCreateItemDraft();
  const {
    can,
    canCreate,
    canEdit,
    canDelete: canDeletePermission,
    canImport: canImportPermission,
    canExport: canExportPermission
  } = usePermission();

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
  const [showPosChecklistModal, setShowPosChecklistModal] = useState(false);
  const [posChecklistSearch, setPosChecklistSearch] = useState('');
  const [posChecklistCategory, setPosChecklistCategory] = useState('all');
  const [posChecklistStatus, setPosChecklistStatus] = useState('all');
  const [posChecklistSelectedIds, setPosChecklistSelectedIds] = useState(new Set());
  const [bulkPosToggleLoading, setBulkPosToggleLoading] = useState(false);

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

  const canConfigurePosCatalog = can('items:edit');

  const getDefaultPosVisibility = useCallback((item) => (
    item?.category === 'product' && item?.product_type === 'finished_goods'
  ), []);

  const fetchPosOverrides = useCallback(async () => {
    if (!canConfigurePosCatalog) {
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
      console.error('Failed to load POS catalog overrides:', error);
    }
  }, [canConfigurePosCatalog]);

  useEffect(() => {
    fetchPosOverrides();
  }, [fetchPosOverrides]);

  const resolvePosConfig = (item) => {
    const itemId = item?.item_id || item?.id;
    const override = posCatalogOverrides[itemId];
    return {
      pos_visible: override ? override.pos_visible !== false : getDefaultPosVisibility(item),
      pos_image_url: override?.pos_image_url || null
    };
  };

  const handleTogglePosVisibility = async (item, nextVisible) => {
    const itemId = item?.item_id || item?.id;
    if (!itemId) return;

    try {
      const updated = await updatePosCatalogOverride(itemId, { pos_visible: Boolean(nextVisible) });
      setPosCatalogOverrides((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...updated }
      }));
      toast.success(`POS visibility ${nextVisible ? 'enabled' : 'disabled'} for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update POS visibility');
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

  const posChecklistItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesSearch = (item.name || '').toLowerCase().includes(posChecklistSearch.toLowerCase()) ||
          (item.sku_code || '').toLowerCase().includes(posChecklistSearch.toLowerCase());
        const effectiveCategory = getEffectiveCategory(item);
        const matchesCategory = posChecklistCategory === 'all' || effectiveCategory === posChecklistCategory || item.category === posChecklistCategory;
        const status = String(item.status || '').toLowerCase();
        const matchesStatus = posChecklistStatus === 'all' || status === posChecklistStatus;
        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [items, posChecklistSearch, posChecklistCategory, posChecklistStatus]);

  const checklistSelectedCount = posChecklistSelectedIds.size;
  const checklistFilteredCount = posChecklistItems.length;

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
      const updates = await Promise.allSettled(
        targetIds.map(async (itemId) => {
          const updated = await updatePosCatalogOverride(itemId, { pos_visible: Boolean(nextVisible) });
          return { itemId, updated };
        })
      );

      const successes = updates
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
      const failures = updates.length - successes.length;

      if (successes.length > 0) {
        setPosCatalogOverrides((prev) => {
          const next = { ...prev };
          successes.forEach(({ itemId, updated }) => {
            next[itemId] = { ...(next[itemId] || {}), ...updated };
          });
          return next;
        });
      }

      if (failures === 0) {
        toast.success(`Updated POS visibility for ${successes.length} item${successes.length !== 1 ? 's' : ''}.`);
      } else {
        toast.warning(`Updated ${successes.length} item${successes.length !== 1 ? 's' : ''}; ${failures} failed.`);
      }
      clearChecklistSelection();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to apply bulk POS visibility update.');
    } finally {
      setBulkPosToggleLoading(false);
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
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.sku_code || '').toLowerCase().includes(searchQuery.toLowerCase());

        // Category filter matches effective category
        const effectiveCategory = getEffectiveCategory(item);
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
  }, [items, searchQuery, categoryFilter, statusFilter, sortBy, folderFilter, fifoFilter, currentFolder, doesItemMatchFolder]);

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
    if (isManufactured(item)) {
      try {
        // Fetch complete item data with all associations
        const fullItemData = await getInventoryItemById(item.item_id);
        handleCreateProduct(fullItemData);
      } catch (error) {
        console.error('Failed to load product data:', error);
        toast.error('Failed to load product data for editing');
      }
    } else {
      setEditingItem(item);
      setShowFormModal(true);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setShowFormModal(true);
  };

  const handleCreateProduct = (product = null) => {
    setEditingProduct(product);
    setShowProductWizard(true);
  };

  const handleProductSubmit = async (productData) => {
    try {
      if (editingProduct) {
        // If finalizing a draft, use finalizeItem with the updated data
        if (editingProduct.status === 'draft' && productData.status === 'active') {
          await finalizeItem(editingProduct.item_id, productData);
          toast.success('Product finalized successfully');
        } else {
          // Regular update (draft->draft or active->active)
          await updateItem(editingProduct.item_id, productData);
          toast.success('Product updated successfully');
        }
      } else {
        // Creating new product
        await createItem(productData);
        toast.success('Product created successfully');
      }
      refetch();
      setShowProductWizard(false);
      setEditingProduct(null);
    } catch (error) {
      console.error('Save product error:', error);
      const errorMessage = error.response?.data?.errors?.map(e => e.message).join(', ') ||
        error.response?.data?.message ||
        error.message ||
        'Failed to save product';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
    }
  };

  const handleProductSaveDraft = async (productData) => {
    try {
      if (editingProduct) {
        await updateItem(editingProduct.item_id, productData);
        toast.success('Product draft updated successfully');
      } else {
        await createItemDraft(productData);
        toast.success('Product draft saved successfully');
      }
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
    }
  };

  const handleSave = async (itemData) => {
    try {
      if (editingItem) {
        await updateItem(editingItem.item_id, itemData);
        toast.success('Item updated successfully');
      } else {
        await createItem(itemData);
        toast.success('Item created successfully');
      }
      refetch();
      setShowFormModal(false);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || error.message || 'Failed to save item';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
      setEditingItem(null);
    }
  };

  const handleSaveDraft = async (itemData) => {
    try {
      await createItemDraft(itemData);
      toast.success('Item draft saved successfully');
      refetch();
      setShowFormModal(false);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || error.message || 'Failed to save draft';
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(errorMessage);
      }
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
          </div>
          <div className="flex gap-2">
            {(canImportPermission('items') || canExportPermission('items')) && (
              <Button variant="outline" onClick={() => setShowImportExportModal(true)}>
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Import / Export
              </Button>
            )}
            {canConfigurePosCatalog && (
              <Button variant="outline" onClick={() => setShowPosChecklistModal(true)}>
                <ListChecks className="w-4 h-4 mr-2" />
                POS Checklist
              </Button>
            )}
            {(categoryFilter === 'finished_goods' || categoryFilter === 'work_in_progress' || categoryFilter === 'product') && canCreate('items') && (
              <Button onClick={() => handleCreateProduct()} className="bg-teal-600 hover:bg-teal-700">
                <Package className="w-4 h-4 mr-2" />
                Create Product
              </Button>
            )}
            {canCreate('items') && (
              <Button
                onClick={handleCreate}
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
                    <SelectItem value="raw_material">Raw Material</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                    <SelectItem value="work_in_progress">Work In Progress</SelectItem>
                    <SelectItem value="finished_goods">Finished Goods</SelectItem>
                    <SelectItem value="supplies">Supplies</SelectItem>
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
                .map(item => (
                  <ItemCard
                    key={item.item_id || item.id}
                    item={item}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    onMoveToFolder={openMoveModal}
                    posConfig={resolvePosConfig(item)}
                    canConfigurePosCatalog={canConfigurePosCatalog}
                    onTogglePosVisibility={handleTogglePosVisibility}
                    onUploadPosImage={handleUploadPosImage}
                    onDeletePosImage={handleDeletePosImage}
                    isSelected={selectedIds.has(item.item_id || item.id)}
                    onSelect={toggleSelection}
                    currentUserRole={currentUser?.role}
                  />
                ))}
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
              {filteredItems.map(item => (
                <ItemCard
                  key={item.item_id || item.id}
                  item={item}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={handleDeleteClick}
                  onMoveToFolder={openMoveModal}
                  posConfig={resolvePosConfig(item)}
                  canConfigurePosCatalog={canConfigurePosCatalog}
                  onTogglePosVisibility={handleTogglePosVisibility}
                  onUploadPosImage={handleUploadPosImage}
                  onDeletePosImage={handleDeletePosImage}
                  isSelected={selectedIds.has(item.item_id || item.id)}
                  onSelect={toggleSelection}
                  currentUserRole={currentUser?.role}
                />
              ))}
            </div>
          )
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-4 font-medium text-slate-600">Item</th>
                  <th className="text-left p-4 font-medium text-slate-600">Category</th>
                  <th className="text-left p-4 font-medium text-slate-600">FIFO</th>
                  <th className="text-left p-4 font-medium text-slate-600">Next Expiry</th>
                  <th className="text-left p-4 font-medium text-slate-600">Stock Level</th>
                  <th className="text-left p-4 font-medium text-slate-600">Status</th>
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
              clearChecklistSelection();
            }
          }}
        >
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle className="text-xl">POS Checklist</DialogTitle>
              <DialogDescription>
                Manage POS visibility for any item category. Use filters, then select rows for bulk enable/disable.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 p-6 pt-0">
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
                    <SelectItem value="raw_material">Raw Material</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                    <SelectItem value="work_in_progress">Work In Progress</SelectItem>
                    <SelectItem value="finished_goods">Finished Goods</SelectItem>
                    <SelectItem value="supplies">Supplies</SelectItem>
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
                  selected <span className="font-semibold text-slate-900">{checklistSelectedCount}</span>.
                </p>
                <div className="flex flex-wrap gap-2">
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
                    Enable Selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyBulkPosVisibility(false)}
                    disabled={bulkPosToggleLoading || checklistSelectedCount === 0}
                  >
                    Disable Selected
                  </Button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-left w-12">Sel</th>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-left">Category</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">POS Visible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {posChecklistItems.map((item) => {
                      const itemId = item.item_id || item.id;
                      const effectiveCategory = getEffectiveCategory(item);
                      const posVisible = resolvePosConfig(item).pos_visible !== false;
                      const checked = posChecklistSelectedIds.has(itemId);

                      return (
                        <tr key={itemId} className="hover:bg-slate-50">
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleTogglePosVisibility(item, !posVisible)}
                            >
                              {posVisible ? 'Enabled' : 'Disabled'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {posChecklistItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">
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
          onClose={() => setShowFormModal(false)}
          onSave={handleSave}
          onSaveDraft={handleSaveDraft}
          folders={folders}
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
            items={items}
            folders={productFolders}
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
                posConfig={resolvePosConfig(activeDragItem)}
                canConfigurePosCatalog={false}
                currentUserRole={currentUser?.role}
              />
            </div>
          ) : null}
        </DragOverlay>

      </div>
    </DndContext>
  );
}
