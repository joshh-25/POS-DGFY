import { BookOpen, Ghost, MessageSquare, ShoppingCart } from 'lucide-react';

export const CUSTOMER_ACCESS_MODE_OPTIONS = [
  { value: 'ghost', label: 'Ghost', description: 'Profile and contact only; catalog, cart, checkout, and booking are hidden.', icon: Ghost, iconClassName: 'bg-indigo-50 text-indigo-500' },
  { value: 'catalog', label: 'Catalog Only', description: 'Customers can browse catalog, prices, and inventory labels only.', icon: BookOpen, iconClassName: 'bg-emerald-50 text-emerald-600' },
  { value: 'inquiry', label: 'Inquiry', description: 'Customers can browse and contact you through existing channels.', icon: MessageSquare, iconClassName: 'bg-amber-50 text-amber-500' },
  { value: 'transaction', label: 'Transaction', description: 'Customers can quote, checkout, and book services online.', icon: ShoppingCart, iconClassName: 'bg-blue-50 text-blue-600' }
];

export const CUSTOMER_ACCESS_MODE_RANK = { ghost: 0, catalog: 1, inquiry: 2, transaction: 3 };

export const STOREFRONT_LOCATION_LABELS = Object.freeze({
  addBranch: 'Add Branch',
  editBranch: 'Edit Branch',
  addLocation: 'Add Location',
  branchName: 'Branch Name',
  address: 'Address',
  active: 'Active',
  inactive: 'Inactive',
  primaryLocation: 'Primary location',
  deliveryRadius: 'Delivery radius (km)',
  estimatedWaitTime: 'Estimated wait time (min)',
  open: 'Open',
  allowOutOfStockSales: 'Allow Out-of-Stock Sales',
  supportsDelivery: 'Supports Delivery',
  supportsPickup: 'Supports Pickup',
  allowScheduledOrders: 'Allow Scheduled Orders',
  allowImmediateFulfillment: 'Allow Immediate Fulfillment'
});

export const normalizeCustomerAccessMode = (value, fallback = 'catalog') => (
  CUSTOMER_ACCESS_MODE_OPTIONS.some((option) => option.value === String(value || '').trim().toLowerCase())
    ? String(value || '').trim().toLowerCase()
    : fallback
);

export const mapCustomerAccessRuntimeSettings = (systemSettings = {}) => ({
  customerAccessMode: normalizeCustomerAccessMode(systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessEffectiveMode: normalizeCustomerAccessMode(systemSettings.effective_customer_access_mode?.value || systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessMaxMode: normalizeCustomerAccessMode(systemSettings.max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessPlatformMaxMode: normalizeCustomerAccessMode(systemSettings.platform_max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessRegistrationStageMaxMode: normalizeCustomerAccessMode(systemSettings.registration_stage_max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessLimitationReason: String(systemSettings.customer_access_limitation_reason?.value || ''),
  customerAccessRegistrationStage: String(systemSettings.customer_access_registration_stage?.value || 'registered').trim().toLowerCase() || 'registered',
  customerAccessFlagStatus: systemSettings.customer_access_modes_enabled?.value === false ? 'rollback' : 'enabled'
});
