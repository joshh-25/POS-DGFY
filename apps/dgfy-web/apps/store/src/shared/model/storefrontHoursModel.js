import {
  formatStorefrontBusinessHoursDisplay,
  normalizeStorefrontBusinessHours
} from '../../../../../src/features/settings/storefrontBusinessHours.js';

export { normalizeStorefrontBusinessHours };

export const formatStorefrontHoursLabel = (rawValue, fallbackDisplay = '') => {
  return String(
    formatStorefrontBusinessHoursDisplay(rawValue)
    || rawValue
    || fallbackDisplay
    || ''
  ).trim();
};
