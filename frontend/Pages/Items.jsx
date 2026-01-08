import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Filter, LayoutGrid, List, Package, Loader2, Clock, Check, X, Upload } from 'lucide-react';
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
import { getStockStatus } from '@/components/data/dummyData';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem, useCreateItemDraft, useFinalizeItem } from '@/hooks/useItems.js';
import { getCurrentUser } from '../src/services/userService.js';
import { toast } from 'sonner';
import { cn } from "../src/lib/utils.js";
import { formatNumber } from '../src/lib/numberUtils.js';
import { getNextExpiryDate, getDaysUntilExpiry, formatExpiryDate } from '@/components/utils/expiryHelpers.js';
import { format } from 'date-fns';
import { isManufactured, getEffectiveCategory } from '@/components/utils/categoryHelpers';

export default function Items() {
  const { items, loading, error, refetch } = useItems();
  const { createItem, loading: creating } = useCreateItem();
  const { updateItem, loading: updating } = useUpdateItem();
  const { deleteItem, loading: deleting } = useDeleteItem();
  const { createItemDraft } = useCreateItemDraft();
  const { finalizeItem } = useFinalizeItem();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fifoFilter, setFifoFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showProductWizard, setShowProductWizard] = useState(false);
  const [folderFilter, setFolderFilter] = useState('all');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteErrors, setDeleteErrors] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);

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

  // Check URL params for filter
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get('filter');
    if (filter === 'low') {
      setStatusFilter('critical');
    } else if (filter === 'expiring') {
      setFifoFilter('expiring');
    }
  }, []);

  const productFolders = useMemo(() => {
    const folders = new Set();
    items.forEach(item => {
      if (isManufactured(item) && item.product_folder) {
        folders.add(item.product_folder);
      }
    });
    return Array.from(folders).sort();
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

        const matchesFolder = folderFilter === 'all' ||
          (isManufactured(item) && item.product_folder === folderFilter);

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
  }, [items, searchQuery, categoryFilter, statusFilter, sortBy, folderFilter, fifoFilter]);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Inventory Items</h1>
          <p className="text-slate-500 mt-1">{filteredItems.length} items found</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          {(categoryFilter === 'finished_goods' || categoryFilter === 'work_in_progress' || categoryFilter === 'product') && (
            <Button onClick={() => handleCreateProduct()} className="bg-teal-600 hover:bg-teal-700">
              <Package className="w-4 h-4 mr-2" />
              Create Product
            </Button>
          )}
          <Button
            onClick={handleCreate}
            variant={(categoryFilter === 'finished_goods' || categoryFilter === 'work_in_progress' || categoryFilter === 'product') ? 'outline' : 'default'}
            className={(categoryFilter !== 'finished_goods' && categoryFilter !== 'work_in_progress' && categoryFilter !== 'product') ? "bg-teal-600 hover:bg-teal-700" : ""}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Item
          </Button>
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
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">No items found matching your criteria.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <ItemCard
              key={item.item_id || item.id}
              item={item}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              currentUserRole={currentUser?.role}
            />
          ))}
        </div>
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
                    <td className="p-4 font-medium text-slate-900">₱{formatNumber(item.cost_per_unit, 2)}</td>
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
    </div>
  );
}