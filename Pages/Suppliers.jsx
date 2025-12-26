import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { Plus, Search, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SupplierCard from '@/components/suppliers/SupplierCard';
import SupplierDetailsModal from '@/components/suppliers/SupplierDetailsModal';
import SupplierFormModal from '@/components/suppliers/SupplierFormModal';
import { useSuppliers, useCreateSupplier, useUpdateSupplier } from '@/hooks/useSuppliers.js';
import { toast } from 'sonner';

export default function Suppliers() {
  const { suppliers, loading, error, refetch } = useSuppliers();
  const { createSupplier, loading: creating } = useCreateSupplier();
  const { updateSupplier, loading: updating } = useUpdateSupplier();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    return suppliers.filter(supplier => {
      const matchesSearch = 
        supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (supplier.items_supplied || []).some(item => 
          (item.item_name || item.Item?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesSearch;
    });
  }, [suppliers, searchQuery]);

  const handleView = (supplier) => {
    setSelectedSupplier(supplier);
    setShowDetailsModal(true);
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setShowFormModal(true);
  };

  const handleCreate = () => {
    setEditingSupplier(null);
    setShowFormModal(true);
  };

  const handleCreatePO = (supplier) => {
    window.location.href = createPageUrl("PurchaseOrders") + `?supplier=${supplier.supplier_id || supplier.id}&action=create`;
  };

  const handleSave = async (supplierData) => {
    try {
    if (editingSupplier) {
        await updateSupplier(editingSupplier.supplier_id || editingSupplier.id, supplierData);
        toast.success('Supplier updated successfully');
    } else {
        await createSupplier(supplierData);
        toast.success('Supplier created successfully');
      }
      refetch();
      setShowFormModal(false);
      setEditingSupplier(null);
    } catch (error) {
      toast.error(error.message || 'Failed to save supplier');
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
          <p className="text-red-800 font-medium">Error loading suppliers</p>
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Suppliers</h1>
          <p className="text-slate-500 mt-1">{filteredSuppliers.length} suppliers</p>
        </div>
        <Button onClick={handleCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by supplier name or items supplied..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Suppliers Grid */}
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">No suppliers found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map(supplier => (
            <SupplierCard 
              key={supplier.supplier_id || supplier.id} 
              supplier={supplier} 
              onView={handleView}
              onEdit={handleEdit}
              onCreatePO={handleCreatePO}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <SupplierDetailsModal
        supplier={selectedSupplier}
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
      />
      <SupplierFormModal
        supplier={editingSupplier}
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSave={handleSave}
      />
    </div>
  );
}