import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { formatNumber } from '@/lib/numberUtils.js';
import { canBeJobOrderOutput } from '@/components/utils/categoryHelpers';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Factory,
  Clock,
  Play,
  CheckCircle,
  AlertTriangle,
  Loader2,
  XCircle,
  Archive,
  ArchiveRestore,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils.js';
import {
  useFeatureJobOrders,
  useFeatureCreateJobOrder,
  useFeatureCompleteJobOrder,
  useFeatureCreateJobOrderDraft,
  useFeatureFinalizeJobOrder,
  useFeatureArchiveJobOrder,
  useFeatureRestoreJobOrder,
  useFeatureJobOrderItems,
  generateFeatureReceiveToken,
} from '@/src/features/jobOrders';
import JOCreateModal from '@/components/jo/JOCreateModal';
import JODetailsModal from '@/components/jo/JODetailsModal';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import QRCodeModal from '@/components/common/QRCodeModal';
import { usePermission } from '@/hooks/usePermission';
import { toast } from 'sonner';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Play },
  partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export default function JobOrdersPage() {
  const createIntent = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldOpen = params.get('action') === 'create';
    return {
      shouldOpen,
      productId: shouldOpen ? params.get('productId') : null,
    };
  }, []);

  const [showArchivedTab, setShowArchivedTab] = useState(false);
  const { jobOrders, loading, error, refetch } = useFeatureJobOrders({ archived: showArchivedTab ? 'true' : 'false' });
  const { items, loading: itemsLoading } = useFeatureJobOrderItems({ limit: 1000, fields: 'dropdown' });
  const { createJobOrder } = useFeatureCreateJobOrder();
  const { completeJobOrder } = useFeatureCompleteJobOrder();
  const { createJobOrderDraft } = useFeatureCreateJobOrderDraft();
  const { finalizeJobOrder } = useFeatureFinalizeJobOrder();
  const { archiveJobOrder, loading: archiving } = useFeatureArchiveJobOrder();
  const { restoreJobOrder, loading: restoring } = useFeatureRestoreJobOrder();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJO, setSelectedJO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(createIntent.shouldOpen);
  const [initialProductId, setInitialProductId] = useState(createIntent.productId);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [joToArchive, setJoToArchive] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrJO, setQrJO] = useState(null);
  const { canCreate, canEdit, canDelete } = usePermission();

  useEffect(() => {
    if (createIntent.shouldOpen) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [createIntent.shouldOpen]);

  const filteredJOs = useMemo(() => {
    if (!jobOrders) return [];
    return jobOrders
      .filter((jo) => {
        const matchesSearch =
          (jo.jo_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (jo.product_name || jo.product?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || jo.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.created_date || b.created_at) - new Date(a.created_date || a.created_at));
  }, [jobOrders, searchQuery, statusFilter]);

  const products = useMemo(() => (items || []).filter((item) => canBeJobOrderOutput(item)), [items]);

  const handleView = (jo) => {
    setSelectedJO(jo);
    setShowDetailsModal(true);
  };

  const handleCreateJO = async (joData) => {
    try {
      if (Array.isArray(joData)) {
        let successCount = 0;
        const errors = [];

        for (const data of joData) {
          try {
            await createJobOrder(data);
            successCount += 1;
          } catch (err) {
            console.error('Failed to create JO:', err);
            errors.push(data.product_id);
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
        await createJobOrder(joData);
        toast.success('Job order created successfully');
        refetch();
        setShowCreateModal(false);
      }
    } catch (error) {
      const errorData = error.response?.data;

      if (errorData?.insufficientIngredients) {
        toast.error(
          <div>
            <p className="font-semibold">{errorData.message}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {errorData.insufficientIngredients.map((ing, idx) => (
                <li key={idx}>- {ing.message}</li>
              ))}
            </ul>
          </div>,
          { duration: 6000 },
        );
      } else {
        toast.error(errorData?.message || error.message || 'Failed to create job order');
      }
    }
  };

  const handleSaveDraft = async (joData) => {
    try {
      if (Array.isArray(joData)) {
        await Promise.all(joData.map((data) => createJobOrderDraft(data)));
        toast.success(`${joData.length} drafts saved successfully`);
      } else {
        await createJobOrderDraft(joData);
        toast.success('Job order draft saved successfully');
      }

      refetch();
      setShowCreateModal(false);
    } catch (error) {
      const errorMessage =
        error.response?.data?.errors?.map((e) => `${e.field}: ${e.message}`).join(', ') ||
        error.message ||
        'Failed to save draft';
      toast.error(errorMessage);
    }
  };

  const handleStartProduction = async (jo) => {
    try {
      await finalizeJobOrder(jo.jo_id || jo.id);
      toast.success('Production started');
      refetch();
    } catch (error) {
      const errorData = error.response?.data;
      if (errorData?.insufficientIngredients) {
        toast.error(
          <div>
            <p className="font-semibold">{errorData.message}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {errorData.insufficientIngredients.map((ing, idx) => (
                <li key={idx}>- {ing.message}</li>
              ))}
            </ul>
          </div>,
          { duration: 6000 },
        );
      } else {
        toast.error(errorData?.message || error.message || 'Failed to start production');
      }
    }
  };

  const handleCompleteProduction = async (jo, expiryOverride, notes = null, quantityProduced = null, qualityCheck = null) => {
    try {
      const completedJO = await completeJobOrder(
        jo.jo_id || jo.id,
        expiryOverride,
        notes,
        quantityProduced,
        qualityCheck,
      );
      toast.success('Job order completed successfully');

      if (selectedJO?.jo_id === completedJO.jo_id) {
        setSelectedJO(completedJO);
      }

      refetch();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to complete job order';
      toast.error(errorMessage);
    }
  };

  const handleArchiveClick = (jo) => {
    setJoToArchive(jo);
    setShowArchiveDialog(true);
  };

  const handleConfirmArchive = async () => {
    if (!joToArchive) return;

    try {
      await archiveJobOrder(joToArchive.jo_id || joToArchive.id);
      toast.success('Job Order archived successfully');
      setShowArchiveDialog(false);
      setJoToArchive(null);
      refetch();
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('You do not have permission to archive Job Orders.');
      } else {
        toast.error(error.response?.data?.message || error.message);
      }
      setShowArchiveDialog(false);
      setJoToArchive(null);
    }
  };

  const handleRestore = async (jo) => {
    try {
      await restoreJobOrder(jo.jo_id || jo.id);
      toast.success('Job Order restored successfully');
      refetch();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    }
  };

  const canArchive = canDelete('job_orders');

  const handleGenerateQR = (jo) => {
    setQrJO(jo);
    setShowQRModal(true);
  };

  const handleQRTokenGenerate = async (orderType, orderId) => generateFeatureReceiveToken(orderType, orderId);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Job Orders</h1>
          <p className="text-slate-500 mt-1">{filteredJOs.length} orders</p>
        </div>
        {canCreate('job_orders') && (
          <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Job Order
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={!showArchivedTab ? 'default' : 'outline'}
          onClick={() => setShowArchivedTab(false)}
          className={!showArchivedTab ? 'bg-teal-600 hover:bg-teal-700' : ''}
        >
          Active Job Orders
        </Button>
        <Button
          variant={showArchivedTab ? 'default' : 'outline'}
          onClick={() => setShowArchivedTab(true)}
          className={showArchivedTab ? 'bg-slate-600 hover:bg-slate-700' : ''}
        >
          <Archive className="w-4 h-4 mr-2" />
          Archived
        </Button>
      </div>

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
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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
              {filteredJOs.map((jo) => {
                const status = statusConfig[jo.status];
                const StatusIcon = status.icon;
                const hasInsufficientStock = (jo.ingredients_consumed || jo.ingredients || []).some(
                  (ing) => (ing.stock_after || 0) < 0,
                );

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
                    <td className="p-4 font-medium text-slate-900">
                      {jo.status === 'partial' || jo.status === 'completed'
                        ? `${formatNumber(jo.quantity_produced || 0)} / ${formatNumber(jo.quantity_to_produce)} units`
                        : `${formatNumber(jo.quantity_to_produce)} units`}
                    </td>
                    <td className="p-4 text-slate-600">
                      {jo.created_date || (jo.created_at ? new Date(jo.created_at).toLocaleDateString() : 'N/A')}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('flex items-center gap-1 w-fit', status.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                        {hasInsufficientStock && jo.status === 'draft' && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">
                      {jo.completion_date ? format(new Date(jo.completion_date), 'MMM d, yyyy h:mm a') : '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleView(jo)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {!showArchivedTab && jo.status === 'draft' && canEdit('job_orders') && (
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
                        {!showArchivedTab && (jo.status === 'in_progress' || jo.status === 'partial') && canEdit('job_orders') && (
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
                        {!showArchivedTab && (jo.status === 'in_progress' || jo.status === 'partial') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateQR(jo)}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            title="Generate QR code for mobile completion"
                          >
                            <QrCode className="w-4 h-4" />
                          </Button>
                        )}
                        {!showArchivedTab && canArchive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleArchiveClick(jo)}
                            className="text-slate-600 border-slate-200 hover:bg-slate-50"
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        {showArchivedTab && canArchive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(jo)}
                            disabled={restoring}
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          >
                            <ArchiveRestore className="w-4 h-4 mr-1" />
                            Restore
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

      {showQRModal && qrJO && (
        <QRCodeModal
          open={showQRModal}
          onClose={() => {
            setShowQRModal(false);
            setQrJO(null);
          }}
          orderType="JO"
          orderId={qrJO.jo_id || qrJO.id}
          orderNumber={qrJO.jo_number || `Draft #${qrJO.jo_id}`}
          onGenerateToken={handleQRTokenGenerate}
        />
      )}

      <DeleteConfirmDialog
        open={showArchiveDialog}
        onClose={() => {
          setShowArchiveDialog(false);
          setJoToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        title="Archive Job Order"
        description={
          joToArchive
            ? `Are you sure you want to archive Job Order ${joToArchive.jo_number || `Draft #${joToArchive.jo_id}`}? You can restore it later from the Archived tab.`
            : ''
        }
        confirmText="Archive Job Order"
        variant="destructive"
        loading={archiving}
      />
    </div>
  );
}
