import { WORKFLOW_MODE_VALUES } from '../../shared/constants/workflowModes.js';
import {
  CUSTOMER_ACCESS_MODES,
  normalizeCustomerAccessMode,
  normalizeInventoryDisplayMode,
  normalizeLowStockDisplayThreshold
} from '../../shared/utils/customerAccessPolicy.js';

const TIER_BY_VISIBILITY = Object.freeze({
  ghost: 'tier_0',
  catalog: 'tier_1',
  inquiry: 'tier_2',
  transaction: 'tier_3'
});
const WORKFLOW_MODES = Object.freeze(WORKFLOW_MODE_VALUES);
const BUSINESS_MODE_TEMPLATES = Object.freeze(WORKFLOW_MODE_VALUES);
const COMPLIANCE_HINTS = Object.freeze([
  'regulated_ready',
  'assisted_compliance',
  'informal_observe'
]);

const normalizeString = (value, fallback = '') => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const normalizeLower = (value, fallback = '') => normalizeString(value, fallback).toLowerCase();

const normalizeNumber = (value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
};

const normalizeBoolean = (value) => value === true;

const normalizeStringArray = (value, { allow = null } = {}) => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => normalizeLower(entry))
    .filter(Boolean);
  const deduped = Array.from(new Set(normalized));
  if (!Array.isArray(allow) || allow.length === 0) return deduped;
  const allowSet = new Set(allow);
  return deduped.filter((entry) => allowSet.has(entry));
};

const tokenizeIndustryTag = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .split(/[^a-z0-9]+/g)
  .map((token) => token.trim())
  .filter(Boolean);

const collectIndustryTokens = (industryTags = []) => {
  const tokenSet = new Set();
  (Array.isArray(industryTags) ? industryTags : []).forEach((entry) => {
    tokenizeIndustryTag(entry).forEach((token) => tokenSet.add(token));
  });
  return tokenSet;
};

const hasAnyIndustryToken = (industryTokens, candidates = []) => (
  (Array.isArray(candidates) ? candidates : []).some((candidate) => {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (!normalized) return false;
    if (industryTokens.has(normalized)) return true;
    return Array.from(industryTokens).some((token) => token.includes(normalized));
  })
);

const deriveBusinessModeTemplateRecommendation = ({ payload, complexityScore }) => {
  const industryTokens = collectIndustryTokens(payload?.identity?.industry_tags || []);
  const offeringTypes = Array.isArray(payload?.product_service?.offering_types)
    ? payload.product_service.offering_types
    : [];
  const fulfillmentMethods = Array.isArray(payload?.order_booking?.fulfillment_methods)
    ? payload.order_booking.fulfillment_methods
    : [];
  const branchCount = Number(payload?.location_presence?.branch_count || 0);
  const salesEstimate = Number(payload?.growth_intent?.estimated_monthly_sales || 0);

  if (hasAnyIndustryToken(industryTokens, ['restaurant', 'cafe', 'coffee', 'bakery', 'food', 'fnb', 'bar'])) {
    return 'fnb';
  }
  if (hasAnyIndustryToken(industryTokens, ['hotel', 'hostel', 'resort', 'lodging', 'hospitality'])) {
    return 'hospitality';
  }
  if (hasAnyIndustryToken(industryTokens, ['health', 'medical', 'clinic', 'hospital', 'pharmacy', 'dental', 'lab'])) {
    return 'healthcare';
  }
  if (hasAnyIndustryToken(industryTokens, ['school', 'academy', 'education', 'college', 'university', 'institution'])) {
    return 'education_institutions';
  }
  if (hasAnyIndustryToken(industryTokens, ['logistics', 'warehouse', 'distribution', 'courier', 'freight', 'shipping'])) {
    return 'logistics_distribution';
  }
  if (
    offeringTypes.includes('ticketed_seat')
    || hasAnyIndustryToken(industryTokens, ['transport', 'ticket', 'transit', 'bus', 'rail', 'ferry'])
  ) {
    return 'ticketing_transport';
  }
  if (hasAnyIndustryToken(industryTokens, ['foodmanufacturing', 'food_manufacturing'])) {
    return 'food_manufacturing';
  }
  if (hasAnyIndustryToken(industryTokens, ['manufacturing', 'factory', 'production'])) {
    return 'food_manufacturing';
  }

  const hasPhysicalProduct = offeringTypes.includes('physical_product');
  const hasServiceOnly = offeringTypes.length > 0
    && offeringTypes.every((entry) => entry === 'time_service');
  const hasDeliveryOps = fulfillmentMethods.includes('own_delivery')
    || fulfillmentMethods.includes('platform_delivery');

  const isSimpleMsmeCandidate = (
    complexityScore <= 1
    && branchCount <= 1
    && salesEstimate < 150000
    && !hasDeliveryOps
    && !offeringTypes.includes('ticketed_seat')
    && !offeringTypes.includes('capacity_slot')
  );

  if (isSimpleMsmeCandidate) return 'msme';
  if (hasServiceOnly) return 'services';
  if (hasPhysicalProduct) return 'retail';
  if (offeringTypes.includes('time_service')) return 'services';
  return 'food_manufacturing';
};

const parseSalesEstimate = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const raw = normalizeString(value);
  if (!raw) return 0;
  const numeric = Number(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
};

const normalizeVisibilityMode = (rawVisibilityMode, paymentConfiguration = {}) => {
  const raw = normalizeLower(rawVisibilityMode);
  if (CUSTOMER_ACCESS_MODES.includes(raw)) return normalizeCustomerAccessMode(raw);

  const acceptsOnline = normalizeBoolean(paymentConfiguration.accepts_online_payments);
  return acceptsOnline ? 'transaction' : 'catalog';
};

export const normalizeBusinessClassificationPayload = (rawPayload = {}) => {
  const normalized = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

  const payload = {
    identity: {
      official_name: normalizeString(normalized.identity?.official_name),
      display_name: normalizeString(normalized.identity?.display_name),
      industry_tags: normalizeStringArray(normalized.identity?.industry_tags)
    },
    legitimacy: {
      registration_status: normalizeLower(normalized.legitimacy?.registration_status, 'informal'),
      requires_official_receipt: normalizeBoolean(normalized.legitimacy?.requires_official_receipt)
    },
    location_presence: {
      operation_type: normalizeLower(normalized.location_presence?.operation_type, 'fixed'),
      branch_count: normalizeNumber(normalized.location_presence?.branch_count, 1, { min: 0, max: 1000 }),
      radius_visibility: normalizeLower(normalized.location_presence?.radius_visibility, 'approximate')
    },
    operations_staff: {
      pos_user_count: normalizeNumber(normalized.operations_staff?.pos_user_count, 1, { min: 0, max: 10000 }),
      needs_rbac: normalizeBoolean(normalized.operations_staff?.needs_rbac)
    },
    product_service: {
      offering_types: normalizeStringArray(normalized.product_service?.offering_types, {
        allow: ['physical_product', 'time_service', 'ticketed_seat', 'capacity_slot', 'rental']
      })
    },
    order_booking: {
      order_modes: normalizeStringArray(normalized.order_booking?.order_modes, {
        allow: ['walk_in', 'pre_order', 'scheduled', 'realtime']
      }),
      fulfillment_methods: normalizeStringArray(normalized.order_booking?.fulfillment_methods, {
        allow: ['pickup', 'own_delivery', 'platform_delivery', 'on_site_service']
      })
    },
    online_visibility: {
      mode: normalizeVisibilityMode(
        normalized.customer_access_mode || normalized.online_visibility?.mode,
        normalized.payment_configuration
      )
    },
    inventory_display: {
      mode: normalizeInventoryDisplayMode(normalized.inventory_display_mode || normalized.inventory_display?.mode),
      low_stock_threshold: normalizeLowStockDisplayThreshold(
        normalized.inventory_low_stock_display_threshold || normalized.inventory_display?.low_stock_threshold
      )
    },
    payment_configuration: {
      accepted_in_store_payments: normalizeStringArray(normalized.payment_configuration?.accepted_in_store_payments),
      accepts_online_payments: normalizeBoolean(normalized.payment_configuration?.accepts_online_payments),
      payout_destination: normalizeLower(normalized.payment_configuration?.payout_destination, 'bank_transfer'),
      settlement_preference: normalizeLower(normalized.payment_configuration?.settlement_preference, 'daily')
    },
    branding: {
      branding_level: normalizeLower(normalized.branding?.branding_level, 'basic'),
      has_custom_domain: normalizeBoolean(normalized.branding?.has_custom_domain)
    },
    customer_interaction: {
      preferred_channels: normalizeStringArray(normalized.customer_interaction?.preferred_channels),
      tracks_customer_data: normalizeBoolean(normalized.customer_interaction?.tracks_customer_data)
    },
    growth_intent: {
      growth_goals: normalizeStringArray(normalized.growth_intent?.growth_goals),
      estimated_monthly_sales: parseSalesEstimate(normalized.growth_intent?.estimated_monthly_sales)
    }
  };

  return payload;
};

export const deriveBusinessClassification = (normalizedPayload = {}) => {
  const payload = normalizeBusinessClassificationPayload(normalizedPayload);
  const visibilityMode = payload.online_visibility.mode;
  const monetizationTier = TIER_BY_VISIBILITY[visibilityMode] || 'tier_1';

  const complexitySignals = [
    payload.location_presence.branch_count >= 2,
    payload.operations_staff.pos_user_count >= 8,
    payload.operations_staff.needs_rbac === true,
    payload.product_service.offering_types.some((entry) => ['ticketed_seat', 'capacity_slot', 'rental'].includes(entry)),
    payload.order_booking.order_modes.some((entry) => ['scheduled', 'realtime'].includes(entry)),
    payload.order_booking.fulfillment_methods.some((entry) => ['own_delivery', 'platform_delivery'].includes(entry)),
    payload.growth_intent.estimated_monthly_sales >= 250000
  ];
  const complexityScore = complexitySignals.filter(Boolean).length;
  const businessModeTemplateRecommendation = deriveBusinessModeTemplateRecommendation({
    payload,
    complexityScore
  });
  const workflowModeRecommendation = businessModeTemplateRecommendation === 'msme'
    ? 'msme'
    : businessModeTemplateRecommendation;

  const registrationStatus = payload.legitimacy.registration_status;
  const wantsOfficialReceipt = payload.legitimacy.requires_official_receipt;

  let compliancePathHint = 'assisted_compliance';
  if (registrationStatus === 'registered' && wantsOfficialReceipt) {
    compliancePathHint = 'regulated_ready';
  } else if (registrationStatus === 'informal' && !wantsOfficialReceipt) {
    compliancePathHint = 'informal_observe';
  }

  return {
    visibility_mode: CUSTOMER_ACCESS_MODES.includes(visibilityMode) ? visibilityMode : 'catalog',
    customer_access_mode: CUSTOMER_ACCESS_MODES.includes(visibilityMode) ? visibilityMode : 'catalog',
    inventory_display_mode: payload.inventory_display.mode,
    inventory_low_stock_display_threshold: payload.inventory_display.low_stock_threshold,
    monetization_tier: TIER_BY_VISIBILITY[visibilityMode] ? monetizationTier : 'tier_1',
    workflow_mode_recommendation: WORKFLOW_MODES.includes(workflowModeRecommendation) ? workflowModeRecommendation : 'msme',
    business_mode_template_recommendation: BUSINESS_MODE_TEMPLATES.includes(businessModeTemplateRecommendation)
      ? businessModeTemplateRecommendation
      : 'msme',
    compliance_path_hint: COMPLIANCE_HINTS.includes(compliancePathHint) ? compliancePathHint : 'assisted_compliance',
    complexity_score: complexityScore
  };
};

export const buildBusinessClassificationSnapshot = (rawPayload = {}) => {
  const normalizedPayload = normalizeBusinessClassificationPayload(rawPayload);
  const derived = deriveBusinessClassification(normalizedPayload);

  return {
    payload: normalizedPayload,
    ...derived,
    computed_at: new Date().toISOString()
  };
};

export default {
  normalizeBusinessClassificationPayload,
  deriveBusinessClassification,
  buildBusinessClassificationSnapshot
};
