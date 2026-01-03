import React from 'react';
import { Star, Truck, Package, MoreVertical, Eye, Edit, FilePlus, FileEdit, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "../../src/lib/utils.js";
import { getQualityColor, getQualityBgColor } from '@/components/data/dummyData';
import { formatNumber } from '../../src/lib/numberUtils.js';

export default function SupplierCard({ supplier, onView, onEdit, onCreatePO, onDelete, currentUserRole }) {
  const qualityColor = getQualityColor(supplier.quality_rating);
  const qualityBgColor = getQualityBgColor(supplier.quality_rating);
  const isDraft = supplier.status === 'draft';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 text-lg">{supplier.name}</h3>
            {isDraft && (
              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                <FileEdit className="w-3 h-3 mr-1" />
                Draft
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500">{supplier.contact_person}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(supplier)}>
              <Eye className="w-4 h-4 mr-2" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(supplier)}>
              <Edit className="w-4 h-4 mr-2" /> Edit Supplier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreatePO(supplier)}>
              <FilePlus className="w-4 h-4 mr-2" /> Create PO
            </DropdownMenuItem>
            {currentUserRole === 'admin' && onDelete && (
              <DropdownMenuItem
                onClick={() => onDelete(supplier)}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete Supplier
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        {/* Quality Rating */}
        <div className={cn("rounded-xl p-3 border", qualityBgColor)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className={cn("w-5 h-5", qualityColor)} fill="currentColor" />
              <span className={cn("font-bold text-lg", qualityColor)}>
                {formatNumber(supplier.quality_rating, 1)}
              </span>
            </div>
            <span className="text-sm text-slate-500">Quality Rating</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Truck className="w-4 h-4 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-900">{supplier.avg_delivery_days} days</p>
            <p className="text-xs text-slate-500">Avg. Delivery</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="w-4 h-4 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-900">{(supplier.items_supplied || []).length}</p>
            <p className="text-xs text-slate-500">Items Supplied</p>
          </div>
        </div>

        {/* Items Supplied */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Items Supplied</p>
          <div className="flex flex-wrap gap-1">
            {(supplier.items_supplied || []).slice(0, 3).map((item, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {item.item_name}
              </Badge>
            ))}
            {(supplier.items_supplied || []).length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{(supplier.items_supplied || []).length - 3} more
              </Badge>
            )}
          </div>
        </div>

        {/* Last Delivery */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
          <span className="text-slate-500">Last Delivery</span>
          <span className="font-medium text-slate-700">{supplier.last_delivery_date}</span>
        </div>
      </div>
    </div>
  );
}