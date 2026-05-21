import React from 'react';
import { Beaker, TrendingUp, TrendingDown, FileText } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';

export default function YieldManagementSection({ item }) {
  const effectiveYield = item.yield_percentage
    ? item.yield_percentage - (item.processing_loss || 0)
    : 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {item.batch_size && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Beaker className="w-4 h-4 text-slate-500" />
              <label className="text-xs font-medium text-slate-600">Batch Size</label>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {formatNumber(item.batch_size, 2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{item.unit_of_measure}</p>
          </div>
        )}

        {item.yield_percentage && (
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <label className="text-xs font-medium text-green-700">Yield Percentage</label>
            </div>
            <p className="text-2xl font-bold text-green-900">
              {formatNumber(item.yield_percentage, 1)}%
            </p>
            <p className="text-xs text-green-600 mt-1">Expected output</p>
          </div>
        )}

        {item.processing_loss !== null && item.processing_loss !== undefined && (
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <label className="text-xs font-medium text-red-700">Processing Loss</label>
            </div>
            <p className="text-2xl font-bold text-red-900">
              {formatNumber(item.processing_loss, 1)}%
            </p>
            <p className="text-xs text-red-600 mt-1">Material waste</p>
          </div>
        )}
      </div>

      {(item.yield_percentage || item.processing_loss) && (
        <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
          <label className="text-sm font-medium text-teal-900">Effective Yield</label>
          <p className="text-3xl font-bold text-teal-900 mt-2">
            {formatNumber(effectiveYield, 1)}%
          </p>
          <p className="text-xs text-teal-700 mt-1">
            Yield after accounting for processing loss
          </p>
        </div>
      )}

      {item.production_notes && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <label className="text-sm font-medium text-slate-700">Production Notes</label>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-slate-700 whitespace-pre-wrap">{item.production_notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
