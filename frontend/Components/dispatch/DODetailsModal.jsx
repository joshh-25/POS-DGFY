import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  PackageCheck,
  XCircle,
  Archive,
  Clock,
  Activity,
  FileEdit,
  Loader2,
  User,
  Calendar,
  Package,
  Hash,
  AlertTriangle,
  Pencil
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';
import { format } from 'date-fns';
import * as dispatchOrderService from '../../src/services/dispatchOrderService.js';
import { toast } from 'sonner';
import { usePermission } from '../../src/hooks/usePermission';

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
    <Badge className={cn('flex items-center gap-1 border font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
};

/**
 * DODetailsModal — full detail view of a Dispatch Order.
 *
 * Props:
 *   open           {boolean}
 *   onClose        {function}
 *   doId           {number|null}
 *   onConfirm      {function(do_)} — called after confirm action
 *   onDispatch     {function(do_)} — called to open the dispatch modal
 *   onCancel       {function(do_)} — called after cancel action
 *   onArchive      {function(do_)} — called after archive action
 *   onEdit         {function(do_)} — called to open edit modal
 *   onRefresh      {function}      — called after any mutation to refresh the list
 */
export default function DODetailsModal({
  open,
  onClose,
  doId,
  onConfirm,
  onDispatch,
  onCancel,
  onArchive,
  onEdit,
  onRefresh
}) {
  const [doOrder, setDoOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null); // { lineId, value: string } | null
  const [savingPrice, setSavingPrice] = useState(false);
  const { can } = usePermission();

  useEffect(() => {
    if (open && doId) {
      loadDetails();
    }
  }, [open, doId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const data = await dispatchOrderService.getDispatchOrderById(doId);
      setDoOrder(data);
    } catch (err) {
      toast.error('Failed to load dispatch order details');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setActionLoading('confirm');
    try {
      await dispatchOrderService.confirmDispatchOrder(doId);
      toast.success('Dispatch Order confirmed');
      await loadDetails();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm');
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async () => {
    setActionLoading('archive');
    try {
      await dispatchOrderService.archiveDispatchOrder(doId);
      toast.success('Dispatch Order archived');
      onRefresh?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = () => {
    setDoOrder(null);
    setEditingPrice(null);
    onClose();
  };

  const handleSaveLinePrice = async (lineId) => {
    const raw = editingPrice?.value?.trim();
    const parsed = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && (isNaN(parsed) || parsed < 0)) {
      toast.error('Enter a valid price or leave blank to clear');
      return;
    }
    setSavingPrice(true);
    try {
      const updated = await dispatchOrderService.updateLineSalePrice(doId, lineId, parsed);
      setDoOrder(updated);
      setEditingPrice(null);
      onRefresh?.();
      toast.success('Sale price updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update sale price');
    } finally {
      setSavingPrice(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try { return format(new Date(d), 'MMM dd, yyyy'); } catch { return d; }
  };

  const getLineProgress = (line) => {
    const ordered = parseFloat(line.qty_ordered);
    const dispatched = parseFloat(line.qty_dispatched || 0);
    return ordered > 0 ? Math.min(100, (dispatched / ordered) * 100) : 0;
  };

  const canConfirm = doOrder?.status === 'draft' && can('do:create');
  const canDispatch = ['confirmed', 'partial'].includes(doOrder?.status) && can('do:dispatch');
  const canCancel = ['draft', 'confirmed'].includes(doOrder?.status) && can('do:delete');
  const canArchive = ['completed', 'cancelled'].includes(doOrder?.status) && !doOrder?.archived_at && can('do:delete');
  const canEditDraft = doOrder?.status === 'draft' && can('do:create');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pb-8">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" />
              {doOrder?.do_number || 'Dispatch Order'}
            </DialogTitle>
            {doOrder && <StatusBadge status={doOrder.status} />}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : !doOrder ? (
          <p className="text-sm text-slate-500 py-8 text-center">No data available</p>
        ) : (
          <div className="space-y-6 py-2">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Recipient</p>
                <p className="mt-0.5 font-medium text-slate-900">{doOrder.recipient_name}</p>
                <p className="text-slate-500 text-xs capitalize">{doOrder.recipient_type}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Dispatch Date</p>
                <p className="mt-0.5 font-medium text-slate-900">{formatDate(doOrder.dispatch_date)}</p>
              </div>
              {doOrder.reference_jo && (
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">JO Reference</p>
                  <p className="mt-0.5 text-slate-700">{doOrder.reference_jo}</p>
                </div>
              )}
              {doOrder.reference_po && (
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">PO Reference</p>
                  <p className="mt-0.5 text-slate-700">{doOrder.reference_po}</p>
                </div>
              )}
              {doOrder.creator && (
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Created By</p>
                  <p className="mt-0.5 text-slate-700 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {doOrder.creator.username}
                  </p>
                </div>
              )}
              {doOrder.confirmedByUser && (
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">Confirmed By</p>
                  <p className="mt-0.5 text-slate-700 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {doOrder.confirmedByUser.username}
                  </p>
                </div>
              )}
            </div>

            {doOrder.notes && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
                {doOrder.notes}
              </div>
            )}

            {/* Lines */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Line Items</h3>
              <div className="space-y-3">
                {(doOrder.lines || []).map(line => {
                  const progress = getLineProgress(line);
                  const itemName = line.item?.name || `Item #${line.item_id}`;
                  const voided = parseFloat(line.qty_voided || 0);
                  const effectiveQty = parseFloat(line.qty_dispatched || 0) - voided;
                  const salePrice = line.sale_price_per_unit != null ? parseFloat(line.sale_price_per_unit) : null;
                  const costPrice = line.cost_per_unit != null ? parseFloat(line.cost_per_unit) : null;
                  const lineRevenue = salePrice != null && effectiveQty > 0 ? salePrice * effectiveQty : null;
                  const lineCogs = costPrice != null && effectiveQty > 0 ? costPrice * effectiveQty : null;
                  const lineProfit = lineRevenue != null && lineCogs != null ? lineRevenue - lineCogs : null;
                  return (
                    <div key={line.line_id} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-slate-900">{itemName}</p>
                          <p className="text-xs text-slate-500">{line.item?.sku_code}</p>
                        </div>
                        <div className="text-right text-sm space-y-0.5">
                          <p className="text-slate-500">Ordered: <span className="font-semibold text-slate-800">{formatNumber(line.qty_ordered)}</span></p>
                          <p className="text-teal-600">Dispatched: <span className="font-semibold">{formatNumber(line.qty_dispatched || 0)}</span></p>
                          {voided > 0 && (
                            <p className="text-red-500 text-xs">Voided: {formatNumber(voided)}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              progress >= 100 ? 'bg-emerald-500' : progress > 0 ? 'bg-amber-500' : 'bg-slate-300'
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      {/* Pricing row */}
                      {(salePrice != null || costPrice != null || (doOrder.status !== 'draft' && can('do:dispatch'))) && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                          {costPrice != null && (
                            <span>Cost/unit: <span className="font-medium text-slate-800">₱{costPrice.toFixed(2)}</span></span>
                          )}
                          {doOrder.status !== 'draft' && can('do:dispatch') ? (
                            editingPrice?.lineId === line.line_id ? (
                              <span className="flex items-center gap-1.5">
                                <span className="text-slate-500">Sale/unit:</span>
                                <span className="relative">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₱</span>
                                  <input
                                    type="number" min="0" step="0.01" autoFocus
                                    value={editingPrice.value}
                                    onChange={e => setEditingPrice(prev => ({ ...prev, value: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveLinePrice(line.line_id); if (e.key === 'Escape') setEditingPrice(null); }}
                                    className="w-24 pl-4 pr-1 py-0.5 text-xs border border-teal-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                                  />
                                </span>
                                <button onClick={() => handleSaveLinePrice(line.line_id)} disabled={savingPrice}
                                  className="text-xs font-medium text-teal-700 hover:text-teal-900 disabled:opacity-50">
                                  {savingPrice ? '…' : 'Save'}
                                </button>
                                <button onClick={() => setEditingPrice(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600">
                                  Cancel
                                </button>
                              </span>
                            ) : salePrice != null ? (
                              <span className="flex items-center gap-1">
                                Sale/unit: <span className="font-medium text-teal-700">₱{salePrice.toFixed(2)}</span>
                                <button onClick={() => setEditingPrice({ lineId: line.line_id, value: String(salePrice) })}
                                  className="text-slate-300 hover:text-slate-500 ml-0.5">
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </span>
                            ) : (
                              <button onClick={() => setEditingPrice({ lineId: line.line_id, value: '' })}
                                className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                                + Add sale price
                              </button>
                            )
                          ) : salePrice != null ? (
                            <span>Sale/unit: <span className="font-medium text-teal-700">₱{salePrice.toFixed(2)}</span></span>
                          ) : null}
                          {lineRevenue != null && (
                            <span>Revenue: <span className="font-medium text-teal-700">₱{lineRevenue.toFixed(2)}</span></span>
                          )}
                          {lineProfit != null && (
                            <span>Gross Profit: <span className={cn('font-medium', lineProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              ₱{lineProfit.toFixed(2)}
                            </span></span>
                          )}
                        </div>
                      )}
                      {line.notes && (
                        <p className="text-xs text-slate-500 mt-2 italic">{line.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Earnings summary for completed/partial DOs */}
              {['completed', 'partial'].includes(doOrder.status) && (() => {
                let totalRevenue = 0;
                let totalCogs = 0;
                let hasPrice = false;
                let linesWithoutPrice = 0;
                for (const line of (doOrder.lines || [])) {
                  const effectiveQty = parseFloat(line.qty_dispatched || 0) - parseFloat(line.qty_voided || 0);
                  if (effectiveQty <= 0) continue;
                  const sp = line.sale_price_per_unit != null ? parseFloat(line.sale_price_per_unit) : null;
                  const cp = line.cost_per_unit != null ? parseFloat(line.cost_per_unit) : 0;
                  if (sp != null) {
                    hasPrice = true;
                    totalRevenue += sp * effectiveQty;
                    totalCogs += cp * effectiveQty;
                  } else {
                    linesWithoutPrice++;
                  }
                }
                if (!hasPrice) return null;
                const grossProfit = totalRevenue - totalCogs;
                const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
                return (
                  <>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Revenue', value: `₱${totalRevenue.toFixed(2)}`, color: 'text-teal-700 bg-teal-50 border-teal-200' },
                        { label: 'COGS', value: `₱${totalCogs.toFixed(2)}`, color: 'text-slate-700 bg-slate-50 border-slate-200' },
                        { label: 'Gross Profit', value: `₱${grossProfit.toFixed(2)}`, color: grossProfit >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200' },
                        { label: 'Margin', value: `${marginPct.toFixed(1)}%`, color: marginPct >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={cn('border rounded-lg px-4 py-3 text-center', color)}>
                          <p className="text-xs font-medium opacity-70">{label}</p>
                          <p className="text-sm font-bold mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                    {linesWithoutPrice > 0 && (
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        {linesWithoutPrice} line{linesWithoutPrice !== 1 ? 's' : ''} {linesWithoutPrice !== 1 ? 'have' : 'has'} no sale price — use "Add sale price" above to set {linesWithoutPrice !== 1 ? 'them' : 'it'} retroactively.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Stock movements */}
            {doOrder.movements?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Stock Movements</h3>
                <div className="space-y-2">
                  {doOrder.movements.map(m => (
                    <div key={m.movement_id} className="flex items-center justify-between text-sm border border-slate-200 rounded-lg px-4 py-2.5">
                      <div>
                        <span className="font-medium text-slate-800">{m.item?.name || `Item #${m.item_id}`}</span>
                        {m.is_voided && (
                          <Badge className="ml-2 bg-red-100 text-red-600 border-red-200 text-xs">Voided</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-slate-600">
                        <span>−{formatNumber(Math.abs(m.quantity))}</span>
                        <span className="text-xs text-slate-400">{formatDate(m.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {doOrder && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-6">
            <div className="flex gap-2">
              {canEditDraft && (
                <Button variant="outline" size="sm" onClick={() => onEdit?.(doOrder)}>
                  Edit Draft
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => onCancel?.(doOrder)}
                >
                  Cancel
                </Button>
              )}
              {canArchive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  disabled={actionLoading === 'archive'}
                >
                  {actionLoading === 'archive' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
                  Archive
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {canConfirm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleConfirm}
                  disabled={actionLoading === 'confirm'}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {actionLoading === 'confirm' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                  Confirm
                </Button>
              )}
              {canDispatch && (
                <Button
                  size="sm"
                  onClick={() => onDispatch?.(doOrder)}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  <PackageCheck className="w-3.5 h-3.5 mr-1" />
                  Dispatch
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
