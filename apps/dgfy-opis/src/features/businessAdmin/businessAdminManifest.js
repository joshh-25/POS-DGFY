import { lazy } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  Factory,
  Hotel,
  LayoutDashboard,
  Package,
  Receipt,
  RefreshCw,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Ticket,
  Truck,
  UserRound,
  Users,
  Utensils,
  Wallet,
  Wrench
} from 'lucide-react';

const CatalogPage = lazy(() => import('../../../../../packages/web-core/src/features/inventory/pages/ItemsPage.jsx'));
const SuppliersPage = lazy(() => import('../../../../../packages/web-core/src/features/merchantBackOffice/pages/SuppliersPage.jsx'));
const PurchaseOrdersPage = lazy(() => import('../../../../../packages/web-core/src/features/merchantBackOffice/pages/PurchaseOrdersPage.jsx'));
const JobOrdersPage = lazy(() => import('../../../../../packages/web-core/src/features/jobOrders/pages/JobOrdersPage.jsx'));
const StockMovementsPage = lazy(() => import('../../../../../packages/web-core/src/features/stockMovements/pages/StockMovementsPage.jsx'));
const DispatchOrdersPage = lazy(() => import('../../../../../packages/web-core/src/features/merchantBackOffice/pages/DispatchOrdersPage.jsx'));
const ServicesPage = lazy(() => import('../../../../../packages/web-core/src/features/services/pages/ServicesPage.jsx'));
const FnbPage = lazy(() => import('../../../../../packages/web-core/src/features/fnb/pages/FnbPage.jsx'));
const HospitalityPage = lazy(() => import('../../../../../packages/web-core/src/features/hospitality/pages/HospitalityPage.jsx'));
const SalesPage = lazy(() => import('../../../../../packages/web-core/src/features/sales/pages/SalesPage.jsx'));
const ReportsPage = lazy(() => import('../../../../../packages/web-core/src/features/merchantBackOffice/pages/ReportsPage.jsx'));
const AiChatPage = lazy(() => import('../../../../../packages/web-core/src/features/merchantBackOffice/pages/AiChatPage.jsx'));
const LegacyPromosPage = lazy(() => import('./LegacyPromosPage.jsx'));

const BUSINESS_ADMIN_ACCESS_PERMISSION = 'business_admin:access';

const module = (group, id, label, description, icon, component, options = {}) => ({
  id,
  key: id,
  group,
  label,
  title: label,
  description,
  icon,
  component,
  route: options.route || `/${id}`,
  permission: options.permission || BUSINESS_ADMIN_ACCESS_PERMISSION,
  visibility: { type: 'workflow', ...(options.visibility || {}) },
  metadata: { migrated: Boolean(component), owner: 'pos-backoffice', ...(options.metadata || {}) },
  navigation: { standalone: options.navigation?.standalone === true }
});

export const BACKOFFICE_MANIFEST = Object.freeze({
  overview: module('Overview', 'overview', 'Overview', '', LayoutDashboard, undefined, { route: '/', navigation: { standalone: true } }),
  sales: module('Sales', 'sales', 'Sales timeline', '', ShoppingBag, SalesPage),
  orders: module('Sales', 'orders', 'Order center', 'Investigate completed, voided, and storefront orders with receipt-safe detail history.', ShoppingBag),
  payments: module('Sales', 'payments', 'Payments', 'Review this business’s online payments and provider refund status.', Wallet),
  // #2159: transitional read/revoke surface for setting-backed legacy promos. Retires with the
  // legacy settings path under #991; not a home for voucher-authoring UI (that stays in POS).
  vouchers: module('Sales', 'vouchers', 'Vouchers', 'Inspect legacy storefront promo codes and revoke an individual code.', Ticket, LegacyPromosPage),
  customers: module('Customers', 'customers', 'Customers', 'Review customer links and related transactions from the canonical Order Center.', UserRound),
  catalog: module('Inventory', 'catalog', 'Catalog editor', 'Create, update, import, export, and organize the canonical catalog.', Package, CatalogPage),
  inventory: module('Inventory', 'inventory', 'Inventory insights', 'Read the canonical branch stock ledger and FIFO valuation where cost access is granted.', Database),
  suppliers: module('Inventory', 'suppliers', 'Suppliers', 'Manage supplier records and item coverage.', Truck, SuppliersPage),
  'purchase-orders': module('Inventory', 'purchase-orders', 'Purchase orders', 'Create, receive, archive, and review procurement orders.', ClipboardList, PurchaseOrdersPage),
  'stock-movements': module('Inventory', 'stock-movements', 'Stock movements', 'Record, inspect, export, and void inventory movements.', RefreshCw, StockMovementsPage, { visibility: { workflowPage: 'StockMovements' } }),
  recipes: module('Inventory', 'recipes', 'Ingredients & recipes', 'Review product compositions, recipe cost, unit-of-measure review, and branch availability.', BookOpen),
  locations: module('Operations', 'locations', 'Locations', 'Manage branches and registers from one canonical location workspace.', Building2),
  shifts: module('Operations', 'shifts', 'Shifts & cash', '', Clock3),
  attendance: module('Operations', 'attendance', 'Attendance', 'Review read-only POS attendance and operator sessions while keeping biometric attendance and payroll outside the approved contract.', CalendarDays),
  expenses: module('Operations', 'expenses', 'Expenses', 'Record and review operating expenses by branch while keeping cash drawer activity in Shifts & cash.', Receipt),
  fnb: module('Operations', 'fnb', 'F&B Setup', 'Configure tables, menu, kitchen routing, reservations, and service charges.', Utensils, FnbPage, { visibility: { workflowPage: 'Fnb' } }),
  services: module('Operations', 'services', 'Services', 'Manage service catalog, resources, bookings, and service operations.', Wrench, ServicesPage, { visibility: { workflowPage: 'Services' } }),
  hospitality: module('Operations', 'hospitality', 'Hospitality', 'Manage rooms, reservations, guests, housekeeping, maintenance, folios, and rates.', Hotel, HospitalityPage, { visibility: { workflowPage: 'Hospitality' } }),
  'job-orders': module('Operations', 'job-orders', 'Job orders', 'Plan and complete production work using canonical inventory flows.', Factory, JobOrdersPage, { visibility: { workflowPage: 'JobOrders' } }),
  'dispatch-orders': module('Operations', 'dispatch-orders', 'Dispatch orders', 'Create, dispatch, and track fulfillment orders.', Send, DispatchOrdersPage, { visibility: { workflowPage: 'DispatchOrders' } }),
  team: module('Team & Access', 'team', 'Team & access', 'Review workforce activity and branch assignments without duplicating the User owner.', Users),
  reports: module('Reports', 'reports', 'Reports & analytics', 'See sales, stock left, inventory, production, procurement, expiry, aging, and executive reports.', BarChart3, ReportsPage),
  'pos-activity': module('Reports', 'pos-activity', 'POS activity', 'Inspect completed paid POS sales, payment volume, linked-customer counts, and historically quiet weekday/hour periods as planning guidance.', Clock3, undefined),
  notifications: module('Settings', 'notifications', 'Notifications', 'Triage inventory, terminal, payment, fulfillment, and governance conditions.', Bell),
  fiscal: module('Settings', 'fiscal', 'Fiscal & BIR', 'Inspect immutable Z-reading and eSales evidence. Accreditation remains an external gate.', Receipt),
  audit: module('Settings', 'audit', 'Audit logs', 'Review activity across this business with sensitive values protected.', ScrollText),
  approvals: module('Settings', 'approvals', 'Approvals', 'Review high-risk requests. Execution stays with the canonical POS command owner.', ShieldCheck),
  onboarding: module('Settings', 'onboarding', 'POS onboarding', 'Track the current business, branch, and workflow readiness contract.', CheckCircle2),
  storefront: module('Settings', 'storefront', 'Storefront', 'Review storefront-facing readiness while keeping public commerce ownership in Storefront.', Store),
  settings: module('Settings', 'settings', 'Settings', 'Back Office owns business and branch configuration; terminal-only controls remain in POS.', Settings),
  'ai-chat': module('Settings', 'ai-chat', 'Business assistant', 'Use the assistant for this business from the POS Back Office.', Sparkles, AiChatPage)
});

export const BACKOFFICE_NAV_GROUP_ORDER = Object.freeze([
  'Overview',
  'Sales',
  'Customers',
  'Inventory',
  'Operations',
  'Team & Access',
  'Reports',
  'Settings'
]);

const manifestGroupLabels = [...new Set(Object.values(BACKOFFICE_MANIFEST).map((definition) => definition.group))];
const groups = [
  ...BACKOFFICE_NAV_GROUP_ORDER,
  ...manifestGroupLabels.filter((label) => !BACKOFFICE_NAV_GROUP_ORDER.includes(label))
];
export const BACKOFFICE_NAV_GROUPS = Object.freeze(groups.map((label) => ({
  label,
  standalone: Object.values(BACKOFFICE_MANIFEST).filter((definition) => definition.group === label).every((definition) => definition.navigation?.standalone === true),
  items: Object.values(BACKOFFICE_MANIFEST).filter((definition) => definition.group === label)
})));

export const getBackOfficeModuleDefinition = (moduleId) => BACKOFFICE_MANIFEST[String(moduleId || '').trim()] || null;

export const buildBackOfficeModulePath = (rootPath, moduleId) => {
  const definition = getBackOfficeModuleDefinition(moduleId);
  const rawRoot = rootPath === '/' ? '' : String(rootPath || '/business-admin').replace(/\/+$/, '');
  const root = rawRoot || (rootPath === '/' ? '' : '/business-admin');
  if (!definition || moduleId === 'overview') return root || '/';
  return `${root}${definition.route}`;
};

export const buildBackOfficeOverviewPath = (rootPath) => {
  const root = rootPath === '/' ? '' : String(rootPath || '/business-admin').replace(/\/+$/, '');
  return root ? `${root}/overview` : '/';
};

export const buildBackOfficeLocationsPath = (rootPath, view = 'branches') => {
  const basePath = buildBackOfficeModulePath(rootPath, 'locations');
  const normalizedView = String(view || '').trim().toLowerCase() === 'registers' ? 'registers' : 'branches';
  return `${basePath}/${normalizedView}`;
};

export const BACKOFFICE_SETTINGS_SECTION_MANIFEST = Object.freeze([
  { key: 'profile', label: 'Business & receipts', description: 'Business identity, receipt details, and business-wide profile values.', scope: 'tenant', ownerViewMode: 'settings_profile', ownerLabel: 'Open business settings' },
  { key: 'pos', label: 'POS configuration', description: 'POS preferences, discount rules, and operational defaults.', scope: 'tenant', ownerViewMode: 'settings_pos', ownerLabel: 'Open POS settings' },
  { key: 'taxes', label: 'Taxes', description: 'Configure tenant tax treatment policies used by POS.', scope: 'tenant', ownerViewMode: 'settings_pos', ownerLabel: 'Open tax settings' },
  { key: 'discounts', label: 'Discounts', description: 'Manage the server-authorized POS discount rules.', scope: 'tenant', ownerViewMode: 'settings_pos', ownerLabel: 'Open discount settings' },
  { key: 'storefront', label: 'Storefront settings', description: 'Storefront identity, visibility, presentation, and public access policy.', scope: 'tenant', ownerViewMode: 'settings_storefront', ownerLabel: 'Open Storefront settings' },
  { key: 'delivery', label: 'Delivery pricing', description: 'Business-wide delivery fee policy used by Storefront checkout.', scope: 'tenant', ownerViewMode: 'settings_storefront', ownerLabel: 'Open delivery settings' },
  { key: 'branches', label: 'Branches & locations', description: 'Branch address, hours, fulfillment, and location-specific operating values.', scope: 'branch', ownerViewMode: 'settings_storefront', ownerLabel: 'Open branch settings' },
  { key: 'team', label: 'Team & access', description: 'User access, cashier administration, branch grants, and employee ownership.', scope: 'branch', ownerViewMode: 'settings_pos', ownerLabel: 'Open team settings' },
  { key: 'attendance', label: 'Attendance settings', description: 'Cashier attendance configuration scoped to the selected branch set.', scope: 'branch', ownerViewMode: 'settings_pos', ownerLabel: 'Open attendance settings' },
  { key: 'payments', label: 'Payment policies', description: 'Downpayment and partial-payment policy for this business.', scope: 'tenant', ownerViewMode: 'settings_pos', ownerLabel: 'Open payment settings' },
  { key: 'registers', label: 'Registers & terminal policy', description: 'Terminal registry and branch binding policy. Device enrollment remains POS-owned.', scope: 'branch', ownerViewMode: 'settings_pos', ownerLabel: 'Open register settings' }
]);

export const BACKOFFICE_SECTION_META = Object.freeze(BACKOFFICE_MANIFEST);
export const MERCHANT_BACKOFFICE_MODULE_META = Object.freeze(
  Object.fromEntries(Object.entries(BACKOFFICE_MANIFEST).filter(([, definition]) => definition.component))
);
