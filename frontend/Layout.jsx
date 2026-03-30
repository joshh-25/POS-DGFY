import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from './src/hooks/usePermission'; // Created next
import { createPageUrl } from './utils.js';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Package,
  Truck,
  ClipboardList,
  Factory,
  ArrowLeftRight,
  FileText,
  Settings,
  Menu,
  X,
  LogOut,
  Bot,
  PackageCheck,
  ShoppingCart
} from 'lucide-react';
import { cn } from "./src/lib/utils.js";
import { logout, getCurrentUser } from './src/services/authService.js';
import FeedbackWidget from './Components/common/FeedbackWidget';
import GracePeriodBanner from './Components/common/GracePeriodBanner';
import useStore from './src/store/useStore.js';

const ALL_NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', permission: null }, // Everyone sees dashboard? Or maybe basic view?
  { name: 'Items', icon: Package, page: 'Items', permission: 'items:view' },
  { name: 'Suppliers', icon: Truck, page: 'Suppliers', permission: 'suppliers:view' },
  { name: 'Purchase Orders', icon: ClipboardList, page: 'PurchaseOrders', permission: 'po:view' },
  { name: 'Job Orders', icon: Factory, page: 'JobOrders', permission: 'jo:view' },
  { name: 'Dispatch Orders', icon: PackageCheck, page: 'DispatchOrders', permission: 'do:view' },
  { name: 'POS Terminal', icon: ShoppingCart, page: 'POS', permission: 'pos:view' },
  { name: 'Sales', icon: FileText, page: 'Sales', permissionAny: ['reports:view', 'do:view', 'pos:view', 'pos:transact'] },
  { name: 'Stock Movements', icon: ArrowLeftRight, page: 'StockMovements', permission: 'stock:view' },
  { name: 'Reports', icon: FileText, page: 'Reports', permission: 'reports:view' },
  { name: 'AI Chat', icon: Bot, page: 'AiChat', permission: 'ai:chat' },
  { name: 'Settings', icon: Settings, page: 'Settings', permission: 'settings:view' },
];

const UserProfile = ({ user }) => {
  if (!user) return null;
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
          {user.username?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{user.username}</p>
          <p className="text-xs text-slate-500 truncate" title={user.email}>{user.email}</p>
        </div>
      </div>
    </div>
  );
};

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const { can, userRole, loading } = usePermission();
  const { setCurrentUser: setGlobalCurrentUser } = useStore();

  React.useEffect(() => {
    if (!loading) {
      console.log('Layout: Permission State', { userRole, loading, canItems: can('items:view') });
    }
  }, [loading, can, userRole]);

  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        // Also sync to global Zustand store so other pages can access user data
        setGlobalCurrentUser(user);
      } catch (error) {
        console.error('Failed to load user profile', error);
      }
    };
    fetchUser();
  }, [setGlobalCurrentUser]);

  // Filter nav items - only filter after permissions have loaded
  // During loading, show all items to prevent flash of limited menu
  const navItems = ALL_NAV_ITEMS.filter(item => {
    if (loading) return true; // Show all during loading to prevent flash
    if (item.permissionAny?.length) {
      return item.permissionAny.some((permission) => can(permission));
    }
    if (!item.permission) return true; // Always show if no permission required
    return can(item.permission);
  });

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Logout failed. Please try again.');
    }
  };

  return (
    <div className="app-shell min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-40 flex items-center px-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center gap-3 ml-4">
          <img src="/logo-icon.png" alt="SKUpervisor" className="h-8 w-8" />
          <span className="font-semibold text-slate-900">SKUpervisor</span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 z-50 transition-transform duration-300 lg:translate-x-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6">
          <div className="flex flex-col gap-1">
            <img src="/logo.png" alt="SKUpervisor" className="h-10" />
            <p className="text-xs text-slate-500 ml-1">Inventory Management System</p>
          </div>
        </div>

        <nav className="px-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            const Icon = item.icon;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/30"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-white" : "text-slate-400")} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 space-y-3 mt-auto border-t border-slate-100">
          {/* User Profile Callout */}
          <UserProfile user={currentUser} />

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200 border border-slate-200 hover:border-red-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>

          {/* System Status */}
          <div className="bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">System Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-slate-700">All systems operational</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main min-h-screen pt-16 lg:pt-0">
        <GracePeriodBanner />
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
      <FeedbackWidget />
    </div>
  );
}
