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
  DollarSign
} from 'lucide-react';
import StatsCard from '@/components/dashboard/StatsCard';
import AlertBanner from '@/components/dashboard/AlertBanner';
import RecentMovements from '@/components/dashboard/RecentMovements';
import LowStockList from '@/components/dashboard/LowStockList';
import { 
  dummyItems, 
  dummySuppliers, 
  dummyPurchaseOrders, 
  dummyStockMovements,
  getItemsStats 
} from '@/components/data/dummyData';

export default function Dashboard() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Pages/Dashboard.jsx:25',message:'Dashboard function entry',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const stats = getItemsStats(dummyItems);
  const pendingPOs = dummyPurchaseOrders.filter(po => po.status === 'pending').length;
  const activeSuppliers = dummySuppliers.length;
  
  // Check if within 7 days of month start
  const today = new Date();
  const dayOfMonth = today.getDate();
  const showProcurementReminder = dayOfMonth <= 7;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Pages/Dashboard.jsx:33',message:'Before return JSX',data:{statsComputed:!!stats,recentMovementsType:typeof RecentMovements,isFunction:typeof RecentMovements==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your inventory status</p>
      </div>

      {/* Alerts */}
      <div className="space-y-3">
        {stats.lowStockCount > 0 && (
          <AlertBanner 
            type="critical"
            title={`${stats.lowStockCount} items below minimum threshold`}
            message="Review your inventory levels and create purchase orders to restock."
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Items"
          value={stats.totalItems}
          subtitle="In inventory"
          icon={Package}
          color="teal"
        />
        <StatsCard 
          title="Low Stock"
          value={stats.lowStockCount}
          subtitle="Below threshold"
          icon={AlertTriangle}
          color={stats.lowStockCount > 0 ? "red" : "emerald"}
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
          value={`₱${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.healthyCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${(stats.healthyCount / stats.totalItems) * 100}%` }}
              />
            </div>
            <span className="text-sm text-slate-500">
              {Math.round((stats.healthyCount / stats.totalItems) * 100)}%
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Surplus Items</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.overStockCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-4">
            {stats.overStockCount === 0 ? "No items over capacity" : "Items exceeding maximum capacity"}
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LowStockList items={dummyItems} />
        {/* #region agent log */}
        {(()=>{fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Pages/Dashboard.jsx:156',message:'Before RecentMovements render',data:{RecentMovementsType:typeof RecentMovements,isComponent:typeof RecentMovements==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});return null;})()}
        {/* #endregion */}
        <RecentMovements movements={dummyStockMovements} />
      </div>
    </div>
  );
}