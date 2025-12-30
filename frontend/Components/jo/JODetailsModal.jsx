import React from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Play,
  CheckCircle,
  Factory,
  ArrowRight,
  User,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle }
};

export default function JODetailsModal({ jo, open, onClose, onComplete }) {
  if (!jo) return null;

  const status = statusConfig[jo.status];
  const StatusIcon = status.icon;
  const hasInsufficientStock = jo.ingredients_consumed?.some(ing => ing.stock_after < 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xl">{jo.jo_number}</span>
            <Badge variant="outline" className={cn("flex items-center gap-1", status.color)}>
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Product Info */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Factory className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-lg">{jo.product_name}</p>
                <p className="text-slate-500">Quantity to Produce: <span className="font-medium text-slate-900">{jo.quantity_to_produce} units</span></p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm text-slate-500 mb-4">Production Timeline</p>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-5 h-5 text-teal-600" />
                </div>
                <p className="text-xs text-slate-500">Created</p>
                <p className="text-sm font-medium">{jo.created_date}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300" />
              <div className="text-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                  jo.status !== 'draft' ? "bg-blue-100" : "bg-slate-200"
                )}>
                  <Play className={cn("w-5 h-5", jo.status !== 'draft' ? "text-blue-600" : "text-slate-400")} />
                </div>
                <p className="text-xs text-slate-500">Started</p>
                <p className="text-sm font-medium">{jo.status !== 'draft' ? 'In Progress' : '—'}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300" />
              <div className="text-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                  jo.status === 'completed' ? "bg-emerald-100" : "bg-slate-200"
                )}>
                  <CheckCircle className={cn("w-5 h-5", jo.status === 'completed' ? "text-emerald-600" : "text-slate-400")} />
                </div>
                <p className="text-xs text-slate-500">Completed</p>
                <p className="text-sm font-medium">
                  {jo.completion_date 
                    ? format(new Date(jo.completion_date), 'MMM d, h:mm a')
                    : '—'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium text-slate-900">Ingredients Consumed</p>
              {hasInsufficientStock && jo.status !== 'completed' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Insufficient Stock Warning
                </Badge>
              )}
            </div>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-slate-600">Ingredient</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Required</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Stock Before</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Stock After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jo.ingredients_consumed?.map((ing, idx) => (
                    <tr key={idx} className={ing.stock_after < 0 ? "bg-red-50" : ""}>
                      <td className="p-3 font-medium text-slate-900">{ing.item_name}</td>
                      <td className="p-3 text-right text-slate-600">{ing.quantity_required}</td>
                      <td className="p-3 text-right text-slate-600">{ing.stock_before}</td>
                      <td className={cn(
                        "p-3 text-right font-medium",
                        ing.stock_after < 0 ? "text-red-600" : "text-emerald-600"
                      )}>
                        {formatNumber(ing.stock_after, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Responsible User */}
          {jo.responsible_user && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <User className="w-4 h-4 text-slate-400" />
              <span>Responsible: {jo.responsible_user}</span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-8">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {jo.status === 'in_progress' && (
            <Button 
              onClick={() => onComplete(jo)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Production
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}