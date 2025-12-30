import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { Package, Beaker, Box, MoreVertical, Eye, Edit, History, FileEdit } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "../../src/lib/utils.js";
import { getStockStatus } from '@/components/data/dummyData';
import { formatNumber } from '../../src/lib/numberUtils.js';

const categoryConfig = {
  ingredient: { icon: Beaker, color: "bg-purple-100 text-purple-700" },
  product: { icon: Package, color: "bg-blue-100 text-blue-700" },
  packaging: { icon: Box, color: "bg-amber-100 text-amber-700" }
};

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: FileEdit },
  critical: { label: "Critical", color: "bg-red-100 text-red-700 border-red-200" },
  warning: { label: "Low", color: "bg-amber-100 text-amber-700 border-amber-200" },
  healthy: { label: "Healthy", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  surplus: { label: "Surplus", color: "bg-blue-100 text-blue-700 border-blue-200" }
};

export default function ItemCard({ item, onView, onEdit }) {
  const category = categoryConfig[item.category] || categoryConfig.ingredient;
  const isDraft = item.status === 'draft';
  const status = isDraft ? 'draft' : getStockStatus(item);
  const statusStyle = statusConfig[status];
  const Icon = category.icon;
  const percentage = isDraft ? 0 : Math.round((item.current_stock / item.max_capacity) * 100);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", category.color)}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{item.name}</h3>
            <p className="text-sm text-slate-500">{item.sku_code}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(item)}>
              <Eye className="w-4 h-4 mr-2" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Edit className="w-4 h-4 mr-2" /> Edit Item
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={createPageUrl("StockMovements") + `?item=${item.id}`}>
                <History className="w-4 h-4 mr-2" /> Movement History
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn("font-medium", statusStyle.color)}>
            {isDraft && statusStyle.icon && <statusStyle.icon className="w-3 h-3 mr-1" />}
            {statusStyle.label}
          </Badge>
          <Badge variant="outline" className={category.color}>
            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
          </Badge>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-500">Stock Level</span>
            <span className="font-semibold text-slate-900">
              {item.current_stock} / {item.max_capacity} {item.unit_of_measure}
            </span>
          </div>
          <Progress 
            value={percentage} 
            className="h-2"
          />
          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
            <span>Min: {item.min_threshold}</span>
            <span>{percentage}%</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-sm text-slate-500">Unit Cost</span>
          <span className="font-semibold text-slate-900">₱{formatNumber(item.cost_per_unit, 2)}</span>
        </div>
      </div>
    </div>
  );
}