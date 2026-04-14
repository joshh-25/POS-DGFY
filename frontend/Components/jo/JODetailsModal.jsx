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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Activity
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber, formatQty } from '../../src/lib/numberUtils.js';
import { useJobOrderById } from '@/hooks/useJobOrders.js';
import { toUomAbbreviation } from '../../src/utils/uomDisplay';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700", icon: Play },
  partial: { label: "Partial", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Activity },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle }
};

export default function JODetailsModal({ jo, open, onClose, onComplete }) {
  // Always call hooks at top level
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [expiryOverride, setExpiryOverride] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [quantityProduced, setQuantityProduced] = useState('');
  const [qualityCheck, setQualityCheck] = useState('pass');

  // Use hook unconditionally, handle null joId internally or let hook handle it
  const { jobOrder: detailedJO, loading } = useJobOrderById(open ? jo?.jo_id : null);

  if (!jo) return null;

  const displayJO = detailedJO || jo;
  const getDisplayUom = (uom) => toUomAbbreviation(uom, 'u');
  const status = statusConfig[displayJO.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  // Determine ingredients list (normalize structure)
  // detailedJO.ingredients -> Sequelize models with 'item' and 'batch'
  // jo.ingredients_consumed -> Transformed objects
  const ingredients = displayJO.ingredients_consumed || displayJO.ingredients || [];

  const hasInsufficientStock = ingredients.some(ing => {
    // For 'ingredients' (Sequelize), we might need to calculate stock_after if not provided
    // For 'ingredients_consumed', it's pre-calculated
    return (ing.stock_after !== undefined && ing.stock_after < 0);
  });

  const handleCompleteClick = () => {
    setCompleteDialogOpen(true);
    setExpiryOverride('');
    setCompletionNotes('');
    const remaining = (displayJO.quantity_to_produce - (displayJO.quantity_produced || 0));
    setQuantityProduced(remaining > 0 ? remaining : displayJO.quantity_to_produce);
    setQualityCheck('pass');
  };

  const handleSetMaxQuantity = () => {
    const remaining = (displayJO.quantity_to_produce - (displayJO.quantity_produced || 0));
    setQuantityProduced(remaining > 0 ? remaining : displayJO.quantity_to_produce);
  };

  const handleConfirmComplete = () => {
    const qty = quantityProduced ? parseFloat(quantityProduced) : null;
    if (!qty || qty <= 0 || isNaN(qty)) {
      return; // Don't submit invalid quantity
    }
    onComplete(displayJO, expiryOverride || null, completionNotes || null, qty, qualityCheck);
    setCompleteDialogOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto pb-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="text-xl">{displayJO.jo_number || 'Job Order Details'}</span>
              <Badge variant="outline" className={cn("flex items-center gap-1", status.color)}>
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </Badge>
              {displayJO.quality_check && (
                <Badge variant="outline" className={cn(
                  "flex items-center gap-1",
                  displayJO.quality_check === 'pass' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                    displayJO.quality_check === 'fail' ? "bg-red-100 text-red-700 border-red-200" :
                      "bg-amber-100 text-amber-700 border-amber-200"
                )}>
                  <Activity className="w-3 h-3" />
                  QC: {displayJO.quality_check.toUpperCase()}
                </Badge>
              )}
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
                    Target Output: <span className="font-medium text-slate-900">{formatQty(displayJO.quantity_to_produce)} {getDisplayUom(displayJO.product?.unit_of_measure)}</span>
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
                        const uom = getDisplayUom(ing.unit_of_measure || ing.item?.unit_of_measure);
                        // Normalize batch info
                        const batch = ing.batch_info || ing.batch;
                        const isStockLow = ing.stock_after !== undefined && ing.stock_after < 0;

                        // Display consumed if available (completed JO), else required
                        const displayQty = (displayJO.status === 'completed' && ing.quantity_consumed)
                          ? ing.quantity_consumed
                          : ing.quantity_required;

                        return (
                          <tr key={idx} className={cn(
                            "hover:bg-slate-50 transition-colors",
                            isStockLow ? "bg-red-50" : ""
                          )}>
                            <td className="p-3 font-medium text-slate-900">{itemName}</td>
                            <td className="p-3 text-right text-slate-600">
                              {formatNumber(displayQty, 2)} {uom}
                            </td>
                            <td className="p-3 text-slate-600 text-sm">
                              {/* Display batch info if available */}
                              {batch ? (
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-slate-50 font-normal">
                                    <Layers className="w-3 h-3 mr-1 text-slate-400" />
                                    #{batch.batch_id}
                                  </Badge>
                                  {batch.expiry_date && (
                                    <span className="text-xs text-slate-500 whitespace-nowrap">
                                      Exp: {format(new Date(batch.expiry_date), 'MMM d, yy')}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">
                                  {displayJO.status === 'completed' ? 'FIFO Auto' : '—'}
                                </span>
                              )}
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
                            ? 'No ingredient data found.'
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

            {/* Notes - Display for completed JOs */}
            {displayJO.status === 'completed' && displayJO.notes && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm text-slate-500 mb-1">Notes</p>
                <p className="text-slate-700">{displayJO.notes}</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-6 mt-6 border-t border-slate-100">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {(displayJO.status === 'in_progress' || displayJO.status === 'partial') && (
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
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Quantity Produced</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={quantityProduced}
                  onChange={(e) => setQuantityProduced(e.target.value)}
                  placeholder="Enter quantity produced"
                  className="font-bold text-lg"
                />
                <Button variant="outline" size="sm" onClick={handleSetMaxQuantity} className="h-10 px-3" title="Set to remaining target quantity">
                  Target
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Target: {formatQty(displayJO.quantity_to_produce)} {getDisplayUom(displayJO.product?.unit_of_measure)} &nbsp;|&nbsp;
                Produced So Far: {formatQty(displayJO.quantity_produced || 0)} &nbsp;|&nbsp;
                <span className="text-amber-600">Over-production allowed</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Quality Check</Label>
              <Select value={qualityCheck} onValueChange={setQualityCheck}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">
                    <div className="flex items-center gap-2">
                      <ThumbsUp className="w-4 h-4 text-emerald-500" />
                      Pass (Good Quality)
                    </div>
                  </SelectItem>
                  <SelectItem value="fail">
                    <div className="flex items-center gap-2">
                      <ThumbsDown className="w-4 h-4 text-red-500" />
                      Fail (Rejected/Scrap)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
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

            <div className="space-y-2">
              <Label htmlFor="completionNotes">Production Notes (Optional)</Label>
              <Textarea
                id="completionNotes"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Add any notes about this production run..."
                rows={3}
              />
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
