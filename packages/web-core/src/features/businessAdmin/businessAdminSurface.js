export const POS_BUSINESS_ADMIN_SETTINGS_SECTIONS = Object.freeze([
  'profile',
  'pos',
  'storefront',
  'delivery',
  'branches',
  'team',
  'attendance',
  'payments',
  'registers'
]);

const POS_SETTINGS_SECTION_KEYS = new Set(POS_BUSINESS_ADMIN_SETTINGS_SECTIONS);

export const isBusinessAdminSettingsSectionAvailable = (surface, sectionKey) => (
  surface !== 'pos' || POS_SETTINGS_SECTION_KEYS.has(String(sectionKey || '').trim().toLowerCase())
);

export const getBusinessAdminSettingsSectionsForSurface = (surface, sections = []) => (
  (Array.isArray(sections) ? sections : []).filter((section) => (
    isBusinessAdminSettingsSectionAvailable(surface, section?.key)
  ))
);

export const resolveBusinessAdminRootPath = (pathname, surface = 'opis') => {
  if (String(pathname || '').startsWith('/business-admin')) return '/business-admin';
  if (String(pathname || '').startsWith('/backoffice')) return '/backoffice';
  return surface === 'pos' ? '/backoffice' : '/';
};
