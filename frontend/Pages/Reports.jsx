import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Clock,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Download,
  BarChart3,
  Loader2,
  Package,
  ShoppingCart,
  Factory,
  Calendar,
  Save,
  History,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Hourglass,
  Truck
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "../src/lib/utils.js";
import { useReports } from '@/hooks/useReports.js';
import { formatNumber } from '../src/lib/numberUtils.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Reports() {
  const [activeTab, setActiveTab] = useState('expiry');
  const [dateFilters, setDateFilters] = useState({ startDate: '', endDate: '' });
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  const {
    loading,
    error,
    expiryReport,
    stockAgingReport,
    productionReport,
    poAnalysisReport,
    executiveSummary,
    snapshots,
    fetchExpiryReport,
    fetchStockAgingReport,
    fetchProductionReport,
    fetchPOAnalysisReport,
    fetchExecutiveSummary,
    fetchSnapshots,
    saveSnapshot,
    loadSnapshot,
    exportCSV
  } = useReports();

  // Fetch data when tab changes or filters change
  useEffect(() => {
    const filters = {
      startDate: dateFilters.startDate || undefined,
      endDate: dateFilters.endDate || undefined
    };

    switch (activeTab) {
      case 'expiry':
        fetchExpiryReport(filters);
        break;
      case 'aging':
        fetchStockAgingReport(filters);
        break;
      case 'production':
        fetchProductionReport(filters);
        break;
      case 'procurement':
        fetchPOAnalysisReport(filters);
        break;
      case 'summary':
        fetchExecutiveSummary(filters);
        break;
    }
  }, [activeTab, dateFilters, fetchExpiryReport, fetchStockAgingReport, fetchProductionReport, fetchPOAnalysisReport, fetchExecutiveSummary]);

  // Fetch snapshots when tab changes
  useEffect(() => {
    const typeMap = {
      expiry: 'expiry',
      aging: 'stock_aging',
      production: 'production',
      procurement: 'po_analysis',
      summary: 'executive_summary'
    };
    fetchSnapshots(typeMap[activeTab]);
  }, [activeTab, fetchSnapshots]);

  const handleExportCSV = async () => {
    const typeMap = {
      expiry: 'expiry',
      aging: 'stock_aging',
      production: 'production',
      procurement: 'po_analysis',
      summary: 'executive_summary'
    };
    try {
      await exportCSV(typeMap[activeTab], dateFilters);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleSaveSnapshot = async () => {
    const typeMap = {
      expiry: 'expiry',
      aging: 'stock_aging',
      production: 'production',
      procurement: 'po_analysis',
      summary: 'executive_summary'
    };
    const dataMap = {
      expiry: expiryReport,
      aging: stockAgingReport,
      production: productionReport,
      procurement: poAnalysisReport,
      summary: executiveSummary
    };

    try {
      setLoadingSnapshot(true);
      await saveSnapshot(typeMap[activeTab], dataMap[activeTab], dateFilters, snapshotName || undefined);
      setShowSnapshotDialog(false);
      setSnapshotName('');
      fetchSnapshots(typeMap[activeTab]);
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const handleLoadSnapshot = async (snapshotId) => {
    try {
      const snapshot = await loadSnapshot(snapshotId);
      if (snapshot) {
        // Set the loaded data based on type
        switch (snapshot.report_type) {
          case 'expiry':
            // Since we can't directly set, we'd need to add set functions
            console.log('Loaded expiry snapshot:', snapshot);
            break;
          // Handle other types...
        }
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err);
    }
  };

  const statusColors = {
    expired: "bg-red-100 text-red-700 border-red-200",
    critical: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    upcoming: "bg-yellow-100 text-yellow-700 border-yellow-200",
    fresh: "bg-emerald-100 text-emerald-700 border-emerald-200",
    aging: "bg-amber-100 text-amber-700 border-amber-200"
  };

  if (loading && !expiryReport && !stockAgingReport && !productionReport && !poAnalysisReport && !executiveSummary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-red-800 font-medium">Error loading reports</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
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
          <p className="text-slate-500 mt-1">Comprehensive inventory analytics and insights</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date Filters */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <Input
              type="date"
              value={dateFilters.startDate}
              onChange={(e) => setDateFilters(prev => ({ ...prev, startDate: e.target.value }))}
              className="border-0 p-0 h-auto w-32 text-sm"
              placeholder="Start"
            />
            <span className="text-slate-400">to</span>
            <Input
              type="date"
              value={dateFilters.endDate}
              onChange={(e) => setDateFilters(prev => ({ ...prev, endDate: e.target.value }))}
              className="border-0 p-0 h-auto w-32 text-sm"
              placeholder="End"
            />
          </div>

          {/* Snapshot Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="w-4 h-4 mr-2" />
                History
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => setShowSnapshotDialog(true)}>
                <Save className="w-4 h-4 mr-2" />
                Save Current as Snapshot
              </DropdownMenuItem>
              {snapshots.length > 0 && (
                <>
                  <div className="my-1 h-px bg-slate-100" />
                  <div className="px-2 py-1 text-xs text-slate-500 font-medium">Previous Snapshots</div>
                  {snapshots.slice(0, 5).map(snap => (
                    <DropdownMenuItem key={snap.snapshot_id} onClick={() => handleLoadSnapshot(snap.snapshot_id)}>
                      <Clock className="w-4 h-4 mr-2" />
                      {snap.report_name || new Date(snap.created_at).toLocaleDateString()}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" onClick={handleExportCSV} disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 h-auto flex-wrap">
          <TabsTrigger value="expiry" className="flex items-center gap-2 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
            <AlertTriangle className="w-4 h-4" />
            Expiry & Expired
          </TabsTrigger>
          <TabsTrigger value="aging" className="flex items-center gap-2 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
            <Clock className="w-4 h-4" />
            Stock Aging
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
            <Factory className="w-4 h-4" />
            Production
          </TabsTrigger>
          <TabsTrigger value="procurement" className="flex items-center gap-2 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
            <ShoppingCart className="w-4 h-4" />
            Procurement
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
            <BarChart3 className="w-4 h-4" />
            Executive Summary
          </TabsTrigger>
        </TabsList>

        {/* EXPIRY REPORT TAB */}
        <TabsContent value="expiry">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : expiryReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Expired</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 mt-2">{expiryReport.summary.total_expired_batches}</p>
                  <p className="text-sm text-red-600">₱{formatNumber(expiryReport.summary.total_expired_value, 2)}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Critical (≤7d)</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 mt-2">{expiryReport.summary.total_critical_batches}</p>
                  <p className="text-sm text-red-600">₱{formatNumber(expiryReport.summary.total_critical_value, 2)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm font-medium">Warning (≤14d)</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700 mt-2">{expiryReport.summary.total_warning_batches}</p>
                  <p className="text-sm text-amber-600">₱{formatNumber(expiryReport.summary.total_warning_value, 2)}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-yellow-600">
                    <Hourglass className="w-5 h-5" />
                    <span className="text-sm font-medium">Upcoming (≤30d)</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-700 mt-2">{expiryReport.summary.total_upcoming_batches}</p>
                  <p className="text-sm text-yellow-600">₱{formatNumber(expiryReport.summary.total_upcoming_value, 2)}</p>
                </div>
                <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <DollarSign className="w-5 h-5" />
                    <span className="text-sm font-medium">Total at Risk</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800 mt-2">₱{formatNumber(expiryReport.summary.total_value_at_risk, 2)}</p>
                </div>
              </div>

              {/* Expired Batches */}
              {expiryReport.expired.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                  <div className="p-4 border-b border-red-100 bg-red-50">
                    <h3 className="font-semibold text-red-800">⚠️ Expired Batches ({expiryReport.expired.length})</h3>
                    <p className="text-sm text-red-600">These items have passed their expiry date</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-red-50/50">
                        <tr>
                          <th className="text-left p-3 font-medium text-red-700">Item</th>
                          <th className="text-left p-3 font-medium text-red-700">SKU</th>
                          <th className="text-left p-3 font-medium text-red-700">Batch</th>
                          <th className="text-left p-3 font-medium text-red-700">Expiry Date</th>
                          <th className="text-right p-3 font-medium text-red-700">Days Expired</th>
                          <th className="text-right p-3 font-medium text-red-700">Qty</th>
                          <th className="text-right p-3 font-medium text-red-700">Value Lost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {expiryReport.expired.map(batch => (
                          <tr key={batch.batch_id} className="hover:bg-red-50/30">
                            <td className="p-3 font-medium text-slate-900">{batch.item_name}</td>
                            <td className="p-3 text-slate-600">{batch.sku_code}</td>
                            <td className="p-3 text-slate-600">#{batch.batch_id}</td>
                            <td className="p-3 text-red-600">{batch.expiry_date}</td>
                            <td className="p-3 text-right text-red-700 font-semibold">{batch.days_expired}d ago</td>
                            <td className="p-3 text-right">{batch.available_quantity} {batch.unit_of_measure}</td>
                            <td className="p-3 text-right text-red-700 font-semibold">₱{formatNumber(batch.value_at_risk, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Critical Batches */}
              {expiryReport.critical.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">🔴 Critical - Expiring within 7 days ({expiryReport.critical.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-slate-600">Item</th>
                          <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                          <th className="text-left p-3 font-medium text-slate-600">Batch</th>
                          <th className="text-left p-3 font-medium text-slate-600">Expiry Date</th>
                          <th className="text-right p-3 font-medium text-slate-600">Days Left</th>
                          <th className="text-right p-3 font-medium text-slate-600">Qty</th>
                          <th className="text-right p-3 font-medium text-slate-600">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expiryReport.critical.map(batch => (
                          <tr key={batch.batch_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-900">{batch.item_name}</td>
                            <td className="p-3 text-slate-600">{batch.sku_code}</td>
                            <td className="p-3 text-slate-600">#{batch.batch_id}</td>
                            <td className="p-3 text-slate-600">{batch.expiry_date}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline" className={statusColors.critical}>{batch.days_until_expiry}d</Badge>
                            </td>
                            <td className="p-3 text-right">{batch.available_quantity} {batch.unit_of_measure}</td>
                            <td className="p-3 text-right font-medium">₱{formatNumber(batch.value_at_risk, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warning Batches */}
              {expiryReport.warning.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">🟡 Warning - Expiring within 14 days ({expiryReport.warning.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-slate-600">Item</th>
                          <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                          <th className="text-left p-3 font-medium text-slate-600">Batch</th>
                          <th className="text-left p-3 font-medium text-slate-600">Expiry Date</th>
                          <th className="text-right p-3 font-medium text-slate-600">Days Left</th>
                          <th className="text-right p-3 font-medium text-slate-600">Qty</th>
                          <th className="text-right p-3 font-medium text-slate-600">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expiryReport.warning.map(batch => (
                          <tr key={batch.batch_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-900">{batch.item_name}</td>
                            <td className="p-3 text-slate-600">{batch.sku_code}</td>
                            <td className="p-3 text-slate-600">#{batch.batch_id}</td>
                            <td className="p-3 text-slate-600">{batch.expiry_date}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline" className={statusColors.warning}>{batch.days_until_expiry}d</Badge>
                            </td>
                            <td className="p-3 text-right">{batch.available_quantity} {batch.unit_of_measure}</td>
                            <td className="p-3 text-right font-medium">₱{formatNumber(batch.value_at_risk, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No expiry data */}
              {expiryReport.expired.length === 0 && expiryReport.critical.length === 0 && expiryReport.warning.length === 0 && expiryReport.upcoming.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-emerald-800">All Clear!</h3>
                  <p className="text-emerald-600">No batches are expired or expiring soon.</p>
                </div>
              )}
            </div>
          ) : null}
        </TabsContent>

        {/* STOCK AGING REPORT TAB */}
        <TabsContent value="aging">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : stockAgingReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Total Batches</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{stockAgingReport.summary.total_batches}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm text-emerald-600">Fresh (≤14d)</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{stockAgingReport.summary.fresh_batches}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm text-amber-600">Aging (15-30d)</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{stockAgingReport.summary.aging_batches}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm text-red-600">Critical (&gt;30d)</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{stockAgingReport.summary.critical_batches}</p>
                </div>
              </div>

              {/* Item Summary Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Stock Aging by Item</h3>
                  <p className="text-sm text-slate-500">Items sorted by oldest batch</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Item</th>
                        <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                        <th className="text-left p-3 font-medium text-slate-600">Category</th>
                        <th className="text-right p-3 font-medium text-slate-600">Batches</th>
                        <th className="text-right p-3 font-medium text-slate-600">Available Qty</th>
                        <th className="text-right p-3 font-medium text-slate-600">Oldest</th>
                        <th className="text-right p-3 font-medium text-slate-600">Turnover Rate</th>
                        <th className="text-right p-3 font-medium text-slate-600">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockAgingReport.by_item.map(item => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-slate-600">{item.sku_code}</td>
                          <td className="p-3 text-slate-600 capitalize">{item.category}</td>
                          <td className="p-3 text-right">{item.total_batches}</td>
                          <td className="p-3 text-right">{formatNumber(item.total_available_qty, 2)}</td>
                          <td className="p-3 text-right">
                            <Badge variant="outline" className={
                              item.oldest_days > 30 ? statusColors.critical :
                                item.oldest_days > 14 ? statusColors.aging :
                                  statusColors.fresh
                            }>
                              {item.oldest_days}d
                            </Badge>
                          </td>
                          <td className="p-3 text-right">{formatNumber(item.avg_turnover_rate, 1)}%</td>
                          <td className="p-3 text-right font-medium">₱{formatNumber(item.total_value, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* PRODUCTION REPORT TAB */}
        <TabsContent value="production">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : productionReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Total Job Orders</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{productionReport.summary.total_job_orders}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm text-emerald-600">Completion Rate</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{formatNumber(productionReport.summary.completion_rate, 1)}%</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-sm text-blue-600">Production Efficiency</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{formatNumber(productionReport.summary.production_efficiency, 1)}%</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm text-red-600">Waste Percentage</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{formatNumber(productionReport.summary.waste_percentage, 1)}%</p>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Job Order Status Breakdown</h3>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(productionReport.summary.status_breakdown).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full",
                        status === 'completed' ? 'bg-emerald-500' :
                          status === 'in_progress' ? 'bg-blue-500' :
                            status === 'partial' ? 'bg-amber-500' :
                              status === 'cancelled' ? 'bg-red-500' :
                                'bg-slate-400'
                      )} />
                      <span className="text-slate-600 capitalize">{status.replace(/_/g, ' ')}: </span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Consumed Items */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Top Consumed Items</h3>
                  <p className="text-sm text-slate-500">Items with highest consumption in production</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Item</th>
                        <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                        <th className="text-left p-3 font-medium text-slate-600">Category</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Consumed</th>
                        <th className="text-right p-3 font-medium text-slate-600">Movements</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productionReport.top_consumed_items.map(item => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-slate-600">{item.sku_code}</td>
                          <td className="p-3 text-slate-600 capitalize">{item.category}</td>
                          <td className="p-3 text-right font-medium">{formatNumber(item.total_consumed, 2)} {item.unit_of_measure}</td>
                          <td className="p-3 text-right">{item.movement_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Loss Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Loss Breakdown by Reason</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {Object.entries(productionReport.loss_breakdown).map(([reason, qty]) => (
                    <div key={reason} className="text-center">
                      <p className="text-2xl font-bold text-slate-800">{formatNumber(qty, 2)}</p>
                      <p className="text-sm text-slate-500 capitalize">{reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* PROCUREMENT REPORT TAB */}
        <TabsContent value="procurement">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : poAnalysisReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Total Orders</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{poAnalysisReport.summary.total_orders}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm text-amber-600">Pending Orders</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{poAnalysisReport.summary.pending_orders}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm text-emerald-600">Fulfillment Rate</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{formatNumber(poAnalysisReport.summary.fulfillment_rate, 1)}%</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                  <p className="text-sm text-purple-600">Total Value</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">₱{formatNumber(poAnalysisReport.summary.total_order_value, 2)}</p>
                </div>
              </div>

              {/* Pending Deliveries */}
              {poAnalysisReport.pending_deliveries.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-amber-50">
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-amber-600" />
                      <h3 className="font-semibold text-amber-800">Pending Deliveries ({poAnalysisReport.pending_deliveries.length})</h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-slate-600">PO Number</th>
                          <th className="text-left p-3 font-medium text-slate-600">Supplier</th>
                          <th className="text-left p-3 font-medium text-slate-600">Order Date</th>
                          <th className="text-left p-3 font-medium text-slate-600">Expected</th>
                          <th className="text-left p-3 font-medium text-slate-600">Status</th>
                          <th className="text-right p-3 font-medium text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poAnalysisReport.pending_deliveries.map(po => (
                          <tr key={po.po_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-900">{po.po_number}</td>
                            <td className="p-3 text-slate-600">{po.supplier_name}</td>
                            <td className="p-3 text-slate-600">{po.order_date}</td>
                            <td className="p-3 text-slate-600">{po.expected_delivery_date || 'TBD'}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={po.status === 'partial' ? statusColors.warning : 'bg-blue-100 text-blue-700'}>
                                {po.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-medium">₱{formatNumber(po.total_amount, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Supplier Performance */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Supplier Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Supplier</th>
                        <th className="text-right p-3 font-medium text-slate-600">Orders</th>
                        <th className="text-right p-3 font-medium text-slate-600">Completed</th>
                        <th className="text-right p-3 font-medium text-slate-600">On-Time Rate</th>
                        <th className="text-right p-3 font-medium text-slate-600">Quality</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poAnalysisReport.supplier_performance.map(supplier => (
                        <tr key={supplier.supplier_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{supplier.supplier_name}</td>
                          <td className="p-3 text-right">{supplier.total_orders}</td>
                          <td className="p-3 text-right">{supplier.completed_orders}</td>
                          <td className="p-3 text-right">
                            <Badge variant="outline" className={
                              supplier.on_time_rate >= 90 ? 'bg-emerald-100 text-emerald-700' :
                                supplier.on_time_rate >= 70 ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                            }>
                              {formatNumber(supplier.on_time_rate, 0)}%
                            </Badge>
                          </td>
                          <td className="p-3 text-right">{supplier.quality_rating ? `${supplier.quality_rating}/5` : 'N/A'}</td>
                          <td className="p-3 text-right font-medium">₱{formatNumber(supplier.total_value, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Most Ordered Items */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Most Ordered Items</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Item</th>
                        <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                        <th className="text-right p-3 font-medium text-slate-600">Order Count</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Qty</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poAnalysisReport.most_ordered_items.slice(0, 10).map(item => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-slate-600">{item.sku_code}</td>
                          <td className="p-3 text-right">{item.order_count}</td>
                          <td className="p-3 text-right">{formatNumber(item.total_quantity, 2)}</td>
                          <td className="p-3 text-right font-medium">₱{formatNumber(item.total_value, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* EXECUTIVE SUMMARY TAB */}
        <TabsContent value="summary">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : executiveSummary ? (
            <div className="space-y-6">
              {/* Main Value Card */}
              <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 text-white">
                <p className="text-teal-100">Total Inventory Value</p>
                <p className="text-4xl font-bold mt-2">
                  ₱{formatNumber(executiveSummary.inventory_overview.total_inventory_value, 2)}
                </p>
                <p className="text-teal-100 mt-2">{executiveSummary.inventory_overview.total_items} items tracked</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Stock Health */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-slate-500" />
                    Stock Health
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Low Stock Items</span>
                      <span className={cn("font-semibold", executiveSummary.stock_health.low_stock_count > 0 ? "text-red-600" : "text-emerald-600")}>
                        {executiveSummary.stock_health.low_stock_count}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expiry Risk */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Expiry Risk
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Expired Batches</span>
                      <span className="font-semibold text-red-600">{executiveSummary.expiry_risk.expired_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Expired Value</span>
                      <span className="font-semibold text-red-600">₱{formatNumber(executiveSummary.expiry_risk.expired_value, 2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total at Risk</span>
                      <span className="font-semibold text-amber-600">₱{formatNumber(executiveSummary.expiry_risk.total_value_at_risk, 2)}</span>
                    </div>
                  </div>
                </div>

                {/* Aging Overview */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    Stock Aging
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fresh Batches</span>
                      <span className="font-semibold text-emerald-600">{executiveSummary.aging_overview.fresh_batches}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Aging Batches</span>
                      <span className="font-semibold text-amber-600">{executiveSummary.aging_overview.aging_batches}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Critical Batches</span>
                      <span className="font-semibold text-red-600">{executiveSummary.aging_overview.critical_batches}</span>
                    </div>
                  </div>
                </div>

                {/* Production */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Factory className="w-5 h-5 text-purple-500" />
                    Production
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Job Orders</span>
                      <span className="font-semibold">{executiveSummary.production_overview.total_job_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Completion Rate</span>
                      <span className="font-semibold text-emerald-600">{formatNumber(executiveSummary.production_overview.completion_rate, 1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Efficiency</span>
                      <span className="font-semibold text-blue-600">{formatNumber(executiveSummary.production_overview.production_efficiency, 1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Procurement */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-teal-500" />
                    Procurement
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Orders</span>
                      <span className="font-semibold">{executiveSummary.procurement_overview.total_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pending Orders</span>
                      <span className="font-semibold text-amber-600">{executiveSummary.procurement_overview.pending_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fulfillment Rate</span>
                      <span className="font-semibold text-emerald-600">{formatNumber(executiveSummary.procurement_overview.fulfillment_rate, 1)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Movers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">🔥 Fastest Moving Items</h3>
                  <div className="space-y-2">
                    {executiveSummary.top_movers.fastest.slice(0, 5).map((item, idx) => (
                      <div key={item.item_id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">#{idx + 1}</span>
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                        </div>
                        <span className="text-sm text-slate-600">{formatNumber(item.total_movement, 2)} moved</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">🐢 Slowest Moving Items</h3>
                  <div className="space-y-2">
                    {executiveSummary.top_movers.slowest.slice(0, 5).map((item, idx) => (
                      <div key={item.item_id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">#{idx + 1}</span>
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                        </div>
                        <span className="text-sm text-slate-600">{formatNumber(item.total_movement, 2)} moved</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Snapshot Save Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report Snapshot</DialogTitle>
            <DialogDescription>
              Save the current report data for future reference and auditing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="snapshot-name">Snapshot Name (Optional)</Label>
              <Input
                id="snapshot-name"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report - ${new Date().toLocaleDateString()}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnapshotDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveSnapshot} disabled={loadingSnapshot}>
              {loadingSnapshot ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}