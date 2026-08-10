import { formatStorefrontBusinessHoursDisplay } from '../../../../../src/features/settings/storefrontBusinessHours.js';

export const formatStorefrontHoursLabel = (rawValue, fallbackDisplay = '') => {
  return String(
    formatStorefrontBusinessHoursDisplay(rawValue)
    || rawValue
    || fallbackDisplay
    || ''
  ).trim();
};
