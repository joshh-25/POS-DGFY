import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Filter, LayoutGrid, List, Package, Loader2, Clock, Check, X, ArrowUpDown, ArrowLeft, Folder } from 'lucide-react';
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
import ItemCard from '@/components/items/ItemCard';
import ItemDetailsModal from '@/components/items/ItemDetailsModal';
import ItemFormModal from '@/components/items/ItemFormModal';
import ProductCreateWizard from '@/components/products/ProductCreateWizard';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import CSVImportModal from '@/components/items/CSVImportModal';
import ImportExportModal from '@/components/items/ImportExportModal';
import CSVExportModal from '@/components/items/CSVExportModal';
import { getStockStatus } from '@/components/data/dummyData';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem, useCreateItemDraft, useFinalizeItem, useFolders } from '@/hooks/useItems.js';
import { getCurrentUser } from '../src/services/userService.js';
import { toast } from 'sonner';
import { cn } from "../src/lib/utils.js";
import { formatNumber } from '../src/lib/numberUtils.js';
import { getNextExpiryDate, getDaysUntilExpiry, formatExpiryDate } from '@/components/utils/expiryHelpers.js';
import { format } from 'date-fns';
import { isManufactured, getEffectiveCategory } from '@/components/utils/categoryHelpers';
import { calculateTotalProductCost } from '@/components/items/details/helpers';
import FolderCard from '@/components/items/FolderCard';
import CreateFolderCard from '@/components/items/CreateFolderCard';
import MoveToFolderModal from '@/components/items/MoveToFolderModal';
import { useItemSelection } from '@/hooks/useItemSelection';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { usePermission } from '../src/hooks/usePermission';

export default function Items() {
  const { items, loading, error, refetch } = useItems({ limit: 1000 });
  const { createItem, loading: creating } = useCreateItem();
  const { updateItem, loading: updating } = useUpdateItem();
  const { deleteItem, loading: deleting } = useDeleteItem();
  const { createItemDraft } = useCreateItemDraft();
  const { canCreate, canImport: canImportPermission, canExport: canExportPermission } = usePermission();

  const { finalizeItem } = useFinalizeItem();
  const { folders: apiFolders, createFolder: createApiFolder, refetch: refetchFolders } = useFolders();

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
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [activeDragItem, setActiveDragItem] = useState(null);

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

  const folders = useMemo(() => {
    const folderSet = new Set(transientFolders);

    // Add API folders (persistent)
    if (apiFolders && Array.isArray(apiFolders)) {
      apiFolders.forEach(f => folderSet.add(f.name));
    }

    // Add derived folders from items (legacy/compatibility)
    items.forEach(item => {
      if (item.product_folder) {
        folderSet.add(item.product_folder);
      }
    });

    return Array.from(folderSet).sort();
  }, [items, transientFolders, apiFolders]);

  const productFolders = folders;

  const folderCounts = useMemo(() => {
    const counts = {};
    items.forEach(item => {
      if (item.product_folder && item.status !== 'draft') {
        counts[item.product_folder] = (counts[item.product_folder] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  const uncategorizedItems = useMemo(() => {
    return items.filter(item => !item.product_folder && item.status !== 'draft');
  }, [items]);

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
          matchesFolder = item.product_folder === currentFolder;
        } else if (folderFilter !== 'all') {
          matchesFolder = item.product_folder === folderFilter;
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
  }, [items, searchQuery, categoryFilter, statusFilter, sortBy, folderFilter, fifoFilter, currentFolder]);

  // Item Selection Hook
  const { selectedIds, toggleSelection, clearSelection, count: selectedCount } = useItemSelection(filteredItems);

  // Clear selection when filters or folder changes
  useEffect(() => {
    clearSelection();
  }, [searchQuery, categoryFilter, statusFilter, folderFilter, currentFolder, clearSelection]);

  const handleView = async (item) => {
    try {
      // Fetch complete item data with all associations for ALL item categories
      const { getItemById } = await import('../src/services/itemService.js');
      const fullItemData = await getItemById(item.item_id);
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
        const { getItemById } = await import('../src/services/itemService.js');
        const fullItemData = await getItemById(item.item_id);
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
      toast.error(errorMessage);
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
      toast.error(errorMessage);
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
      toast.error(errorMessage);
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
      toast.error(errorMessage);
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
        toast.error(error.response?.data?.message || error.message || 'Failed to delete item');
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
      const movePromises = itemsToMoveIds.map(id =>
        updateItem(id, { product_folder: targetFolder })
      );

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
        item.product_folder !== targetFolder
      );

      if (itemsToMove.length === 0) return;

      try {
        const movePromises = itemsToMove.map(item =>
          updateItem(item.item_id || item.id, { product_folder: targetFolder })
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

              {categoryFilter === 'product' && productFolders.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Folder</span>
                  <Select value={folderFilter} onValueChange={setFolderFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Folder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Folders</SelectItem>
                      {productFolders.map(folder => (
                        <SelectItem key={folder} value={folder}>{folder}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
        </div>

        {/* Items Grid/List */}
        {viewMode === 'grid' ? (
          currentFolder === null ? (
            /* Root view - show folders first, then uncategorized items */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* Create Folder Card */}
              <CreateFolderCard onCreateFolder={handleCreateFolder} />

              {/* Folder Cards */}
              {folders.map(folderName => (
                <FolderCard
                  key={folderName}
                  name={folderName}
                  itemCount={folderCounts[folderName] || 0}
                  onClick={() => handleEnterFolder(folderName)}
                />
              ))}

              {/* Uncategorized Items */}
              {filteredItems
                .filter(item => !item.product_folder)
                .map(item => (
                  <ItemCard
                    key={item.item_id || item.id}
                    item={item}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    onMoveToFolder={openMoveModal}
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
        <ItemDetailsModal
          item={selectedItem}
          open={showDetailsModal}
          onClose={() => setShowDetailsModal(false)}
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
          currentFolder={itemToMove?.product_folder}
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

        {/* Bulk Actions Bar */}
        {selectedCount > 0 && (
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
                currentUserRole={currentUser?.role}
              />
            </div>
          ) : null}
        </DragOverlay>

      </div>
    </DndContext>
  );
}