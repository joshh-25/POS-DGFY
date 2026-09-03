import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { MoreVertical, Eye, Edit, History, FileEdit, Trash2, Clock, Check, Folder, Monitor, AlertTriangle, RotateCcw } from 'lucide-react';
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
import { formatPeso, formatQty } from '../../src/lib/numberUtils.js';
import { getNextExpiryDate, getDaysUntilExpiry } from '@/components/utils/expiryHelpers.js';
import { format } from 'date-fns';
import { getCategoryConfig, getCategoryLabel } from '@/components/utils/categoryHelpers';
import { usePermission } from '../../src/hooks/usePermission';
import { resolveItemFinancialPolicy } from '../../src/features/inventory/itemFinancialPolicy.js';

const safeStockPercentage = (item) => {
  const currentStock = Number(item?.current_stock ?? 0);
  const maxCapacity = Number(item?.max_capacity ?? 0);
  if (!Number.isFinite(currentStock) || !Number.isFinite(maxCapacity) || maxCapacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((currentStock / maxCapacity) * 100)));
};

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
  onRestore,
  onMoveToFolder,
  posReadiness,
  onOpenInTerminal,
  posVisible = false,
  posAlwaysAvailable = false,
  showPosVisibilityControl = true,
  canTogglePosVisibility = false,
  onTogglePosVisibility,
  onTogglePosAlwaysAvailable,
  storefrontVisible = false,
  showStorefrontVisibilityControl = true,
  canToggleStorefrontVisibility = false,
  onToggleStorefrontVisibility,
  isSelected,
  onSelect,
  isMsmeMode = false,
  workflowMode,
  // #682: set by ItemsPage only when the current view is genuinely branch-scoped (not the
  // schema-fallback case) -- rendered under the stock line when this item's stock is truly 0 at
  // that branch, so a zero doesn't just look like a blank/broken number.
  branchZeroStockHint = null
}) {
  const { canEdit, canDelete } = usePermission();
  const category = getCategoryConfig(item);
  const isDraft = item.status === 'draft';
  const status = isDraft ? 'draft' : (posAlwaysAvailable ? 'healthy' : getStockStatus(item));
  const statusStyle = statusConfig[status];
  const Icon = category.icon;
  const percentage = isDraft ? 0 : safeStockPercentage(item);
  const financialPolicy = resolveItemFinancialPolicy({
    workflowMode,
    item,
    posVisible,
    storefrontVisible,
    serviceCostTrackingEnabled: Number(item?.cost_per_unit || 0) > 0
  });
  const weightedAvgCost = Number(item?.cost_metrics?.global?.weighted_avg_cost || 0);
  const hasAverageCost = financialPolicy.show_cost && weightedAvgCost > 0
    && Math.abs(weightedAvgCost - Number(item?.cost_per_unit || 0)) > 0.0001;
  const itemDomId = String(item.item_id || item.id || item.sku_code || item.name || 'item')
    .replace(/[^a-zA-Z0-9_-]+/g, '-');
  const showCatalogControls = showPosVisibilityControl || showStorefrontVisibilityControl;
  const catalogPriceMissing = showCatalogControls && !financialPolicy.has_explicit_sale_price;
  const salePriceSetupNeeded = financialPolicy.show_sale_price && !financialPolicy.has_explicit_sale_price;
  const catalogPriceWarningId = `item-card-${itemDomId}-customer-price-warning`;

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
  const readinessMissingCount = Array.isArray(posReadiness?.missing_requirements)
    ? posReadiness.missing_requirements.length
    : 0;
  const readinessState = posReadiness?.ready === true ? 'ready' : 'needs_attention';

  const handleClick = (e) => {
    // Prevent selection when clicking interactive elements or during drag (listeners)
    if (e.target.closest('button') || e.target.closest('a')) {
      return;
    }

    if (onSelect) {
      onSelect(item.item_id || item.id, e.ctrlKey || e.metaKey, e.shiftKey);
    }
  };

  const handleTogglePos = (nextValue) => {
    if (!canTogglePosVisibility || typeof onTogglePosVisibility !== 'function') return;
    onTogglePosVisibility(item, nextValue);
  };

  const handleToggleStorefront = (nextValue) => {
    if (!canToggleStorefrontVisibility || typeof onToggleStorefrontVisibility !== 'function') return;
    onToggleStorefrontVisibility(item, nextValue);
  };

  const handleToggleAlwaysAvailable = (nextValue) => {
    if (!canTogglePosVisibility || typeof onTogglePosAlwaysAvailable !== 'function') return;
    onTogglePosAlwaysAvailable(item, nextValue);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={cn(
        "relative group flex h-full select-none touch-none flex-col rounded-2xl border bg-white p-6 transition-all duration-300", // touch-none for better dragging
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
          <div className="flex min-h-[3.5rem] min-w-0 flex-col justify-center">
            <h3
              className="font-semibold text-slate-900"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word'
              }}
              title={item.name}
            >
              {item.name}
            </h3>
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
            {onOpenInTerminal && (
              <DropdownMenuItem onClick={() => onOpenInTerminal(item)}>
                <Monitor className="w-4 h-4 mr-2" /> Preview in Terminal
              </DropdownMenuItem>
            )}
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
            {canDelete('items') && item.status === 'inactive' && onRestore && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRestore(item)}
                  className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Restore Item
                </DropdownMenuItem>
              </>
            )}
            {canDelete('items') && item.status !== 'inactive' && onDelete && (
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

      <div className="flex flex-1 flex-col gap-4">
        {showCatalogControls && (
          <div className="space-y-2">
            {showPosVisibilityControl && (
              <div
                className={cn(
                  "flex min-h-10 items-center justify-between rounded-lg border px-3 py-2",
                  catalogPriceMissing
                    ? "border-amber-200 bg-amber-50/80"
                    : "border-slate-200 bg-slate-50"
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="text-xs font-semibold text-slate-600">Show in POS</span>
                <Switch
                  checked={Boolean(posVisible)}
                  onCheckedChange={handleTogglePos}
                  disabled={!canTogglePosVisibility}
                  aria-label={`Toggle POS visibility for ${item.name}`}
                  aria-describedby={catalogPriceMissing ? catalogPriceWarningId : undefined}
                />
              </div>
            )}
            {showPosVisibilityControl && (
              <div
                className="flex min-h-10 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="text-xs font-semibold text-slate-600">Always Available</span>
                <Switch
                  checked={Boolean(posAlwaysAvailable)}
                  onCheckedChange={handleToggleAlwaysAvailable}
                  disabled={!canTogglePosVisibility}
                  aria-label={`Toggle Always Available for ${item.name}`}
                />
              </div>
            )}
            {showStorefrontVisibilityControl && (
              <div
                className={cn(
                  "flex min-h-10 items-center justify-between rounded-lg border px-3 py-2",
                  catalogPriceMissing
                    ? "border-amber-200 bg-amber-50/80"
                    : "border-slate-200 bg-slate-50"
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="text-xs font-semibold text-slate-600">Show in Storefront</span>
                <Switch
                  checked={Boolean(storefrontVisible)}
                  onCheckedChange={handleToggleStorefront}
                  disabled={!canToggleStorefrontVisibility}
                  aria-label={`Toggle storefront visibility for ${item.name}`}
                  aria-describedby={catalogPriceMissing ? catalogPriceWarningId : undefined}
                />
              </div>
            )}
            {catalogPriceMissing && (
              <div
                id={catalogPriceWarningId}
                role="status"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Set a positive selling price before enabling POS or Storefront sales.</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {item.status === 'inactive' && (
            <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-300">
              Inactive
            </Badge>
          )}
          <Badge variant="outline" className={cn("font-medium", statusStyle.color)}>
            {isDraft && statusStyle.icon && <statusStyle.icon className="w-3 h-3 mr-1" />}
            {statusStyle.label}
          </Badge>
          <Badge variant="outline" className={category.color}>
            {getCategoryLabel(item)}
          </Badge>
          {!financialPolicy.is_pure_service && item.fifo_enabled && !isMsmeMode && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Check className="w-3 h-3 mr-1" />
              FIFO
            </Badge>
          )}
          {!financialPolicy.is_pure_service && nextExpiry && daysUntilExpiry !== null && !isMsmeMode && (
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
          {posReadiness && (
            <Badge
              variant="outline"
              className={readinessState === 'ready'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'}
            >
              {readinessState === 'ready'
                ? 'POS Ready'
                : isMsmeMode ? 'POS Setup Needed' : `POS Needs ${readinessMissingCount}`}
            </Badge>
          )}
        </div>

        {!financialPolicy.is_pure_service && (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="whitespace-nowrap text-slate-500">Stock Level</span>
            <span className="whitespace-nowrap text-right font-semibold text-slate-900">
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
          {branchZeroStockHint && Number(item?.current_stock || 0) === 0 && (
            <div className="mt-1 text-xs text-amber-700">{branchZeroStockHint}</div>
          )}
        </div>
        )}

        <div className="mt-auto space-y-2 border-t border-slate-100 pt-4">
          {financialPolicy.show_cost && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{financialPolicy.is_pure_service ? 'Internal Cost' : 'Unit Cost'}</span>
              <span className="font-semibold text-slate-900">{formatPeso(item.cost_per_unit)}</span>
            </div>
          )}
          {hasAverageCost && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Avg Cost (On-hand)</span>
              <span className="text-sm font-semibold text-teal-700">{formatPeso(weightedAvgCost)}</span>
            </div>
          )}
          {financialPolicy.show_sale_price && (
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
                <span>Selling Price</span>
                {salePriceSetupNeeded && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-700">
                    Setup needed
                  </Badge>
                )}
              </span>
              <span className={cn(
                "text-sm font-semibold",
                salePriceSetupNeeded ? "text-amber-700" : "text-slate-900"
              )}>
                {financialPolicy.has_explicit_sale_price ? formatPeso(item.default_sale_price) : 'Not set'}
              </span>
            </div>
          )}
          {!financialPolicy.is_pure_service && nextExpiry && !isMsmeMode && (
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
        </div>
      </div>
    </div >
  );
}
