import React from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';
import { calculateTotalProductCost } from './helpers';

export default function CostFinancialSection({ item }) {
  const totalCost = calculateTotalProductCost(item);
  const hasCostBreakdown = (item.labor_cost && item.labor_cost > 0) ||
                          (item.overhead_cost && item.overhead_cost > 0) ||
                          (item.additional_packaging_cost && item.additional_packaging_cost > 0);

  return (
    <div className="space-y-6">
      {/* Total Cost Card */}
      <div className="bg-teal-50 rounded-lg p-6 border-2 border-teal-200">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-teal-900">Total Product Cost</h3>
        </div>
        <p className="text-4xl font-bold text-teal-900">
          ₱{formatNumber(totalCost, 2)}
        </p>
        <p className="text-sm text-teal-700 mt-1">per {item.unit_of_measure}</p>
      </div>

      {/* Cost Breakdown */}
      {hasCostBreakdown && (
        <div>
          <h4 className="font-semibold text-slate-900 mb-3">Cost Breakdown</h4>
          <div className="space-y-3">
            {item.cost_per_unit > 0 && (
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-700">Base Cost</span>
                <span className="font-semibold text-slate-900">₱{formatNumber(item.cost_per_unit, 2)}</span>
              </div>
            )}

            {item.labor_cost > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-blue-700">Labor Cost</span>
                <span className="font-semibold text-blue-900">₱{formatNumber(item.labor_cost, 2)}</span>
              </div>
            )}

            {item.overhead_cost > 0 && (
              <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-purple-700">Overhead Cost</span>
                <span className="font-semibold text-purple-900">₱{formatNumber(item.overhead_cost, 2)}</span>
              </div>
            )}

            {item.additional_packaging_cost > 0 && (
              <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <span className="text-orange-700">Additional Packaging</span>
                <span className="font-semibold text-orange-900">₱{formatNumber(item.additional_packaging_cost, 2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Inventory Value */}
      {item.current_stock > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-slate-600" />
            <label className="text-sm font-medium text-slate-700">Current Inventory Value</label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            ₱{formatNumber(item.current_stock * totalCost, 2)}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {formatNumber(item.current_stock, 2)} {item.unit_of_measure} × ₱{formatNumber(totalCost, 2)}
          </p>
        </div>
      )}

      {/* Default Sale Price */}
      {item.category === 'product' && item.product_type === 'finished_goods' && (
        <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            <label className="text-sm font-medium text-teal-700">Default Sale Price</label>
          </div>
          {item.default_sale_price != null ? (
            <>
              <p className="text-2xl font-bold text-teal-900">
                ₱{formatNumber(item.default_sale_price, 2)}
              </p>
              <p className="text-xs text-teal-600 mt-1">per {item.unit_of_measure} — pre-fills Dispatch Order sale price</p>
            </>
          ) : (
            <p className="text-sm text-teal-700">
              Not set — will default to cost per unit (₱{formatNumber(totalCost, 2)}) on first dispatch
            </p>
          )}
        </div>
      )}

      {!item.cost_per_unit && !hasCostBreakdown && (
        <p className="text-slate-500 text-center py-4">No cost information available</p>
      )}
    </div>
  );
}
