import React from 'react';
import {
  Award,
  CalendarDays,
  Home,
  MapPin,
  Package,
  Percent,
  Store,
  User
} from 'lucide-react';

export const CUSTOMER_DASHBOARD_THEME = {
  bg: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#EAECF0',
  primary: '#1A4E8D',
  text: '#101828',
  muted: '#667085',
  success: '#16A34A',
  successBg: '#ECFDF3',
  warning: '#F59E0B',
  warningBg: '#FFFAEB',
  info: '#1A4586',
  infoBg: '#AEE8F4',
  purple: '#7A5AF8',
  purpleBg: '#F4F3FF',
  orange: '#DC2626',
  orangeBg: '#FEF3F2'
};

export const CUSTOMER_DASHBOARD_TYPOGRAPHY = {
  pageTitle: { desktop: 26, mobile: 22 },
  pageTitleWeight: 700,
  headerTitle: { desktop: 20, mobile: 16 },
  headerTitleWeight: 700,
  pageSubtitle: 14,
  sectionTitle: { desktop: 16, mobile: 15 },
  sectionTitleWeight: 700,
  subsectionTitle: { desktop: 20, mobile: 18 },
  subsectionTitleWeight: 700,
  identityName: { desktop: 24, mobile: 16 },
  body: 14,
  secondary: 13,
  label: 13,
  caption: 12,
  micro: 12,
  cardTitle: 16,
  badge: 12,
  action: 14,
  compactAction: 13,
  tab: { desktop: 14, mobile: 13 },
  metric: { desktop: 22, mobile: 18 },
  heroMetric: { desktop: 28, mobile: 24 },
  storeMark: { desktop: 12, mobile: 18 },
  modalTitle: 20,
  modalTitleWeight: 700,
  modalHeroTitle: { desktop: 24, mobile: 22 },
  controlHeight: { desktop: 40, mobile: 44 },
  iconControlSize: { desktop: 36, mobile: 40 }
};

export const CUSTOMER_DASHBOARD_NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays },
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'loyalty', label: 'Loyalty', icon: Award, visible: false },
  { id: 'affiliate', label: 'Affiliate', icon: Percent },
  { id: 'account', label: 'Account', icon: User },
  { id: 'business', label: 'Business', icon: Store }
];

export const formatCustomerMoney = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'PHP 0.00';
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatCustomerDate = (value) => {
  if (!value) return 'Recent activity';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recent activity';
  return parsed.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const prettyCustomerStatus = (value) => (
  String(value || '').trim().replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()) || 'Pending'
);

export const getCustomerStoreLogoUrl = (entry = {}) => (
  [
    entry.store_logo,
    entry.storeLogo,
    entry.storefront_profile_image_url,
    entry.profile_image_url,
    entry.logo_url,
    entry.logoUrl
  ].map((value) => String(value || '').trim()).find(Boolean) || ''
);

export const CustomerDashboardEmptyState = ({ title, desc, isMobileViewport }) => (
  <div style={{ border: `1px dashed ${CUSTOMER_DASHBOARD_THEME.border}`, borderRadius: 14, padding: isMobileViewport ? 22 : 30, textAlign: 'center', background: CUSTOMER_DASHBOARD_THEME.bg }}>
    <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: CUSTOMER_DASHBOARD_THEME.text }}>{title}</div>
    {desc ? <div style={{ marginTop: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: CUSTOMER_DASHBOARD_THEME.muted }}>{desc}</div> : null}
  </div>
);

export const CustomerDashboardStatusBadge = ({ status }) => {
  const normalized = String(status || '').toLowerCase();
  let color = CUSTOMER_DASHBOARD_THEME.muted;
  let background = CUSTOMER_DASHBOARD_THEME.border;
  if (/active|progress|preparing|confirmed/.test(normalized)) {
    color = CUSTOMER_DASHBOARD_THEME.info;
    background = CUSTOMER_DASHBOARD_THEME.infoBg;
  } else if (/deliver|transit|complete|done/.test(normalized)) {
    color = CUSTOMER_DASHBOARD_THEME.success;
    background = CUSTOMER_DASHBOARD_THEME.successBg;
  } else if (/cancel|fail/.test(normalized)) {
    color = CUSTOMER_DASHBOARD_THEME.orange;
    background = CUSTOMER_DASHBOARD_THEME.orangeBg;
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 600, color, background }}>{prettyCustomerStatus(status)}</span>;
};
