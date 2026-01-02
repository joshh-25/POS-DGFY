import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Filter, Eye, Package, Truck, CheckCircle, Clock, AlertCircle, Loader2, FileEdit, XCircle } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "../src/lib/utils.js";
import { usePurchaseOrders, useCreatePurchaseOrder, useReceivePurchaseOrder } from '@/hooks/usePurchaseOrders.js';
import { useSuppliers } from '@/hooks/useSuppliers.js';
import { useItems } from '@/hooks/useItems.js';
import * as purchaseOrderService from '../src/services/purchaseOrderService.js';
import POCreateWizard from '@/components/po/POCreateWizard';
import PODetailsModal from '@/components/po/PODetailsModal';
import POReceiptModal from '@/components/po/POReceiptModal';
import { toast } from 'sonner';
import { formatNumber } from '../src/lib/numberUtils.js';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: FileEdit },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  partial: { label: "Partial", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Package },
  received: { label: "Received", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle }
};

export default function PurchaseOrders() {
  const { purchaseOrders, loading, error, refetch } = usePurchaseOrders();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { items, loading: itemsLoading } = useItems();
  const { createPurchaseOrder, loading: creating } = useCreatePurchaseOrder();
  const { receivePurchaseOrder, loading: receiving } = useReceivePurchaseOrder();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [initialItemId, setInitialItemId] = useState(null);

  // Check URL params for deep linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      const itemId = params.get('itemId');
      if (itemId) {
        setInitialItemId(itemId);
      }
      setShowCreateWizard(true);
      // Clean up URL without reload
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

  const handleView = (po) => {
    setSelectedPO(po);
    setShowDetailsModal(true);
  };

  const handleReceive = async (po) => {
    try {
      // Fetch full PO details with line items to ensure we have line_item_id
      const fullPO = await purchaseOrderService.getPurchaseOrderById(po.po_id || po.id);

      // Transform lineItems to items format expected by modal
      // Handle both Sequelize models and plain objects
      const lineItems = fullPO.lineItems || fullPO.LineItems || [];
      const items = lineItems.map(lineItem => {
        const lineItemData = lineItem.toJSON ? lineItem.toJSON() : lineItem;
        const itemData = lineItemData.item || lineItemData.Item || {};
        const itemName = itemData.name || itemData.item_name || lineItemData.item_name;

        return {
          line_item_id: lineItemData.line_item_id,
          item_id: lineItemData.item_id,
          item_name: itemName,
          quantity: lineItemData.quantity_ordered,
          quantity_received: lineItemData.quantity_received || 0,
          unit_price: lineItemData.unit_price,
          total_price: lineItemData.total_price,
          quality_check: lineItemData.quality_check_status === 'passed' ? 'pass' :
            lineItemData.quality_check_status === 'failed' ? 'fail' : 'pass'
        };
      });

      const poData = fullPO.toJSON ? fullPO.toJSON() : fullPO;
      const supplierData = poData.supplier || poData.Supplier || {};

      setSelectedPO({
        ...poData,
        items: items,
        supplier_name: supplierData.name || po.supplier_name,
        po_number: poData.po_number || po.po_number
      });
      setShowReceiptModal(true);
    } catch (error) {
      toast.error('Failed to load purchase order details');
    }
  };

  const handleCreatePO = async (poData) => {
    try {
      await createPurchaseOrder(poData);
      toast.success('Purchase order created successfully');
      refetch();
      setShowCreateWizard(false);
    } catch (error) {
      toast.error(error.message || 'Failed to create purchase order');
    }
  };

  const handleReceiptConfirm = async (receiptData) => {
    try {
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
        line_items: line_items,
        delivery_rating: receiptData.delivery_rating,
        notes: receiptData.notes
      };

      await receivePurchaseOrder(selectedPO.po_id || selectedPO.id, transformedData);
      toast.success('Purchase order received successfully');
      refetch();
      setShowReceiptModal(false);
      setSelectedPO(null);
    } catch (error) {
      toast.error(error.message || 'Failed to receive purchase order');
    }
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
        <Button onClick={() => setShowCreateWizard(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Purchase Order
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="received">Received</SelectItem>
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
                    <td className="p-4 text-slate-600">{(po.items || po.line_items || []).length} items</td>
                    <td className="p-4 font-medium text-slate-900">₱{formatNumber(po.total_amount, 2)}</td>
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
                        {po.status !== 'received' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReceive(po)}
                            className="text-teal-600 border-teal-200 hover:bg-teal-50"
                          >
                            Receive
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
      {showCreateWizard && (
        <POCreateWizard
          open={showCreateWizard}
          onClose={() => {
            setShowCreateWizard(false);
            setInitialItemId(null);
          }}
          onSubmit={handleCreatePO}
          suppliers={suppliers || []}
          items={items || []}
          initialItemId={initialItemId}
        />
      )}

      <PODetailsModal
        po={selectedPO}
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
      />

      {showReceiptModal && selectedPO && (
        <POReceiptModal
          po={selectedPO}
          open={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          onConfirm={handleReceiptConfirm}
        />
      )}
    </div>
  );
}