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

  it('selects the correct route root for each app and each POS prefix', () => {
    expect(resolveBusinessAdminRootPath('/backoffice/sales', 'pos')).toBe('/backoffice');
    expect(resolveBusinessAdminRootPath('/business-admin/settings/team', 'pos')).toBe('/business-admin');
    expect(resolveBusinessAdminRootPath('/sales', 'pos')).toBe('/backoffice');
    expect(resolveBusinessAdminRootPath('/sales', 'opis')).toBe('/');
  });

  it('builds the full manifest under both POS prefixes and the OPIS root', () => {
    for (const moduleKey of Object.keys(BACKOFFICE_MANIFEST)) {
      const expectedPath = BACKOFFICE_MANIFEST[moduleKey].route;
      expect(buildBackOfficeModulePath('/backoffice', moduleKey)).toBe(
        moduleKey === 'overview' ? '/backoffice' : `/backoffice${expectedPath}`
      );
      expect(buildBackOfficeModulePath('/business-admin', moduleKey)).toBe(
        moduleKey === 'overview' ? '/business-admin' : `/business-admin${expectedPath}`
      );
      expect(buildBackOfficeModulePath('/', moduleKey)).toBe(expectedPath);
    }
    expect(buildBackOfficeLocationsPath('/backoffice', 'registers')).toBe('/backoffice/locations/registers');
    expect(buildBusinessAdminSettingsPath('/backoffice', 'team')).toBe('/backoffice/settings/team');
    expect(buildBusinessAdminSettingsPath('/business-admin', 'registers')).toBe('/business-admin/settings/registers');
    expect(parseBusinessAdminPath('/backoffice/locations/registers', '/backoffice')).toMatchObject({
      activeSection: 'locations',
      locationView: 'registers'
    });
  });
});
