import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { Plus, Search, Loader2, Filter, Upload, Download } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SupplierCard from '@/components/suppliers/SupplierCard';
import SupplierDetailsModal from '@/components/suppliers/SupplierDetailsModal';
import SupplierFormModal from '@/components/suppliers/SupplierFormModal';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import ItemCoveragePanel from '@/components/suppliers/ItemCoveragePanel';
import AddSupplierChoiceDialog from '@/components/suppliers/AddSupplierChoiceDialog';
import QuickAssignSupplierModal from '@/components/suppliers/QuickAssignSupplierModal';
import SupplierExportModal from '@/components/suppliers/SupplierExportModal';
import SupplierImportModal from '@/components/suppliers/SupplierImportModal';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useCreateSupplierDraft, useFinalizeSupplier, useDeleteSupplier } from '@/hooks/useSuppliers.js';
import { useItemSupplierCoverage } from '@/hooks/useItems.js';
import { getCurrentUser } from '../src/services/authService.js';
import { toast } from 'sonner';

export default function Suppliers() {
  const { suppliers, loading, error, refetch } = useSuppliers();
  const { createSupplier, loading: creating } = useCreateSupplier();
  const { updateSupplier, loading: updating } = useUpdateSupplier();
  const { createSupplierDraft } = useCreateSupplierDraft();
  const { finalizeSupplier } = useFinalizeSupplier();
  const { deleteSupplier, loading: deleting } = useDeleteSupplier();
  const { refetch: refetchCoverage } = useItemSupplierCoverage();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [deleteErrors, setDeleteErrors] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Item coverage panel state
  const [itemForSupplierAssignment, setItemForSupplierAssignment] = useState(null);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [showQuickAssignModal, setShowQuickAssignModal] = useState(false);
  const [preAddedItemForNewSupplier, setPreAddedItemForNewSupplier] = useState(null);

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

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    return suppliers.filter(supplier => {
      const matchesSearch =
        supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (supplier.items_supplied || []).some(item =>
          (item.item_name || item.Item?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
        );

      // Handle draft status filter
      if (statusFilter === 'draft') {
        return matchesSearch && supplier.status === 'draft';
      }

      // Handle other status filters
      const matchesStatus = statusFilter === 'all' || supplier.status === statusFilter;
      return matchesSearch && matchesStatus && supplier.status !== 'draft';
    });
  }, [suppliers, searchQuery, statusFilter]);

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
      refetchCoverage(); // Refresh coverage panel after supplier save
      setShowFormModal(false);
      setEditingSupplier(null);
      setPreAddedItemForNewSupplier(null); // Clear pre-added item
      setItemForSupplierAssignment(null);
    } catch (error) {
      console.error('Save supplier error:', error);
      const errorMessage = error.response?.data?.errors?.map(e => e.message).join(', ') ||
        error.response?.data?.message ||
        error.message ||
        'Failed to save supplier';
      toast.error(errorMessage);
    }
  };

  const handleSaveDraft = async (supplierData) => {
    try {
      await createSupplierDraft(supplierData);
      toast.success('Supplier draft saved successfully');
      refetch();
      setShowFormModal(false);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || error.message || 'Failed to save draft';
      toast.error(errorMessage);
    }
  };

  const handleDeleteClick = (supplier) => {
    setSupplierToDelete(supplier);
    setDeleteErrors(null);
    setShowDeleteDialog(true);
  };

  // Item Coverage Panel handlers
  const handleAddSupplierToItem = useCallback((item) => {
    setItemForSupplierAssignment(item);
    setShowChoiceDialog(true);
  }, []);

  const handleSelectExistingSupplier = useCallback(() => {
    setShowChoiceDialog(false);
    setShowQuickAssignModal(true);
  }, []);

  const handleCreateNewSupplier = useCallback(() => {
    setShowChoiceDialog(false);
    setPreAddedItemForNewSupplier(itemForSupplierAssignment);
    setEditingSupplier(null);
    setShowFormModal(true);
  }, [itemForSupplierAssignment]);

  const handleQuickAssignSuccess = useCallback(() => {
    refetch();
    refetchCoverage();
    setItemForSupplierAssignment(null);
  }, [refetch, refetchCoverage]);

  const handleCloseChoiceDialog = useCallback(() => {
    setShowChoiceDialog(false);
    setItemForSupplierAssignment(null);
  }, []);

  const handleCloseQuickAssignModal = useCallback(() => {
    setShowQuickAssignModal(false);
    setItemForSupplierAssignment(null);
  }, []);

  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return;

    try {
      await deleteSupplier(supplierToDelete.supplier_id || supplierToDelete.id);
      toast.success('Supplier deleted successfully');
      setShowDeleteDialog(false);
      setSupplierToDelete(null);
      setDeleteErrors(null);
      refetch();
    } catch (error) {
      const errorDetails = error.response?.data?.details;
      if (errorDetails && Array.isArray(errorDetails)) {
        setDeleteErrors(errorDetails);
      } else {
        toast.error(error.response?.data?.message || error.message);
        setShowDeleteDialog(false);
        setSupplierToDelete(null);
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
        <Button
          variant="outline"
          onClick={() => setShowImportModal(true)}
          className="mr-2"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowExportModal(true)}
          className="mr-2"
        >
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
        <Button onClick={handleCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Item Coverage Panel */}
      <ItemCoveragePanel
        onAddSupplier={handleAddSupplierToItem}
        suppliers={suppliers}
      />

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by supplier name or items supplied..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
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
              onDelete={handleDeleteClick}
              currentUserRole={currentUser?.role}
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
        onClose={() => {
          setShowFormModal(false);
          setPreAddedItemForNewSupplier(null);
          setItemForSupplierAssignment(null);
        }}
        onSave={handleSave}
        onSaveDraft={handleSaveDraft}
        preAddedItem={preAddedItemForNewSupplier}
      />
      <SupplierExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        filters={{ search: searchQuery, status: statusFilter }}
        filteredCount={filteredSuppliers.length}
        totalCount={suppliers?.length || 0}
      />
      <SupplierImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          refetch();
        }}
      />
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setSupplierToDelete(null);
          setDeleteErrors(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Supplier"
        description={
          supplierToDelete
            ? `Are you sure you want to delete ${supplierToDelete.name}? This will set the supplier status to inactive. This action cannot be undone.`
            : ''
        }
        confirmText="Delete Supplier"
        variant="destructive"
        loading={deleting}
        errors={deleteErrors}
      />

      {/* Add Supplier Choice Dialog */}
      <AddSupplierChoiceDialog
        open={showChoiceDialog}
        onClose={handleCloseChoiceDialog}
        item={itemForSupplierAssignment}
        onSelectExisting={handleSelectExistingSupplier}
        onCreateNew={handleCreateNewSupplier}
        existingSuppliersCount={suppliers?.filter(s => s.status === 'active').length || 0}
      />

      {/* Quick Assign Supplier Modal */}
      <QuickAssignSupplierModal
        open={showQuickAssignModal}
        onClose={handleCloseQuickAssignModal}
        item={itemForSupplierAssignment}
        suppliers={suppliers?.filter(s => s.status === 'active') || []}
        onSuccess={handleQuickAssignSuccess}
      />
    </div>
  );
}