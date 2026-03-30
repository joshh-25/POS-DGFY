import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { MoreVertical, Eye, Edit, History, FileEdit, Trash2, Clock, Check, Folder } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "../../src/lib/utils.js";
import { getStockStatus } from '@/components/data/dummyData';
import { formatNumber, formatQty } from '../../src/lib/numberUtils.js';
import { getNextExpiryDate, getDaysUntilExpiry } from '@/components/utils/expiryHelpers.js';
import { format } from 'date-fns';
import { getCategoryConfig, getCategoryLabel } from '@/components/utils/categoryHelpers';
import { usePermission } from '../../src/hooks/usePermission';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: FileEdit },
  critical: { label: "Critical", color: "bg-red-100 text-red-700 border-red-200" },
  warning: { label: "Low", color: "bg-amber-100 text-amber-700 border-amber-200" },
  healthy: { label: "Healthy", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  surplus: { label: "Surplus", color: "bg-blue-100 text-blue-700 border-blue-200" }
};

export default function ItemCard({
  item,
  onView,
  onEdit,
  onDelete,
  onMoveToFolder,
  posConfig,
  canConfigurePosCatalog = false,
  onTogglePosVisibility,
  onUploadPosImage,
  onDeletePosImage,
  currentUserRole,
  isSelected,
  onSelect
}) {
  const { canEdit, canDelete } = usePermission();
  const category = getCategoryConfig(item);
  const isDraft = item.status === 'draft';
  const status = isDraft ? 'draft' : getStockStatus(item);
  const statusStyle = statusConfig[status];
  const Icon = category.icon;
  const percentage = isDraft || !item.max_capacity ? 0 : Math.round((item.current_stock / item.max_capacity) * 100);

  // DnD Hook
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.item_id || item.id,
    data: { name: item.name },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : undefined,
  } : undefined;

  // Calculate expiry information
  const nextExpiry = getNextExpiryDate(item);
  const daysUntilExpiry = nextExpiry ? getDaysUntilExpiry(nextExpiry) : null;

  const handleClick = (e) => {
    // Prevent selection when clicking interactive elements or during drag (listeners)
    if (e.target.closest('button') || e.target.closest('a')) {
      return;
    }

    if (onSelect) {
      onSelect(item.item_id || item.id, e.ctrlKey || e.metaKey, e.shiftKey);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={cn(
        "bg-white rounded-2xl border p-6 transition-all duration-300 relative group select-none touch-none", // touch-none for better dragging
        isSelected
          ? "border-teal-500 ring-1 ring-teal-500 shadow-md bg-teal-50/30"
          : "border-slate-200 hover:shadow-lg hover:border-slate-300",
        isDragging && "opacity-50 shadow-2xl scale-105 rotate-2 cursor-grabbing z-50 border-teal-400"
      )}
    >
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
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100/50">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(item)}>
              <Eye className="w-4 h-4 mr-2" /> View Details
            </DropdownMenuItem>
            {canEdit('items') && (
              <DropdownMenuItem onClick={() => onEdit(item)}>
                <Edit className="w-4 h-4 mr-2" /> Edit Item
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to={createPageUrl("StockMovements") + `?item=${item.id}`}>
                <History className="w-4 h-4 mr-2" /> Movement History
              </Link>
            </DropdownMenuItem>
            {onMoveToFolder && (
              <>
                <DropdownMenuSeparator />
                {canEdit('items') && (
                  <DropdownMenuItem onClick={() => onMoveToFolder(item)}>
                    <Folder className="w-4 h-4 mr-2" /> Move to Folder...
                  </DropdownMenuItem>
                )}
              </>
            )}
            {canDelete('items') && onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(item)}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Item
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn("font-medium", statusStyle.color)}>
            {isDraft && statusStyle.icon && <statusStyle.icon className="w-3 h-3 mr-1" />}
            {statusStyle.label}
          </Badge>
          <Badge variant="outline" className={category.color}>
            {getCategoryLabel(item)}
          </Badge>
          {item.fifo_enabled && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Check className="w-3 h-3 mr-1" />
              FIFO
            </Badge>
          )}
          {nextExpiry && daysUntilExpiry !== null && (
            <Badge variant="outline" className={cn(
              "flex items-center gap-1",
              daysUntilExpiry < 0
                ? "bg-red-100 text-red-700 border-red-200"
                : daysUntilExpiry <= 7
                  ? "bg-red-100 text-red-700 border-red-200"
                  : daysUntilExpiry <= 30
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-emerald-100 text-emerald-700 border-emerald-200"
            )}>
              <Clock className="w-3 h-3" />
              {daysUntilExpiry < 0 ? 'Expired' : `${daysUntilExpiry}d left`}
            </Badge>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-500">Stock Level</span>
            <span className="font-semibold text-slate-900">
              {formatQty(item.current_stock)} / {formatQty(item.max_capacity)} {item.unit_of_measure}
            </span>
          </div>
          <Progress
            value={percentage}
            className="h-2"
          />
          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
            <span>Min: {formatQty(item.min_threshold)}</span>
            <span>{percentage}%</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Unit Cost</span>
            <span className="font-semibold text-slate-900">₱{formatNumber(item.cost_per_unit, 2)}</span>
          </div>
          {nextExpiry && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Next Expiry</span>
              <span className={cn(
                "text-sm font-medium",
                daysUntilExpiry < 0
                  ? "text-red-700"
                  : daysUntilExpiry <= 7
                    ? "text-red-700"
                    : daysUntilExpiry <= 30
                      ? "text-amber-700"
                      : "text-emerald-700"
              )}>
                {format(new Date(nextExpiry), 'MMM d, yyyy')}
              </span>
            </div>
          )}
          {canConfigurePosCatalog && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-2">
                <span className="text-xs text-slate-600">Show in POS Menu</span>
                <Switch
                  checked={posConfig?.pos_visible !== false}
                  onCheckedChange={(checked) => onTogglePosVisibility?.(item, checked)}
                />
              </div>
              <div className="rounded-lg border border-slate-200 p-2 space-y-2">
                <p className="text-xs text-slate-600">POS Menu Image</p>
                {posConfig?.pos_image_url ? (
                  <img
                    src={posConfig.pos_image_url}
                    alt={`${item.name} POS menu`}
                    className="h-20 w-full object-cover rounded-md border border-slate-200"
                  />
                ) : (
                  <p className="text-xs text-slate-400">No POS image override uploaded.</p>
                )}
                <div className="flex gap-2">
                  <label className="text-xs px-2 py-1 border rounded-md cursor-pointer hover:bg-slate-50">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onUploadPosImage?.(item, file);
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDeletePosImage?.(item)}
                    disabled={!posConfig?.pos_image_url}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div >
  );
}
