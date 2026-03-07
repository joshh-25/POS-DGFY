import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus, Search, Eye, CheckCircle, XCircle, Clock, Activity,
  FileEdit, PackageCheck, Download, Loader2, AlertTriangle, TrendingUp
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "../src/lib/utils.js";
import { toast } from 'sonner';
import { formatNumber } from '../src/lib/numberUtils.js';
import { usePermission } from '../src/hooks/usePermission';
import { useItems } from '@/hooks/useItems.js';
import { useDispatchOrders } from '@/hooks/useDispatchOrders.js';
import * as dispatchOrderService from '../src/services/dispatchOrderService.js';
import DOCreateModal from '@/components/dispatch/DOCreateModal';
import DODetailsModal from '@/components/dispatch/DODetailsModal';
import DODispatchModal from '@/components/dispatch/DODispatchModal';
import DOEarningsPanel from '@/components/dispatch/DOEarningsPanel';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: FileEdit },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
  partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Activity },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle }
};

const StatusBadge = ({ status }) => {
  const cfg = statusConfig[status] || statusConfig.draft;
  const Icon = cfg.icon;
  return (
    <Badge className={cn('flex items-center gap-1 border text-xs font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
};

export default function DispatchOrders() {
  const [activeView, setActiveView] = useState('orders'); // 'orders' | 'earnings'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedDO, setSelectedDO] = useState(null);
  const [selectedDOId, setSelectedDOId] = useState(null);
  const [editingDO, setEditingDO] = useState(null);
  const [cancellingDO, setCancellingDO] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { can } = usePermission();
  const { items } = useItems({ limit: 1000, fields: 'dropdown' });
  const { dispatchOrders, stats, loading, refetch: fetchDispatchOrders } = useDispatchOrders({ limit: 200 });

  const filteredDOs = useMemo(() => {
    return dispatchOrders.filter(d => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        d.do_number?.toLowerCase().includes(q) ||
        d.recipient_name?.toLowerCase().includes(q) ||
        d.reference_jo?.toLowerCase().includes(q) ||
        d.reference_po?.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [dispatchOrders, searchQuery, statusFilter]);

  const handleView = (doOrder) => {
    setSelectedDOId(doOrder.do_id);
    setShowDetailsModal(true);
  };

  const handleCreate = async (payload) => {
    const result = await dispatchOrderService.createDispatchOrder(payload);
    toast.success(result.message || 'Dispatch Order created');
    await fetchDispatchOrders();
  };

  const handleUpdate = async (payload) => {
    await dispatchOrderService.updateDispatchOrder(editingDO.do_id, payload);
    toast.success('Dispatch Order updated');
    await fetchDispatchOrders();
    setEditingDO(null);
  };

  const handleDispatch = async (lines) => {
    await dispatchOrderService.dispatchLines(selectedDO.do_id, lines);
    toast.success('Dispatch executed successfully');
    setShowDispatchModal(false);
    setShowDetailsModal(false);
    await fetchDispatchOrders();
  };

  const handleCancelConfirm = async () => {
    if (!cancellingDO) return;
    setCancelling(true);
    try {
      const result = await dispatchOrderService.cancelDispatchOrder(cancellingDO.do_id, cancelReason);
      toast.success(result.message || 'Dispatch Order cancelled');
      setShowCancelDialog(false);
      setCancellingDO(null);
      setCancelReason('');
      setShowDetailsModal(false);
      await fetchDispatchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await dispatchOrderService.exportDispatchOrdersCSV({ status: statusFilter !== 'all' ? statusFilter : undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispatch-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try { return format(new Date(d), 'MMM dd, yyyy'); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dispatch Orders</h1>
          <p className="text-slate-500 mt-1">Manage outbound finished goods dispatch</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setActiveView('orders')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors',
                activeView === 'orders'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              Orders
            </button>
            <button
              onClick={() => setActiveView('earnings')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors border-l border-slate-200',
                activeView === 'earnings'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Earnings
            </button>
          </div>

          {activeView === 'orders' && can('do:view') && (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
          {activeView === 'orders' && can('do:create') && (
            <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              New Dispatch Order
            </Button>
          )}
        </div>
      </div>

      {/* Earnings view */}
      {activeView === 'earnings' && <DOEarningsPanel />}

      {/* Orders view */}
      {activeView === 'orders' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Draft', value: stats.draft || 0, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
            { label: 'Confirmed', value: stats.confirmed || 0, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
            { label: 'Partial', value: stats.partial || 0, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
            { label: 'Completed', value: stats.completed || 0, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Cancelled', value: stats.cancelled || 0, color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
          ].map(s => (
            <div key={s.label} className={cn('rounded-xl border p-4', s.bg)}>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{s.label}</p>
              <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {activeView === 'orders' && <>
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by DO#, recipient, reference…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([v, c]) => (
              <SelectItem key={v} value={v}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : filteredDOs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <PackageCheck className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium">No dispatch orders found</p>
          {can('do:create') && (
            <Button
              className="mt-4 bg-teal-600 hover:bg-teal-700"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" /> Create your first DO
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">DO #</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Recipient</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Date</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Lines</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Reference</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredDOs.map((doOrder, idx) => (
                <tr
                  key={doOrder.do_id}
                  className={cn(
                    'border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer',
                    idx % 2 === 0 ? '' : 'bg-slate-50/30'
                  )}
                  onClick={() => handleView(doOrder)}
                >
                  <td className="py-3 px-4 font-medium text-teal-700">{doOrder.do_number}</td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-slate-800">{doOrder.recipient_name}</p>
                      <p className="text-xs text-slate-400 capitalize">{doOrder.recipient_type}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{formatDate(doOrder.dispatch_date)}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={doOrder.status} />
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {doOrder.line_count || doOrder.lines?.length || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-xs">
                    {doOrder.reference_jo && <span className="mr-2">JO: {doOrder.reference_jo}</span>}
                    {doOrder.reference_po && <span>PO: {doOrder.reference_po}</span>}
                    {!doOrder.reference_jo && !doOrder.reference_po && '—'}
                  </td>
                  <td className="py-3 px-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleView(doOrder); }}
                      className="text-slate-400 hover:text-teal-600"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}

      {/* Modals */}
      <DOCreateModal
        open={showCreateModal && !editingDO}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreate}
        items={items || []}
      />

      <DOCreateModal
        open={!!editingDO}
        onClose={() => setEditingDO(null)}
        onSave={handleUpdate}
        items={items || []}
        existingDO={editingDO}
      />

      <DODetailsModal
        open={showDetailsModal}
        onClose={() => { setShowDetailsModal(false); setSelectedDOId(null); }}
        doId={selectedDOId}
        onEdit={(doOrder) => {
          setEditingDO(doOrder);
          setShowDetailsModal(false);
        }}
        onDispatch={(doOrder) => {
          setSelectedDO(doOrder);
          setShowDispatchModal(true);
        }}
        onCancel={(doOrder) => {
          setCancellingDO(doOrder);
          setShowCancelDialog(true);
          setShowDetailsModal(false); // Close details so cancel dialog is unobstructed
        }}
        onRefresh={fetchDispatchOrders}
      />

      <DODispatchModal
        open={showDispatchModal}
        onClose={() => { setShowDispatchModal(false); setSelectedDO(null); }}
        onDispatch={handleDispatch}
        do={selectedDO}
      />

      {/* Cancel dialog — rendered LAST so its portal sits above all other open modals */}
      <Dialog
        open={showCancelDialog && !!cancellingDO}
        onOpenChange={(open) => {
          if (!open) { setShowCancelDialog(false); setCancellingDO(null); setCancelReason(''); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <DialogTitle className="font-semibold text-slate-900">Cancel Dispatch Order</DialogTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Are you sure you want to cancel <strong>{cancellingDO?.do_number}</strong>?
                  Any partial dispatches will need to be voided separately.
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Reason (optional)</label>
            <Input
              placeholder="Reason for cancellation"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowCancelDialog(false); setCancellingDO(null); setCancelReason(''); }}
              disabled={cancelling}
            >
              Keep
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleCancelConfirm}
              disabled={cancelling}
            >
              {cancelling && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
