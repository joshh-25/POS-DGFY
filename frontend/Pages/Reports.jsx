import React, { useState, useMemo } from 'react';
import {
  FileText,
  Clock,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Download,
  BarChart3,
  Loader2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "../src/lib/utils.js";
import { useItems } from '@/hooks/useItems.js';
import { useStockMovements } from '@/hooks/useStockMovements.js';
import { getStockStatus } from '@/components/data/dummyData';
import { formatNumber } from '../src/lib/numberUtils.js';
import { calculateTotalProductCost } from '@/components/items/details/helpers';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('aging');
  const { items, loading: itemsLoading, error: itemsError } = useItems({ limit: 1000 });
  const { stockMovements, loading: movementsLoading, error: movementsError } = useStockMovements();

  // Stock Aging Report Data
  const agingReport = useMemo(() => {
    if (!items || !stockMovements) return [];
    return items.map(item => {
      const itemId = item.item_id || item.id;
      const lastMovement = stockMovements
        .filter(m => (m.item_id || m.Item?.item_id) == itemId)
        .sort((a, b) => new Date(b.timestamp || b.created_date || b.created_at) - new Date(a.timestamp || a.created_date || a.created_at))[0];

      const daysInStorage = lastMovement
        ? Math.floor((new Date() - new Date(lastMovement.timestamp || lastMovement.created_date || lastMovement.created_at)) / (1000 * 60 * 60 * 24))
        : 30;

      let agingStatus = 'fresh';
      if (daysInStorage > 14) agingStatus = 'aging';
      if (daysInStorage > 30) agingStatus = 'critical';

      return {
        ...item,
        lastMovementDate: lastMovement ? (lastMovement.timestamp || lastMovement.created_date || lastMovement.created_at) : (item.updated_at || item.last_updated),
        daysInStorage,
        agingStatus
      };
    }).sort((a, b) => b.daysInStorage - a.daysInStorage);
  }, [items, stockMovements]);

  // Surplus & Shortage Report Data
  const surplusShortageReport = useMemo(() => {
    if (!items) return [];
    return items.map(item => {
      const status = getStockStatus(item);
      const currentStock = parseFloat(item.current_stock || 0);
      const minThreshold = parseFloat(item.min_threshold || 0);
      const maxCapacity = parseFloat(item.max_capacity || 0);
      let variancePercent = 0;
      let recommendation = '';

      if (currentStock < minThreshold) {
        variancePercent = -Math.round((1 - currentStock / minThreshold) * 100);
        const neededQty = minThreshold - currentStock;
        recommendation = `Order ${neededQty} ${item.unit_of_measure} - currently ${currentStock}, minimum is ${minThreshold}`;
      } else if (currentStock > maxCapacity) {
        variancePercent = Math.round((currentStock / maxCapacity - 1) * 100);
        recommendation = `Surplus of ${currentStock - maxCapacity} ${item.unit_of_measure}`;
      } else {
        variancePercent = maxCapacity > 0 ? Math.round((currentStock / maxCapacity) * 100) : 0;
        recommendation = 'Stock level is healthy';
      }

      return {
        ...item,
        status,
        variancePercent,
        recommendation
      };
    });
  }, [items]);

  // Movement Summary Stats
  const movementStats = useMemo(() => {
    const stats = {
      totalReceived: 0,
      totalConsumed: 0,
      totalLosses: 0,
      totalTransfers: 0
    };

    if (!stockMovements) return stats;

    stockMovements.forEach(mov => {
      const quantity = parseFloat(mov.quantity || 0);
      switch (mov.movement_type) {
        case 'purchase_receipt':
        case 'return':
          stats.totalReceived += quantity;
          break;
        case 'production_consumption':
          stats.totalConsumed += quantity;
          break;
        case 'calculated_loss':
          stats.totalLosses += quantity;
          break;
        case 'transfer':
          stats.totalTransfers += quantity;
          break;
      }
    });

    return stats;
  }, [stockMovements]);

  // Inventory Valuation Report Data
  const valuationReport = useMemo(() => {
    const byCategory = {
      ingredient: { items: [], total: 0 },
      product: { items: [], total: 0 },
      packaging: { items: [], total: 0 }
    };

    if (!items) return { byCategory, grandTotal: 0 };

    items.forEach(item => {
      const currentStock = parseFloat(item.current_stock || 0);
      const costPerUnit = calculateTotalProductCost(item);
      const totalValue = currentStock * costPerUnit;
      if (byCategory[item.category]) {
        byCategory[item.category].items.push({ ...item, totalValue, calculatedCost: costPerUnit });
        byCategory[item.category].total += totalValue;
      }
    });

    const grandTotal = Object.values(byCategory).reduce((sum, cat) => sum + cat.total, 0);

    return { byCategory, grandTotal };
  }, [items]);

  const agingStatusColors = {
    fresh: "bg-emerald-100 text-emerald-700 border-emerald-200",
    aging: "bg-amber-100 text-amber-700 border-amber-200",
    critical: "bg-red-100 text-red-700 border-red-200"
  };

  const statusColors = {
    critical: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    healthy: "bg-emerald-100 text-emerald-700",
    surplus: "bg-blue-100 text-blue-700"
  };

  if (itemsLoading || movementsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (itemsError || movementsError) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-red-800 font-medium">Error loading reports</p>
          <p className="text-red-600 text-sm mt-1">{itemsError || movementsError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-slate-500 mt-1">Inventory analytics and insights</p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 h-auto flex-wrap">
          <TabsTrigger value="aging" className="flex items-center gap-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
            <Clock className="w-4 h-4" />
            Stock Aging
          </TabsTrigger>
          <TabsTrigger value="surplus" className="flex items-center gap-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
            <TrendingUp className="w-4 h-4" />
            Surplus & Shortage
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center gap-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
            <BarChart3 className="w-4 h-4" />
            Movement Summary
          </TabsTrigger>
          <TabsTrigger value="valuation" className="flex items-center gap-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
            <DollarSign className="w-4 h-4" />
            Inventory Valuation
          </TabsTrigger>
        </TabsList>

        {/* Stock Aging Report */}
        <TabsContent value="aging">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Stock Aging Report</h3>
              <p className="text-sm text-slate-500 mt-1">Identify slow-moving items and potential expiration risks</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left p-4 font-medium text-slate-600">Item</th>
                    <th className="text-left p-4 font-medium text-slate-600">Category</th>
                    <th className="text-right p-4 font-medium text-slate-600">Current Stock</th>
                    <th className="text-right p-4 font-medium text-slate-600">Days in Storage</th>
                    <th className="text-left p-4 font-medium text-slate-600">Last Movement</th>
                    <th className="text-left p-4 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agingReport.map(item => (
                    <tr key={item.item_id || item.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">{item.name}</td>
                      <td className="p-4 text-slate-600 capitalize">{item.category}</td>
                      <td className="p-4 text-right text-slate-900">{parseFloat(item.current_stock || 0)} {item.unit_of_measure}</td>
                      <td className="p-4 text-right font-medium text-slate-900">{item.daysInStorage} days</td>
                      <td className="p-4 text-slate-600">{item.lastMovementDate ? new Date(item.lastMovementDate).toLocaleDateString() : 'N/A'}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={agingStatusColors[item.agingStatus]}>
                          {item.agingStatus.charAt(0).toUpperCase() + item.agingStatus.slice(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Surplus & Shortage Report */}
        <TabsContent value="surplus">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Surplus & Shortage Report</h3>
              <p className="text-sm text-slate-500 mt-1">Stock levels compared to thresholds with recommendations</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left p-4 font-medium text-slate-600">Item</th>
                    <th className="text-right p-4 font-medium text-slate-600">Current</th>
                    <th className="text-right p-4 font-medium text-slate-600">Min Threshold</th>
                    <th className="text-right p-4 font-medium text-slate-600">Max Capacity</th>
                    <th className="text-left p-4 font-medium text-slate-600">Status</th>
                    <th className="text-left p-4 font-medium text-slate-600">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {surplusShortageReport.map(item => (
                    <tr key={item.item_id || item.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">{item.name}</td>
                      <td className="p-4 text-right font-medium text-slate-900">{parseFloat(item.current_stock || 0)} {item.unit_of_measure}</td>
                      <td className="p-4 text-right text-slate-600">{parseFloat(item.min_threshold || 0)} {item.unit_of_measure}</td>
                      <td className="p-4 text-right text-slate-600">{parseFloat(item.max_capacity || 0)} {item.unit_of_measure}</td>
                      <td className="p-4">
                        <Badge className={cn("font-medium", statusColors[item.status])}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-slate-600 max-w-xs">
                        {item.recommendation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Movement Summary Report */}
        <TabsContent value="movements">
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <p className="text-sm text-slate-500">Total Received</p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">{movementStats.totalReceived}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <p className="text-sm text-slate-500">Total Consumed</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{movementStats.totalConsumed}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <p className="text-sm text-slate-500">Total Losses</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{movementStats.totalLosses}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <p className="text-sm text-slate-500">Total Transferred</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">{movementStats.totalTransfers}</p>
              </div>
            </div>

            {/* Movement History Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Movement History</h3>
                <p className="text-sm text-slate-500 mt-1">Complete log of all inventory movements</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-4 font-medium text-slate-600">Date</th>
                      <th className="text-left p-4 font-medium text-slate-600">Item</th>
                      <th className="text-left p-4 font-medium text-slate-600">Type</th>
                      <th className="text-right p-4 font-medium text-slate-600">Quantity</th>
                      <th className="text-left p-4 font-medium text-slate-600">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(stockMovements || []).slice(0, 10).map(mov => (
                      <tr key={mov.movement_id || mov.id} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-600">{(mov.timestamp || mov.created_date || mov.created_at) ? new Date(mov.timestamp || mov.created_date || mov.created_at).toLocaleDateString() : 'N/A'}</td>
                        <td className="p-4 font-medium text-slate-900">{mov.item_name || mov.Item?.name || 'N/A'}</td>
                        <td className="p-4 text-slate-600 capitalize">{(mov.movement_type || '').replace(/_/g, ' ')}</td>
                        <td className="p-4 text-right font-medium text-slate-900">{parseFloat(mov.quantity || 0)}</td>
                        <td className="p-4 text-slate-600">{mov.user_responsible || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Inventory Valuation Report */}
        <TabsContent value="valuation">
          <div className="space-y-6">
            {/* Grand Total Card */}
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 text-white">
              <p className="text-teal-100">Total Inventory Value</p>
              <p className="text-4xl font-bold mt-2">
                ₱{valuationReport.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* By Category */}
            {Object.entries(valuationReport.byCategory).map(([category, data]) => (
              <div key={category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900 capitalize">{category}s</h3>
                    <p className="text-sm text-slate-500 mt-1">{data.items.length} items</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Subtotal</p>
                    <p className="text-xl font-bold text-slate-900">
                      ₱{data.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-4 font-medium text-slate-600">Item</th>
                        <th className="text-right p-4 font-medium text-slate-600">Quantity</th>
                        <th className="text-right p-4 font-medium text-slate-600">Cost/Unit</th>
                        <th className="text-right p-4 font-medium text-slate-600">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map(item => (
                        <tr key={item.item_id || item.id} className="hover:bg-slate-50">
                          <td className="p-4 font-medium text-slate-900">{item.name}</td>
                          <td className="p-4 text-right text-slate-600">{parseFloat(item.current_stock || 0)} {item.unit_of_measure}</td>
                          <td className="p-4 text-right text-slate-600">₱{formatNumber(item.calculatedCost || 0, 2)}</td>
                          <td className="p-4 text-right font-medium text-slate-900">₱{formatNumber(item.totalValue, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}