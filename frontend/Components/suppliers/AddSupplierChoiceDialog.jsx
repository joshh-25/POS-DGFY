import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Link2,
  PlusCircle,
  Package,
  X
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";

/**
 * Choice dialog for adding a supplier to an item
 * Offers two options:
 * 1. Use existing supplier (quick assign)
 * 2. Create new supplier (full form)
 */
export default function AddSupplierChoiceDialog({
  open,
  onClose,
  item,
  onSelectExisting,
  onCreateNew,
  existingSuppliersCount = 0
}) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-600" />
            Add Supplier
          </DialogTitle>
          <DialogDescription>
            Choose how to assign a supplier to this item
          </DialogDescription>
        </DialogHeader>

        {/* Item being assigned */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-slate-500">Adding supplier for:</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-semibold text-slate-900">{item.name}</span>
            {item.sku_code && (
              <Badge variant="outline" className="text-xs">
                {item.sku_code}
              </Badge>
            )}
          </div>
        </div>

        {/* Choice Options */}
        <div className="space-y-3">
          {/* Option 1: Use Existing Supplier */}
          <button
            onClick={onSelectExisting}
            disabled={existingSuppliersCount === 0}
            className={cn(
              "w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all",
              existingSuppliersCount > 0
                ? "border-slate-200 hover:border-teal-300 hover:bg-teal-50 cursor-pointer"
                : "border-slate-100 bg-slate-50 cursor-not-allowed opacity-60"
            )}
          >
            <div className={cn(
              "p-2 rounded-lg",
              existingSuppliersCount > 0 ? "bg-teal-100" : "bg-slate-200"
            )}>
              <Link2 className={cn(
                "w-6 h-6",
                existingSuppliersCount > 0 ? "text-teal-600" : "text-slate-400"
              )} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-900">Use Existing Supplier</h4>
                {existingSuppliersCount > 0 && (
                  <Badge className="bg-teal-100 text-teal-700 text-xs">Recommended</Badge>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {existingSuppliersCount > 0
                  ? `Link this item to one of your ${existingSuppliersCount} existing suppliers`
                  : "No suppliers available - create one first"}
              </p>
            </div>
          </button>

          {/* Option 2: Create New Supplier */}
          <button
            onClick={onCreateNew}
            className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-all"
          >
            <div className="p-2 rounded-lg bg-blue-100">
              <PlusCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900">Create New Supplier</h4>
              <p className="text-sm text-slate-500 mt-1">
                Register a new supplier and assign this item to them
              </p>
            </div>
          </button>
        </div>

        {/* Cancel Button */}
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
