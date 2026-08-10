const MAX_STOREFRONT_CONTACT_ROWS = 4;

export const buildGoogleMapsDirectionsUrl = ({ latitude, longitude, addressLine }) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const address = String(addressLine || '').trim();
  if (!address) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

export const buildVisibleStorefrontContactRows = ({
  contactRows = [],
  hours = '',
  rawHoursData = null,
  addressText = '',
  directionsUrl = '',
  destinationLatitude = null,
  destinationLongitude = null
} = {}) => {
  const normalizedRows = Array.isArray(contactRows)
    ? contactRows
      .map((row) => ({
        ...row,
        label: String(row?.label || '').trim(),
        value: String(row?.value || '').trim(),
        href: String(row?.href || '').trim()
      }))
      .filter((row) => row.label && row.value)
    : [];

  const findRow = (...labels) => normalizedRows.find((row) => labels.includes(row.label.toLowerCase()));
  const phoneRow = findRow('call', 'phone');
  const socialRow = findRow('messenger', 'message', 'facebook');
  const emailRow = findRow('email');
  const normalizedHours = String(hours || '').trim();
  const normalizedAddressText = String(addressText || '').trim();
  const normalizedDirectionsUrl = String(directionsUrl || '').trim();
  const normalizedDestLat = Number(destinationLatitude);
  const normalizedDestLng = Number(destinationLongitude);
  const hasDestinationCoordinates = Number.isFinite(normalizedDestLat) && Number.isFinite(normalizedDestLng);

  return [
    phoneRow,
    socialRow,
    normalizedHours ? { label: 'Hours', value: normalizedHours, rawHoursData } : null,
    normalizedAddressText
      ? {
          label: 'Address',
          value: normalizedAddressText,
          actionLabel: normalizedDirectionsUrl ? 'Get directions' : '',
          actionHref: normalizedDirectionsUrl,
          destinationLatitude: hasDestinationCoordinates ? normalizedDestLat : null,
          destinationLongitude: hasDestinationCoordinates ? normalizedDestLng : null
        }
      : null,
    emailRow
  ]
    .filter(Boolean)
    .slice(0, MAX_STOREFRONT_CONTACT_ROWS);
};
