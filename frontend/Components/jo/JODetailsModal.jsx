import React, { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Clock,
  Play,
  CheckCircle,
  Factory,
  ArrowRight,
  User,
  AlertTriangle,
  XCircle,
  Layers,
  Calendar
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';
import { useJobOrderById } from '@/hooks/useJobOrders.js';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle }
};

export default function JODetailsModal({ jo, open, onClose, onComplete }) {
  // Always call hooks at top level
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [expiryOverride, setExpiryOverride] = useState('');

  // Use hook unconditionally, handle null joId internally or let hook handle it
  const { jobOrder: detailedJO, loading } = useJobOrderById(open ? jo?.jo_id : null);

  if (!jo) return null;

  const displayJO = detailedJO || jo;
  const status = statusConfig[displayJO.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  // Determine ingredients list (normalize structure)
  // detailedJO.ingredients -> Sequelize models with 'item' and 'batch'
  // jo.ingredients_consumed -> Transformed objects
  const ingredients = displayJO.ingredients || displayJO.ingredients_consumed || [];

  const hasInsufficientStock = ingredients.some(ing => {
    // For 'ingredients' (Sequelize), we might need to calculate stock_after if not provided
    // For 'ingredients_consumed', it's pre-calculated
    return (ing.stock_after !== undefined && ing.stock_after < 0);
  });

  const handleCompleteClick = () => {
    setCompleteDialogOpen(true);
    setExpiryOverride('');
  };

  const handleConfirmComplete = () => {
    onComplete(displayJO, expiryOverride || null);
    setCompleteDialogOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="text-xl">{displayJO.jo_number || 'Job Order Details'}</span>
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
                  <p className="font-semibold text-slate-900 text-lg">
                    {displayJO.product_name || displayJO.product?.name || 'Unknown Product'}
                  </p>
                  <p className="text-slate-500">
                    Quantity to Produce: <span className="font-medium text-slate-900">{displayJO.quantity_to_produce} units</span>
                  </p>
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
                  <p className="text-sm font-medium">
                    {displayJO.created_date || (displayJO.created_at ? format(new Date(displayJO.created_at), 'MMM d') : '—')}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300" />
                <div className="text-center">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                    displayJO.status !== 'draft' ? "bg-blue-100" : "bg-slate-200"
                  )}>
                    <Play className={cn("w-5 h-5", displayJO.status !== 'draft' ? "text-blue-600" : "text-slate-400")} />
                  </div>
                  <p className="text-xs text-slate-500">Started</p>
                  <p className="text-sm font-medium">{displayJO.status !== 'draft' ? 'In Progress' : '—'}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300" />
                <div className="text-center">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2",
                    displayJO.status === 'completed' ? "bg-emerald-100" : "bg-slate-200"
                  )}>
                    <CheckCircle className={cn("w-5 h-5", displayJO.status === 'completed' ? "text-emerald-600" : "text-slate-400")} />
                  </div>
                  <p className="text-xs text-slate-500">Completed</p>
                  <p className="text-sm font-medium">
                    {displayJO.completion_date
                      ? format(new Date(displayJO.completion_date), 'MMM d, h:mm a')
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
                {hasInsufficientStock && displayJO.status !== 'completed' && (
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
                      <th className="text-right p-3 text-sm font-medium text-slate-600">Req / Consumed</th>
                      <th className="text-left p-3 text-sm font-medium text-slate-600">Batch Used</th>
                      {/* Only show stock columns if needed, or simplify */}
                      <th className="text-right p-3 text-sm font-medium text-slate-600">Stock After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ingredients.length > 0 ? (
                      ingredients.map((ing, idx) => {
                        const itemName = ing.item_name || ing.item?.name || 'Unknown';
                        const uom = ing.unit_of_measure || ing.item?.unit_of_measure || '';
                        const batch = ing.batch || ing.batch_info; // normalize from detailedJO or ingredients_consumed
                        const isStockLow = ing.stock_after !== undefined && ing.stock_after < 0;

                        return (
                          <tr key={idx} className={cn(
                            "hover:bg-slate-50 transition-colors",
                            isStockLow ? "bg-red-50" : ""
                          )}>
                            <td className="p-3 font-medium text-slate-900">{itemName}</td>
                            <td className="p-3 text-right text-slate-600">
                              {/* Show required vs consumed if they differ, or just required */}
                              {displayJO.status === 'completed' && ing.quantity_consumed
                                ? formatNumber(ing.quantity_consumed, 2)
                                : formatNumber(ing.quantity_required, 2)
                              } {uom}
                            </td>
                            <td className="p-3 text-slate-600 text-sm">
                              {(() => {
                                const batchTransactions = ing.batchTransactions || [];
                                const singleBatch = ing.batch || ing.batch_info;

                                if (batchTransactions.length > 0) {
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {batchTransactions.map((bt, i) => (
                                        <Badge key={i} variant="outline" className="bg-slate-50 font-normal text-xs">
                                          <Layers className="w-3 h-3 mr-1 text-slate-400" />
                                          #{bt.batch?.batch_id} ({formatNumber(bt.quantity_consumed, 2)})
                                        </Badge>
                                      ))}
                                    </div>
                                  );
                                } else if (singleBatch) {
                                  return (
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="bg-slate-50 font-normal">
                                        <Layers className="w-3 h-3 mr-1 text-slate-400" />
                                        #{singleBatch.batch_id}
                                      </Badge>
                                      {singleBatch.expiry_date && (
                                        <span className="text-xs text-slate-500 whitespace-nowrap">
                                          Exp: {format(new Date(singleBatch.expiry_date), 'MMM d, yy')}
                                        </span>
                                      )}
                                    </div>
                                  );
                                } else {
                                  return <span className="text-slate-400 text-xs italic">
                                    {displayJO.status === 'completed' ? 'Non-FIFO / Untracked' : '—'}
                                  </span>;
                                }
                              })()}
                            </td>
                            <td className={cn(
                              "p-3 text-right font-medium",
                              isStockLow ? "text-red-600" : "text-emerald-600"
                            )}>
                              {ing.stock_after !== undefined
                                ? `${formatNumber(ing.stock_after, 2)} ${uom}`
                                : '—'
                              }
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="4" className="p-6 text-center text-slate-500">
                          {displayJO.status === 'completed'
                            ? 'No ingredient data available'
                            : 'Complete this order to see consumption details'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Responsible User */}
            {displayJO.responsible_user && (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <User className="w-4 h-4 text-slate-400" />
                <span>Responsible: {displayJO.responsibleUser?.username || displayJO.responsible_user}</span>
              </div>
            )}
          </div>

          <DialogFooter className="pt-8">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {displayJO.status === 'in_progress' && (
              <Button
                onClick={handleCompleteClick}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Production
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion Confirmation Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Production</DialogTitle>
            <DialogDescription>
              Confirm completion of <strong>{displayJO.product_name || displayJO.product?.name}</strong>.
              You can optionally override the calculated expiry date for the finished product.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Quantity Produced</Label>
              <div className="p-2 bg-slate-100 rounded-md font-medium">
                {displayJO.quantity_to_produce} units
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryOverride">Expiry Date Override (Optional)</Label>
              <div className="relative">
                <Input
                  id="expiryOverride"
                  type="date"
                  value={expiryOverride}
                  onChange={(e) => setExpiryOverride(e.target.value)}
                />
                {!expiryOverride && displayJO.status === 'in_progress' && (
                  <div className="mt-2 text-xs text-slate-500">
                    {displayJO.product?.shelf_life_days ? (
                      <>
                        Default: <span className="font-medium">
                          {format(addDays(new Date(), displayJO.product.shelf_life_days), 'MMM d, yyyy')}
                        </span>
                        {' '}({displayJO.product.shelf_life_days} days shelf life)
                      </>
                    ) : (
                      "No shelf life defined for this product."
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmComplete} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Completion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}