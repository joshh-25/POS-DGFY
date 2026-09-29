import { describe, expect, it } from 'vitest';
import {
  getBusinessAdminSettingsSectionsForSurface,
  isBusinessAdminSettingsSectionAvailable,
  resolveBusinessAdminRootPath
} from '../businessAdminSurface.js';
import {
  BACKOFFICE_MANIFEST,
  buildBackOfficeModulePath,
  buildBackOfficeLocationsPath
} from '../businessAdminManifest.js';
import { buildBusinessAdminSettingsPath, parseBusinessAdminPath } from '../businessAdminSettingsModel.js';

describe('Business Admin app surface policy', () => {
  it('keeps the nine baseline settings sections available in POS and OPIS', () => {
    const keys = ['profile', 'pos', 'storefront', 'delivery', 'branches', 'team', 'attendance', 'payments', 'registers'];
    for (const key of keys) {
      expect(isBusinessAdminSettingsSectionAvailable('pos', key)).toBe(true);
      expect(isBusinessAdminSettingsSectionAvailable('opis', key)).toBe(true);
    }
  });

  it('keeps OPIS-only sections out of POS navigation and direct route access', () => {
    const sections = [{ key: 'taxes' }, { key: 'discounts' }, { key: 'profile' }];
    expect(getBusinessAdminSettingsSectionsForSurface('pos', sections)).toEqual([{ key: 'profile' }]);
    expect(isBusinessAdminSettingsSectionAvailable('pos', 'taxes')).toBe(false);
    expect(isBusinessAdminSettingsSectionAvailable('pos', 'discounts')).toBe(false);
    expect(getBusinessAdminSettingsSectionsForSurface('opis', sections)).toEqual(sections);
  });

  it('keeps POS administration under its native route and OPIS at the app root', () => {
    expect(resolveBusinessAdminRootPath('/business-admin/sales', 'pos')).toBe('/business-admin');
    expect(resolveBusinessAdminRootPath('/business-admin/settings/team', 'pos')).toBe('/business-admin');
    expect(resolveBusinessAdminRootPath('/sales', 'pos')).toBe('/business-admin');
    expect(resolveBusinessAdminRootPath('/sales', 'opis')).toBe('/');
  });

  it('builds the full manifest under the POS administration route and the OPIS root', () => {
    for (const moduleKey of Object.keys(BACKOFFICE_MANIFEST)) {
      const expectedPath = BACKOFFICE_MANIFEST[moduleKey].route;
      expect(buildBackOfficeModulePath('/business-admin', moduleKey)).toBe(
        moduleKey === 'overview' ? '/business-admin' : `/business-admin${expectedPath}`
      );
      expect(buildBackOfficeModulePath('/', moduleKey)).toBe(expectedPath);
    }
    expect(buildBackOfficeLocationsPath('/business-admin', 'registers')).toBe('/business-admin/locations/registers');
    expect(buildBusinessAdminSettingsPath('/business-admin', 'team')).toBe('/business-admin/settings/team');
    expect(buildBusinessAdminSettingsPath('/business-admin', 'registers')).toBe('/business-admin/settings/registers');
    expect(parseBusinessAdminPath('/business-admin/locations/registers', '/business-admin')).toMatchObject({
      activeSection: 'locations',
      locationView: 'registers'
    });
  });
});
