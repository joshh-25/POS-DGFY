import React from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
import { formatNumber, formatPeso } from '../../../src/lib/numberUtils';
import { calculateTotalProductCost } from './helpers';

export default function CostFinancialSection({ item }) {
  const totalCost = calculateTotalProductCost(item);
  const weightedGlobal = item?.cost_metrics?.global || null;
  const weightedAvgCost = Number(weightedGlobal?.weighted_avg_cost || 0);
  const weightedInventoryValue = Number(weightedGlobal?.inventory_value || 0);
  const weightedAvailableQty = Number(weightedGlobal?.available_qty || 0);
  const weightedSource = weightedGlobal?.source || null;
  const byLocation = Array.isArray(item?.cost_metrics?.by_location) ? item.cost_metrics.by_location : [];
  const hasWeightedMetrics = weightedGlobal && (weightedAvgCost > 0 || weightedInventoryValue > 0);

  const hasCostBreakdown = (item.labor_cost && item.labor_cost > 0)
    || (item.overhead_cost && item.overhead_cost > 0)
    || (item.additional_packaging_cost && item.additional_packaging_cost > 0);

  const inventoryValue = hasWeightedMetrics
    ? weightedInventoryValue
    : Number(item.current_stock || 0) * totalCost;

  const inventoryUnitCost = hasWeightedMetrics ? weightedAvgCost : totalCost;

  return (
    <div className="space-y-6">
      {/* Total Cost Card */}
      <div className="bg-teal-50 rounded-lg p-6 border-2 border-teal-200">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-teal-900">Total Product Cost</h3>
        </div>
        <p className="text-4xl font-bold text-teal-900">
          {formatPeso(totalCost)}
        </p>
        <p className="text-sm text-teal-700 mt-1">per {item.unit_of_measure}</p>
      </div>

      {hasWeightedMetrics && (
        <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-cyan-700">Average Cost (On-hand)</p>
              <p className="text-2xl font-bold text-cyan-900">{formatPeso(weightedAvgCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-cyan-700">Available Qty</p>
              <p className="text-sm font-semibold text-cyan-900">{formatNumber(weightedAvailableQty, 2)} {item.unit_of_measure}</p>
            </div>
          </div>
          <p className="text-xs text-cyan-700 mt-2">
            {weightedSource === 'item_cost_fallback' ? 'Using item unit cost fallback (no open FIFO batches).' : 'Computed from open FIFO balances.'}
          </p>
        </div>
      )}

      {/* Cost Breakdown */}
      {hasCostBreakdown && (
        <div>
          <h4 className="font-semibold text-slate-900 mb-3">Cost Breakdown</h4>
          <div className="space-y-3">
            {item.cost_per_unit > 0 && (
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-700">Base Cost</span>
                <span className="font-semibold text-slate-900">{formatPeso(item.cost_per_unit)}</span>
              </div>
            )}

            {item.labor_cost > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-blue-700">Labor Cost</span>
                <span className="font-semibold text-blue-900">{formatPeso(item.labor_cost)}</span>
              </div>
            )}

            {item.overhead_cost > 0 && (
              <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-purple-700">Overhead Cost</span>
                <span className="font-semibold text-purple-900">{formatPeso(item.overhead_cost)}</span>
              </div>
            )}

            {item.additional_packaging_cost > 0 && (
              <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <span className="text-orange-700">Additional Packaging</span>
                <span className="font-semibold text-orange-900">{formatPeso(item.additional_packaging_cost)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Inventory Value */}
      {Number(item.current_stock) > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-slate-600" />
            <label className="text-sm font-medium text-slate-700">
              {hasWeightedMetrics ? 'Current Inventory Value (On-hand)' : 'Current Inventory Value'}
            </label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatPeso(inventoryValue)}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {formatNumber(item.current_stock, 2)} {item.unit_of_measure} x {formatPeso(inventoryUnitCost)}
          </p>
        </div>
      )}

      {byLocation.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-800">Location Cost Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Location</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">On-hand Qty</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">Avg Cost</th>
                  <th className="text-right px-4 py-2 font-medium text-slate-600">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byLocation.map((row, index) => (
                  <tr key={`cost-location-${row.location_id ?? 'na'}-${index}`}>
                    <td className="px-4 py-2 text-slate-700">{row.location_name || 'Unassigned'}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{formatNumber(row.available_qty || 0, 2)}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{formatPeso(row.weighted_avg_cost || 0)}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900">{formatPeso(row.inventory_value || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                {formatPeso(item.default_sale_price)}
              </p>
              <p className="text-xs text-teal-600 mt-1">per {item.unit_of_measure} - pre-fills Dispatch Order sale price</p>
            </>
          ) : (
            <p className="text-sm text-teal-700">
              Not set - will default to cost per unit ({formatPeso(totalCost)}) on first dispatch
            </p>
          )}
        </div>
      )}

      {!item.cost_per_unit && !hasCostBreakdown && !hasWeightedMetrics && (
        <p className="text-slate-500 text-center py-4">No cost information available</p>
      )}
    </div>
  );
}
