import React, { useState, useMemo } from 'react';
import { Plus, Search, Filter, LayoutGrid, List, Package } from 'lucide-react';
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
import ItemCard from '@/components/items/ItemCard';
import ItemDetailsModal from '@/components/items/ItemDetailsModal';
import ItemFormModal from '@/components/items/ItemFormModal';
import ProductCreateWizard from '@/components/products/ProductCreateWizard';
import { dummyItems, getStockStatus } from '@/components/data/dummyData';
import { cn } from "../src/lib/utils.js";

export default function Items() {
  const [items, setItems] = useState(dummyItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showProductWizard, setShowProductWizard] = useState(false);
  const [folderFilter, setFolderFilter] = useState('all');

  // Check URL params for filter
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get('filter');
    if (filter === 'low') {
      setStatusFilter('critical');
    }
  }, []);

  const productFolders = useMemo(() => {
    const folders = new Set();
    items.forEach(item => {
      if (item.category === 'product' && item.product_folder) {
        folders.add(item.product_folder);
      }
    });
    return Array.from(folders).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.sku_code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
        const matchesFolder = folderFilter === 'all' || 
                             (item.category === 'product' && item.product_folder === folderFilter);
        const status = getStockStatus(item);
        const matchesStatus = statusFilter === 'all' || 
                             (statusFilter === 'critical' && (status === 'critical' || status === 'warning')) ||
                             status === statusFilter;
        return matchesSearch && matchesCategory && matchesStatus && matchesFolder;
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
            return new Date(b.last_updated) - new Date(a.last_updated);
          default:
            return 0;
        }
      });
  }, [items, searchQuery, categoryFilter, statusFilter, sortBy, folderFilter]);

  const handleView = (item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setShowFormModal(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setShowFormModal(true);
  };

  const handleCreateProduct = () => {
    setShowProductWizard(true);
  };

  const handleProductSubmit = (productData) => {
    const newId = `item-${Date.now()}`;
    setItems(prev => [...prev, { ...productData, id: newId, last_updated: new Date().toISOString().split('T')[0] }]);
    setShowProductWizard(false);
  };

  const handleSave = (itemData) => {
    if (editingItem) {
      setItems(prev => prev.map(i => i.id === editingItem.id ? { ...itemData, id: editingItem.id } : i));
    } else {
      const newId = `item-${Date.now()}`;
      setItems(prev => [...prev, { ...itemData, id: newId, last_updated: new Date().toISOString().split('T')[0] }]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Inventory Items</h1>
          <p className="text-slate-500 mt-1">{filteredItems.length} items found</p>
        </div>
        <div className="flex gap-2">
          {categoryFilter === 'product' && (
            <Button onClick={handleCreateProduct} className="bg-teal-600 hover:bg-teal-700">
              <Package className="w-4 h-4 mr-2" />
              Create Product
            </Button>
          )}
          <Button onClick={handleCreate} variant={categoryFilter === 'product' ? 'outline' : 'default'} className={categoryFilter !== 'product' ? "bg-teal-600 hover:bg-teal-700" : ""}>
            <Plus className="w-4 h-4 mr-2" />
            Add New Item
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="ingredient">Ingredients</SelectItem>
                <SelectItem value="product">Products</SelectItem>
                <SelectItem value="packaging">Packaging</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="critical">Low Stock</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="surplus">Surplus</SelectItem>
              </SelectContent>
            </Select>

            {categoryFilter === 'product' && productFolders.length > 0 && (
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
            )}

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
              key={item.id} 
              item={item} 
              onView={handleView}
              onEdit={handleEdit}
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
                return (
                  <tr 
                    key={item.id} 
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
                      <span className="font-medium text-slate-900">
                        {item.current_stock} / {item.max_capacity} {item.unit_of_measure}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColors[status])}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-slate-900">₱{item.cost_per_unit.toFixed(2)}</td>
                    <td className="p-4 text-slate-600">{item.last_updated}</td>
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
      />
      {showProductWizard && (
        <ProductCreateWizard
          open={showProductWizard}
          onClose={() => setShowProductWizard(false)}
          onSubmit={handleProductSubmit}
          items={items}
          folders={productFolders}
        />
      )}
    </div>
  );
}