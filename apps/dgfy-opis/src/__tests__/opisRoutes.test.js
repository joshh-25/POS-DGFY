import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BACKOFFICE_MANIFEST,
  BACKOFFICE_NAV_GROUPS,
  buildBackOfficeModulePath,
  getBackOfficeModuleDefinition
} from '../features/businessAdmin/businessAdminManifest.js';
import { createPageUrl, getPageNameFromPath } from '../utils.js';

const here = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(here, '../main.jsx'), 'utf8');

describe('OPIS routes (issue #2052)', () => {
  it('keeps /backoffice/* canonical with /business-admin/* as an alias', () => {
    expect(mainSource).toContain('path="/backoffice/*"');
    expect(mainSource).toContain('path="/business-admin/*"');
    expect(mainSource).toContain('BusinessAdminAliasRoute');
  });

  it('opens the Back Office overview at /', () => {
    expect(mainSource).toContain('path="/" element={<Navigate to="/backoffice/overview" replace />}');
  });

  it('preserves /receive/:token handling with authorization intact', () => {
    expect(mainSource).toContain('path="/receive/:token"');
    expect(mainSource).toContain('ProtectedRoute');
    expect(mainSource).toContain('MobileReceivePage');
  });

  it('selects OPIS as the DGFY company destination', () => {
    expect(mainSource).toContain('targetSurface="opis"');
  });

  it('identifies as the opis surface', () => {
    expect(mainSource).toContain("surface: 'opis'");
    expect(mainSource).toContain('data-opis-surface');
  });
});

describe('OPIS Back Office manifest', () => {
  it('exposes the migrated module inventory with canonical routes', () => {
    const ids = Object.keys(BACKOFFICE_MANIFEST);
    expect(ids).toContain('overview');
    expect(ids).toContain('catalog');
    expect(ids).toContain('settings');
    for (const definition of Object.values(BACKOFFICE_MANIFEST)) {
      expect(definition.route).toMatch(/^\/business-admin\//);
    }
  });

  it('maps modules under an OPIS /backoffice root', () => {
    expect(buildBackOfficeModulePath('/backoffice', 'catalog')).toBe('/backoffice/catalog');
    expect(getBackOfficeModuleDefinition('sales')?.key).toBe('sales');
    expect(getBackOfficeModuleDefinition('nope')).toBeNull();
  });

  it('keeps navigation groups intact', () => {
    expect(BACKOFFICE_NAV_GROUPS.length).toBeGreaterThan(0);
    expect(BACKOFFICE_NAV_GROUPS.flatMap((group) => group.items).length).toBe(
      Object.keys(BACKOFFICE_MANIFEST).length
    );
  });
});

describe('OPIS page routes', () => {
  it('resolves known pages and falls back to the dashboard', () => {
    expect(createPageUrl('Sales')).toBe('/backoffice/sales');
    expect(createPageUrl('Unknown')).toBe('/backoffice/overview');
    expect(getPageNameFromPath('/backoffice/catalog')).toBe('Items');
    expect(getPageNameFromPath('/nope')).toBe('Dashboard');
  });
});
