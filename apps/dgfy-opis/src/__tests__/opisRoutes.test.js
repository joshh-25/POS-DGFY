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
import { parseBusinessAdminPath } from '../features/businessAdmin/businessAdminSettingsModel.js';
import { createPageUrl, getPageNameFromPath } from '../utils.js';

const here = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(here, '../main.jsx'), 'utf8');
const businessAdminPageSource = readFileSync(
  resolve(here, '../features/businessAdmin/BusinessAdminPage.jsx'),
  'utf8'
);

describe('OPIS routes (issue #2052)', () => {
  it('keeps /backoffice/* canonical with /business-admin/* as an alias', () => {
    expect(mainSource).toContain('path="/backoffice/*"');
    expect(mainSource).toContain('path="/business-admin/*"');
    expect(mainSource).toContain('BusinessAdminAliasRoute');
  });

  it('renders the Back Office overview directly at / with no redirect', () => {
    expect(mainSource).toContain('path="/" element={<BusinessAdminPage />}');
    expect(mainSource).not.toContain('path="/" element={<Navigate to="/backoffice/overview"');
  });

  it('redirects the legacy /backoffice/overview URL to the canonical /', () => {
    expect(mainSource).toContain('path="/backoffice/overview"');
    expect(mainSource).toContain('BackofficeOverviewRedirect');
    expect(mainSource).toContain('to={`/${search}`}');
  });

  it('resolves a bare / to the overview section under the canonical root', () => {
    expect(parseBusinessAdminPath('/', '/backoffice').activeSection).toBe('overview');
    expect(parseBusinessAdminPath('/backoffice/catalog', '/backoffice').activeSection).toBe('catalog');
  });

  it('preserves /receive/:token handling with authorization intact', () => {
    expect(mainSource).toContain('path="/receive/:token"');
    expect(mainSource).toContain('ProtectedRoute');
    expect(mainSource).toContain('MobileReceivePage');
  });

  it('serves proper paths via BrowserRouter (no hash redirect)', () => {
    expect(mainSource).toContain('BrowserRouter');
    expect(mainSource).not.toContain('HashRouter');
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

describe('OPIS "Open POS terminal" links (issue #2052 follow-up)', () => {
  it('navigates cross-origin via real hrefs, not react-router Links', () => {
    expect(businessAdminPageSource).not.toContain('to="/terminal"');
    expect(businessAdminPageSource).toContain('href={buildPosTerminalUrl()}');
    expect(businessAdminPageSource).toContain(
      "href={buildPosTerminalUrl({ path: '/terminal', search: `?view=${encodeURIComponent('terminal_setup')}` })}"
    );
  });

  it('keeps the dirty-guard contract on the external GuardedLink mode', () => {
    expect(businessAdminPageSource).toContain('window.location.assign(externalHref)');
    expect(businessAdminPageSource).toContain('shouldBlockSettingsNavigation(isDirty)');
    expect(businessAdminPageSource).toContain('onLeave?.()');
  });
});

describe('OPIS page routes', () => {
  it('resolves known pages and falls back to the dashboard', () => {
    expect(createPageUrl('Sales')).toBe('/backoffice/sales');
    expect(createPageUrl('Unknown')).toBe('/');
    expect(createPageUrl('Dashboard')).toBe('/');
    expect(getPageNameFromPath('/backoffice/catalog')).toBe('Items');
    expect(getPageNameFromPath('/')).toBe('Dashboard');
    expect(getPageNameFromPath('/nope')).toBe('Dashboard');
  });
});
