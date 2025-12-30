import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Package, TrendingDown, ShoppingCart, DollarSign } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';
import { getStockStatus } from '../../data/dummyData';

export default function StockInventorySection({ item }) {
  const stockPercentage = item.max_capacity > 0
    ? (item.current_stock / item.max_capacity) * 100
    : 0;

  const status = getStockStatus(item);
  const inventoryValue = (item.current_stock || 0) * (item.cost_per_unit || 0);

  const getStatusColor = () => {
    switch (status) {
      case 'critical': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      case 'healthy': return 'bg-green-500';
      case 'surplus': return 'bg-blue-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'critical': return 'Critical - Immediate Restock Required';
      case 'warning': return 'Low Stock - Restock Soon';
      case 'healthy': return 'Healthy Stock Level';
      case 'surplus': return 'Surplus Stock';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stock Level Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-600">Stock Level</label>
          <span className={`text-sm font-medium ${
            status === 'critical' ? 'text-red-600' :
            status === 'warning' ? 'text-yellow-600' :
            status === 'healthy' ? 'text-green-600' :
            'text-blue-600'
          }`}>
            {getStatusText()}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Progress value={stockPercentage} className="h-3" indicatorClassName={getStatusColor()} />
          </div>
          <div className="text-sm font-medium text-slate-900">
            {formatNumber(item.current_stock, 2)} / {formatNumber(item.max_capacity, 2)} {item.unit_of_measure}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {formatNumber(stockPercentage, 1)}% capacity
        </p>
      </div>

      {/* Stock Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-slate-500" />
            <label className="text-xs font-medium text-slate-600">Current Stock</label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatNumber(item.current_stock, 2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{item.unit_of_measure}</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-yellow-500" />
            <label className="text-xs font-medium text-slate-600">Min Threshold</label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatNumber(item.min_threshold || 0, 2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{item.unit_of_measure}</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-blue-500" />
            <label className="text-xs font-medium text-slate-600">Purchase Allowance</label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatNumber(item.purchase_allowance || 0, 2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{item.unit_of_measure}</p>
        </div>

        <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-teal-600" />
            <label className="text-xs font-medium text-teal-700">Inventory Value</label>
          </div>
          <p className="text-2xl font-bold text-teal-900">
            ₱{formatNumber(inventoryValue, 2)}
          </p>
          <p className="text-xs text-teal-600 mt-1">
            @ ₱{formatNumber(item.cost_per_unit || 0, 2)}/{item.unit_of_measure}
          </p>
        </div>
      </div>
    </div>
  );
}
