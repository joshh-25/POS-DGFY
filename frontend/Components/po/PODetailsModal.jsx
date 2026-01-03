import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Package,
  CheckCircle,
  Truck,
  Calendar,
  Star,
  ArrowRight,
  FileEdit,
  XCircle
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: FileEdit },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  partial: { label: "Partial Delivery", color: "bg-blue-100 text-blue-700", icon: Package },
  received: { label: "Received", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle }
};

export default function PODetailsModal({ po, open, onClose }) {
  if (!po) return null;

  const status = statusConfig[po.status];
  const StatusIcon = status.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xl">{po.po_number}</span>
            <Badge variant="outline" className={cn("flex items-center gap-1", status.color)}>
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4 pb-6">
          {/* Supplier & Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Truck className="w-4 h-4" />
                <span className="text-sm">Supplier</span>
              </div>
              <p className="font-semibold text-slate-900">{po.supplier_name}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Order Date</span>
              </div>
              <p className="font-semibold text-slate-900">{po.order_date}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500 mb-4">Delivery Timeline</p>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-5 h-5 text-teal-600" />
                </div>
                <p className="text-xs text-slate-500">Ordered</p>
                <p className="text-sm font-medium">{po.order_date}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300" />
              <div className="text-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                  po.status === 'received' ? "bg-teal-100" : "bg-slate-200"
                )}>
                  <Truck className={cn("w-5 h-5", po.status === 'received' ? "text-teal-600" : "text-slate-400")} />
                </div>
                <p className="text-xs text-slate-500">Expected</p>
                <p className="text-sm font-medium">{po.expected_delivery_date}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300" />
              <div className="text-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                  po.status === 'received' ? "bg-emerald-100" : "bg-slate-200"
                )}>
                  <Package className={cn("w-5 h-5", po.status === 'received' ? "text-emerald-600" : "text-slate-400")} />
                </div>
                <p className="text-xs text-slate-500">Received</p>
                <p className="text-sm font-medium">{po.received_date || '—'}</p>
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-sm text-slate-500 mb-3">Order Items</p>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-slate-600">Item</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Qty</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Received</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Unit Price</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(po.items || []).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                      <td className="p-3 text-right text-slate-600">{item.quantity}</td>
                      <td className="p-3 text-right">
                        <span className={cn(
                          "font-medium",
                          item.quantity_received === item.quantity ? "text-emerald-600" :
                            item.quantity_received > 0 ? "text-amber-600" : "text-slate-400"
                        )}>
                          {item.quantity_received}
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-600">₱{formatNumber(item.unit_price, 2)}</td>
                      <td className="p-3 text-right font-medium text-slate-900">₱{formatNumber(item.total_price, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-900">₱{formatNumber(po.subtotal, 2)}</span>
            </div>
            {po.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600">Discount</span>
                <span className="text-emerald-600">-₱{formatNumber(po.discount, 2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="text-teal-600">₱{formatNumber(po.total_amount, 2)}</span>
            </div>
          </div>

          {/* Rating & Notes */}
          {po.status === 'received' && (
            <div className="space-y-4">
              {po.delivery_rating && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Delivery Rating:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        className={cn(
                          "w-4 h-4",
                          star <= po.delivery_rating ? "text-amber-500" : "text-slate-200"
                        )}
                        fill={star <= po.delivery_rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                </div>
              )}
              {po.notes && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Notes</p>
                  <p className="text-slate-700">{po.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}