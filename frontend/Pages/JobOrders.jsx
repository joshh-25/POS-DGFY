import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Filter, Eye, Factory, Clock, Play, CheckCircle, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "../src/lib/utils.js";
import { useJobOrders, useCreateJobOrder, useCompleteJobOrder, useCreateJobOrderDraft, useFinalizeJobOrder } from '@/hooks/useJobOrders.js';
import { useItems } from '@/hooks/useItems.js';
import JOCreateModal from '@/components/jo/JOCreateModal';
import JODetailsModal from '@/components/jo/JODetailsModal';
import { toast } from 'sonner';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle }
};

export default function JobOrders() {
  const { jobOrders, loading, error, refetch } = useJobOrders();
  const { items, loading: itemsLoading } = useItems();
  const { createJobOrder, loading: creating } = useCreateJobOrder();
  const { completeJobOrder, loading: completing } = useCompleteJobOrder();
  const { createJobOrderDraft } = useCreateJobOrderDraft();
  const { finalizeJobOrder } = useFinalizeJobOrder();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJO, setSelectedJO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [initialProductId, setInitialProductId] = useState(null);

  // Check URL params for deep linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      const productId = params.get('productId');
      if (productId) {
        setInitialProductId(productId);
      }
      setShowCreateModal(true);
      // Clean up URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const filteredJOs = useMemo(() => {
    if (!jobOrders) return [];
    return jobOrders.filter(jo => {
      const matchesSearch =
        (jo.jo_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (jo.product_name || jo.product?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || jo.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.created_date || b.created_at) - new Date(a.created_date || a.created_at));
  }, [jobOrders, searchQuery, statusFilter]);

  const products = useMemo(() => {
    const prods = (items || []).filter(item => item.category === 'product');

    // DEBUG: Log products received from backend
    console.log('=== PRODUCTS IN FRONTEND (JobOrders.jsx) ===');
    console.log('Total products:', prods.length);
    prods.forEach(p => {
      console.log(`Product: ${p.name} (id: ${p.id || p.item_id})`);
      console.log(`  - has ingredients: ${!!p.ingredients}`);
      console.log(`  - ingredients count: ${p.ingredients?.length || 0}`);
      if (p.ingredients && p.ingredients.length > 0) {
        console.log(`  - ingredients:`, p.ingredients);
      }
    });

    return prods;
  }, [items]);

  const handleView = (jo) => {
    setSelectedJO(jo);
    setShowDetailsModal(true);
  };

  const handleCreateJO = async (joData) => {
    try {
      if (Array.isArray(joData)) {
        // Bulk Create
        // We'll process them sequentially to ensure order and error handling
        let successCount = 0;
        const errors = [];

        for (const data of joData) {
          try {
            await createJobOrder(data);
            successCount++;
          } catch (err) {
            console.error('Failed to create JO:', err);
            errors.push(data.product_id); // Track which product failed
          }
        }

        if (successCount > 0) {
          toast.success(`${successCount} Job Orders created successfully`);
          refetch();
          setShowCreateModal(false);
        }

        if (errors.length > 0) {
          toast.error(`Failed to create ${errors.length} orders. Please check stock and try again.`);
        }

      } else {
        // Single Create (e.g. from existing code or strict single mode)
        await createJobOrder(joData);
        toast.success('Job order created successfully');
        refetch();
        setShowCreateModal(false);
      }

    } catch (error) {
      const errorData = error.response?.data;

      if (errorData?.insufficientIngredients) {
        // Show detailed insufficient stock error
        toast.error(
          <div>
            <p className="font-semibold">{errorData.message}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {errorData.insufficientIngredients.map((ing, idx) => (
                <li key={idx}>• {ing.message}</li>
              ))}
            </ul>
          </div>,
          { duration: 6000 }
        );
      } else {
        toast.error(errorData?.message || error.message || 'Failed to create job order');
      }
    }
  };

  const handleSaveDraft = async (joData) => {
    try {
      if (Array.isArray(joData)) {
        // Bulk Draft
        // Assuming we want to save all as drafts
        await Promise.all(joData.map(data => createJobOrderDraft(data)));
        toast.success(`${joData.length} drafts saved successfully`);
      } else {
        await createJobOrderDraft(joData);
        toast.success('Job order draft saved successfully');
      }

      refetch();
      setShowCreateModal(false);
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || error.message || 'Failed to save draft';
      toast.error(errorMessage);
    }
  };

  const handleStartProduction = async (jo) => {
    try {
      // Update status to in_progress - this might need a separate API endpoint
      // For now, we'll use updateJobOrder if available, or handle it in the component
      toast.success('Production started');
      refetch();
    } catch (error) {
      toast.error(error.message || 'Failed to start production');
    }
  };

  const handleCompleteProduction = async (jo) => {
    try {
      const completedJO = await completeJobOrder(jo.jo_id || jo.id);
      toast.success('Job order completed successfully');

      // Update the selected JO with enriched data including ingredients_consumed
      if (selectedJO?.jo_id === completedJO.jo_id) {
        setSelectedJO(completedJO);
      }

      refetch();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to complete job order';
      toast.error(errorMessage);
    }
  };

  if (loading || itemsLoading) {
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
          <p className="text-red-800 font-medium">Error loading job orders</p>
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Job Orders</h1>
          <p className="text-slate-500 mt-1">{filteredJOs.length} orders</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Job Order
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by JO number or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* JO Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600">JO Number</th>
                <th className="text-left p-4 font-medium text-slate-600">Product</th>
                <th className="text-left p-4 font-medium text-slate-600">Quantity</th>
                <th className="text-left p-4 font-medium text-slate-600">Created Date</th>
                <th className="text-left p-4 font-medium text-slate-600">Status</th>
                <th className="text-left p-4 font-medium text-slate-600">Completed</th>
                <th className="text-left p-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJOs.map(jo => {
                const status = statusConfig[jo.status];
                const StatusIcon = status.icon;
                const hasInsufficientStock = (jo.ingredients_consumed || jo.ingredients || []).some(ing => (ing.stock_after || 0) < 0);

                return (
                  <tr key={jo.jo_id || jo.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">
                        {jo.jo_number || <span className="text-slate-400 italic">Draft #{jo.jo_id}</span>}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Factory className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-700">{jo.product_name || jo.product?.name || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium text-slate-900">{jo.quantity_to_produce} units</td>
                    <td className="p-4 text-slate-600">{jo.created_date || (jo.created_at ? new Date(jo.created_at).toLocaleDateString() : 'N/A')}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("flex items-center gap-1 w-fit", status.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                        {hasInsufficientStock && jo.status === 'draft' && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">
                      {jo.completion_date
                        ? format(new Date(jo.completion_date), 'MMM d, yyyy h:mm a')
                        : '—'
                      }
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleView(jo)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {jo.status === 'draft' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStartProduction(jo)}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {jo.status === 'in_progress' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedJO(jo);
                              setShowDetailsModal(true);
                            }}
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <JOCreateModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setInitialProductId(null);
          }}
          onSubmit={handleCreateJO}
          onSaveDraft={handleSaveDraft}
          products={products}
          items={items || []}
          initialProductId={initialProductId}
        />
      )}

      <JODetailsModal
        jo={selectedJO}
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        onComplete={handleCompleteProduction}
      />
    </div>
  );
}