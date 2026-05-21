import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Search, Filter, Eye, Package, CheckCircle, Clock, Loader2, FileEdit, XCircle, Archive, ArchiveRestore, QrCode } from 'lucide-react';
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
import { usePurchaseOrders, useCreatePurchaseOrder, useReceivePurchaseOrder, useArchivePurchaseOrder, useRestorePurchaseOrder } from '@/hooks/usePurchaseOrders.js';
import { useSuppliers } from '@/hooks/useSuppliers.js';
import { useItems } from '@/hooks/useItems.js';
import * as purchaseOrderService from '../src/services/purchaseOrderService.js';
import POCreateWizard from '@/components/po/POCreateWizard';
import PODetailsModal from '@/components/po/PODetailsModal';
import POReceiptModal from '@/components/po/POReceiptModal';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import { toast } from 'sonner';
import { formatPeso } from '../src/lib/numberUtils.js';
import { usePermission } from '../src/hooks/usePermission';
import QRCodeModal from '@/components/common/QRCodeModal';
import { generateReceiveToken } from '../src/services/receiveTokenService.js';
import { normalizeApiError } from '../src/utils/errorHandler.js';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: FileEdit },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  partial: { label: "Partial", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Package },
  received: { label: "Received", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle }
};

const resolveWeightedAvgCost = (itemData = {}) => Number(
  itemData.weighted_avg_cost
  ?? itemData?.cost_metrics?.scoped?.weighted_avg_cost
  ?? itemData?.cost_metrics?.global?.weighted_avg_cost
  ?? itemData.cost_per_unit
  ?? 0
);

const transformPurchaseOrderForModal = (fullPO, fallbackPo = {}) => {
  const lineItems = fullPO.lineItems || fullPO.LineItems || [];
  const items = lineItems.map((lineItem) => {
    const lineItemData = lineItem.toJSON ? lineItem.toJSON() : lineItem;
    const itemData = lineItemData.item || lineItemData.Item || {};
    const itemName = itemData.name || itemData.item_name || lineItemData.item_name;
    const weightedAvgCost = resolveWeightedAvgCost(itemData);

    return {
      line_item_id: lineItemData.line_item_id,
      item_id: lineItemData.item_id,
      item_name: itemName,
      quantity: lineItemData.quantity_ordered,
      quantity_received: lineItemData.quantity_received || 0,
      unit_price: lineItemData.unit_price,
      total_price: lineItemData.total_price,
      expiry_date: lineItemData.expiry_date,
      fifo_enabled: Boolean(itemData.fifo_enabled),
      shelf_life_days: itemData.shelf_life_days ?? null,
      cost_metrics: itemData.cost_metrics || null,
      weighted_avg_cost: weightedAvgCost > 0 ? weightedAvgCost : null,
      quality_check: lineItemData.quality_check_status === 'passed' ? 'pass'
        : lineItemData.quality_check_status === 'failed' ? 'fail' : 'pass'
    };
  });

  const poData = fullPO.toJSON ? fullPO.toJSON() : fullPO;
  const supplierData = poData.supplier || poData.Supplier || {};
  return {
    ...poData,
    items,
    supplier_name: supplierData.name || fallbackPo.supplier_name,
    po_number: poData.po_number || fallbackPo.po_number
  };
};

export default function PurchaseOrders() {
  const [showArchivedTab, setShowArchivedTab] = useState(false);
  const { purchaseOrders, loading, error, refetch } = usePurchaseOrders({ archived: showArchivedTab ? 'true' : 'false' });
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const [valuationLocationId, setValuationLocationId] = useState('');
  const itemQuery = useMemo(() => ({
    limit: 1000,
    fields: 'dropdown',
    ...(valuationLocationId ? { valuation_location_id: valuationLocationId } : {})
  }), [valuationLocationId]);
  const { items, loading: itemsLoading } = useItems(itemQuery);
  const { createPurchaseOrder } = useCreatePurchaseOrder();
  const { receivePurchaseOrder } = useReceivePurchaseOrder();
  const { archivePurchaseOrder, loading: archiving } = useArchivePurchaseOrder();
  const { restorePurchaseOrder, loading: restoring } = useRestorePurchaseOrder();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(() => (
    new URLSearchParams(window.location.search).get('action') === 'create'
  ));
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [initialItemId, setInitialItemId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'create') return null;
    return params.get('itemId');
  });
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [poToArchive, setPoToArchive] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPO, setQrPO] = useState(null);
  const [receiptLocationRefreshing, setReceiptLocationRefreshing] = useState(false);
  const receiptFetchRequestRef = useRef(0);
  const { canCreate, canDelete, can } = usePermission();

  // Check URL params for deep linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      // Clean up URL without reload.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const filteredPOs = useMemo(() => {
    if (!purchaseOrders) return [];
    return purchaseOrders.filter(po => {
      const matchesSearch =
        po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (po.supplier_name || po.Supplier?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
  }, [purchaseOrders, searchQuery, statusFilter]);

  const buildValuationParams = (locationId = valuationLocationId) => (
    locationId ? { valuation_location_id: locationId } : {}
  );

  const handleView = async (po) => {
    try {
      const fullPO = await purchaseOrderService.getPurchaseOrderById(
        po.po_id || po.id,
        buildValuationParams()
      );
      setSelectedPO(transformPurchaseOrderForModal(fullPO, po));
      setShowDetailsModal(true);
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to load purchase order details');
      }
    }
  };

  const handleReceive = async (po) => {
    try {
      const fullPO = await purchaseOrderService.getPurchaseOrderById(
        po.po_id || po.id,
        buildValuationParams()
      );
      setSelectedPO(transformPurchaseOrderForModal(fullPO, po));
      setShowReceiptModal(true);
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to load purchase order details');
      }
    }
  };

  const handleReceiptLocationChange = async (locationId) => {
    const poId = selectedPO?.po_id || selectedPO?.id;
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!poId || !Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
      return;
    }

    const requestId = receiptFetchRequestRef.current + 1;
    receiptFetchRequestRef.current = requestId;
    setReceiptLocationRefreshing(true);

    try {
      const fullPO = await purchaseOrderService.getPurchaseOrderById(
        poId,
        { valuation_location_id: normalizedLocationId }
      );
      if (receiptFetchRequestRef.current !== requestId) return;

      setSelectedPO((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...transformPurchaseOrderForModal(fullPO, prev)
        };
      });
      setValuationLocationId(String(normalizedLocationId));
    } catch (error) {
      if (receiptFetchRequestRef.current === requestId && !normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to refresh location-based average cost');
      }
    } finally {
      if (receiptFetchRequestRef.current === requestId) {
        setReceiptLocationRefreshing(false);
      }
    }
  };

  const handleCreatePO = async (poData) => {
    try {
      await createPurchaseOrder(poData);
      toast.success('Purchase order created successfully');
      refetch();
      setShowCreateWizard(false);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error("You do not have permission to create Purchase Orders.");
      } else {
        if (!normalizeApiError(error).isGlobalCandidate) {
          toast.error(error.message || 'Failed to create purchase order');
        }
      }
    }
  };

  const handleReceiptConfirm = async (receiptData) => {
    try {
      if (!receiptData.location_id) {
        toast.error('Please select a location before confirming receipt.');
        return;
      }
      // Transform receipt data to match backend expectations
      const line_items = (receiptData.items || []).map(item => {
        // Map quality_check ('pass'/'fail') to quality_check_status ('passed'/'failed')
        const quality_check_status = item.quality_check === 'pass' ? 'passed' :
          item.quality_check === 'fail' ? 'failed' : 'pending';

        return {
          line_item_id: item.line_item_id || item.item_id, // Use line_item_id if available, fallback to item_id
          quantity_received: item.quantity_received || item.quantity || 0,
          quality_check_status: quality_check_status
        };
      });

      const transformedData = {
        location_id: receiptData.location_id,
        line_items: line_items,
        delivery_rating: receiptData.delivery_rating,
        notes: receiptData.notes
      };

      await receivePurchaseOrder(selectedPO.po_id || selectedPO.id, transformedData);
      setValuationLocationId(String(receiptData.location_id));
      toast.success('Purchase order received successfully');
      refetch();
      setShowReceiptModal(false);
      setSelectedPO(null);
      setReceiptLocationRefreshing(false);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error("You do not have permission to receive Purchase Orders.");
      } else {
        if (!normalizeApiError(error).isGlobalCandidate) {
          toast.error(error.message || 'Failed to receive purchase order');
        }
      }
    }
  };

  const handleArchiveClick = (po) => {
    setPoToArchive(po);
    setShowArchiveDialog(true);
  };

  const handleConfirmArchive = async () => {
    if (!poToArchive) return;

    try {
      await archivePurchaseOrder(poToArchive.po_id || poToArchive.id);
      toast.success('Purchase Order archived successfully');
      setShowArchiveDialog(false);
      setPoToArchive(null);
      refetch();
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.response?.data?.message || error.message);
      }
      setShowArchiveDialog(false);
      setPoToArchive(null);
    }
  };

  const handleRestore = async (po) => {
    try {
      await restorePurchaseOrder(po.po_id || po.id);
      toast.success('Purchase Order restored successfully');
      refetch();
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.response?.data?.message || error.message);
      }
    }
  };

  const canArchive = canDelete('purchase_orders');

  const handleGenerateQR = (po) => {
    setQrPO(po);
    setShowQRModal(true);
  };

  const handleQRTokenGenerate = async (orderType, orderId) => {
    return await generateReceiveToken(orderType, orderId);
  };

  if (loading || suppliersLoading || itemsLoading) {
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
          <p className="text-red-800 font-medium">Error loading purchase orders</p>
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Purchase Orders</h1>
          <p className="text-slate-500 mt-1">{filteredPOs.length} orders</p>
        </div>
        {canCreate('purchase_orders') && (
          <Button onClick={() => setShowCreateWizard(true)} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Purchase Order
          </Button>
        )}
      </div>

      {/* Archive Toggle */}
      <div className="flex gap-2">
        <Button
          variant={!showArchivedTab ? 'default' : 'outline'}
          onClick={() => setShowArchivedTab(false)}
          className={!showArchivedTab ? 'bg-teal-600 hover:bg-teal-700' : ''}
        >
          Active Purchase Orders
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

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by PO number or supplier..."
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600">PO Number</th>
                <th className="text-left p-4 font-medium text-slate-600">Supplier</th>
                <th className="text-left p-4 font-medium text-slate-600">Items</th>
                <th className="text-left p-4 font-medium text-slate-600">Total</th>
                <th className="text-left p-4 font-medium text-slate-600">Order Date</th>
                <th className="text-left p-4 font-medium text-slate-600">Expected</th>
                <th className="text-left p-4 font-medium text-slate-600">Status</th>
                <th className="text-left p-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPOs.map(po => {
                const status = statusConfig[po.status];
                const StatusIcon = status.icon;
                return (
                  <tr key={po.po_id || po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">{po.po_number}</span>
                    </td>
                    <td className="p-4 text-slate-600">{po.supplier_name || po.Supplier?.name || 'N/A'}</td>
                    <td className="p-4 text-slate-600">{po.item_count || 0} items</td>
                    <td className="p-4 font-medium text-slate-900">{formatPeso(po.total_amount)}</td>
                    <td className="p-4 text-slate-600">{po.order_date}</td>
                    <td className="p-4 text-slate-600">{po.expected_delivery_date}</td>
                    <td className="p-4">
                      <Badge variant="outline" className={cn("flex items-center gap-1 w-fit", status.color)}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleView(po)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {!showArchivedTab && po.status !== 'received' && can('po:receive') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReceive(po)}
                            className="text-teal-600 border-teal-200 hover:bg-teal-50"
                          >
                            Receive
                          </Button>
                        )}
                        {!showArchivedTab && (po.status === 'pending' || po.status === 'partial') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateQR(po)}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            title="Generate QR Code for mobile receiving"
                          >
                            <QrCode className="w-4 h-4" />
                          </Button>
                        )}
                        {!showArchivedTab && canArchive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleArchiveClick(po)}
                            className="text-slate-600 border-slate-200 hover:bg-slate-50"
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        {showArchivedTab && canArchive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(po)}
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
      </div >

      {/* Modals */}
      {
        showCreateWizard && (
          <POCreateWizard
            open={showCreateWizard}
            onClose={() => {
              setShowCreateWizard(false);
              setInitialItemId(null);
            }}
            onSubmit={handleCreatePO}
            suppliers={suppliers?.filter(s => s.status === 'active') || []}
            items={items || []}
            initialItemId={initialItemId}
          />
        )
      }

      <PODetailsModal
        po={selectedPO}
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
      />

      {
        showReceiptModal && selectedPO && (
          <POReceiptModal
            po={selectedPO}
            open={showReceiptModal}
            onClose={() => {
              receiptFetchRequestRef.current += 1;
              setReceiptLocationRefreshing(false);
              setShowReceiptModal(false);
            }}
            onConfirm={handleReceiptConfirm}
            onLocationChange={handleReceiptLocationChange}
            locationUpdating={receiptLocationRefreshing}
          />
        )
      }

      {/* QR Code Modal */}
      {
        showQRModal && qrPO && (
          <QRCodeModal
            open={showQRModal}
            onClose={() => {
              setShowQRModal(false);
              setQrPO(null);
            }}
            orderType="PO"
            orderId={qrPO.po_id || qrPO.id}
            orderNumber={qrPO.po_number}
            onGenerateToken={handleQRTokenGenerate}
          />
        )
      }

      {/* Archive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={showArchiveDialog}
        onClose={() => {
          setShowArchiveDialog(false);
          setPoToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        title="Archive Purchase Order"
        description={
          poToArchive
            ? `Are you sure you want to archive Purchase Order ${poToArchive.po_number}? You can restore it later from the Archived tab.`
            : ''
        }
        confirmText="Archive Purchase Order"
        variant="destructive"
        loading={archiving}
      />
    </div >
  );
}
