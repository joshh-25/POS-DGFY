import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShoppingCart,
  Package,
  Clipboard,
  FileText
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
    icon: AlertCircle,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800'
  }
};

export default function ActionResultCard({ result, onViewDetails }) {
  if (!result) return null;

  const resultType = result.type || (result.success ? 'success' : 'error');
  const style = RESULT_STYLES[resultType] || RESULT_STYLES.info;
  const IconComponent = style.icon;

  // Determine entity type for navigation
  const getEntityLink = () => {
    if (result.po_id || result.po_number) {
      return { path: '/purchase-orders', label: 'View Purchase Order', icon: ShoppingCart };
    }
    if (result.jo_id || result.jo_number) {
      return { path: '/job-orders', label: 'View Job Order', icon: Clipboard };
    }
    if (result.item_id || result.item) {
      return { path: '/items', label: 'View Item', icon: Package };
    }
    if (result.movement_id) {
      return { path: '/stock-movements', label: 'View Movement', icon: FileText };
    }
    return null;
  };

  const entityLink = getEntityLink();

  return (
    <div className={`rounded-xl border ${style.borderColor} ${style.bgColor} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${style.iconColor}`}>
          <IconComponent className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold ${style.titleColor}`}>
            {resultType === 'success' ? 'Action Completed' :
             resultType === 'error' ? 'Action Failed' :
             'Result'}
          </h4>

          <p className="text-sm text-slate-700 mt-1">
            {result.message}
          </p>

          {/* Show specific result details */}
          {(result.po_number || result.jo_number || result.movement_id) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.po_number && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700">
                  PO: {result.po_number}
                </span>
              )}
              {result.jo_number && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700">
                  JO: {result.jo_number}
                </span>
              )}
              {result.total_amount && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700">
                  Total: ${result.total_amount.toFixed(2)}
                </span>
              )}
              {result.quantity_produced && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700">
                  Produced: {result.quantity_produced}
                </span>
              )}
              {result.batches_created && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700">
                  Batches: {result.batches_created}
                </span>
              )}
            </div>
          )}

          {/* Action button */}
          {entityLink && onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(entityLink.path)}
              className="mt-3 text-slate-600 hover:text-slate-800 p-0 h-auto font-medium"
            >
              <entityLink.icon className="w-4 h-4 mr-1.5" />
              {entityLink.label}
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
