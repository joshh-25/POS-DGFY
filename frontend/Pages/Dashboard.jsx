import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Truck,
  ClipboardList,
  Calendar,
  DollarSign,
  Loader2,
  Clock
} from 'lucide-react';
import StatsCard from '@/components/dashboard/StatsCard';
import AlertBanner from '@/components/dashboard/AlertBanner';
import AnomalyAlertBanner from '@/components/dashboard/AnomalyAlertBanner';
import RecentMovements from '@/components/dashboard/RecentMovements';
import LowStockList from '@/components/dashboard/LowStockList';
import ExpiringBatchesList from '@/components/dashboard/ExpiringBatchesList';
import { useDashboardStats, useLowStockItems, useRecentMovements } from '@/hooks/useDashboard.js';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders.js';
import { useSuppliers } from '@/hooks/useSuppliers.js';
import { useExpiryAlerts } from '@/hooks/useAlerts.js';

export default function Dashboard() {
  const { stats, loading: statsLoading, error: statsError } = useDashboardStats();
  const { items: lowStockItems, loading: lowStockLoading } = useLowStockItems();
  const { movements: recentMovements, loading: movementsLoading } = useRecentMovements(10);
  const { purchaseOrders, loading: poLoading } = usePurchaseOrders();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { alerts: expiryAlerts, loading: alertsLoading } = useExpiryAlerts();

  const pendingPOs = purchaseOrders?.filter(po => po.status === 'pending').length || 0;
  const activeSuppliers = suppliers?.length || 0;

  // Check if within 7 days of month start
  const today = new Date();
  const dayOfMonth = today.getDate();
  const showProcurementReminder = dayOfMonth <= 7;

  const loading = statsLoading || lowStockLoading || movementsLoading || poLoading || suppliersLoading || alertsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="space-y-8">
        <AlertBanner
          type="critical"
          title="Error Loading Dashboard"
          message={statsError}
        />
      </div>
    );
  }

  // Use stats from API or calculate from available data
  const displayStats = stats || {
    totalItems: 0,
    lowStockCount: lowStockItems?.length || 0,
    overStockCount: 0,
    healthyCount: 0,
    totalValue: 0
  };

  // Calculate expiry statistics
  const criticalExpiryCount = expiryAlerts?.filter(a => a.severity === 'critical').length || 0;
  const warningExpiryCount = expiryAlerts?.filter(a => a.severity === 'warning').length || 0;
  const totalExpiringCount = criticalExpiryCount + warningExpiryCount;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your inventory status</p>
      </div>

      {/* Alerts */}
      <div className="space-y-3">
        <AnomalyAlertBanner />

        {displayStats.lowStockCount > 0 && (
          <AlertBanner
            type="critical"
            title={`${displayStats.lowStockCount} items below minimum threshold`}
            message="Review your inventory levels and create purchase orders to restock."
          />
        )}
        {criticalExpiryCount > 0 && (
          <AlertBanner
            type="critical"
            icon={Clock}
            title={`${criticalExpiryCount} batch${criticalExpiryCount !== 1 ? 'es' : ''} expiring within 7 days`}
            message="Review batches and plan usage to minimize waste."
          />
        )}
        {warningExpiryCount > 0 && criticalExpiryCount === 0 && (
          <AlertBanner
            type="warning"
            icon={Clock}
            title={`${warningExpiryCount} batch${warningExpiryCount !== 1 ? 'es' : ''} expiring within 30 days`}
            message="Monitor these batches and plan usage accordingly."
          />
        )}
        {showProcurementReminder && (
          <AlertBanner
            type="info"
            icon={Calendar}
            title="Monthly Procurement Reminder"
            message="It's the beginning of the month. Review your stock levels and plan your monthly orders."
          />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatsCard
          title="Total Items"
          value={displayStats.totalItems || 0}
          subtitle="In inventory"
          icon={Package}
          color="teal"
        />
        <StatsCard
          title="Low Stock"
          value={displayStats.lowStockCount || 0}
          subtitle="Below threshold"
          icon={AlertTriangle}
          color={displayStats.lowStockCount > 0 ? "red" : "emerald"}
        />
        <StatsCard
          title="Expiring Soon"
          value={totalExpiringCount}
          subtitle="Within 30 days"
          icon={Clock}
          color={totalExpiringCount > 0 ? "amber" : "emerald"}
        />
        <StatsCard
          title="Pending Orders"
          value={pendingPOs}
          subtitle="Awaiting delivery"
          icon={ClipboardList}
          color="amber"
        />
        <StatsCard
          title="Inventory Value"
          value={`₱${(displayStats.totalValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle="Total stock value"
          icon={DollarSign}
          color="emerald"
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Suppliers</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{activeSuppliers}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
          </div>
          <Link
            to={createPageUrl("Suppliers")}
            className="inline-flex items-center text-sm text-teal-600 font-medium mt-4 hover:text-teal-700 transition-colors"
          >
            View suppliers →
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Healthy Stock</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{displayStats.healthyCount || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${displayStats.totalItems > 0 ? (displayStats.healthyCount / displayStats.totalItems) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm text-slate-500">
              {displayStats.totalItems > 0 ? Math.round((displayStats.healthyCount / displayStats.totalItems) * 100) : 0}%
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Surplus Items</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{displayStats.overStockCount || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-4">
            {displayStats.overStockCount === 0 ? "No items over capacity" : "Items exceeding maximum capacity"}
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LowStockList items={lowStockItems || []} />
        <ExpiringBatchesList alerts={expiryAlerts || []} />
      </div>

      {/* Recent Movements - Full Width */}
      <div>
        <RecentMovements movements={recentMovements || []} />
      </div>
    </div>
  );
}