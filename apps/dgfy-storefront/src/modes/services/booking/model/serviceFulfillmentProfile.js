import {
  resolveFulfillmentProfile,
  resolveFulfillmentProfilesForServiceAreaType
} from '@sieitzz/shared-constants/fulfillmentProfiles';

const PROFILE_METHOD_BY_KEY = Object.freeze({
  appointment_at_business: 'appointment',
  service_at_customer_address: 'on_site',
  online_service: 'online',
  customer_choice_of_location: 'hybrid',
  item_pickup_return: '',
  item_pickup_collection: '',
  item_dropoff_collection: '',
  quote_request: ''
});

const normalize = (value) => String(value || '').trim().toLowerCase();
const PROFILE_KEYS = new Set(Object.keys(PROFILE_METHOD_BY_KEY));

const getServiceAreaType = (serviceItem = null) => {
  const candidates = [
    serviceItem?.service_detail?.service_area_type,
    serviceItem?.serviceDetail?.service_area_type,
    serviceItem?.service_area_type,
    serviceItem?.serviceAreaType,
    serviceItem?.serviceArea?.type
  ];
  return candidates.map((value) => normalize(value)).find(Boolean) || '';
};

const getExplicitProfileKey = ({ serviceItem = null, storefrontContext = null } = {}) => {
  const candidates = [
    serviceItem?.fulfillment_profile_key,
    serviceItem?.fulfillmentProfileKey,
    serviceItem?.service_detail?.fulfillment_profile_key,
    serviceItem?.service_detail?.fulfillmentProfileKey,
    serviceItem?.serviceDetail?.fulfillment_profile_key,
    serviceItem?.serviceDetail?.fulfillmentProfileKey,
    storefrontContext?.fulfillment_profile_key,
    storefrontContext?.fulfillmentProfileKey
  ];
  return candidates.map((value) => String(value || '').trim()).find((value) => PROFILE_KEYS.has(value)) || '';
};

const isLaundryStorefront = ({ serviceItem = null, storefrontContext = null } = {}) => {
  const categories = Array.isArray(storefrontContext?.storefront_categories)
    ? storefrontContext.storefront_categories.map(normalize).filter(Boolean)
    : [];
  if (categories.some((category) => category.includes('laundry'))) return true;

  const storefrontIdentity = [
    storefrontContext?.slug,
    storefrontContext?.tenant_name,
    storefrontContext?.name,
    storefrontContext?.business_name
  ].map(normalize).filter(Boolean).join(' ');
  if (storefrontIdentity) return storefrontIdentity.includes('laundry');
  if (categories.length > 0) return false;

  return [
    serviceItem?.service_detail?.service_category,
    serviceItem?.serviceDetail?.service_category,
    serviceItem?.category,
    serviceItem?.folder_name,
    serviceItem?.serviceAreaLabel,
    serviceItem?.name
  ].map(normalize).filter(Boolean).join(' ').includes('laundry');
};

const resolveProfileKey = ({ serviceItem = null, storefrontContext = null } = {}) => {
  const explicitProfileKey = getExplicitProfileKey({ serviceItem, storefrontContext });
  if (explicitProfileKey) return explicitProfileKey;
  return resolveFulfillmentProfilesForServiceAreaType(getServiceAreaType(serviceItem))[0] || '';
};

export const resolveServiceFulfillmentProfile = ({ serviceItem = null, storefrontContext = null } = {}) => (
  resolveFulfillmentProfile(resolveProfileKey({ serviceItem, storefrontContext }))
);

/**
 * Returns the profile's composition method without changing the raw handoff
 * selection. Laundry stays on its legacy picker; other service-area profiles
 * use their own flow while the selection remains empty until the user acts.
 */
export const resolveServiceFlowProfileMethod = ({ serviceItem = null, storefrontContext = null } = {}) => {
  const explicitProfileKey = getExplicitProfileKey({ serviceItem, storefrontContext });
  if (!explicitProfileKey && isLaundryStorefront({ serviceItem, storefrontContext })) return '';
  return PROFILE_METHOD_BY_KEY[resolveProfileKey({ serviceItem, storefrontContext })] || '';
};

export const resolveServiceFlowMethod = ({
  serviceItem = null,
  storefrontContext = null,
  selectedMethod = ''
} = {}) => {
  const profileMethod = resolveServiceFlowProfileMethod({ serviceItem, storefrontContext });
  const selected = normalize(selectedMethod);
  if (profileMethod === 'hybrid') return ['appointment', 'on_site'].includes(selected) ? selected : 'hybrid';
  return profileMethod || selected;
};
