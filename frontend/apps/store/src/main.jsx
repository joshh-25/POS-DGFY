import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import QRCode from 'qrcode';
import { Toaster, toast } from 'sonner';
import { canCheckout, getCheckoutBlockReason } from './checkoutRules.js';
import { filterCatalogItems } from './catalogSearch.js';
import {
  getDiscoveryEmptyStateMessage,
  getDiscoveryMatchBadges,
  getPreferredDiscoveryLocationId,
  selectDiscoveryPinLocations
} from './discoveryPresentation.js';
import {
  classifyStoreCatalogError,
  normalizeStorefrontErrorMessage
} from './storefrontErrorMessages.js';
import {
  canUseBooking,
  canUseCheckout,
  canUseProductCart,
  canViewCatalog,
  getAccessCapabilities,
  getInventoryDisplayLabel
} from './customerAccess.js';

const FnbReservationPanel = lazy(() => import('./FnbReservationPanel.jsx'));
const StoresMap = lazy(() => import('./StoreMaps.jsx').then((module) => ({ default: module.StoresMap })));
const DeliveryPinMap = lazy(() => import('./StoreMaps.jsx').then((module) => ({ default: module.DeliveryPinMap })));

const DEFAULT_CENTER = { latitude: 10.7202, longitude: 122.5621 };

const ORDER_METHOD_OPTIONS = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeout', label: 'Takeout' }
];
const DGFY_BRAND_NAME = 'DGFY';
const DGFY_ACRONYM = 'Discover Goods For You';
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
const DGFY_CONVENIENCE_FEE_RATE = 0.01;
const DISCOVERY_BADGE_TONE_STYLES = {
  teal: { color: '#0f766e', background: '#ecfeff', borderColor: '#99f6e4' },
  blue: { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' },
  slate: { color: '#334155', background: '#f8fafc', borderColor: '#cbd5e1' },
  emerald: { color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' },
  amber: { color: '#92400e', background: '#fff7ed', borderColor: '#fed7aa' }
};

const money = (v) => `PHP ${Number(v || 0).toFixed(2)}`;
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toSlug = (v) => String(v || '').trim().toLowerCase();
const normalizePathBase = (value, fallback = '/tenant-store') => {
  const raw = String(value || '').trim() || fallback;
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const normalized = withLeadingSlash.replace(/\/+$/, '');
  return normalized || '/';
};
const TENANT_STORE_BASE_PATH = normalizePathBase(import.meta.env.VITE_TENANT_STORE_BASE_PATH || '/tenant-store');
const ROOT_TENANT_SLUGS_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_ROOT_TENANT_SLUGS || '').trim().toLowerCase()
);
const RESERVED_ROOT_PATHS = new Set([
  'api',
  'assets',
  'favicon.ico',
  'health',
  'login',
  'manifest.json',
  'robots.txt',
  'store',
  'sw.js',
  'tenant-store',
  'uploads',
  'version.json'
]);
const isReservedRootSegment = (segment) => {
  const normalized = String(segment || '').trim().toLowerCase();
  return !normalized || normalized.includes('.') || RESERVED_ROOT_PATHS.has(normalized);
};
const discoveryPath = () => (ROOT_TENANT_SLUGS_ENABLED ? '/' : TENANT_STORE_BASE_PATH);
const storePath = (slug) => {
  const encoded = encodeURIComponent(toSlug(slug));
  return ROOT_TENANT_SLUGS_ENABLED ? `/${encoded}` : `${TENANT_STORE_BASE_PATH}/${encoded}`;
};
const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => value * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + (Math.sin(dLon / 2) ** 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const readRouteSlug = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  const basePattern = TENANT_STORE_BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^${basePattern}\\/([^/]+)(?:\\/qr\\/[^/]+)?\\/?$`, 'i'),
    /^\/tenant-store\/([^/]+)(?:\/qr\/[^/]+)?\/?$/i,
    /^\/store\/([^/]+)(?:\/qr\/[^/]+)?\/?$/i
  ];
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  if (ROOT_TENANT_SLUGS_ENABLED) {
    const rootMatch = path.match(/^\/([^/]+)(?:\/qr\/[^/]+)?\/?$/i);
    const segment = rootMatch?.[1] ? decodeURIComponent(rootMatch[1]).toLowerCase() : '';
    if (segment && !isReservedRootSegment(segment)) return segment;
  }
  const hashPatterns = [
    /^#\/tenant-store\/([^/]+)(?:\/qr\/[^/]+)?\/?$/i,
    /^#\/store\/([^/]+)(?:\/qr\/[^/]+)?\/?$/i
  ];
  for (const pattern of hashPatterns) {
    const match = (window.location.hash || '').match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  return null;
};

const readQrRoute = () => {
  if (typeof window === 'undefined') return null;
  const search = new URLSearchParams(window.location.search || '');
  const queryCode = (
    search.get('bc')
    || search.get('barcode')
    || search.get('code')
    || search.get('qr')
    || ''
  ).trim();
  if (queryCode) {
    return { slug: readRouteSlug(), code: queryCode };
  }

  const path = window.location.pathname || '';
  const basePattern = TENANT_STORE_BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^${basePattern}\\/([^/]+)\\/qr\\/([^/?#]+)\\/?$`, 'i'),
    /^\/tenant-store\/([^/]+)\/qr\/([^/?#]+)\/?$/i,
    /^\/store\/([^/]+)\/qr\/([^/?#]+)\/?$/i
  ];
  if (ROOT_TENANT_SLUGS_ENABLED) {
    patterns.push(/^\/([^/]+)\/qr\/([^/?#]+)\/?$/i);
  }
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1] && match?.[2]) {
      return {
        slug: decodeURIComponent(match[1]).toLowerCase(),
        code: decodeURIComponent(match[2])
      };
    }
  }

  const hash = window.location.hash || '';
  const hashPatterns = [
    /^#\/tenant-store\/([^/]+)\/qr\/([^/?#]+)\/?$/i,
    /^#\/store\/([^/]+)\/qr\/([^/?#]+)\/?$/i
  ];
  for (const pattern of hashPatterns) {
    const match = hash.match(pattern);
    if (match?.[1] && match?.[2]) {
      return {
        slug: decodeURIComponent(match[1]).toLowerCase(),
        code: decodeURIComponent(match[2])
      };
    }
  }
  return null;
};

const buildRequestError = (message, meta = {}) => {
  const error = new Error(message);
  Object.assign(error, meta);
  return error;
};

const inferRuntimeApiOrigin = () => {
  if (typeof window === 'undefined') return '';
  const { hostname, port, protocol } = window.location;
  const isLocalStorePort = port === '5175' || port === '4175';
  if (!isLocalStorePort) return '';
  return `${protocol}//${hostname}:5000`;
};

const resolveConfiguredOrigin = (rawValue = '') => {
  const raw = String(rawValue || '').trim();
  if (!raw || raw.startsWith('/')) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.protocol.startsWith('http') ? parsed.origin : '';
  } catch {
    return '';
  }
};

const configuredApiOrigin = resolveConfiguredOrigin(import.meta.env.VITE_API_BASE_URL);
const apiOrigin = configuredApiOrigin || inferRuntimeApiOrigin();
const configuredAssetOrigin = resolveConfiguredOrigin(import.meta.env.VITE_ASSET_BASE_URL);
const assetOrigin = configuredAssetOrigin || apiOrigin;
const buildStamp = String(import.meta.env.VITE_BUILD_STAMP || '').trim();
const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;
const withApiOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('/')) return url;
  return apiOrigin ? `${apiOrigin}${url}` : url;
};

const withAssetOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.startsWith('storefront-assets/')) {
    const normalized = `/uploads/${trimmed}`;
    return assetOrigin ? `${assetOrigin}${normalized}` : normalized;
  }
  if (trimmed.startsWith('/')) {
    return assetOrigin ? `${assetOrigin}${trimmed}` : trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const parseOptionalArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseOptionalObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseBooleanFlag = (value, fallback = false) => {
  if (value === true || value === false) return value;
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const buildAccessPolicyStorePatch = (accessPolicy = null) => {
  if (!accessPolicy || typeof accessPolicy !== 'object') return null;
  return {
    customer_access_mode: accessPolicy.customer_access_mode,
    effective_customer_access_mode: accessPolicy.effective_customer_access_mode,
    max_customer_access_mode: accessPolicy.max_customer_access_mode,
    inventory_display_mode: accessPolicy.inventory_display_mode,
    inventory_low_stock_display_threshold: accessPolicy.inventory_low_stock_display_threshold,
    access_capabilities: accessPolicy.access_capabilities,
    access_limitation_reason: accessPolicy.limitation_reason || accessPolicy.access_limitation_reason || null,
    customer_access_modes_enabled: accessPolicy.customer_access_modes_enabled
  };
};

const normalizeStorefrontCategories = (value) => parseOptionalArray(value)
  .map((entry) => String(entry || '').trim())
  .filter(Boolean)
  .slice(0, 12);

const normalizeStorefrontGallery = (value) => parseOptionalArray(value)
  .map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const url = String(entry.url || '').trim();
    const path = String(entry.path || '').trim();
    if (!url && !path) return null;
    return {
      url: withAssetOrigin(url) || '',
      path: withAssetOrigin(path) || '',
      caption: String(entry.caption || '').trim(),
      alt: String(entry.alt || '').trim(),
      sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
    };
  })
  .filter(Boolean)
  .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
  .slice(0, 24);

const normalizeStorefrontDeliveryPartners = (value) => parseOptionalArray(value)
  .map((entry) => {
    if (typeof entry === 'string') {
      const partner = String(entry || '').trim().toLowerCase();
      if (!partner) return null;
      return { partner, label: partner, url: '' };
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const partner = String(entry.partner || '').trim().toLowerCase();
    if (!partner) return null;
    return {
      partner,
      label: String(entry.label || '').trim() || partner,
      url: sanitizeExternalLink(entry.url)
    };
  })
  .filter(Boolean)
  .slice(0, 8);

const normalizeStorefrontReviewSummary = (value) => {
  const raw = parseOptionalObject(value);
  if (!raw) return null;
  const score = Number(raw.score);
  const totalCount = Number(raw.total_count);
  const starDistributionRaw = raw.star_distribution && typeof raw.star_distribution === 'object' ? raw.star_distribution : {};
  const starDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: Number.isInteger(Number(starDistributionRaw[star])) ? Number(starDistributionRaw[star]) : 0
  }));
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : null,
    total_count: Number.isInteger(totalCount) && totalCount >= 0 ? totalCount : null,
    star_distribution: starDistribution
  };
};

const sanitizeExternalLink = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const normalizeProfileLocations = (profile = {}) => (
  (Array.isArray(profile?.active_location_snapshot) ? profile.active_location_snapshot : [])
    .map((location) => ({
      location_id: location.location_id ?? null,
      name: location.name || profile.location_name || 'Main Branch',
      address_line: location.address_line || profile.address_line || '',
      latitude: location.latitude ?? profile.latitude ?? null,
      longitude: location.longitude ?? profile.longitude ?? null,
      is_open: location.is_open !== false,
      is_active: location.is_active !== false,
      is_primary_storefront: location.is_primary_storefront === true,
      supports_delivery: location.supports_delivery !== false,
      supports_pickup: location.supports_pickup !== false,
      supports_dine_in: location.supports_dine_in !== false
    }))
    .filter((location) => location.location_id != null)
);

const locationsMatchProfileSnapshot = (locations = [], profile = {}) => {
  const profileLocations = normalizeProfileLocations(profile);
  if (!profileLocations.length) return true;
  const profilePrimary = profileLocations.find((location) => location.is_primary_storefront) || profileLocations[0];
  const returnedPrimary = (Array.isArray(locations) ? locations : [])
    .find((location) => Number(location.location_id) === Number(profilePrimary.location_id));
  if (!returnedPrimary) return false;
  return String(returnedPrimary.name || '').trim() === String(profilePrimary.name || '').trim()
    && String(returnedPrimary.address_line || '').trim() === String(profilePrimary.address_line || '').trim();
};

const readStoreAuthToken = () => {
  if (typeof window === 'undefined') return '';
  const keys = ['dgfy_store_customer_token', 'store_customer_token', 'store_token'];
  for (const key of keys) {
    const token = String(window.localStorage.getItem(key) || '').trim();
    if (token) return token;
  }
  return '';
};

const requestJson = async (url, { method = 'GET', body, storeSlug, authToken = '' } = {}) => {
  let response;
  try {
    const token = String(authToken || '').trim();
    response = await fetch(withApiOrigin(url), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(storeSlug ? { 'x-store-slug': storeSlug } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    throw buildRequestError('Request failed before reaching API. Check server/proxy/CORS connectivity.', {
      isNetworkError: true,
      cause: networkError
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw buildRequestError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      errorCode: payload?.error_code || null,
      details: payload?.errors || payload?.details || null,
      requestId: payload?.request_id || null,
      payload
    });
  }
  return payload?.data ?? payload;
};

const extractStockViolation = (error) => {
  const details = error?.details;
  if (!details) return null;

  if (details?.stock_violation && typeof details.stock_violation === 'object') {
    return details.stock_violation;
  }

  if (Array.isArray(details?.stock_violations) && details.stock_violations.length > 0) {
    return details.stock_violations[0];
  }

  if (Array.isArray(details)) {
    return details.find((entry) => entry && typeof entry === 'object' && Number.isFinite(Number(entry.available_stock)) && Number.isFinite(Number(entry.requested_qty))) || null;
  }

  return null;
};

const buildStockExceededMessage = (violation = {}) => {
  const itemName = violation.item_name || 'item';
  return `${itemName} is currently unavailable at the selected location.`;
};

const isItemAvailable = (item = {}) => {
  if (item?.is_available === true) return true;
  if (item?.is_available === false) return false;
  const status = String(item?.availability_status || '').toLowerCase();
  return status === 'in_stock' || status === 'bookable';
};

const isServiceCatalogItem = (item = {}) => String(item?.category || '').trim().toLowerCase() === 'service';
const isFnbStorefront = (store = {}) => String(store?.workflow_mode || store?.business_mode || '').trim().toLowerCase() === 'fnb';
const nowLocalDateTimeInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};
const getDefaultFnbLineModifiers = (item = {}) => (
  (Array.isArray(item.fnb_modifier_groups) ? item.fnb_modifier_groups : []).flatMap((group) => {
    const options = Array.isArray(group.options) ? group.options : [];
    const selected = options.filter((option) => option.is_default === true);
    return selected.map((option) => ({
      modifier_group_id: group.modifier_group_id,
      group_name: group.display_name || group.name,
      modifier_option_id: option.modifier_option_id,
      option_name: option.name,
      price_delta: Number(option.price_delta || 0)
    }));
  })
);
const getFnbLineModifierDelta = (modifiers = []) => (
  round4((Array.isArray(modifiers) ? modifiers : []).reduce((sum, modifier) => sum + Number(modifier.price_delta || 0), 0))
);

const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const buildTicketImage = async ({ result = {}, storeName = '', cartLines = [], totals = {} } = {}) => {
  const booking = result.booking || null;
  const reference = booking?.public_reference || result.tracking_pin || result.order?.tracking_pin || 'PENDING';
  const typeLabel = booking ? 'SERVICE TICKET' : 'ORDER RECEIPT';
  const paymentStatus = booking?.payment_status || result.order?.payment_status || result.payment_status || 'unpaid';
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1250;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 42px Arial';
  ctx.fillText(typeLabel, 64, 88);
  ctx.font = '700 26px Arial';
  ctx.fillText(storeName || DGFY_BRAND_NAME, 64, 132);
  ctx.font = '400 22px Arial';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Reference: ${reference}`, 64, 182);
  ctx.fillText(`Payment: ${paymentStatus}`, 64, 218);
  if (booking?.start_at) ctx.fillText(`Appointment: ${formatTicketDate(booking.start_at)}`, 64, 254);
  if (booking?.service?.name || booking?.service_name) ctx.fillText(`Service: ${booking.service?.name || booking.service_name}`, 64, 290);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(64, 330);
  ctx.lineTo(836, 330);
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 24px Arial';
  ctx.fillText('Line Items', 64, 382);
  ctx.font = '400 22px Arial';
  let y = 426;
  cartLines.slice(0, 10).forEach((line) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${Number(line.quantity || 1)} x ${line.name}`, 64, y);
    ctx.fillStyle = '#475569';
    ctx.fillText(money(Number(line.quantity || 1) * Number(line.price || 0)), 650, y);
    y += 38;
  });
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(64, y + 8);
  ctx.lineTo(836, y + 8);
  ctx.stroke();
  y += 58;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 28px Arial';
  ctx.fillText('Total', 64, y);
  ctx.fillText(money(totals.total_amount || booking?.total_amount || result.order?.total_amount || 0), 650, y);
  y += 56;
  ctx.font = '400 20px Arial';
  ctx.fillStyle = '#64748b';
  ctx.fillText(booking ? 'Booking ticket - not a fiscal receipt unless marked paid.' : 'Digital order receipt/ticket. Keep this image for your records.', 64, y);
  const qrCode = booking ? `SERVICE_BOOKING:${reference}` : reference;
  let qrPayload = JSON.stringify({ type: booking ? 'service_booking' : 'store_order', reference, code: qrCode, store: storeName || '' });
  if (typeof window !== 'undefined' && booking) {
    const currentUrl = new URL(window.location.href);
    const basePath = currentUrl.pathname.replace(/\/qr\/[^/]+\/?$/i, '').replace(/\/$/, '');
    qrPayload = `${currentUrl.origin}${basePath}/qr/${encodeURIComponent(qrCode)}`;
  }
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 });
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, 340, 900, 220, 220);
  ctx.font = '700 22px Arial';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.fillText(reference, 450, 1156);
  ctx.textAlign = 'left';
  return canvas.toDataURL('image/png');
};

const formatTicketDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STOREFRONT_VISITOR_ID_STORAGE_KEY = 'dgfy_storefront_visitor_id';
const getOrCreateStorefrontVisitorId = () => {
  if (typeof window === 'undefined') return '';
  const existing = String(window.localStorage.getItem(STOREFRONT_VISITOR_ID_STORAGE_KEY) || '').trim();
  if (existing && existing.length >= 16) return existing;
  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(36).slice(2, 18)}`;
  window.localStorage.setItem(STOREFRONT_VISITOR_ID_STORAGE_KEY, generated);
  return generated;
};

function StoreCatalogEmptyState({ mode = 'setup_pending', searchQuery = '', onRefreshTenantPage }) {
  const normalizedMode = String(mode || 'setup_pending').trim().toLowerCase();
  const title = normalizedMode === 'search_on_empty'
    ? 'No items are available to search yet'
    : 'Storefront items are not set up yet';
  const description = normalizedMode === 'search_on_empty'
    ? `No catalog is published for this tenant yet, so search for "${searchQuery}" cannot return results.`
    : 'This tenant has not configured any storefront-visible items yet. Ask the tenant admin to enable items for storefront selling.';

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid #cbd5e1',
        borderRadius: 14,
        background: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)',
        padding: 16
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</div>
      <p style={{ margin: '8px 0 0 0', color: '#475569', fontSize: 14 }}>{description}</p>
      <div style={{ marginTop: 10, fontSize: 13, color: '#0f766e', fontWeight: 700 }}>
        Customer checkout will be available once at least one storefront item is enabled.
      </div>
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={onRefreshTenantPage}
          style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700 }}
        >
          Check Again
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [routeSlug, setRouteSlug] = useState(() => readRouteSlug());
  const previousRouteSlugRef = useRef(routeSlug);

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedDiscoverySearch, setDebouncedDiscoverySearch] = useState('');
  const searchRef = useRef(search);
  const [discoveryResultMode, setDiscoveryResultMode] = useState('union');
  const [discoveryStockFilter, setDiscoveryStockFilter] = useState('in_stock_only');
  const [discoveryPinScope, setDiscoveryPinScope] = useState('tenant_primary');
  const [discoveryIncludeMatchMeta, setDiscoveryIncludeMatchMeta] = useState(true);
  const [discoveryAppliedFilters, setDiscoveryAppliedFilters] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [highlightedStoreSlug, setHighlightedStoreSlug] = useState('');
  const [discoveryCoords, setDiscoveryCoords] = useState(null);
  const discoveryCoordsRef = useRef(discoveryCoords);
  const [discoveryLocationMap, setDiscoveryLocationMap] = useState({});
  const [loadingDiscoveryLocations, setLoadingDiscoveryLocations] = useState(false);
  const [highlightedDiscoveryMarkerKey, setHighlightedDiscoveryMarkerKey] = useState('');

  const [selectedStore, setSelectedStore] = useState(null);
  const [storeLocations, setStoreLocations] = useState([]);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [preferredStoreLocationSelection, setPreferredStoreLocationSelection] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogErrorGuidance, setCatalogErrorGuidance] = useState('');
  const [pendingQrCode, setPendingQrCode] = useState(() => readQrRoute()?.code || '');
  const [qrLanding, setQrLanding] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [orderMethod, setOrderMethod] = useState('delivery');
  const [cart, setCart] = useState([]);
  const [catalogImageErrors, setCatalogImageErrors] = useState(() => new Set());
  const [cartImageErrors, setCartImageErrors] = useState(() => new Set());
  const [brandingImageErrors, setBrandingImageErrors] = useState(() => new Set());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPin, setCustomerPin] = useState(null);
  const [serviceAppointmentAt, setServiceAppointmentAt] = useState('');
  const [servicePaymentTiming, setServicePaymentTiming] = useState('postpaid');
  const [serviceIntakeResponses, setServiceIntakeResponses] = useState({});
  const [fnbReservationForm, setFnbReservationForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    party_size: 2,
    requested_at: nowLocalDateTimeInput(),
    notes: ''
  });
  const [fnbReservationLoading, setFnbReservationLoading] = useState(false);
  const [fnbReservationError, setFnbReservationError] = useState('');
  const [fnbReservationResult, setFnbReservationResult] = useState(null);
  const [pinLocationLoading, setPinLocationLoading] = useState(false);
  const [pinLocationError, setPinLocationError] = useState('');
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteNeedsRefresh, setQuoteNeedsRefresh] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [trackingPinInput, setTrackingPinInput] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [accountPanel, setAccountPanel] = useState({ loading: false, error: '', me: null, orders: [], bookings: [] });

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState('checkout');
  const [followState, setFollowState] = useState({
    loading: false,
    isFollowing: false,
    followersCount: 0,
    error: ''
  });
  const storefrontVisitorId = useMemo(() => getOrCreateStorefrontVisitorId(), []);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1280 : window.innerWidth
  ));
  const discoveryRequestSequenceRef = useRef(0);
  const lastImmediateDiscoveryRequestRef = useRef({ search: '', at: 0 });
  const markBrandingImageError = useCallback((key) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    setBrandingImageErrors((previous) => {
      if (previous.has(normalizedKey)) return previous;
      const next = new Set(previous);
      next.add(normalizedKey);
      return next;
    });
  }, []);
  const isBrandingImageBlocked = useCallback((key) => brandingImageErrors.has(String(key || '').trim()), [brandingImageErrors]);

  const isStorePage = Boolean(routeSlug);

  const loadStores = useCallback(async (coords = undefined, options = {}) => {
    const useImmediateSearch = options?.useImmediateSearch === true;
    const requestSearch = useImmediateSearch ? String(searchRef.current || '').trim() : debouncedDiscoverySearch.trim();
    if (useImmediateSearch) {
      lastImmediateDiscoveryRequestRef.current = { search: requestSearch, at: Date.now() };
    }
    const requestSequence = discoveryRequestSequenceRef.current + 1;
    discoveryRequestSequenceRef.current = requestSequence;
    setLoadingStores(true);
    setStoresError('');
    try {
      const resolvedCoords = coords === undefined ? discoveryCoordsRef.current : coords;
      const q = new URLSearchParams();
      if (requestSearch) q.set('search', requestSearch);
      q.set('result_mode', discoveryResultMode);
      q.set('stock_filter', discoveryStockFilter);
      q.set('pin_scope', discoveryPinScope);
      q.set('include_match_meta', discoveryIncludeMatchMeta ? 'true' : 'false');
      if (resolvedCoords?.latitude && resolvedCoords?.longitude) {
        q.set('latitude', String(resolvedCoords.latitude));
        q.set('longitude', String(resolvedCoords.longitude));
        const nextCoords = {
          latitude: Number(resolvedCoords.latitude),
          longitude: Number(resolvedCoords.longitude)
        };
        discoveryCoordsRef.current = nextCoords;
        setDiscoveryCoords((previous) => {
          if (
            previous
            && Number(previous.latitude) === Number(nextCoords.latitude)
            && Number(previous.longitude) === Number(nextCoords.longitude)
          ) {
            return previous;
          }
          return nextCoords;
        });
      } else {
        discoveryCoordsRef.current = null;
        setDiscoveryCoords(null);
      }
      q.set('limit', '100');
      const data = await requestJson(`/api/v1/storefront/discovery?${q.toString()}`);
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setStores(Array.isArray(data?.stores) ? data.stores : []);
        setDiscoveryAppliedFilters(data?.applied_filters || null);
      }
    } catch (error) {
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setStores([]);
        setDiscoveryAppliedFilters(null);
        setStoresError(error.message || 'Failed to load discovery stores.');
      }
    } finally {
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setLoadingStores(false);
      }
    }
  }, [debouncedDiscoverySearch, discoveryResultMode, discoveryStockFilter, discoveryPinScope, discoveryIncludeMatchMeta]);

  const openStoreBySlug = useCallback(async (slug) => {
    const normalized = toSlug(slug);
    if (!normalized) return;

    setLoadingCatalog(true);
    setCatalogError('');
    setCatalogErrorGuidance('');
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    try {
      const profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(normalized)}`);
      setSelectedStore(profile);
      let resolvedCatalogLocationId = null;
      const profileLocations = normalizeProfileLocations(profile);

      try {
        const locationsData = await requestJson('/api/v1/store/locations', { storeSlug: profile.slug });
        const apiLocations = Array.isArray(locationsData?.locations) ? locationsData.locations : [];
        const useProfileSnapshot = !locationsMatchProfileSnapshot(apiLocations, profile);
        const locations = useProfileSnapshot ? profileLocations : apiLocations;
        const nextPrimaryLocationId = useProfileSnapshot
          ? (profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null)
          : (locationsData?.primary_location_id ?? null);
        setStoreLocations(locations);
        setPrimaryLocationId(nextPrimaryLocationId);
        if (locations.length > 0) {
          const preferredLocationId = (
            preferredStoreLocationSelection?.slug
            && toSlug(preferredStoreLocationSelection.slug) === toSlug(profile.slug)
          )
            ? preferredStoreLocationSelection.locationId
            : null;
          const preferredLocation = preferredLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(preferredLocationId)) || null);
          const primaryLocation = nextPrimaryLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(nextPrimaryLocationId)) || null);
          const firstOpenLocation = locations.find((location) => location?.is_open !== false) || null;
          const fallbackLocationId = (
            preferredLocation?.location_id
            ?? firstOpenLocation?.location_id
            ?? primaryLocation?.location_id
            ?? locations[0]?.location_id
            ?? null
          );
          resolvedCatalogLocationId = fallbackLocationId;
          setSelectedLocationId(fallbackLocationId);
        } else {
          resolvedCatalogLocationId = null;
          setSelectedLocationId(null);
        }
      } catch {
        const fallbackPrimaryLocationId = profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null;
        setStoreLocations(profileLocations);
        setPrimaryLocationId(fallbackPrimaryLocationId);
        resolvedCatalogLocationId = fallbackPrimaryLocationId;
        setSelectedLocationId(fallbackPrimaryLocationId);
      }

      const catalogQuery = resolvedCatalogLocationId == null
        ? '/api/v1/store/catalog?limit=120'
        : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(resolvedCatalogLocationId)}`;
      const catalogData = await requestJson(catalogQuery, { storeSlug: profile.slug });
      const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
      if (accessPatch) {
        setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
      }
      setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
    } catch (error) {
      const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant storefront page.');
      setSelectedStore(null);
      setStoreLocations([]);
      setCatalog([]);
      setCatalogError(normalizedError.message);
      setCatalogErrorGuidance(normalizedError.guidance);
    } finally {
      setLoadingCatalog(false);
    }
  }, [preferredStoreLocationSelection]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedDiscoverySearch(search);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    const lastImmediate = lastImmediateDiscoveryRequestRef.current;
    const debouncedSearch = debouncedDiscoverySearch.trim();
    if (
      debouncedSearch
      && lastImmediate?.search === debouncedSearch
      && Date.now() - Number(lastImmediate.at || 0) < 400
    ) {
      return;
    }
    loadStores();
  }, [loadStores, debouncedDiscoverySearch]);

  useEffect(() => {
    discoveryCoordsRef.current = discoveryCoords;
  }, [discoveryCoords]);

  useEffect(() => {
    if (!routeSlug) return;
    openStoreBySlug(routeSlug);
  }, [routeSlug, openStoreBySlug]);

  useEffect(() => {
    if (isStorePage) return;
    setCatalogSearch('');
  }, [isStorePage]);

  useEffect(() => {
    const previousRouteSlug = previousRouteSlugRef.current;
    const currentRouteSlug = routeSlug;
    if (previousRouteSlug && currentRouteSlug && previousRouteSlug !== currentRouteSlug) {
      setCatalogSearch('');
    }
    previousRouteSlugRef.current = currentRouteSlug;
  }, [routeSlug]);

  useEffect(() => {
    let cancelled = false;
    const loadLocationAwareCatalog = async () => {
      if (!isStorePage || !selectedStore?.slug) return;
      setLoadingCatalog(true);
      setCatalogError('');
      setCatalogErrorGuidance('');
      try {
        const catalogQuery = selectedLocationId == null
          ? '/api/v1/store/catalog?limit=120'
          : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(selectedLocationId)}`;
        const catalogData = await requestJson(catalogQuery, { storeSlug: selectedStore.slug });
        if (cancelled) return;
        const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
        if (accessPatch) {
          setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
        }
        setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
      } catch (error) {
        if (cancelled) return;
        const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant catalog for selected location.');
        setCatalog([]);
        setCatalogError(normalizedError.message);
        setCatalogErrorGuidance(normalizedError.guidance);
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    loadLocationAwareCatalog();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, selectedStore?.slug, selectedLocationId]);

  useEffect(() => {
    setCatalogImageErrors(new Set());
  }, [catalog]);

  useEffect(() => {
    let cancelled = false;

    const loadDiscoveryLocations = async () => {
      if (!Array.isArray(stores) || stores.length === 0) {
        setDiscoveryLocationMap({});
        return;
      }

      setLoadingDiscoveryLocations(true);
      try {
        const locationPairs = await Promise.all(
          stores.map(async (store) => {
            const slug = toSlug(store?.slug);
            if (!slug) return [slug, { locations: [], primary_location_id: null }];
            try {
              const data = await requestJson('/api/v1/store/locations', { storeSlug: slug });
              const locations = Array.isArray(data?.locations) ? data.locations : [];
              return [slug, { locations, primary_location_id: data?.primary_location_id ?? null }];
            } catch {
              return [slug, { locations: [], primary_location_id: null }];
            }
          })
        );
        if (cancelled) return;
        setDiscoveryLocationMap(Object.fromEntries(locationPairs.filter(([slug]) => Boolean(slug))));
      } finally {
        if (!cancelled) setLoadingDiscoveryLocations(false);
      }
    };

    loadDiscoveryLocations();
    return () => {
      cancelled = true;
    };
  }, [stores]);

  useEffect(() => {
    const onPopState = () => {
      setRouteSlug(readRouteSlug());
      setPendingQrCode(readQrRoute()?.code || '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((k) => k.startsWith('sku-store-shell-') || k.startsWith('sku-store-runtime-'))
              .map((k) => caches.delete(k))
          ))
          .catch(() => {});
      }
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
        const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
        const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
        if (!probe.ok || !scriptLike) {
          console.warn('[StorefrontPWA] Skipping service worker registration due to invalid script response', {
            status: probe.status,
            contentType
          });
          return;
        }
        await navigator.serviceWorker.register(serviceWorkerUrl, { scope: appBasePath === '/' ? '/' : `${appBasePath}/` });
      } catch (error) {
        console.warn('[StorefrontPWA] Service worker registration failed', {
          error: error?.message || 'unknown_error'
        });
      }
    };

    registerServiceWorker();
  }, []);

  const goStore = (slug, locationId = null) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    setPreferredStoreLocationSelection(locationId == null ? null : {
      slug: normalized,
      locationId: Number(locationId)
    });
    const target = storePath(normalized);
    if (window.location.pathname !== target) {
      window.history.pushState({ storeSlug: normalized }, '', target);
    }
    setRouteSlug(normalized);
  };

  const goDiscovery = () => {
    const target = discoveryPath();
    if (window.location.pathname !== target) window.history.pushState({}, '', target);
    setRouteSlug(null);
    setSelectedStore(null);
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    setPreferredStoreLocationSelection(null);
    setCatalog([]);
    setCatalogError('');
    setCatalogErrorGuidance('');
    setDiscoveryAppliedFilters(null);
    setIsCheckoutOpen(false);
  };

  const cartTotal = useMemo(() => cart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.price)), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [cart]);
  const storesWithNearestBranch = useMemo(() => {
    const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
    const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
    const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
    return (Array.isArray(stores) ? stores : [])
      .map((store) => {
        const slug = toSlug(store?.slug);
        const locationBundle = discoveryLocationMap[slug] || {};
        const allLocations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
        const activeLocations = allLocations.filter((location) => location?.is_active !== false);
        const pins = activeLocations
          .map((location) => ({
            ...location,
            latitude: toNumberOrNull(location?.latitude),
            longitude: toNumberOrNull(location?.longitude)
          }))
          .filter((location) => location.latitude != null && location.longitude != null);
        const matchingLocationIds = Array.isArray(store?.matching_location_ids)
          ? store.matching_location_ids
            .map((locationId) => Number(locationId))
            .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
          : [];
        const nearestMatchingLocationId = Number(store?.nearest_matching_location_id);
        const nearestMatchingLocation = Number.isInteger(nearestMatchingLocationId)
          ? (pins.find((location) => Number(location.location_id) === nearestMatchingLocationId) || null)
          : null;
        const primaryLocation = pins.find((location) => Number(location.location_id) === Number(locationBundle.primary_location_id))
          || pins.find((location) => location?.is_primary_storefront === true)
          || null;
        const fallbackLocation = nearestMatchingLocation || primaryLocation || pins[0] || null;
        const fallbackLat = toNumberOrNull(store?.latitude);
        const fallbackLng = toNumberOrNull(store?.longitude);
        const anchorLatitude = fallbackLocation?.latitude ?? fallbackLat ?? DEFAULT_CENTER.latitude;
        const anchorLongitude = fallbackLocation?.longitude ?? fallbackLng ?? DEFAULT_CENTER.longitude;
        const nearestPinWithDistance = hasDiscoveryLocation
          ? pins
            .map((location) => ({
              location,
              distance_km: haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
            }))
            .sort((a, b) => a.distance_km - b.distance_km)[0] || null
          : null;
        const nearestDistanceKm = nearestPinWithDistance?.distance_km
          ?? (Number.isFinite(Number(store?.distance_km)) ? Number(store.distance_km) : null);
        const nearestLocation = nearestPinWithDistance?.location || fallbackLocation;
        return {
          ...store,
          latitude: anchorLatitude,
          longitude: anchorLongitude,
          active_location_count: activeLocations.length,
          nearest_distance_km: nearestDistanceKm,
          nearest_location_name: nearestLocation?.name || null,
          nearest_location_id: nearestLocation?.location_id ?? null,
          nearest_is_primary: nearestLocation?.is_primary_storefront === true,
          match_reasons: Array.isArray(store?.match_reasons) ? store.match_reasons : [],
          matching_item_count: Number(store?.matching_item_count || 0),
          matching_item_sample: Array.isArray(store?.matching_item_sample) ? store.matching_item_sample : [],
          has_in_stock_match: store?.has_in_stock_match === true,
          matching_location_ids: matchingLocationIds,
          nearest_matching_location_id: Number.isInteger(nearestMatchingLocationId) ? nearestMatchingLocationId : null
        };
      })
      .sort((a, b) => {
        const left = Number.isFinite(a.nearest_distance_km) ? a.nearest_distance_km : Number.POSITIVE_INFINITY;
        const right = Number.isFinite(b.nearest_distance_km) ? b.nearest_distance_km : Number.POSITIVE_INFINITY;
        if (left !== right) return left - right;
        return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
      });
  }, [stores, discoveryCoords, discoveryLocationMap]);
  const discoveryMapPins = useMemo(() => {
    const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
    const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
    const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
    const hasSearchQuery = search.trim().length > 0;
    const pins = [];
    storesWithNearestBranch.forEach((store) => {
      const slug = toSlug(store?.slug);
      const locationBundle = discoveryLocationMap[slug] || {};
      const locations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
      const activeWithCoords = locations
        .filter((location) => location?.is_active !== false)
          .map((location) => ({
            ...location,
            latitude: toNumberOrNull(location?.latitude),
            longitude: toNumberOrNull(location?.longitude)
          }))
          .filter((location) => location.latitude != null && location.longitude != null);
      const matchingLocationIds = Array.isArray(store?.matching_location_ids)
        ? store.matching_location_ids
          .map((locationId) => Number(locationId))
          .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
        : [];
      const nearestMatchingLocationId = Number(store?.nearest_matching_location_id);
      const nearestMatchingLocation = Number.isInteger(nearestMatchingLocationId)
        ? (activeWithCoords.find((location) => Number(location.location_id) === nearestMatchingLocationId) || null)
        : null;
      if (activeWithCoords.length === 0) {
        const lat = toNumberOrNull(store?.latitude);
        const lng = toNumberOrNull(store?.longitude);
        if (lat == null || lng == null) return;
        pins.push({
          ...store,
          marker_key: `${slug}:fallback`,
          latitude: lat,
          longitude: lng,
          location_id: store?.location_id ?? null,
          location_name: store?.nearest_location_name || store?.tenant_name,
          branch_label: 'Storefront pin',
          distance_km: Number.isFinite(Number(store?.nearest_distance_km)) ? Number(store.nearest_distance_km) : null
        });
        return;
      }

      const scopedLocations = selectDiscoveryPinLocations({
        activeLocations: activeWithCoords,
        hasSearchQuery,
        pinScope: discoveryPinScope,
        matchingLocationIds,
        nearestMatchingLocationId: nearestMatchingLocation?.location_id ?? null
      });

      scopedLocations.forEach((location) => {
        pins.push({
          ...store,
          marker_key: `${slug}:${location.location_id}`,
          location_id: location.location_id,
          location_name: location.name || store?.tenant_name,
          address_line: location.address_line || store?.address_line || '',
          latitude: location.latitude,
          longitude: location.longitude,
          is_primary_storefront: location.is_primary_storefront === true,
          branch_label: location.is_primary_storefront ? 'Primary branch' : 'Branch',
          distance_km: hasDiscoveryLocation
            ? haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
            : null
        });
      });
    });
    return pins.sort((a, b) => {
      const left = Number.isFinite(Number(a.distance_km)) ? Number(a.distance_km) : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(Number(b.distance_km)) ? Number(b.distance_km) : Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
    });
  }, [storesWithNearestBranch, discoveryLocationMap, discoveryCoords, discoveryPinScope, search]);
  const discoveryPinsBySlug = useMemo(() => {
    const map = {};
    discoveryMapPins.forEach((pin) => {
      const slug = toSlug(pin?.slug);
      if (!slug) return;
      if (!Array.isArray(map[slug])) {
        map[slug] = [];
      }
      map[slug].push(pin);
    });
    return map;
  }, [discoveryMapPins]);
  const discoverySummary = useMemo(() => {
    const totalStores = storesWithNearestBranch.length;
    const openStores = storesWithNearestBranch.filter((store) => store.storefront_open).length;
    const totalCatalogItems = storesWithNearestBranch.reduce((sum, store) => sum + Number(store.catalog_count || 0), 0);
    const waitTotals = storesWithNearestBranch.reduce((sum, store) => sum + Number(store.estimated_wait_minutes || 0), 0);
    const avgWait = totalStores > 0 ? Math.round(waitTotals / totalStores) : 0;
    return {
      totalStores,
      openStores,
      totalCatalogItems,
      avgWait
    };
  }, [storesWithNearestBranch]);
  const nearestDistanceKm = useMemo(() => {
    const withDistance = storesWithNearestBranch
      .map((store) => Number(store?.nearest_distance_km))
      .filter((distance) => Number.isFinite(distance));
    if (withDistance.length === 0) return null;
    return Math.min(...withDistance);
  }, [storesWithNearestBranch]);
  const highlightedStore = useMemo(() => {
    if (!storesWithNearestBranch.length) return null;
    if (!highlightedStoreSlug) return storesWithNearestBranch[0];
    return storesWithNearestBranch.find((store) => store.slug === highlightedStoreSlug) || storesWithNearestBranch[0];
  }, [storesWithNearestBranch, highlightedStoreSlug]);
  const selectedLocation = useMemo(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) return null;
    if (selectedLocationId == null) return null;
    return storeLocations.find((location) => Number(location.location_id) === Number(selectedLocationId)) || null;
  }, [storeLocations, selectedLocationId]);
  const filteredCatalog = useMemo(() => filterCatalogItems(catalog, catalogSearch), [catalog, catalogSearch]);
  const hasCatalogSearchQuery = catalogSearch.trim().length > 0;
  const catalogState = useMemo(() => {
    if (loadingCatalog) return 'loading';
    if (catalogError) return 'error';
    if (catalog.length === 0 && hasCatalogSearchQuery) return 'empty_search_on_zero';
    if (catalog.length === 0) return 'empty_setup';
    if (hasCatalogSearchQuery && filteredCatalog.length === 0) return 'empty_no_match';
    return 'ready';
  }, [loadingCatalog, catalogError, catalog.length, hasCatalogSearchQuery, filteredCatalog.length]);
  const isDeliveryOrder = orderMethod === 'delivery';
  const serviceCartLines = useMemo(() => cart.filter((line) => line.category === 'service'), [cart]);
  const hasServiceCart = serviceCartLines.length > 0;
  const hasMixedServiceCart = hasServiceCart && serviceCartLines.length !== cart.length;
  const firstServiceLine = serviceCartLines[0] || null;
  const servicePaymentPolicy = firstServiceLine?.service_detail?.payment_policy || 'customer_choice';
  const serviceIntakeFields = useMemo(() => {
    const schema = firstServiceLine?.service_detail?.intake_form_schema;
    const fields = Array.isArray(schema?.fields) ? schema.fields : Array.isArray(schema?.questions) ? schema.questions : [];
    return fields
      .map((field, index) => ({
        id: String(field.id || field.key || field.name || `field_${index}`),
        label: String(field.label || field.question || field.name || `Question ${index + 1}`),
        type: ['textarea', 'select', 'checkbox', 'number', 'date', 'text'].includes(String(field.type || '').trim()) ? String(field.type).trim() : 'text',
        required: field.required === true,
        options: Array.isArray(field.options) ? field.options.map((option) => String(option)) : []
      }))
      .filter((field) => field.id && field.label);
  }, [firstServiceLine]);
  const missingRequiredIntake = useMemo(() => (
    serviceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [serviceIntakeFields, serviceIntakeResponses]);
  const servicePaymentOptions = useMemo(() => {
    if (servicePaymentPolicy === 'prepaid_required') return [{ value: 'prepaid', label: 'Pay Now' }];
    if (servicePaymentPolicy === 'postpaid_only') return [{ value: 'postpaid', label: 'Pay Later' }];
    if (servicePaymentPolicy === 'deposit_allowed') {
      return [
        { value: 'postpaid', label: 'Pay Later' },
        { value: 'prepaid', label: 'Pay Now' },
        { value: 'deposit', label: 'Deposit' }
      ];
    }
    return [
      { value: 'postpaid', label: 'Pay Later' },
      { value: 'prepaid', label: 'Pay Now' }
    ];
  }, [servicePaymentPolicy]);
  const hasStockViolation = useMemo(() => (
    cart.some((line) => Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY))
  ), [cart]);
  const totalsForDisplay = useMemo(() => {
    const subtotal = quoteResult?.subtotal_amount != null ? Number(quoteResult.subtotal_amount) : cartTotal;
    const serviceFee = quoteResult?.service_fee_amount != null
      ? Number(quoteResult.service_fee_amount)
      : round4(Math.max(0, subtotal) * DGFY_CONVENIENCE_FEE_RATE);
    const deliveryFee = quoteResult?.delivery_fee != null ? Number(quoteResult.delivery_fee) : 0;
    const totalAmount = quoteResult?.total_amount != null ? Number(quoteResult.total_amount) : subtotal + deliveryFee + serviceFee;
    return {
      subtotal_amount: subtotal,
      service_fee_amount: serviceFee,
      service_fee_label: quoteResult?.service_fee_label || DGFY_CONVENIENCE_FEE_LABEL,
      delivery_fee: deliveryFee,
      vatable_sales: quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount
    };
  }, [quoteResult, cartTotal]);
  const isDesktopCheckout = viewportWidth >= 1024;
  const isMobileViewport = viewportWidth < 768;
  const isStorefrontV2 = parseBooleanFlag(selectedStore?.storefront_ui_v2_enabled, false);
  const followEnabledForStore = parseBooleanFlag(selectedStore?.storefront_follow_enabled, false);
  const accessCapabilities = useMemo(() => getAccessCapabilities(selectedStore), [selectedStore]);
  const catalogPermitted = canViewCatalog(selectedStore);
  const productCartPermitted = canUseProductCart(selectedStore);
  const checkoutPermitted = canUseCheckout(selectedStore);
  const bookingPermitted = canUseBooking(selectedStore);
  const fnbStorefront = isFnbStorefront(selectedStore);
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh
  });
  const checkoutAllowed = canCheckout({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh
  }) && !hasMixedServiceCart && (!hasServiceCart || (Boolean(serviceAppointmentAt) && missingRequiredIntake.length === 0));

  useEffect(() => {
    if (productCartPermitted && checkoutPermitted && bookingPermitted) return;
    if (cart.length === 0 && !quoteResult && !isCheckoutOpen) return;
    setCart([]);
    setQuoteResult(null);
    setQuoteNeedsRefresh(true);
    setIsCheckoutOpen(false);
  }, [productCartPermitted, checkoutPermitted, bookingPermitted, cart.length, quoteResult, isCheckoutOpen]);

  useEffect(() => {
    if (!storesWithNearestBranch.length) {
      setHighlightedStoreSlug('');
      setHighlightedDiscoveryMarkerKey('');
      return;
    }
    if (!highlightedStoreSlug || !storesWithNearestBranch.some((store) => store.slug === highlightedStoreSlug)) {
      setHighlightedStoreSlug(storesWithNearestBranch[0].slug);
    }
    if (!highlightedDiscoveryMarkerKey || !discoveryMapPins.some((pin) => pin.marker_key === highlightedDiscoveryMarkerKey)) {
      setHighlightedDiscoveryMarkerKey(discoveryMapPins[0]?.marker_key || '');
    }
  }, [storesWithNearestBranch, highlightedStoreSlug, discoveryMapPins, highlightedDiscoveryMarkerKey]);
  useEffect(() => {
    if (!isStorePage) return;
    setQuoteNeedsRefresh(true);
  }, [cart, orderMethod, selectedLocationId, customerPin, serviceAppointmentAt, servicePaymentTiming, isStorePage]);
  useEffect(() => {
    if (!hasServiceCart) return;
    if (!servicePaymentOptions.some((option) => option.value === servicePaymentTiming)) {
      setServicePaymentTiming(servicePaymentOptions[0]?.value || 'postpaid');
    }
  }, [hasServiceCart, servicePaymentOptions, servicePaymentTiming]);
  useEffect(() => {
    setServiceIntakeResponses({});
  }, [firstServiceLine?.item_id]);
  useEffect(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) {
      if (selectedLocationId != null) setSelectedLocationId(null);
      return;
    }
    const exists = storeLocations.some((location) => Number(location.location_id) === Number(selectedLocationId));
    if (!exists) {
      const primaryLocation = primaryLocationId == null
        ? null
        : (storeLocations.find((location) => Number(location.location_id) === Number(primaryLocationId)) || null);
      const firstOpenLocation = storeLocations.find((location) => location?.is_open !== false) || null;
      const fallbackLocationId = (firstOpenLocation?.location_id ?? primaryLocation?.location_id ?? storeLocations[0]?.location_id ?? null);
      setSelectedLocationId(fallbackLocationId);
    }
  }, [storeLocations, selectedLocationId, primaryLocationId]);

  useEffect(() => {
    if (!selectedStore?.slug || !pendingQrCode) {
      setQrLanding(null);
      setQrLoading(false);
      return;
    }

    let cancelled = false;
    const resolveQr = async () => {
      setQrLoading(true);
      try {
        const query = new URLSearchParams({ code: pendingQrCode });
        if (selectedLocationId != null) {
          query.set('location_id', String(selectedLocationId));
        }
        const data = await requestJson(`/api/v1/store/qr/resolve?${query.toString()}`, { storeSlug: selectedStore.slug });
        if (cancelled) return;
        setQrLanding(data);
        const accessPatch = buildAccessPolicyStorePatch(data?.access_policy);
        if (accessPatch) {
          setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
        }
        if (data?.status === 'resolved' && data?.item?.item_id) {
          setCatalog((prev) => {
            if (prev.some((item) => Number(item.item_id) === Number(data.item.item_id))) return prev;
            return [data.item, ...prev];
          });
        }
      } catch (error) {
        if (cancelled) return;
        setQrLanding({
          status: 'blocked',
          reason_code: error?.errorCode || 'QR_RESOLVE_FAILED',
          message: normalizeStorefrontErrorMessage(error, 'Unable to resolve this QR code right now.')
        });
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    };

    resolveQr();
    return () => {
      cancelled = true;
    };
  }, [selectedStore?.slug, selectedLocationId, pendingQrCode]);

  const addToCart = (item, options = {}) => {
    if (isServiceCatalogItem(item) ? !bookingPermitted : !productCartPermitted) {
      toast.error('This storefront is not accepting online checkout right now.');
      return;
    }
    let stockWarning = '';
    const requestedAddQty = Math.max(1, Number(options.quantity || options.quantity_multiplier || 1));
    const normalizedItemId = Number(item?.item_id);
    if (Number.isFinite(normalizedItemId)) {
      setCartImageErrors((prev) => {
        if (!prev.has(normalizedItemId)) return prev;
        const next = new Set(prev);
        next.delete(normalizedItemId);
        return next;
      });
    }
    setCart((prev) => {
      const found = prev.find((l) => Number(l.item_id) === Number(item.item_id));
      const lineModifiers = Array.isArray(options.line_modifiers)
        ? options.line_modifiers
        : getDefaultFnbLineModifiers(item);
      const price = round4(Number(item.default_sale_price ?? 0) + getFnbLineModifierDelta(lineModifiers));
      const maxStock = isItemAvailable(item) ? Number.POSITIVE_INFINITY : 0;
      if (found) {
        if (isServiceCatalogItem(item)) {
          stockWarning = 'This service is already in your booking cart.';
          return prev;
        }
        const requestedQty = Number(found.quantity) + requestedAddQty;
        const safeQty = Math.max(0, Math.min(requestedQty, maxStock));
        if (requestedQty > maxStock) {
          stockWarning = buildStockExceededMessage({
            item_name: item.name,
            requested_qty: requestedQty,
            available_stock: maxStock,
            unit_of_measure: item.unit_of_measure || ''
          });
        }
        return prev.map((line) => Number(line.item_id) === Number(item.item_id)
          ? { ...line, quantity: safeQty, max_stock: maxStock }
          : line);
      }
      return [...prev, {
        item_id: item.item_id,
        name: item.name,
        category: isServiceCatalogItem(item) ? 'service' : String(item.category || '').trim().toLowerCase(),
        service_detail: item.service_detail || null,
        quantity: isServiceCatalogItem(item) ? 1 : (maxStock > 0 ? Math.min(requestedAddQty, maxStock) : 0),
        price,
        line_modifiers: lineModifiers,
        image_url: withAssetOrigin(item.image_url) || null,
        unit_of_measure: item.unit_of_measure || '',
        max_stock: maxStock
      }];
    });
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

  const addQrItemToCart = () => {
    if (qrLanding?.status !== 'resolved' || !qrLanding?.item) return;
    if (qrLanding.cart_allowed !== true) {
      toast.error('This QR code can show the catalog item, but checkout is not enabled for this storefront mode.');
      return;
    }
    const quantityMultiplier = Number(qrLanding?.barcode?.quantity_multiplier || 1);
    addToCart(qrLanding.item, { quantity: Number.isFinite(quantityMultiplier) && quantityMultiplier > 0 ? quantityMultiplier : 1 });
    setIsCheckoutOpen(true);
  };

  const removeCartItem = (itemId) => {
    setCart((prev) => prev.filter((line) => Number(line.item_id) !== Number(itemId)));
  };

  const updateQty = (itemId, qty) => {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      setCart((prev) => prev.filter((line) => Number(line.item_id) !== Number(itemId)));
      return;
    }
    let stockWarning = '';
    setCart((prev) => prev.map((line) => {
      if (Number(line.item_id) !== Number(itemId)) return line;
      const maxStock = Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock) : Number.POSITIVE_INFINITY;
      const safeQty = Math.min(parsed, maxStock);
      if (parsed > maxStock) {
        stockWarning = buildStockExceededMessage({
          item_name: line.name,
          requested_qty: parsed,
          available_stock: maxStock,
          unit_of_measure: line.unit_of_measure || ''
        });
      }
      return { ...line, quantity: safeQty };
    }));
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

  const checkoutPayload = () => ({
    location_id: selectedLocationId ?? selectedStore?.location_id,
    order_method: orderMethod,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    delivery_address: isDeliveryOrder ? customerAddress : '',
    delivery_latitude: isDeliveryOrder ? toNumberOrNull(customerPin?.latitude) : null,
    delivery_longitude: isDeliveryOrder ? toNumberOrNull(customerPin?.longitude) : null,
    lines: cart.map((line) => ({
      item_id: Number(line.item_id),
      quantity: Number(line.quantity),
      line_modifiers: (Array.isArray(line.line_modifiers) ? line.line_modifiers : []).map((modifier) => ({
        modifier_group_id: modifier.modifier_group_id,
        modifier_option_id: modifier.modifier_option_id,
        group_name: modifier.group_name,
        option_name: modifier.option_name
      }))
    }))
  });

  const handlePinMyLocation = () => {
    if (!navigator?.geolocation) {
      setPinLocationError('Geolocation is not supported on this device/browser.');
      return;
    }
    setPinLocationError('');
    setPinLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerPin({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        });
        setPinLocationLoading(false);
      },
      () => {
        setPinLocationError('Unable to get your current location.');
        setPinLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  useEffect(() => {
    const slug = String(selectedStore?.slug || '').trim().toLowerCase();
    if (!isStorePage || !isStorefrontV2 || !followEnabledForStore || !slug || !storefrontVisitorId) {
      setFollowState({ loading: false, isFollowing: false, followersCount: 0 });
      return;
    }
    let cancelled = false;
    const loadFollowStatus = async () => {
      setFollowState((prev) => ({ ...prev, loading: true }));
      try {
        const token = readStoreAuthToken();
        const status = await requestJson(`/api/v1/store/follow/status?storefront_slug=${encodeURIComponent(slug)}&visitor_id=${encodeURIComponent(storefrontVisitorId)}`, {
          method: 'GET',
          storeSlug: slug,
          authToken: token
        });
        if (cancelled) return;
        setFollowState({
          loading: false,
          isFollowing: status?.is_following === true,
          followersCount: Number(status?.followers_count || 0),
          error: ''
        });
      } catch {
        if (cancelled) return;
        setFollowState({ loading: false, isFollowing: false, followersCount: 0, error: 'Follow status unavailable.' });
      }
    };
    loadFollowStatus();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, isStorefrontV2, followEnabledForStore, selectedStore?.slug, storefrontVisitorId]);

  const handleFollowAction = async () => {
    const slug = String(selectedStore?.slug || '').trim().toLowerCase();
    if (!slug || !storefrontVisitorId || followState.loading) return;
    const nextIsFollowing = !followState.isFollowing;
    setFollowState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const token = readStoreAuthToken();
      const response = await requestJson('/api/v1/store/follow', {
        method: nextIsFollowing ? 'POST' : 'DELETE',
        storeSlug: slug,
        authToken: token,
        body: {
          storefront_slug: slug,
          visitor_id: storefrontVisitorId
        }
      });
      setFollowState({
        loading: false,
        isFollowing: response?.is_following === true,
        followersCount: Number(response?.followers_count || 0),
        error: ''
      });
      toast.success(response?.is_following ? 'Storefront followed.' : 'Storefront unfollowed.');
    } catch (error) {
      let followError = normalizeStorefrontErrorMessage(error, 'Unable to update follow status.');
      if (Number(error?.status) === 404) {
        followError = 'Storefront is unavailable for follow.';
      } else if (Number(error?.status) === 429) {
        followError = 'Too many follow requests. Please wait and retry.';
      }
      setFollowState((prev) => ({ ...prev, loading: false, error: followError }));
      toast.error(followError);
    }
  };

  const handleShareAction = async () => {
    const targetUrl = typeof window !== 'undefined' ? window.location.href : '';
    const sharePayload = {
      title: selectedStore?.tenant_name || 'Storefront',
      text: selectedStore?.storefront_tagline || `${DGFY_BRAND_NAME} tenant storefront`,
      url: targetUrl
    };
    try {
      if (navigator?.share) {
        await navigator.share(sharePayload);
        return;
      }
      if (navigator?.clipboard?.writeText && targetUrl) {
        await navigator.clipboard.writeText(targetUrl);
        toast.success('Storefront link copied.');
        return;
      }
    } catch {
      // fallback to toast below
    }
    toast.info('Sharing is unavailable in this browser.');
  };

  const handleQuote = async () => {
    if (!selectedStore) return;
    setQuoteError('');
    if (!checkoutPermitted || accessCapabilities.quote === false) {
      const message = 'This storefront is not accepting online checkout right now.';
      setQuoteError(message);
      toast.error(message);
      return;
    }
    try {
      const data = await requestJson('/api/v1/store/cart/quote', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken: readStoreAuthToken(),
        body: checkoutPayload()
      });
      setQuoteResult(data);
      setQuoteNeedsRefresh(false);
      toast.success('Quote updated.');
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      const message = normalizeStorefrontErrorMessage(error, 'Unable to compute quote.');
      setQuoteError(message);
      toast.error(message);
    }
  };

  const handleCheckout = async () => {
    if (!selectedStore) return;
    setCheckoutError('');
    setCheckoutResult(null);
    if (checkoutBlockReason === 'stock_violation') {
      const message = 'Cannot checkout: one or more items exceed current stock.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'access_mode') {
      const message = 'This storefront is not accepting online checkout right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && checkoutBlockReason === 'missing_quote') {
      const message = 'Please click Quote first before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && checkoutBlockReason === 'stale_quote') {
      const message = 'Your cart changed. Please refresh Quote before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (hasMixedServiceCart) {
      const message = 'Book services separately from regular product orders.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (hasServiceCart && !serviceAppointmentAt) {
      const message = 'Choose an appointment date and time before booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (hasServiceCart && missingRequiredIntake.length > 0) {
      const message = `Complete required intake question: ${missingRequiredIntake[0].label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    setCheckoutLoading(true);
    try {
      const authToken = readStoreAuthToken();
      const data = hasServiceCart
        ? await requestJson('/api/v1/store/services/bookings', {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: {
            service_item_id: Number(firstServiceLine.item_id),
            start_at: new Date(serviceAppointmentAt).toISOString(),
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            location_id: selectedLocationId ?? selectedStore?.location_id,
            payment_timing: servicePaymentTiming,
            intake_responses: serviceIntakeFields.length > 0 ? serviceIntakeResponses : null,
            notes: Number(firstServiceLine.quantity || 1) > 1 ? `Service quantity/package count: ${firstServiceLine.quantity}` : ''
          }
        })
        : await requestJson('/api/v1/store/checkout', {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: {
            ...checkoutPayload(),
            idempotency_key: window.crypto?.randomUUID?.() || `store-${Date.now()}`,
            payment_type: 'cash'
          }
        });
      setCheckoutResult({ ...data, cart_lines: cart, totals: totalsForDisplay });
      if (data?.tracking_pin) {
        setTrackingPinInput(data.tracking_pin);
        setCheckoutTab('track');
      }
      if (data?.booking?.public_reference) {
        setTrackingPinInput(data.booking.public_reference);
      }
      setCart([]);
      setQuoteResult(null);
      setQuoteNeedsRefresh(true);
      toast.success(hasServiceCart ? 'Booking created.' : 'Checkout completed.');
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setCheckoutError(message);
        toast.error(message);
        return;
      }
      const message = normalizeStorefrontErrorMessage(error, 'Unable to complete checkout.');
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleFnbReservationRequest = async () => {
    if (!selectedStore?.slug) return;
    setFnbReservationError('');
    setFnbReservationResult(null);
    setFnbReservationLoading(true);
    try {
      const data = await requestJson('/api/v1/store/fnb/reservations', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken: readStoreAuthToken(),
        body: {
          ...fnbReservationForm,
          party_size: Number(fnbReservationForm.party_size || 2),
          requested_at: new Date(fnbReservationForm.requested_at).toISOString()
        }
      });
      setFnbReservationResult(data?.reservation || data);
      setFnbReservationForm((prev) => ({
        ...prev,
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        notes: '',
        requested_at: nowLocalDateTimeInput()
      }));
      toast.success('Reservation request sent.');
    } catch (error) {
      setFnbReservationError(normalizeStorefrontErrorMessage(error, 'Unable to send reservation request.'));
    } finally {
      setFnbReservationLoading(false);
    }
  };

  const handleDownloadCheckoutImage = async () => {
    if (!checkoutResult) return;
    try {
      const reference = checkoutResult.booking?.public_reference || checkoutResult.tracking_pin || checkoutResult.order?.tracking_pin || 'ticket';
      const dataUrl = await buildTicketImage({
        result: checkoutResult,
        storeName: selectedStore?.tenant_name || routeSlug || DGFY_BRAND_NAME,
        cartLines: Array.isArray(checkoutResult.cart_lines) ? checkoutResult.cart_lines : cart,
        totals: checkoutResult.totals || totalsForDisplay
      });
      downloadDataUrl(dataUrl, `${String(reference).toLowerCase()}-ticket.png`);
    } catch {
      toast.error('Unable to generate ticket image.');
    }
  };

  const handleTrack = async () => {
    setTrackingError('');
    setTrackingResult(null);
    try {
      const pin = trackingPinInput.trim().toUpperCase();
      if (!pin || !selectedStore?.slug) throw new Error('Select a storefront and enter a valid tracking pin.');
      const data = await requestJson(`/api/v1/store/track/${encodeURIComponent(pin)}`, { storeSlug: selectedStore.slug });
      setTrackingResult(data);
    } catch (error) {
      setTrackingError(normalizeStorefrontErrorMessage(error, 'Tracking failed.'));
    }
  };

  const handleLoadAccountPanel = async () => {
    if (!selectedStore?.slug) return;
    const authToken = readStoreAuthToken();
    if (!authToken) {
      setAccountPanel({ loading: false, error: 'Sign in to view saved bookings, orders, tickets, and receipts.', me: null, orders: [], bookings: [] });
      return;
    }
    setAccountPanel((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const [me, ordersData, bookingsData] = await Promise.all([
        requestJson('/api/v1/store/auth/me', { storeSlug: selectedStore.slug, authToken }),
        requestJson('/api/v1/store/orders?limit=25', { storeSlug: selectedStore.slug, authToken }),
        requestJson('/api/v1/store/services/bookings?limit=25', { storeSlug: selectedStore.slug, authToken }).catch(() => ({ bookings: [] }))
      ]);
      setAccountPanel({
        loading: false,
        error: '',
        me: me?.customer || me || null,
        orders: Array.isArray(ordersData?.orders) ? ordersData.orders : [],
        bookings: Array.isArray(bookingsData?.bookings) ? bookingsData.bookings : []
      });
    } catch (error) {
      setAccountPanel({ loading: false, error: normalizeStorefrontErrorMessage(error, 'Unable to load account.'), me: null, orders: [], bookings: [] });
    }
  };

  const handleNearMe = () => {
    if (!navigator?.geolocation) {
      loadStores(undefined, { useImmediateSearch: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDiscoveryPinScope((current) => (current === 'tenant_primary' ? 'nearest_matching_branch' : current));
        loadStores({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }, { useImmediateSearch: true });
      },
      () => {
        loadStores(undefined, { useImmediateSearch: true });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  };

  return (
    <main style={{ fontFamily: '"Manrope","Nunito Sans","Segoe UI",system-ui,sans-serif', background: 'radial-gradient(circle at 20% 0%, #fff7ed 0%, #f8fafc 40%, #eef2f7 100%)', minHeight: '100vh', color: '#0f172a' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? 12 : 20, paddingBottom: isStorePage ? (isMobileViewport ? 96 : 120) : 24 }}>
        {!isStorePage && (
          <>
            <h1 style={{ margin: '0 0 10px 0', fontSize: isMobileViewport ? 30 : 44, letterSpacing: '-0.02em' }}>{DGFY_BRAND_NAME} General Store</h1>
            <p style={{ margin: '0 0 14px 0', color: '#475569', fontSize: isMobileViewport ? 15 : 20 }}>Discover nearby stores, browse menus, and place online orders.</p>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 18, padding: isMobileViewport ? 12 : 16, boxShadow: '0 12px 28px rgba(15,23,42,.06)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search store, slug, address, or item..." style={{ flex: '1 1 360px', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px' }} />
                <button type="button" onClick={() => loadStores(undefined, { useImmediateSearch: true })} style={{ borderRadius: 12, border: '1px solid #c2410c', color: '#fff', background: 'linear-gradient(135deg,#ea580c,#f97316)', padding: '10px 14px', fontWeight: 800 }}>Search</button>
                <button type="button" onClick={handleNearMe} style={{ borderRadius: 12, border: '1px solid #fb923c', color: '#c2410c', background: '#fff7ed', padding: '10px 14px', fontWeight: 700 }}>Near Me</button>
                {['list', 'grid', 'map'].map((mode) => (
                  <button key={mode} type="button" onClick={() => setViewMode(mode)} style={{ borderRadius: 10, border: `1px solid ${viewMode === mode ? '#1d9a8a' : '#cbd5e1'}`, background: viewMode === mode ? '#e6fffb' : '#fff', padding: '10px 14px', fontWeight: 700, textTransform: 'capitalize' }}>{mode}</button>
                ))}
              </div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#475569' }}>
                  Result Mode
                  <select value={discoveryResultMode} onChange={(e) => setDiscoveryResultMode(e.target.value)} style={{ width: '100%', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
                    <option value="union">Union (store + item)</option>
                    <option value="item_only">Item matches only</option>
                    <option value="store_only">Store matches only</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                  Stock Filter
                  <select value={discoveryStockFilter} onChange={(e) => setDiscoveryStockFilter(e.target.value)} style={{ width: '100%', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
                    <option value="in_stock_only">In-stock matches only</option>
                    <option value="include_out_of_stock">Include out-of-stock matches</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                  Pin Scope
                  <select value={discoveryPinScope} onChange={(e) => setDiscoveryPinScope(e.target.value)} style={{ width: '100%', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
                    <option value="nearest_matching_branch">Nearest matching branch</option>
                    <option value="all_matching_branches">All matching branches</option>
                    <option value="tenant_primary">Tenant primary branch</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', marginTop: 18 }}>
                  <input type="checkbox" checked={discoveryIncludeMatchMeta} onChange={(e) => setDiscoveryIncludeMatchMeta(e.target.checked)} />
                  Include match metadata
                </label>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                {discoveryCoords
                  ? `Near Me is active (${discoveryCoords.latitude.toFixed(4)}, ${discoveryCoords.longitude.toFixed(4)}). Results are sorted by nearest active storefront branch${nearestDistanceKm != null ? ` - nearest: ${nearestDistanceKm.toFixed(2)} km` : ''}.`
                  : 'Tip: Near Me uses your browser location to sort stores by nearest active storefront branch.'}
                {loadingDiscoveryLocations ? ' Syncing branch pins...' : ''}
                {discoveryAppliedFilters
                  ? ` Applied: mode=${discoveryAppliedFilters.result_mode}, stock=${discoveryAppliedFilters.stock_filter}, pins=${discoveryAppliedFilters.pin_scope}.`
                  : ''}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <article style={{ background: 'linear-gradient(135deg,#ecfeff,#f0fdfa)', border: '1px solid #bff3ec', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>DISCOVERABLE STORES</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.totalStores}</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#eff6ff,#f8fafc)', border: '1px solid #dbeafe', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>OPEN RIGHT NOW</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.openStores}</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#fff7ed,#fffaf0)', border: '1px solid #ffedd5', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>AVG WAIT TIME</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.avgWait} min</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#f5f3ff,#faf5ff)', border: '1px solid #e9d5ff', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#6d28d9', fontWeight: 700 }}>VISIBLE CATALOG</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.totalCatalogItems}</div>
                </article>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 12 }}>
                <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc', padding: 12, minHeight: 420 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 16, letterSpacing: '-0.01em' }}>Discovery Results</strong>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Select any store to open its tenant page</span>
                  </div>

                  {loadingStores && <div style={{ color: '#475569' }}>Loading stores...</div>}
                  {!loadingStores && storesError && <div style={{ color: '#b91c1c' }}>{storesError}</div>}
                  {!loadingStores && !storesError && storesWithNearestBranch.length === 0 && (
                    <div style={{ color: '#64748b' }}>
                      {getDiscoveryEmptyStateMessage(search)}
                    </div>
                  )}

                  {!loadingStores && !storesError && discoveryMapPins.length > 0 && viewMode === 'map' && (
                    <Suspense fallback={<div style={{ border: '1px solid #d6e2e8', borderRadius: 14, height: 360, display: 'grid', placeItems: 'center', color: '#64748b' }}>Loading map...</div>}>
                      <StoresMap
                        stores={discoveryMapPins}
                        selectedKey={highlightedDiscoveryMarkerKey || null}
                        userLocation={discoveryCoords}
                        resolveAssetUrl={withAssetOrigin}
                        onSelectStore={(pin) => {
                          setHighlightedStoreSlug(pin.slug);
                          setHighlightedDiscoveryMarkerKey(pin.marker_key || '');
                          goStore(pin.slug, pin.location_id ?? null);
                        }}
                      />
                    </Suspense>
                  )}

                  {!loadingStores && !storesError && storesWithNearestBranch.length > 0 && viewMode !== 'map' && (
                    <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'list' ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {storesWithNearestBranch.map((store) => {
                        const storeSlug = toSlug(store?.slug);
                        const storeCoverImageUrl = withAssetOrigin(store?.storefront_cover_image_url);
                        const storeCoverImageKey = `discovery-cover:${storeSlug}:${storeCoverImageUrl}`;
                        const storeProfileImageUrl = withAssetOrigin(store?.storefront_profile_image_url);
                        const storeProfileImageKey = `discovery-profile:${storeSlug}:${storeProfileImageUrl}`;
                        const storePins = Array.isArray(discoveryPinsBySlug[storeSlug]) ? discoveryPinsBySlug[storeSlug] : [];
                        const preferredLocationId = getPreferredDiscoveryLocationId({ store, storePins });
                        const highlightedPin = storePins[0] || null;
                        const badges = getDiscoveryMatchBadges(store, search.trim().length > 0);
                        const storeV2Enabled = parseBooleanFlag(store?.storefront_ui_v2_enabled, false);
                        const storeCategories = normalizeStorefrontCategories(store?.storefront_categories);
                        const storeReviewSummary = normalizeStorefrontReviewSummary(store?.storefront_review_summary);
                        return (
                          <button
                            key={store.slug}
                            type="button"
                            aria-label={`Open tenant storefront for ${store.tenant_name}`}
                            onMouseEnter={() => {
                              setHighlightedStoreSlug(store.slug);
                              if (highlightedPin) setHighlightedDiscoveryMarkerKey(highlightedPin.marker_key);
                            }}
                            onClick={() => goStore(store.slug, preferredLocationId)}
                            style={{ textAlign: 'left', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, cursor: 'pointer', boxShadow: '0 8px 24px rgba(15,23,42,.05)' }}
                          >
                            {storeV2Enabled && (
                              <div style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid #dbe5ee', background: '#f8fafc', position: 'relative', minHeight: 120 }}>
                                {storeCoverImageUrl && !isBrandingImageBlocked(storeCoverImageKey) ? (
                                  <img
                                    src={storeCoverImageUrl}
                                    alt={`${store.tenant_name} cover`}
                                    style={{ width: '100%', height: 120, objectFit: 'cover' }}
                                    onError={() => markBrandingImageError(storeCoverImageKey)}
                                  />
                                ) : (
                                  <div style={{ width: '100%', height: 120, background: 'linear-gradient(135deg,#dbeafe,#ecfeff 70%,#f8fafc)' }} />
                                )}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(15,23,42,0.05),rgba(15,23,42,0.45))' }} />
                                <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: store.storefront_open ? '#16a34a' : '#b45309', borderRadius: 999, padding: '3px 8px' }}>
                                    {store.storefront_open ? 'Open' : 'Closed'}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                                    {store.estimated_wait_minutes} min
                                  </span>
                                </div>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 999, overflow: 'hidden', border: '1px solid #d1d5db', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {storeProfileImageUrl && !isBrandingImageBlocked(storeProfileImageKey) ? (
                                    <img
                                      src={storeProfileImageUrl}
                                      alt={`${store.tenant_name} profile`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      onError={() => markBrandingImageError(storeProfileImageKey)}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>ICON</span>
                                  )}
                                </div>
                                <strong style={{ fontSize: 18 }}>{store.tenant_name}</strong>
                              </div>
                              {!storeV2Enabled && <span style={{ fontSize: 12, color: store.storefront_open ? '#0f766e' : '#b45309', fontWeight: 700 }}>{store.storefront_open ? 'Open' : 'Closed'}</span>}
                            </div>
                            {badges.length > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {badges.map((badge) => {
                                  const tone = DISCOVERY_BADGE_TONE_STYLES[badge.tone] || DISCOVERY_BADGE_TONE_STYLES.slate;
                                  return (
                                    <span
                                      key={`${store.slug}:${badge.key}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        borderRadius: 999,
                                        border: `1px solid ${tone.borderColor}`,
                                        background: tone.background,
                                        color: tone.color,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '3px 8px'
                                      }}
                                    >
                                      {badge.label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ marginTop: 8, color: '#425466', fontSize: 13 }}>{store.address_line || 'Address unavailable'}</div>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#4f46e5', fontWeight: 700 }}>{store.catalog_count} storefront item(s) - Wait {store.estimated_wait_minutes} min</div>
                            {storeV2Enabled && (
                              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {storeReviewSummary?.score != null && (
                                  <span style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                                    {storeReviewSummary.score.toFixed(1)}? ({storeReviewSummary.total_count ?? 0})
                                  </span>
                                )}
                                {storeCategories.slice(0, 2).map((category, index) => (
                                  <span key={`${store.slug}:category:${index}`} style={{ fontSize: 11, color: '#334155', borderRadius: 999, border: '1px solid #cbd5e1', padding: '2px 7px', background: '#f8fafc' }}>
                                    {category}
                                  </span>
                                ))}
                              </div>
                            )}
                            {Number(store.matching_item_count) > 0 && search.trim() && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#334155' }}>
                                {store.matching_item_count} matching item(s)
                                {Array.isArray(store.matching_item_sample) && store.matching_item_sample.length > 0
                                  ? ` - e.g. ${store.matching_item_sample.join(', ')}`
                                  : ''}
                              </div>
                            )}
                            {Number.isFinite(Number(store.nearest_distance_km)) && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                                {Number(store.nearest_distance_km).toFixed(2)} km from your location
                              </div>
                            )}
                            {store.nearest_location_name && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#334155' }}>
                                Nearest branch: <strong>{store.nearest_location_name}</strong> {store.nearest_is_primary ? '(Primary)' : ''}
                              </div>
                            )}
                            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 12, color: '#0f766e', textDecoration: 'underline' }}>Open tenant storefront page</span>
                              {storeV2Enabled && getAccessCapabilities(store).checkout === true && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 999, padding: '3px 8px', background: '#fff7ed' }}>
                                  Order now
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>Live Storefront Map</strong>
                  {!loadingStores && !storesError && discoveryMapPins.length > 0 ? (
                    <Suspense fallback={<div style={{ border: '1px solid #d6e2e8', borderRadius: 14, height: 360, display: 'grid', placeItems: 'center', color: '#64748b' }}>Loading map...</div>}>
                      <StoresMap
                        stores={discoveryMapPins}
                        selectedKey={highlightedDiscoveryMarkerKey || null}
                        userLocation={discoveryCoords}
                        resolveAssetUrl={withAssetOrigin}
                        onSelectStore={(pin) => {
                          setHighlightedStoreSlug(pin.slug);
                          setHighlightedDiscoveryMarkerKey(pin.marker_key || '');
                          goStore(pin.slug, pin.location_id ?? null);
                        }}
                      />
                    </Suspense>
                  ) : (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 12, color: '#64748b' }}>Map will appear once storefront data is available.</div>
                  )}

                  {highlightedStore && (
                    <article style={{ border: '1px solid #dbeafe', borderRadius: 12, background: '#eff6ff', padding: 10 }}>
                      {(() => {
                        const highlightedSlug = toSlug(highlightedStore?.slug);
                        const highlightedProfileImageUrl = withAssetOrigin(highlightedStore?.storefront_profile_image_url);
                        const highlightedProfileImageKey = `highlighted-profile:${highlightedSlug}:${highlightedProfileImageUrl}`;
                        const highlightedPins = Array.isArray(discoveryPinsBySlug[highlightedSlug]) ? discoveryPinsBySlug[highlightedSlug] : [];
                        const highlightedBadges = getDiscoveryMatchBadges(highlightedStore, search.trim().length > 0);
                        const highlightedPreferredLocationId = getPreferredDiscoveryLocationId({
                          store: highlightedStore,
                          storePins: highlightedPins
                        });
                        return (
                          <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 999, overflow: 'hidden', border: '1px solid #d1d5db', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {highlightedProfileImageUrl && !isBrandingImageBlocked(highlightedProfileImageKey) ? (
                              <img
                                src={highlightedProfileImageUrl}
                                alt={`${highlightedStore.tenant_name} profile`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={() => markBrandingImageError(highlightedProfileImageKey)}
                              />
                            ) : (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>ICON</span>
                            )}
                          </div>
                          <strong>{highlightedStore.tenant_name}</strong>
                        </div>
                        <span style={{ color: highlightedStore.storefront_open ? '#0f766e' : '#b45309', fontWeight: 700, fontSize: 12 }}>
                          {highlightedStore.storefront_open ? 'Open' : 'Closed'}
                        </span>
                      </div>
                      {highlightedBadges.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {highlightedBadges.map((badge) => {
                            const tone = DISCOVERY_BADGE_TONE_STYLES[badge.tone] || DISCOVERY_BADGE_TONE_STYLES.slate;
                            return (
                              <span
                                key={`highlighted:${badge.key}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  borderRadius: 999,
                                  border: `1px solid ${tone.borderColor}`,
                                  background: tone.background,
                                  color: tone.color,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px'
                                }}
                              >
                                {badge.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ fontSize: 13, marginTop: 6, color: '#334155' }}>{highlightedStore.address_line || 'Address unavailable'}</div>
                      {Number.isFinite(Number(highlightedStore.nearest_distance_km)) && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                          {Number(highlightedStore.nearest_distance_km).toFixed(2)} km from your location
                        </div>
                      )}
                      {highlightedStore.nearest_location_name && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
                          Closest active branch: <strong>{highlightedStore.nearest_location_name}</strong> {highlightedStore.nearest_is_primary ? '(Primary)' : ''}
                        </div>
                      )}
                      <button type="button" onClick={() => goStore(highlightedStore.slug, highlightedPreferredLocationId)} style={{ marginTop: 10, width: '100%', borderRadius: 9, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 10px', fontWeight: 700 }}>
                        Open This Tenant Storefront
                      </button>
                          </>
                        );
                      })()}
                    </article>
                  )}

                  <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: 10 }}>
                    <strong style={{ fontSize: 14 }}>Quick Flow</strong>
                    <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#64748b' }}>Search a store, open its tenant page, add items, then checkout using the bottom cart popout.</p>
                  </article>
                </section>
              </div>
            </section>
          </>
        )}

        {isStorePage && (
          <>
            <section style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={goDiscovery} style={{ borderRadius: 12, border: '1px solid #334155', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700 }}>Back to {DGFY_BRAND_NAME} General Store</button>
              <div style={{ color: '#64748b', fontSize: 13 }}>Tenant page: {routeSlug}</div>
            </section>

            {selectedStore && !isStorefrontV2 && (() => {
              const whyChooseUs = parseOptionalArray(selectedStore.storefront_why_choose_us).map((entry) => String(entry || '').trim()).filter(Boolean);
              const reviewHighlights = parseOptionalArray(selectedStore.storefront_review_highlights).filter((entry) => entry && typeof entry === 'object' && String(entry.comment || '').trim());
              const promo = parseOptionalObject(selectedStore.storefront_promo);
              const social = parseOptionalObject(selectedStore.storefront_social_links);
              const socialMessengerUrl = sanitizeExternalLink(social?.messenger);
              const socialFacebookUrl = sanitizeExternalLink(social?.facebook);
              const socialInstagramUrl = sanitizeExternalLink(social?.instagram);
              const hasSocialLinks = Boolean(socialMessengerUrl || socialFacebookUrl || socialInstagramUrl);
              const hasPromo = promo && promo.active === true && (
                String(promo.title || '').trim() || String(promo.subtitle || '').trim() || String(promo.badge || '').trim()
              );
              const hasAnyContent = (
                String(selectedStore.storefront_about || '').trim()
                || String(selectedStore.storefront_tagline || '').trim()
                || String(selectedStore.storefront_phone || '').trim()
                || String(selectedStore.storefront_email || '').trim()
                || String(selectedStore.storefront_hours || '').trim()
                || whyChooseUs.length > 0
                || reviewHighlights.length > 0
                || hasPromo
                || hasSocialLinks
              );
              if (!hasAnyContent) return null;
              return (
                <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                    {(String(selectedStore.storefront_about || '').trim() || String(selectedStore.storefront_tagline || '').trim()) && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>About {selectedStore.tenant_name}</div>
                        {String(selectedStore.storefront_tagline || '').trim() && (
                          <p style={{ margin: '6px 0 0 0', color: '#c2410c', fontStyle: 'italic', fontWeight: 700 }}>{selectedStore.storefront_tagline}</p>
                        )}
                        {String(selectedStore.storefront_about || '').trim() && (
                          <p style={{ margin: '8px 0 0 0', color: '#334155', fontSize: 14, lineHeight: 1.55 }}>{selectedStore.storefront_about}</p>
                        )}
                      </article>
                    )}
                    {(String(selectedStore.storefront_phone || '').trim() || String(selectedStore.storefront_email || '').trim() || String(selectedStore.storefront_hours || '').trim()) && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Contact & Hours</div>
                        {String(selectedStore.storefront_phone || '').trim() && <p style={{ margin: '8px 0 0 0', color: '#334155' }}>Phone: {selectedStore.storefront_phone}</p>}
                        {String(selectedStore.storefront_email || '').trim() && <p style={{ margin: '6px 0 0 0', color: '#334155' }}>Email: {selectedStore.storefront_email}</p>}
                        {String(selectedStore.storefront_hours || '').trim() && <p style={{ margin: '6px 0 0 0', color: '#0f766e', fontWeight: 700 }}>{selectedStore.storefront_hours}</p>}
                      </article>
                    )}
                    {whyChooseUs.length > 0 && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Why Choose Us</div>
                        <ul style={{ margin: '8px 0 0 16px', color: '#334155' }}>
                          {whyChooseUs.map((entry, index) => <li key={`why-${index}`} style={{ marginBottom: 6 }}>{entry}</li>)}
                        </ul>
                      </article>
                    )}
                    {hasPromo && (
                      <article style={{ border: '1px solid #fed7aa', borderRadius: 12, padding: 12, background: 'linear-gradient(135deg,#fff7ed,#fff)' }}>
                        <div style={{ fontWeight: 800, color: '#c2410c' }}>{String(promo.badge || 'Promo')}</div>
                        {String(promo.title || '').trim() && <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: '#9a3412' }}>{promo.title}</div>}
                        {String(promo.subtitle || '').trim() && <p style={{ margin: '6px 0 0 0', color: '#7c2d12' }}>{promo.subtitle}</p>}
                        {String(promo.validity_text || '').trim() && <div style={{ marginTop: 6, fontSize: 12, color: '#b45309' }}>{promo.validity_text}</div>}
                      </article>
                    )}
                    {reviewHighlights.length > 0 && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Customer Highlights</div>
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          {reviewHighlights.slice(0, 3).map((review, index) => (
                            <div key={`review-${index}`} style={{ borderTop: index === 0 ? 'none' : '1px solid #e2e8f0', paddingTop: index === 0 ? 0 : 8 }}>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{String(review.reviewer_name || 'Customer')} {review.rating ? `- ${review.rating}` : ''}</div>
                              <div style={{ marginTop: 4, color: '#334155', fontSize: 14 }}>{String(review.comment || '')}</div>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}
                    {hasSocialLinks && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Social Links</div>
                        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                          {socialMessengerUrl && <a href={socialMessengerUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'underline' }}>Messenger</a>}
                          {socialFacebookUrl && <a href={socialFacebookUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'underline' }}>Facebook</a>}
                          {socialInstagramUrl && <a href={socialInstagramUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'underline' }}>Instagram</a>}
                        </div>
                      </article>
                    )}
                  </div>
                </section>
              );
            })()}

            {selectedStore && isStorefrontV2 && (() => {
              const categories = normalizeStorefrontCategories(selectedStore.storefront_categories);
              const gallery = normalizeStorefrontGallery(selectedStore.storefront_gallery_images);
              const whyChooseUs = parseOptionalArray(selectedStore.storefront_why_choose_us).map((entry) => String(entry || '').trim()).filter(Boolean);
              const reviewHighlights = parseOptionalArray(selectedStore.storefront_review_highlights).filter((entry) => entry && typeof entry === 'object' && String(entry.comment || '').trim());
              const promo = parseOptionalObject(selectedStore.storefront_promo);
              const reviewSummary = normalizeStorefrontReviewSummary(selectedStore.storefront_review_summary);
              const deliveryPartners = normalizeStorefrontDeliveryPartners(selectedStore.storefront_delivery_partners);
              const social = parseOptionalObject(selectedStore.storefront_social_links);
              const socialMessengerUrl = sanitizeExternalLink(social?.messenger);
              const socialFacebookUrl = sanitizeExternalLink(social?.facebook);
              const socialInstagramUrl = sanitizeExternalLink(social?.instagram);
              const followEnabled = parseBooleanFlag(selectedStore.storefront_follow_enabled, false);
              const shareEnabled = parseBooleanFlag(selectedStore.storefront_share_enabled, false);
              const hasPromo = promo && promo.active === true && (String(promo.title || '').trim() || String(promo.subtitle || '').trim() || String(promo.badge || '').trim());
              return (
                <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0,2fr) minmax(0,1fr)' }}>
                    <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>Overview</div>
                      {String(selectedStore.storefront_tagline || '').trim() && (
                        <p style={{ margin: '6px 0 0 0', color: '#c2410c', fontStyle: 'italic', fontWeight: 700 }}>{selectedStore.storefront_tagline}</p>
                      )}
                      {String(selectedStore.storefront_about || '').trim() && (
                        <p style={{ margin: '8px 0 0 0', color: '#334155', fontSize: 14, lineHeight: 1.55 }}>{selectedStore.storefront_about}</p>
                      )}
                      {gallery.length > 0 && (
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
                          {gallery.slice(0, 4).map((image, index) => {
                            const gallerySrc = image.url || image.path;
                            if (!gallerySrc) return null;
                            return (
                              <div key={`gallery-thumb-${index}`} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '4 / 3', background: '#f8fafc' }}>
                                <img src={gallerySrc} alt={image.alt || `${selectedStore.tenant_name} gallery ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                    <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>Contact & Location</div>
                      {String(selectedStore.storefront_phone || '').trim() && <p style={{ margin: '8px 0 0 0', color: '#334155' }}>Phone: {selectedStore.storefront_phone}</p>}
                      {String(selectedStore.storefront_email || '').trim() && <p style={{ margin: '6px 0 0 0', color: '#334155' }}>Email: {selectedStore.storefront_email}</p>}
                      {String(selectedStore.storefront_hours || '').trim() && <p style={{ margin: '6px 0 0 0', color: '#0f766e', fontWeight: 700 }}>{selectedStore.storefront_hours}</p>}
                      <p style={{ margin: '6px 0 0 0', color: '#334155' }}>{selectedLocation?.address_line || selectedStore.address_line || 'Address unavailable'}</p>
                      {deliveryPartners.length > 0 && (
                        <p style={{ margin: '10px 0 0 0', color: '#334155', fontSize: 13 }}>
                          We deliver via {deliveryPartners.map((entry) => entry.label).join(', ')}
                        </p>
                      )}
                    </article>
                    {(categories.length > 0 || whyChooseUs.length > 0 || hasPromo) && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Why Choose Us</div>
                        {categories.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {categories.map((entry, index) => (
                              <span key={`category-chip-${index}`} style={{ fontSize: 12, fontWeight: 700, color: '#334155', border: '1px solid #cbd5e1', borderRadius: 999, padding: '3px 8px', background: '#f8fafc' }}>{entry}</span>
                            ))}
                          </div>
                        )}
                        {whyChooseUs.length > 0 && (
                          <ul style={{ margin: '8px 0 0 16px', color: '#334155' }}>
                            {whyChooseUs.map((entry, index) => <li key={`why-v2-${index}`} style={{ marginBottom: 6 }}>{entry}</li>)}
                          </ul>
                        )}
                        {hasPromo && (
                          <div style={{ marginTop: 8, borderRadius: 10, border: '1px solid #fed7aa', background: 'linear-gradient(135deg,#fff7ed,#fff)', padding: 10 }}>
                            <div style={{ fontWeight: 800, color: '#c2410c' }}>{String(promo.badge || 'Promo')}</div>
                            {String(promo.title || '').trim() && <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: '#9a3412' }}>{promo.title}</div>}
                            {String(promo.subtitle || '').trim() && <p style={{ margin: '4px 0 0 0', color: '#7c2d12' }}>{promo.subtitle}</p>}
                          </div>
                        )}
                      </article>
                    )}
                    {(reviewSummary || reviewHighlights.length > 0 || socialMessengerUrl || socialFacebookUrl || socialInstagramUrl) && (
                      <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Customer Reviews</div>
                        {reviewSummary && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{reviewSummary.score != null ? reviewSummary.score.toFixed(1) : '--'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>({reviewSummary.total_count ?? 0} reviews)</div>
                            {Array.isArray(reviewSummary.star_distribution) && reviewSummary.star_distribution.some((entry) => Number(entry.count) > 0) && (
                              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                                {(() => {
                                  const peak = Math.max(...reviewSummary.star_distribution.map((entry) => Number(entry.count || 0)), 1);
                                  return reviewSummary.star_distribution.map((entry) => (
                                    <div key={`review-dist-${entry.star}`} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 34px', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 11, color: '#334155' }}>{entry.star}?</span>
                                      <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.round((Number(entry.count || 0) / peak) * 100)}%`, height: '100%', background: '#f59e0b' }} />
                                      </div>
                                      <span style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }}>{entry.count}</span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                        {reviewHighlights.length > 0 && (
                          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                            {reviewHighlights.slice(0, 2).map((review, index) => (
                              <div key={`review-v2-${index}`} style={{ borderTop: index === 0 ? 'none' : '1px solid #e2e8f0', paddingTop: index === 0 ? 0 : 8 }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>{String(review.reviewer_name || 'Customer')} {review.rating ? `- ${review.rating}` : ''}</div>
                                <div style={{ marginTop: 4, color: '#334155', fontSize: 14 }}>{String(review.comment || '')}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(socialMessengerUrl || socialFacebookUrl || socialInstagramUrl) && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {socialMessengerUrl && <a href={socialMessengerUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'underline' }}>Messenger</a>}
                            {socialFacebookUrl && <a href={socialFacebookUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'underline' }}>Facebook</a>}
                            {socialInstagramUrl && <a href={socialInstagramUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'underline' }}>Instagram</a>}
                          </div>
                        )}
                      </article>
                    )}
                  </div>
                  {(followEnabled || shareEnabled) && !isMobileViewport && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: isMobileViewport ? 'space-between' : 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{followState.followersCount} follower(s)</span>
                        {followEnabled && (
                        <button type="button" aria-label="Follow this storefront" disabled={followState.loading} onClick={handleFollowAction} style={{ borderRadius: 10, border: '1px solid #cbd5e1', background: followState.isFollowing ? '#ecfeff' : '#fff', color: '#334155', padding: '8px 12px', minHeight: 44, minWidth: 96, fontWeight: 700, opacity: followState.loading ? 0.7 : 1, cursor: followState.loading ? 'not-allowed' : 'pointer' }}>{followState.isFollowing ? 'Following' : 'Follow'}</button>
                      )}
                      {shareEnabled && (
                        <button type="button" aria-label="Share this storefront" onClick={handleShareAction} style={{ borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '8px 12px', minHeight: 44, minWidth: 96, fontWeight: 700 }}>Share</button>
                      )}
                    </div>
                  )}
                  {followState.error && (
                    <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{followState.error}</p>
                  )}
                </section>
              );
            })()}

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: isMobileViewport ? 12 : 16, marginBottom: 14 }}>
              {(() => {
                const selectedSlug = toSlug(selectedStore?.slug || routeSlug);
                const selectedCoverImageUrl = withAssetOrigin(selectedStore?.storefront_cover_image_url);
                const selectedProfileImageUrl = withAssetOrigin(selectedStore?.storefront_profile_image_url);
                const selectedCoverImageKey = `tenant-cover:${selectedSlug}:${selectedCoverImageUrl}`;
                const selectedProfileImageKey = `tenant-profile:${selectedSlug}:${selectedProfileImageUrl}`;
                const showCoverImage = Boolean(selectedCoverImageUrl) && !isBrandingImageBlocked(selectedCoverImageKey);
                const showProfileImage = Boolean(selectedProfileImageUrl) && !isBrandingImageBlocked(selectedProfileImageKey);
                const heroCategories = normalizeStorefrontCategories(selectedStore?.storefront_categories);
                const heroReviewSummary = normalizeStorefrontReviewSummary(selectedStore?.storefront_review_summary);
                const social = parseOptionalObject(selectedStore?.storefront_social_links);
                const messengerUrl = sanitizeExternalLink(social?.messenger);
                const messageHref = messengerUrl || (String(selectedStore?.storefront_email || '').trim() ? `mailto:${selectedStore.storefront_email}` : '');
                return (
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', minHeight: 180 }}>
                {showCoverImage ? (
                  <img
                    src={selectedCoverImageUrl}
                    alt={`${selectedStore?.tenant_name || 'Store'} cover`}
                    loading="eager"
                    decoding="async"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => markBrandingImageError(selectedCoverImageKey)}
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#dbeafe,#ecfeff 60%,#f8fafc)' }} />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(15,23,42,0.12) 0%, rgba(15,23,42,0.56) 100%)' }} />
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end', minHeight: 180, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 999, overflow: 'hidden', border: '3px solid #fff', background: '#e2e8f0', boxShadow: '0 8px 20px rgba(15,23,42,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {showProfileImage ? (
                          <img
                            src={selectedProfileImageUrl}
                            alt={`${selectedStore?.tenant_name || 'Store'} profile`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => markBrandingImageError(selectedProfileImageKey)}
                          />
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>ICON</span>
                        )}
                      </div>
                      <div>
                        <h1 style={{ margin: 0, fontSize: isMobileViewport ? 28 : 38, color: '#fff', letterSpacing: '-0.02em' }}>{selectedStore?.tenant_name || 'Loading storefront...'}</h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: 15, color: '#e2e8f0' }}>
                          {String(selectedStore?.storefront_tagline || '').trim() || DGFY_BRAND_NAME}
                        </p>
                      </div>
                    </div>
                    {buildStamp && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc', border: '1px solid rgba(248,250,252,.5)', borderRadius: 999, padding: '4px 8px', background: 'rgba(15,23,42,.25)' }}>
                        Build {buildStamp}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, color: '#e2e8f0' }}>{selectedLocation?.address_line || selectedStore?.address_line || 'Tenant storefront page is loading or being configured.'}</p>
                  {selectedStore && <div style={{ color: '#99f6e4', fontWeight: 700, fontSize: 13 }}>{selectedStore.storefront_open ? 'Open now' : 'Temporarily closed'} - {selectedStore.catalog_count} storefront item(s)</div>}
                  {isStorefrontV2 && (
                    <div style={{ color: '#f8fafc', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {heroReviewSummary?.score != null && <span>{heroReviewSummary.score.toFixed(1)} rating ({heroReviewSummary.total_count ?? 0})</span>}
                      {heroCategories.length > 0 && <span>{heroCategories.join(', ')}</span>}
                      {(selectedLocation?.name || selectedStore?.location_name) && <span>{selectedLocation?.name || selectedStore?.location_name}</span>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {messageHref && (
                      <a href={messageHref} target={messageHref.startsWith('http') ? '_blank' : undefined} rel={messageHref.startsWith('http') ? 'noreferrer' : undefined} style={{ textDecoration: 'none', borderRadius: 10, border: '1px solid rgba(255,255,255,.7)', color: '#fff', padding: '8px 12px', minHeight: 44, minWidth: 96, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'rgba(15,23,42,.25)' }}>Message</a>
                    )}
                    {String(selectedStore?.storefront_phone || '').trim() && (
                      <a href={`tel:${selectedStore.storefront_phone}`} style={{ textDecoration: 'none', borderRadius: 10, border: '1px solid rgba(255,255,255,.7)', color: '#fff', padding: '8px 12px', minHeight: 44, minWidth: 96, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: 'rgba(15,23,42,.25)' }}>Call</a>
                    )}
                    {checkoutPermitted && (
                      <button type="button" aria-label="Open checkout order panel" onClick={() => setIsCheckoutOpen(true)} style={{ borderRadius: 10, border: '1px solid #fb923c', color: '#fff', background: 'linear-gradient(135deg,#ea580c,#f97316)', padding: '8px 14px', minHeight: 44, minWidth: 110, fontWeight: 800, cursor: 'pointer' }}>Order Now</button>
                    )}
                  </div>
                </div>
              </div>
                );
              })()}
            </section>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: isMobileViewport ? 12 : 16, marginBottom: 14 }}>
              {selectedStore ? (
                <>
                  <Suspense fallback={<div style={{ border: '1px solid #d6e2e8', borderRadius: 14, height: 360, display: 'grid', placeItems: 'center', color: '#64748b' }}>Loading map...</div>}>
                    <StoresMap
                      stores={
                        storeLocations.length > 0
                          ? storeLocations.map((location) => ({
                            ...location,
                            tenant_name: selectedStore.tenant_name,
                            workflow_mode: selectedStore.workflow_mode,
                            marker_key: `loc-${location.location_id}`,
                            location_name: location.name,
                            storefront_profile_image_url: selectedStore.storefront_profile_image_url || null
                          }))
                          : [selectedStore]
                      }
                      selectedKey={selectedLocationId != null ? `loc-${selectedLocationId}` : null}
                      resolveAssetUrl={withAssetOrigin}
                      onSelectStore={(location) => {
                        if (location?.location_id != null) {
                          setSelectedLocationId(location.location_id);
                        }
                      }}
                    />
                  </Suspense>
                  <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>
                    {storeLocations.length > 0
                      ? `Showing ${storeLocations.length} active fulfillment location pin(s). Discovery and Near Me rank by the nearest active branch pin.`
                      : 'Showing storefront location pin used by discovery and Near Me.'}
                  </div>
                  {selectedLocation && (
                    <div style={{ marginTop: 6, fontSize: 13, color: '#0f766e', fontWeight: 700 }}>
                      Selected fulfillment location: {selectedLocation.name} ({selectedLocation.address_line || 'Address unavailable'})
                    </div>
                  )}
                </>
              ) : <div style={{ color: '#64748b' }}>Waiting for storefront map pin...</div>}
            </section>

            {catalogPermitted && (
            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: isMobileViewport ? 26 : 34, letterSpacing: '-0.02em' }}>Store Catalog</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: isMobileViewport ? '100%' : 'auto' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#334155', fontWeight: 700 }}>Search</span>
                    <input
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Search items in this store catalog..."
                      style={{ width: isMobileViewport ? '100%' : 280, maxWidth: '100%', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', padding: '8px 11px' }}
                    />
                  </label>
                  <button type="button" onClick={() => openStoreBySlug(routeSlug)} style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700 }}>Refresh Tenant Page</button>
                </div>
              </div>

              {(pendingQrCode || qrLoading || qrLanding) && (
                <div style={{ marginTop: 12, border: '1px solid #99f6e4', borderRadius: 12, background: '#ecfeff', padding: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 800, textTransform: 'uppercase' }}>QR landing</div>
                    {qrLoading ? (
                      <p style={{ margin: '4px 0 0 0', color: '#475569' }}>Resolving scanned storefront code...</p>
                    ) : qrLanding?.status === 'resolved' ? (
                      <>
                        <p style={{ margin: '4px 0 0 0', color: '#0f172a', fontWeight: 800 }}>
                          {qrLanding.item?.name || qrLanding.booking?.service_name || qrLanding.booking?.public_reference || 'Storefront reference'}
                        </p>
                        <p style={{ margin: '2px 0 0 0', color: '#475569', fontSize: 13 }}>
                          {qrLanding.kind === 'service_booking'
                            ? 'Booking ticket resolved. Customer contact details stay hidden unless the claim flow permits access.'
                            : (qrLanding.cart_allowed ? 'Transaction mode allows cart handoff after checkout gates pass.' : 'This storefront mode allows catalog viewing only.')}
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ margin: '4px 0 0 0', color: '#0f172a', fontWeight: 800 }}>QR code blocked</p>
                        <p style={{ margin: '2px 0 0 0', color: '#475569', fontSize: 13 }}>
                          {qrLanding?.message || qrLanding?.reason_code || 'This code is not available for public Storefront use.'}
                        </p>
                      </>
                    )}
                  </div>
                  {qrLanding?.status === 'resolved' && qrLanding?.item && (
                    <button
                      type="button"
                      onClick={addQrItemToCart}
                      disabled={qrLanding.cart_allowed !== true || !isItemAvailable(qrLanding.item)}
                      style={{
                        borderRadius: 10,
                        border: qrLanding.cart_allowed ? '1px solid #ea580c' : '1px solid #cbd5e1',
                        background: qrLanding.cart_allowed ? 'linear-gradient(135deg,#ea580c,#f97316)' : '#e2e8f0',
                        color: qrLanding.cart_allowed ? '#fff' : '#64748b',
                        padding: '9px 12px',
                        minHeight: 42,
                        fontWeight: 800,
                        cursor: qrLanding.cart_allowed ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Add scanned item
                    </button>
                  )}
                </div>
              )}

              {catalogState === 'loading' && <p style={{ color: '#475569' }}>Loading tenant catalog...</p>}
              {catalogState === 'error' && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: 0, color: '#b91c1c' }}>{catalogError}</p>
                  {catalogErrorGuidance && <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: 13 }}>{catalogErrorGuidance}</p>}
                </div>
              )}
              {(catalogState === 'empty_setup' || catalogState === 'empty_search_on_zero') && (
                <StoreCatalogEmptyState
                  mode={catalogState === 'empty_search_on_zero' ? 'search_on_empty' : 'setup_pending'}
                  searchQuery={catalogSearch.trim()}
                  onRefreshTenantPage={() => openStoreBySlug(routeSlug)}
                />
              )}
              {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 10 }}>
                  {filteredCatalog.map((item) => {
                    const itemId = Number(item.item_id);
                    const imageUrl = withAssetOrigin(item.image_url);
                    const imageBlocked = Number.isFinite(itemId) && catalogImageErrors.has(itemId);
                    const available = isItemAvailable(item);
                    const serviceItem = isServiceCatalogItem(item);
                    const canAddItem = serviceItem ? bookingPermitted : productCartPermitted;
                    const inventoryDisplayLabel = getInventoryDisplayLabel(item);
                    const fnbModifierGroups = Array.isArray(item.fnb_modifier_groups) ? item.fnb_modifier_groups : [];
                    const allergens = Array.isArray(item.allergens) ? item.allergens : [];
                    return (
                      <div
                        key={item.item_id}
                        style={{
                          border: '1px solid #d6e2e8',
                          borderRadius: 16,
                          background: '#fff',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 320
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 10',
                            borderBottom: '1px solid #e2e8f0',
                            background: 'linear-gradient(135deg,#f8fafc,#eef2f7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {imageUrl && !imageBlocked ? (
                            <img
                              src={imageUrl}
                              alt={`${item.name} menu`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={() => {
                                if (!Number.isFinite(itemId)) return;
                                setCatalogImageErrors((prev) => {
                                  const next = new Set(prev);
                                  next.add(itemId);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>No image</span>
                          )}
                        </div>
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: 18,
                              lineHeight: 1.2,
                              minHeight: 44,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word'
                            }}
                            title={item.name}
                          >
                            {item.name}
                          </div>
                          <div style={{ color: '#0f766e', fontWeight: 700 }}>{money(item.default_sale_price ?? 0)}</div>
                          {serviceItem && (
                            <div style={{ fontSize: 12, color: '#475569' }}>
                              {item.service_detail?.duration_minutes ? `${item.service_detail.duration_minutes} min` : 'Bookable service'} - {item.service_detail?.payment_policy || 'customer_choice'}
                            </div>
                          )}
                          {fnbModifierGroups.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {fnbModifierGroups.slice(0, 3).map((group) => (
                                <span key={group.modifier_group_id} style={{ borderRadius: 999, border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', padding: '3px 7px', fontSize: 11, fontWeight: 700 }}>
                                  {group.display_name || group.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {allergens.length > 0 && (
                            <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>
                              Allergens: {allergens.slice(0, 3).map((entry) => entry.allergen_name).filter(Boolean).join(', ')}
                            </div>
                          )}
                          {item.nutrition?.calories != null && (
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {item.nutrition.calories} cal{item.nutrition.serving_size ? ` / ${item.nutrition.serving_size}` : ''}
                            </div>
                          )}
                          {inventoryDisplayLabel && (
                            <div style={{ fontSize: 12, color: available ? '#0f766e' : '#b91c1c', fontWeight: 700 }}>
                              {inventoryDisplayLabel}
                            </div>
                          )}
                          {canAddItem && (
                            <button type="button" onClick={() => addToCart(item)} disabled={!available} style={{ marginTop: 'auto', width: '100%', borderRadius: 10, border: '1px solid #ea580c', background: available ? 'linear-gradient(135deg,#ea580c,#f97316)' : '#cbd5e1', color: '#fff', padding: '9px 10px', fontWeight: 800, cursor: available ? 'pointer' : 'not-allowed' }}>+ Add</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {catalogState === 'empty_no_match' && (
                    <p style={{ color: '#64748b' }}>
                      No catalog items matched &quot;{catalogSearch.trim()}&quot;.
                    </p>
                  )}
                </div>
              )}
            </section>
            )}
          </>
        )}
      </div>

      {isStorePage && (checkoutPermitted || bookingPermitted || fnbStorefront) && (
        <>
          {isStorefrontV2 && selectedStore && isMobileViewport && (() => {
            const followEnabled = parseBooleanFlag(selectedStore.storefront_follow_enabled, false);
            const shareEnabled = parseBooleanFlag(selectedStore.storefront_share_enabled, false);
            if (!followEnabled && !shareEnabled) return null;
            return (
              <div
                style={{
                  position: 'fixed',
                  zIndex: 2090,
                  left: isMobileViewport ? 10 : 'auto',
                  right: isMobileViewport ? 10 : 18,
                  bottom: isMobileViewport ? 78 : 84,
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap'
                }}
              >
                {followEnabled && (
                  <button type="button" aria-label="Follow this storefront" disabled={followState.loading} onClick={handleFollowAction} style={{ borderRadius: 10, border: '1px solid #cbd5e1', background: followState.isFollowing ? '#ecfeff' : '#fff', color: '#334155', padding: '8px 12px', minHeight: 44, minWidth: 96, fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,.12)', opacity: followState.loading ? 0.7 : 1, cursor: followState.loading ? 'not-allowed' : 'pointer' }}>
                    {followState.isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                {shareEnabled && (
                  <button type="button" aria-label="Share this storefront" onClick={handleShareAction} style={{ borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '8px 12px', minHeight: 44, minWidth: 96, fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,.12)' }}>
                    Share
                  </button>
                )}
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => {
              setIsCheckoutOpen((prev) => {
                const next = !prev;
                if (next) setCheckoutTab((!checkoutPermitted && !bookingPermitted && fnbStorefront) ? 'reservation' : 'checkout');
                return next;
              });
            }}
            style={{
              position: 'fixed',
              zIndex: 2100,
              border: 'none',
              borderRadius: isMobileViewport ? 12 : 14,
              background: 'linear-gradient(135deg,#ea580c,#f97316)',
              color: '#fff',
              boxShadow: '0 14px 34px rgba(234,88,12,.38)',
              padding: '12px 18px',
              minWidth: isMobileViewport ? 0 : 255,
              textAlign: 'left',
              cursor: 'pointer',
              right: isMobileViewport ? 10 : 18,
              left: isMobileViewport ? 10 : 'auto',
              bottom: isMobileViewport ? 10 : 18
            }}
          >
            <div style={{ fontSize: 13, opacity: .95 }}>{cartCount} item(s) in cart</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{money(cartTotal)}</div>
            <div style={{ marginTop: 2, fontSize: 12, textDecoration: 'underline' }}>{isCheckoutOpen ? 'Close checkout' : 'View Cart'}</div>
          </button>

          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: isCheckoutOpen ? 'auto' : 'none' }}>
            <div role="button" tabIndex={0} onClick={() => setIsCheckoutOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsCheckoutOpen(false); }} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.50)', backdropFilter: 'blur(6px)', opacity: isCheckoutOpen ? 1 : 0, transition: 'opacity 180ms ease' }} />
            <aside
              style={{
                position: 'absolute',
                zIndex: 2001,
                background: 'linear-gradient(180deg,#ffffff 0%,#f7fbfb 100%)',
                border: '1px solid #d6e2e8',
                boxShadow: isDesktopCheckout ? '0 30px 80px rgba(15,23,42,.18)' : '0 -14px 34px rgba(15,23,42,.22)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 220ms ease, opacity 220ms ease',
                opacity: isCheckoutOpen ? 1 : 0,
                ...(isDesktopCheckout
                  ? {
                    top: 24,
                    right: 24,
                    bottom: 24,
                    width: 'min(1080px, calc(100vw - 48px))',
                    borderRadius: 26,
                    transform: isCheckoutOpen ? 'translateX(0)' : 'translateX(32px)'
                  }
                  : {
                    left: 0,
                    right: 0,
                    bottom: 0,
                    maxHeight: '92vh',
                    borderTopLeftRadius: 22,
                    borderTopRightRadius: 22,
                    transform: isCheckoutOpen ? 'translateY(0)' : 'translateY(105%)'
                  })
              }}
            >
              <div style={{ padding: isDesktopCheckout ? '16px 18px 12px 18px' : '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.88)' }}>
                <div>
                          <div style={{ fontWeight: 800, fontSize: 20 }}>{DGFY_BRAND_NAME} Checkout</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedStore?.tenant_name || routeSlug || 'Tenant'}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#e6fffb', border: '1px solid #99f6e4', borderRadius: 999, padding: '3px 8px' }}>
                      {cartCount} item{cartCount === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {ORDER_METHOD_OPTIONS.find((option) => option.value === orderMethod)?.label || 'Checkout'}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setIsCheckoutOpen(false)} style={{ borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', width: 34, height: 34, fontWeight: 900, cursor: 'pointer' }}>x</button>
              </div>

              <div style={{ display: 'flex', gap: 8, padding: isDesktopCheckout ? '14px 18px 8px 18px' : '12px 14px 6px 14px', background: 'rgba(255,255,255,.72)' }}>
                {[
                  { id: 'checkout', label: 'Checkout' },
                  ...(fnbStorefront ? [{ id: 'reservation', label: 'Reservation' }] : []),
                  { id: 'track', label: 'Track' },
                  { id: 'account', label: 'Account' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setCheckoutTab(tab.id);
                      if (tab.id === 'account') handleLoadAccountPanel();
                    }}
                    style={{ borderRadius: 999, border: `1px solid ${checkoutTab === tab.id ? '#0f766e' : '#cbd5e1'}`, background: checkoutTab === tab.id ? '#e6fffb' : '#fff', color: checkoutTab === tab.id ? '#0f766e' : '#334155', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ overflowY: 'auto', padding: isDesktopCheckout ? '12px 18px 18px 18px' : '8px 14px 16px 14px' }}>
                {checkoutTab === 'checkout' && (
                  <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.5fr) minmax(340px, 420px)' : '1fr', gap: 16, alignItems: 'start' }}>
                    <section style={{ display: 'grid', gap: 14 }}>
                      <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Delivery Details</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Group the must-fill fields together so checkout feels faster and calmer.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                          {storeLocations.length > 0 && (
                            <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                              Fulfillment Location
                              <select
                                value={selectedLocationId ?? ''}
                                onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                                style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                              >
                                {storeLocations.map((location) => (
                                  <option key={location.location_id} value={location.location_id} disabled={location.is_open === false || location.is_active === false}>
                                    {location.name} {location.is_primary_storefront ? '(Primary)' : ''} {location.is_open === false ? '(Closed)' : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Order Method
                            <select
                              value={orderMethod}
                              onChange={(e) => {
                                setOrderMethod(e.target.value);
                                setPinLocationError('');
                              }}
                              style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                            >
                              {ORDER_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Customer Name
                            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who is receiving this?" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Phone Number
                            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Mobile number" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Email
                            <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="For ticket or account linking" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                        </div>
                        {hasServiceCart && (
                          <>
                            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                              <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                Appointment Date / Time
                                <input type="datetime-local" value={serviceAppointmentAt} onChange={(e) => setServiceAppointmentAt(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                              </label>
                              <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                Payment Timing
                                <select value={servicePaymentTiming} onChange={(e) => setServicePaymentTiming(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}>
                                  {servicePaymentOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            {serviceIntakeFields.length > 0 && (
                              <section style={{ marginTop: 10, border: '1px solid #d9e4e8', borderRadius: 14, padding: 12, background: '#f8fafc' }}>
                                <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Service Intake</h3>
                                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                                  {serviceIntakeFields.map((field) => (
                                    <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                      {field.label}{field.required ? ' *' : ''}
                                      {field.type === 'textarea' ? (
                                        <textarea
                                          value={serviceIntakeResponses[field.id] || ''}
                                          onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                          style={{ width: '100%', minHeight: 72, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                        />
                                      ) : field.type === 'select' ? (
                                        <select
                                          value={serviceIntakeResponses[field.id] || ''}
                                          onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                        >
                                          <option value="">Select</option>
                                          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                      ) : field.type === 'checkbox' ? (
                                        <input
                                          type="checkbox"
                                          checked={serviceIntakeResponses[field.id] === true}
                                          onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                                          style={{ marginTop: 10 }}
                                        />
                                      ) : (
                                        <input
                                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                          value={serviceIntakeResponses[field.id] || ''}
                                          onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                        />
                                      )}
                                    </label>
                                  ))}
                                </div>
                              </section>
                            )}
                          </>
                        )}
                        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10 }}>
                          Delivery Address
                          <input
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder={isDeliveryOrder ? 'House number, street, landmark' : 'Address is only needed for delivery'}
                            disabled={!isDeliveryOrder}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: isDeliveryOrder ? '#fff' : '#f1f5f9' }}
                          />
                        </label>
                        {selectedLocation?.is_open === false && (
                          <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                            Selected location is closed and cannot accept orders right now.
                          </div>
                        )}
                      </div>

                      <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: 'linear-gradient(180deg,#f8fffe 0%,#ffffff 100%)', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Location Pin</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {isDeliveryOrder ? 'Add a precise drop-off pin to help fulfillment.' : 'Pinning is available for delivery orders.'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={handlePinMyLocation}
                              disabled={!isDeliveryOrder || pinLocationLoading}
                              style={{ borderRadius: 12, border: '1px solid #0f766e', background: isDeliveryOrder ? '#fff' : '#f8fafc', color: '#0f766e', padding: '9px 12px', fontWeight: 700, cursor: isDeliveryOrder ? 'pointer' : 'not-allowed' }}
                            >
                              {pinLocationLoading ? 'Pinning...' : 'Pin My Location'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerPin(null)}
                              disabled={!isDeliveryOrder || !customerPin}
                              style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700, cursor: (!isDeliveryOrder || !customerPin) ? 'not-allowed' : 'pointer' }}
                            >
                              Clear Pin
                            </button>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                          {isDeliveryOrder
                            ? (customerPin
                              ? `Pinned at ${Number(customerPin.latitude).toFixed(6)}, ${Number(customerPin.longitude).toFixed(6)}`
                              : 'No pin selected yet. Tap the map or use your current location.')
                            : 'Switch order method to Delivery if you want to save a location pin.'}
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          <Suspense fallback={<div style={{ width: '100%', maxWidth: 420, aspectRatio: '1 / 1', border: '1px solid #cbd5e1', borderRadius: 10, display: 'grid', placeItems: 'center', color: '#64748b' }}>Loading map...</div>}>
                            <DeliveryPinMap
                              pin={customerPin}
                              onPinChange={setCustomerPin}
                              disabled={!isDeliveryOrder}
                            />
                          </Suspense>
                          {pinLocationError && <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</p>}
                        </div>
                      </div>
                    </section>

                    <section style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
                      <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 14, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Order Summary</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Keep the total visible while editing.</div>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
                        </div>
                        <div style={{ maxHeight: isDesktopCheckout ? 320 : 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 16, padding: 10, marginTop: 12, background: '#fbfeff' }}>
                          {cart.length === 0 && <p style={{ margin: 0, color: '#64748b' }}>Cart is empty.</p>}
                          {cart.map((line) => (
                            <div key={line.item_id} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 78px 96px', gap: 10, alignItems: 'center', marginBottom: 10, padding: 10, border: '1px solid #e6edf2', borderRadius: 14, background: '#fff' }}>
                              <div style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                                  <img
                                    src={withAssetOrigin(line.image_url)}
                                    alt={line.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={() => {
                                      const normalizedLineItemId = Number(line.item_id);
                                      if (!Number.isFinite(normalizedLineItemId)) return;
                                      setCartImageErrors((prev) => {
                                        const next = new Set(prev);
                                        next.add(normalizedLineItemId);
                                        return next;
                                      });
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: 6 }}>No Image</span>
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  Unit: {money(line.price)} {line.unit_of_measure ? `- ${line.unit_of_measure}` : ''}
                                </div>
                                {Array.isArray(line.line_modifiers) && line.line_modifiers.length > 0 && (
                                  <div style={{ marginTop: 3, fontSize: 11, color: '#92400e' }}>
                                    {line.line_modifiers.map((modifier) => modifier.option_name).filter(Boolean).join(', ')}
                                  </div>
                                )}
                                <div style={{ fontSize: 11, color: '#0f766e', fontWeight: 700 }}>
                                  {line.category === 'service' ? 'Bookable appointment' : 'Availability checked on quote/checkout'}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeCartItem(line.item_id)}
                                  style={{ marginTop: 6, border: 'none', background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Remove
                                </button>
                              </div>
                              <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateQty(line.item_id, e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 10px', background: '#fff', fontWeight: 700 }} />
                              <span style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{money(line.quantity * line.price)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 12, borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14 }}>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Items Subtotal</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.subtotal_amount)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>{totalsForDisplay.service_fee_label} (1%)</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.service_fee_amount)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Delivery Fee</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.delivery_fee)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Vatable Sales</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vatable_sales)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>VAT Amount</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_amount)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>VAT-Exempt Sales</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_exempt_sales)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, opacity: .95 }}>Zero-Rated Sales</span>
                              <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.zero_rated_sales)}</strong>
                            </div>
                            <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.24)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 14, fontWeight: 800 }}>Total Amount Due</span>
                              <strong style={{ fontSize: 22 }}>{money(totalsForDisplay.total_amount)}</strong>
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, opacity: .95 }}>
                            {hasServiceCart
                              ? 'Service booking totals are estimated from the selected service. Complete appointment details to book.'
                              : quoteResult
                              ? (quoteNeedsRefresh ? 'Displayed totals are stale. Click Quote again to re-sync and unlock checkout.' : 'Totals are synced from the latest quote and checkout is enabled.')
                              : 'No quote yet. Click Quote to unlock checkout.'}
                          </div>
                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {!hasServiceCart && checkoutPermitted && accessCapabilities.quote !== false && (
                              <button type="button" onClick={handleQuote} disabled={!selectedStore || cart.length === 0} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.55)', background: '#ffffff', color: '#0f766e', padding: '11px 12px', fontWeight: 800 }}>Quote</button>
                            )}
                            <button type="button" onClick={handleCheckout} disabled={!checkoutAllowed} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.2)', background: '#0b3d3a', color: '#fff', padding: '11px 12px', fontWeight: 800 }}>{checkoutLoading ? 'Processing...' : 'Checkout'}</button>
                          </div>
                        </div>
                        {hasStockViolation && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>
                            Cannot checkout: one or more lines exceed current stock.
                          </p>
                        )}
                        {!hasServiceCart && !quoteResult && cart.length > 0 && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                            Quote is required before checkout.
                          </p>
                        )}
                        {!hasServiceCart && quoteResult && quoteNeedsRefresh && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                            Cart changed after quote. Click Quote again to proceed.
                          </p>
                        )}
                        {hasMixedServiceCart && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                            Services must be booked separately from regular product orders.
                          </p>
                        )}
                        {hasServiceCart && !serviceAppointmentAt && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                            Choose an appointment date and time before booking.
                          </p>
                        )}
                        {quoteError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
                        {!hasServiceCart && quoteResult && (
                          <p style={{ marginTop: 10, fontSize: 13, color: '#0f766e' }}>
                            Quote synced. Total due: {money(totalsForDisplay.total_amount)}
                          </p>
                        )}
                        {checkoutError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
                        {(checkoutResult?.tracking_pin || checkoutResult?.booking?.public_reference) && (
                          <div style={{ marginTop: 10, display: 'grid', gap: 8, border: '1px solid #99f6e4', background: '#ecfeff', borderRadius: 12, padding: '10px 12px' }}>
                            <p style={{ margin: 0, fontSize: 13, color: '#0f766e' }}>
                              {checkoutResult?.booking ? 'Booking created.' : 'Order placed.'} Reference: <strong>{checkoutResult.booking?.public_reference || checkoutResult.tracking_pin}</strong>
                            </p>
                            {checkoutResult?.account_action?.show_signup === true && (
                              <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                                You can sign in or register to save this latest transaction to your account.
                              </p>
                            )}
                            {checkoutResult?.payment?.checkout_url && (
                              <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800, textDecoration: 'none' }}>
                                Pay Now
                              </a>
                            )}
                            {checkoutResult?.account_action?.show_signup !== true && (
                              <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                                This ticket can be kept as an image for your gallery.
                              </p>
                            )}
                            <button type="button" onClick={handleDownloadCheckoutImage} style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 800 }}>
                              Download Image
                            </button>
                          </div>
                        )}
                        <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>{DGFY_ACRONYM}</p>
                      </div>
                    </section>
                  </div>
                )}

                {checkoutTab === 'reservation' && fnbStorefront && (
                  <Suspense fallback={<div style={{ color: '#64748b', fontSize: 13 }}>Loading reservation form...</div>}>
                    <FnbReservationPanel
                      form={fnbReservationForm}
                      setForm={setFnbReservationForm}
                      loading={fnbReservationLoading}
                      selectedStore={selectedStore}
                      error={fnbReservationError}
                      result={fnbReservationResult}
                      isDesktopCheckout={isDesktopCheckout}
                      onSubmit={handleFnbReservationRequest}
                    />
                  </Suspense>
                )}

                {checkoutTab === 'track' && (
                  <div style={{ maxWidth: 560, border: '1px solid #d9e4e8', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>Track Order</h3>
                    <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>Enter a tracking PIN to check the latest status without leaving the sheet.</p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={trackingPinInput} onChange={(e) => setTrackingPinInput(e.target.value.toUpperCase())} placeholder="SK-XXXXXX" style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px' }} />
                      <button type="button" onClick={handleTrack} disabled={!selectedStore} style={{ borderRadius: 12, border: '1px solid #334155', background: '#334155', color: '#fff', padding: '11px 16px', fontWeight: 700 }}>Track</button>
                    </div>
                    {trackingError && <p style={{ color: '#b91c1c', marginTop: 10 }}>{trackingError}</p>}
                    {trackingResult && <div style={{ marginTop: 10, fontSize: 14, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>Status: <strong>{trackingResult.status_label || trackingResult.status}</strong></div>}
                  </div>
                )}

                {checkoutTab === 'account' && (
                  <div style={{ display: 'grid', gap: 14, maxWidth: 860 }}>
                    <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div>
                          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>My Account</h3>
                          <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>Bookings, orders, tickets, receipts, and the latest linked transaction.</p>
                        </div>
                        <button type="button" onClick={handleLoadAccountPanel} style={{ borderRadius: 12, border: '1px solid #334155', background: '#334155', color: '#fff', padding: '10px 14px', fontWeight: 700 }}>Refresh</button>
                      </div>
                      {accountPanel.loading && <p style={{ color: '#64748b' }}>Loading account...</p>}
                      {accountPanel.error && <p style={{ color: '#b91c1c' }}>{accountPanel.error}</p>}
                      {accountPanel.me && (
                        <div style={{ marginTop: 8, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '10px 12px' }}>
                          <strong>{accountPanel.me.name || accountPanel.me.email || 'Customer'}</strong>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{accountPanel.me.email || accountPanel.me.phone || 'Signed in'}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 12 }}>
                      <section style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#fff' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>My Bookings</h4>
                        {accountPanel.bookings.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No saved bookings yet.</p>}
                        {accountPanel.bookings.map((booking) => (
                          <div key={booking.booking_id} style={{ borderTop: '1px solid #e2e8f0', padding: '9px 0', fontSize: 13 }}>
                            <strong>{booking.public_reference}</strong>
                            <div style={{ color: '#475569' }}>{booking.service_name || booking.service?.name || 'Service'} - {booking.status}</div>
                            <div style={{ color: '#64748b' }}>{booking.start_at ? formatTicketDate(booking.start_at) : 'Unscheduled'} - {booking.payment_status}</div>
                          </div>
                        ))}
                      </section>
                      <section style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#fff' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>My Orders & Tickets</h4>
                        {accountPanel.orders.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No saved orders yet.</p>}
                        {accountPanel.orders.map((order) => (
                          <div key={order.pos_transaction_id || order.tracking_pin} style={{ borderTop: '1px solid #e2e8f0', padding: '9px 0', fontSize: 13 }}>
                            <strong>{order.tracking_pin || order.receipt_number || 'Order'}</strong>
                            <div style={{ color: '#475569' }}>{order.status_label || order.status || 'Placed'} - {money(order.total_amount)}</div>
                            <div style={{ color: '#64748b' }}>{order.created_at ? formatTicketDate(order.created_at) : 'Recent transaction'}</div>
                          </div>
                        ))}
                      </section>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
      <Toaster richColors position="top-right" />
    </React.StrictMode>
  );
}
