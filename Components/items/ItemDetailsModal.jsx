import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Package, 
  Beaker, 
  Box, 
  History, 
  Plus, 
  ArrowRight,
  Ruler,
  Layers,
  Palette
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { getStockStatus } from '@/components/data/dummyData';
import FIFOBatchViewer from './FIFOBatchViewer';
import { formatNumber } from '../../src/lib/numberUtils.js';

const categoryConfig = {
  ingredient: { icon: Beaker, color: "bg-purple-100 text-purple-700", label: "Ingredient" },
  product: { icon: Package, color: "bg-blue-100 text-blue-700", label: "Product" },
  packaging: { icon: Box, color: "bg-amber-100 text-amber-700", label: "Packaging" }
};

const statusConfig = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700" },
  warning: { label: "Low Stock", color: "bg-amber-100 text-amber-700" },
  healthy: { label: "Healthy", color: "bg-emerald-100 text-emerald-700" },
  surplus: { label: "Surplus", color: "bg-blue-100 text-blue-700" }
};

export default function ItemDetailsModal({ item, open, onClose }) {
  if (!item) return null;

  const category = categoryConfig[item.category] || categoryConfig.ingredient;
  const status = getStockStatus(item);
  const statusStyle = statusConfig[status];
  const Icon = category.icon;
  const percentage = Math.round((item.current_stock / item.max_capacity) * 100);
  const totalValue = item.current_stock * item.cost_per_unit;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", category.color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl">{item.name}</span>
              <p className="text-sm font-normal text-slate-500">{item.sku_code}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status and Category */}
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="outline" className={cn("font-medium", statusStyle.color)}>
              {statusStyle.label}
            </Badge>
            <Badge variant="outline" className={category.color}>
              {category.label}
            </Badge>
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-slate-600">{item.description}</p>
          )}

          {/* Stock Level */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Stock Level</span>
              <span className="text-lg font-bold text-slate-900">
                {item.current_stock} / {item.max_capacity} {item.unit_of_measure}
              </span>
            </div>
            <Progress value={percentage} className="h-3" />
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-500">Min Threshold</p>
                <p className="font-semibold text-slate-900">{item.min_threshold} {item.unit_of_measure}</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-500">Purchase Allowance</p>
                <p className="font-semibold text-slate-900">{item.purchase_allowance} {item.unit_of_measure}</p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-500">Total Value</p>
                <p className="font-semibold text-emerald-600">₱{formatNumber(totalValue, 2)}</p>
              </div>
            </div>
          </div>

          {/* Product Matrix (for products) */}
          {item.category === 'product' && item.ingredients && item.ingredients.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-900 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Ingredient Composition (per unit)
              </h4>
              <div className="space-y-4">
                {item.ingredients.map((ing, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
                    <span className="text-slate-700">{ing.item_name}</span>
                    <span className="font-medium text-slate-900">{ing.quantity} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Packaging Specs (for packaging) */}
          {item.category === 'packaging' && item.packaging_specs && (
            <div className="bg-amber-50 rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-amber-900 flex items-center gap-2">
                <Ruler className="w-4 h-4" />
                Packaging Specifications
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-slate-500">Dimensions</p>
                  <p className="font-medium text-slate-900">
                    {item.packaging_specs.height} × {item.packaging_specs.width}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-slate-500">Thickness</p>
                  <p className="font-medium text-slate-900">{item.packaging_specs.thickness}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-slate-500">Material</p>
                  <p className="font-medium text-slate-900">{item.packaging_specs.material}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-slate-500">Design</p>
                  <p className="font-medium text-slate-900">{item.packaging_specs.design}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-amber-100 col-span-2">
                  <p className="text-xs text-slate-500">Contents</p>
                  <p className="font-medium text-slate-900">{item.packaging_specs.contents}</p>
                </div>
              </div>
            </div>
          )}

          {/* FIFO Batch Viewer */}
          {item.fifo_enabled && <FIFOBatchViewer item={item} />}

          {/* Cost Info */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm text-slate-500">Cost per Unit</p>
              <p className="text-xl font-bold text-slate-900">₱{formatNumber(item.cost_per_unit, 2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Last Updated</p>
              <p className="font-medium text-slate-700">{item.last_updated}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-6 pt-8 pb-6 border-t border-slate-200">
            <Link to={createPageUrl("StockMovements") + `?item=${item.id}`} className="flex-1">
              <Button variant="outline" className="w-full">
                <History className="w-4 h-4 mr-2" />
                View Movement History
              </Button>
            </Link>
            <Link to={createPageUrl("StockMovements") + `?action=create&item=${item.id}`} className="flex-1">
              <Button className="w-full bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Stock Movement
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}