import {
  findItemPresetForValues,
  ITEM_FINANCIAL_REQUIREMENT,
  ITEM_FINANCIAL_VISIBILITY,
  resolveItemPreset
} from '@/src/features/settings/modeItemTaxonomy.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';

export const toPositiveMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export const hasExplicitSalePrice = (item) => toPositiveMoney(item?.default_sale_price) !== null;

export const isPureServiceItem = (item) => (
  String(item?.category || '').trim().toLowerCase() === 'service'
  || String(item?.mode_item_preset || '').trim().toLowerCase() === 'service'
);

const resolvePreset = ({ workflowMode, item, preset }) => {
  if (preset) return preset;
  const mode = normalizeWorkflowMode(workflowMode);
  if (!mode) return null;
  if (item?.mode_item_preset) {
    const explicitPreset = resolveItemPreset(mode, item.mode_item_preset);
    if (explicitPreset) return explicitPreset;
  }
  return findItemPresetForValues(mode, item) || null;
};

const inferFallbackProfile = (item) => ({
  cost_visibility: isPureServiceItem(item)
    ? ITEM_FINANCIAL_VISIBILITY.HIDDEN_OPTIONAL
    : ITEM_FINANCIAL_VISIBILITY.VISIBLE,
  sale_price_visibility: isPureServiceItem(item)
    || (item?.category === 'product' && item?.product_type === 'finished_goods')
    ? ITEM_FINANCIAL_VISIBILITY.VISIBLE
    : ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY,
  cost_required: ITEM_FINANCIAL_REQUIREMENT.NEVER,
  sale_price_required: ITEM_FINANCIAL_REQUIREMENT.WHEN_SELLABLE
});

export const resolveItemFinancialPolicy = ({
  workflowMode,
  item,
  preset,
  posVisible = false,
  storefrontVisible = false,
  serviceCostTrackingEnabled = false
} = {}) => {
  const resolvedPreset = resolvePreset({ workflowMode, item, preset });
  const profile = resolvedPreset?.financial_profile || inferFallbackProfile(item || {});
  const sellable = Boolean(
    posVisible
    || storefrontVisible
    || item?.pos_visible === true
    || item?.storefront_visible === true
    || item?.service_detail?.visible_in_pos === true
    || item?.service_detail?.visible_in_storefront === true
    || item?.service_detail?.bookable === true
    || item?.serviceDetail?.visible_in_pos === true
    || item?.serviceDetail?.visible_in_storefront === true
    || item?.serviceDetail?.bookable === true
  );
  const hasStoredServiceCost = isPureServiceItem(item) && Number(item?.cost_per_unit || 0) > 0;
  const showCost = profile.cost_visibility === ITEM_FINANCIAL_VISIBILITY.VISIBLE
    || (profile.cost_visibility === ITEM_FINANCIAL_VISIBILITY.HIDDEN_OPTIONAL && (serviceCostTrackingEnabled || hasStoredServiceCost));
  const showSalePrice = profile.sale_price_visibility === ITEM_FINANCIAL_VISIBILITY.VISIBLE
    || (profile.sale_price_visibility === ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY && sellable);
  const requiresCost = profile.cost_required === ITEM_FINANCIAL_REQUIREMENT.ACTIVE;
  const requiresSalePrice = profile.sale_price_required === ITEM_FINANCIAL_REQUIREMENT.ACTIVE
    || (profile.sale_price_required === ITEM_FINANCIAL_REQUIREMENT.WHEN_SELLABLE && sellable);

  return {
    preset: resolvedPreset,
    profile,
    is_pure_service: isPureServiceItem(item),
    is_sellable: sellable,
    show_cost: showCost,
    show_sale_price: showSalePrice,
    requires_cost: requiresCost,
    requires_sale_price: requiresSalePrice,
    has_explicit_sale_price: hasExplicitSalePrice(item)
  };
};
