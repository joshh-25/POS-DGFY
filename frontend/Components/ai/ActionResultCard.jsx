import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShoppingCart,
  Package,
  Clipboard,
  FileText,
  Users,
  Settings,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Map result types to styling
const RESULT_STYLES = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-800'
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    titleColor: 'text-red-800'
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800'
  },
  info: {
    icon: AlertCircle, // Info icon would be better if imported
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800'
  }
};

const ENTITY_ICONS = {
  purchase_order: ShoppingCart,
  item: Package,
  supplier: Users,
  job_order: Clipboard,
  stock_movement: FileText,
  settings: Settings,
  inventory_folder: Package
};

const ENTITY_PATHS = {
  purchase_order: '/purchase-orders',
  item: '/items',
  supplier: '/suppliers',
  job_order: '/job-orders',
  stock_movement: '/stock-movements',
  settings: '/settings',
  inventory_folder: '/items'
};

export default function ActionResultCard({ result, onViewDetails }) {
  if (!result) return null;

  const resultType = result.success ? 'success' : (result.error ? 'error' : 'info');
  const style = RESULT_STYLES[resultType] || RESULT_STYLES.info;
  const IconComponent = style.icon;

  // 1. Resolve Navigation Link
  // Use new standardized 'related_entity' if available, otherwise fallback to legacy heuristics
  let actionLink = null;
  if (result.related_entity) {
    const { type, label } = result.related_entity;
    if (ENTITY_PATHS[type]) {
      actionLink = {
        path: ENTITY_PATHS[type],
        label: `View ${label || type.replace('_', ' ')}`,
        icon: ENTITY_ICONS[type] || ArrowRight
      };
    }
  } else {
    // Legacy Handlers (Backward Compatibility)
    if (result.po_id || result.po_number) {
      actionLink = { path: '/purchase-orders', label: 'View Purchase Order', icon: ShoppingCart };
    } else if (result.jo_id || result.jo_number) {
      actionLink = { path: '/job-orders', label: 'View Job Order', icon: Clipboard };
    } else if (result.item_id || result.item) {
      actionLink = { path: '/items', label: 'View Item', icon: Package };
    } else if (result.movement_id) {
      actionLink = { path: '/stock-movements', label: 'View Movement', icon: FileText };
    }
  }

  // 2. Resolve Key Details (Chips)
  // Use 'details' object if available
  const details = result.details || {};

  // 3. Resolve Impact/Stats (Grid)
  // Consolidate 'impact' (new) and 'stats' (legacy)
  const impactStats = result.impact || result.stats || {};
  const hasImpact = Object.keys(impactStats).length > 0;

  return (
    <div className={`rounded-xl border ${style.borderColor} ${style.bgColor} p-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${style.iconColor} shrink-0`}>
          <IconComponent className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold ${style.titleColor}`}>
            {result.summary || result.message || (resultType === 'success' ? 'Action Completed' : 'Action Failed')}
          </h4>

          {/* Impact / Stats Grid (The "Visual Success Card" Core) */}
          {hasImpact && (
            <div className="mt-3 grid grid-cols-2 gap-3 bg-white/60 rounded-lg p-3 border border-black/5">
              {Object.entries(impactStats).map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-bold text-slate-800 break-words leading-tight">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Details Chips (Secondary Info) */}
          {Object.keys(details).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(details).map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white/40 border border-black/5 text-slate-600"
                >
                  <span className="opacity-70 mr-1.5">{key}:</span>
                  <span className="font-semibold">{String(value)}</span>
                </span>
              ))}
            </div>
          )}

          {/* Legacy fallback if no details/impact but specific fields exist */}
          {Object.keys(details).length === 0 && !hasImpact && (result.po_number || result.jo_number || result.total_amount) && (
            <div className="mt-2 text-sm text-slate-600">
              {result.po_number && <span>PO: {result.po_number} </span>}
              {result.jo_number && <span>JO: {result.jo_number} </span>}
            </div>
          )}

          {/* Action Button */}
          {actionLink && onViewDetails && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onViewDetails(actionLink.path)}
              className={`mt-4 w-full sm:w-auto ${style.iconColor} bg-white hover:bg-white/80 border border-black/10 shadow-sm h-8 font-medium`}
            >
              <actionLink.icon className="w-3.5 h-3.5 mr-2" />
              {actionLink.label}
              <ExternalLink className="w-3 h-3 ml-2 opacity-50" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
