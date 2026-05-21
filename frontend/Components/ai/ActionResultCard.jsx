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
  ArrowRight,
  Send
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
  inventory_folder: Package,
  dispatch_order: Send
};

const ENTITY_PATHS = {
  purchase_order: '/purchase-orders',
  item: '/items',
  supplier: '/suppliers',
  job_order: '/job-orders',
  stock_movement: '/stock-movements',
  settings: '/settings',
  inventory_folder: '/items',
  dispatch_order: '/dispatch-orders'
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
    if (result.do_id || result.do_number) {
      actionLink = { path: '/dispatch-orders', label: `View ${result.do_number || 'Dispatch Order'}`, icon: Send };
    } else if (result.po_id || result.po_number) {
      actionLink = { path: '/purchase-orders', label: `View ${result.po_number || 'Purchase Order'}`, icon: ShoppingCart };
    } else if (result.jo_id || result.jo_number) {
      actionLink = { path: '/job-orders', label: `View ${result.jo_number || 'Job Order'}`, icon: Clipboard };
    } else if (result.item_id || result.item) {
      actionLink = { path: '/items', label: 'View Item', icon: Package };
    } else if (result.movement_id) {
      actionLink = { path: '/stock-movements', label: 'View Movement', icon: FileText };
    }
  }

  // State for pagination/truncation
  const [showAllImpact, setShowAllImpact] = React.useState(false);
  const [showAllDetails, setShowAllDetails] = React.useState(false);
  const ITEMS_TO_SHOW = 8; // Number of items to show initially

  // 2. Resolve Key Details (Chips)
  const details = result.details || {};
  const detailsEntries = Object.entries(details);
  const hasDetails = detailsEntries.length > 0;
  const visibleDetails = showAllDetails ? detailsEntries : detailsEntries.slice(0, ITEMS_TO_SHOW);
  const hiddenDetailsCount = detailsEntries.length - ITEMS_TO_SHOW;

  // 3. Resolve Impact/Stats (Grid)
  const impactStats = result.impact || result.stats || {};
  const impactEntries = Object.entries(impactStats);
  const hasImpact = impactEntries.length > 0;
  const visibleImpact = showAllImpact ? impactEntries : impactEntries.slice(0, ITEMS_TO_SHOW);
  const hiddenImpactCount = impactEntries.length - ITEMS_TO_SHOW;

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
            <div className="mt-3">
              <div className={`grid grid-cols-2 gap-3 bg-white/60 rounded-lg p-3 border border-black/5 ${showAllImpact ? 'max-h-[300px] overflow-y-auto pr-1' : ''}`}>
                {visibleImpact.map(([key, value]) => (
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
              {hiddenImpactCount > 0 && (
                <button
                  onClick={() => setShowAllImpact(!showAllImpact)}
                  className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700 underline decoration-slate-300 underline-offset-2"
                >
                  {showAllImpact ? 'Show Less' : `Show ${hiddenImpactCount} more updates...`}
                </button>
              )}
            </div>
          )}

          {/* Details Chips (Secondary Info) */}
          {hasDetails && (
            <div className="mt-3">
              <div className={`flex flex-wrap gap-2 ${showAllDetails ? 'max-h-[200px] overflow-y-auto pr-1' : ''}`}>
                {visibleDetails.map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white/40 border border-black/5 text-slate-600"
                  >
                    <span className="opacity-70 mr-1.5">{key}:</span>
                    <span className="font-semibold">{String(value)}</span>
                  </span>
                ))}
              </div>
              {hiddenDetailsCount > 0 && (
                <button
                  onClick={() => setShowAllDetails(!showAllDetails)}
                  className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700 underline decoration-slate-300 underline-offset-2"
                >
                  {showAllDetails ? 'Show Less' : `Show ${hiddenDetailsCount} more details...`}
                </button>
              )}
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
