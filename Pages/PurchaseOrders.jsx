import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Filter, Eye, Package, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react';
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
import { dummyPurchaseOrders, dummySuppliers, dummyItems, getStockStatus } from '@/components/data/dummyData';
import POCreateWizard from '@/components/po/POCreateWizard';
import PODetailsModal from '@/components/po/PODetailsModal';
import POReceiptModal from '@/components/po/POReceiptModal';

const statusConfig = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  partial: { label: "Partial", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Package },
  received: { label: "Received", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle }
};

export default function PurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState(dummyPurchaseOrders);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      const matchesSearch = 
        po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        po.supplier_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
  }, [purchaseOrders, searchQuery, statusFilter]);

  const handleView = (po) => {
    setSelectedPO(po);
    setShowDetailsModal(true);
  };

  const handleReceive = (po) => {
    setSelectedPO(po);
    setShowReceiptModal(true);
  };

  const handleCreatePO = (poData) => {
    const newPO = {
      ...poData,
      id: `po-${Date.now()}`,
      po_number: `PO-${String(purchaseOrders.length + 1).padStart(3, '0')}`,
      order_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      delivery_rating: null,
      notes: ''
    };
    setPurchaseOrders(prev => [...prev, newPO]);
    setShowCreateWizard(false);
  };

  const handleReceiptConfirm = (receiptData) => {
    setPurchaseOrders(prev => prev.map(po => {
      if (po.id === selectedPO.id) {
        return {
          ...po,
          ...receiptData,
          status: receiptData.status,
          received_date: new Date().toISOString().split('T')[0]
        };
      }
      return po;
    }));
    setShowReceiptModal(false);
    setSelectedPO(null);
  };

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
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">{po.po_number}</span>
                    </td>
                    <td className="p-4 text-slate-600">{po.supplier_name}</td>
                    <td className="p-4 text-slate-600">{po.items.length} items</td>
                    <td className="p-4 font-medium text-slate-900">${po.total_amount.toFixed(2)}</td>
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
          onClose={() => setShowCreateWizard(false)}
          onSubmit={handleCreatePO}
          suppliers={dummySuppliers}
          items={dummyItems}
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