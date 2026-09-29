import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BACKOFFICE_MANIFEST,
  BACKOFFICE_NAV_GROUPS,
  buildBackOfficeModulePath,
  getBackOfficeModuleDefinition
} from '../../../../packages/web-core/src/features/businessAdmin/businessAdminManifest.js';
import { parseBusinessAdminPath } from '../../../../packages/web-core/src/features/businessAdmin/businessAdminSettingsModel.js';
import { createPageUrl, getPageNameFromPath } from '../utils.js';
import { canonicalizeOpisPath } from '../opisRoutes.js';

const here = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(here, '../main.jsx'), 'utf8');
const businessAdminPageSource = readFileSync(
  resolve(here, '../features/businessAdmin/BusinessAdminPage.jsx'),
  'utf8'
);
const sharedBusinessAdminPageSource = readFileSync(
  resolve(here, '../../../../packages/web-core/src/features/businessAdmin/BusinessAdminPage.jsx'),
  'utf8'
);

describe('OPIS routes (issue #2052)', () => {
  it('serves sections at the origin root and redirects both old prefixes', () => {
    expect(mainSource).toContain('path="/:section/*" element={<OpisSectionRoute />}');
    expect(mainSource).toContain('OPIS_BACKOFFICE_SECTIONS.has(section)');
    expect(mainSource).toContain('path="/backoffice/*" element={<OpisCompatRedirect />}');
    expect(mainSource).toContain('path="/business-admin/*" element={<OpisCompatRedirect />}');
    expect(mainSource).toContain('search: location.search ||');
    expect(mainSource).toContain('hash: location.hash ||');
    expect(canonicalizeOpisPath('/backoffice/orders')).toBe('/orders');
    expect(canonicalizeOpisPath('/business-admin/sales')).toBe('/sales');
    expect(canonicalizeOpisPath('/backoffice/settings/team')).toBe('/settings/team');
    expect(canonicalizeOpisPath('/backoffice/overview')).toBe('/');
    expect(canonicalizeOpisPath('/business-admin/overview')).toBe('/');
    expect(canonicalizeOpisPath('/business-admin')).toBe('/');
  });

  it('renders the Back Office overview directly at / with no redirect', () => {
    expect(mainSource).toContain('path="/" element={<BusinessAdminPage />}');
    expect(mainSource).not.toContain('path="/" element={<Navigate to="/backoffice/overview"');
  });

  it('wires account actions below the POS terminal link in the Back Office sidebar', () => {
    const posTerminalIndex = sharedBusinessAdminPageSource.indexOf('aria-label="Open POS terminal"');
    const accountActionsIndex = sharedBusinessAdminPageSource.indexOf('accountActions({ sidebarCollapsed })');

    expect(posTerminalIndex).toBeGreaterThanOrEqual(0);
    expect(accountActionsIndex).toBeGreaterThan(posTerminalIndex);
    expect(businessAdminPageSource).toContain('<BusinessAdminAccountActions sidebarCollapsed={sidebarCollapsed} />');
  });

  it('resolves both dashboard and section paths at the origin root', () => {
    expect(parseBusinessAdminPath('/', '/').activeSection).toBe('overview');
    expect(parseBusinessAdminPath('/catalog', '/').activeSection).toBe('catalog');
    expect(parseBusinessAdminPath('/orders', '/').activeSection).toBe('orders');
    expect(parseBusinessAdminPath('/settings/team', '/')).toMatchObject({
      activeSection: 'settings',
      settingsSection: 'team'
    });
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
      expect(definition.route).toMatch(/^\//);
      expect(definition.route).not.toMatch(/^\/(?:business-admin|backoffice)(?:\/|$)/);
    }
  });

  it('maps modules to root-level OPIS URLs and preserves explicit alternate roots', () => {
    expect(buildBackOfficeModulePath('/', 'sales')).toBe('/sales');
    expect(buildBackOfficeModulePath('/', 'orders')).toBe('/orders');
    expect(buildBackOfficeModulePath('/', 'overview')).toBe('/');
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
    expect(sharedBusinessAdminPageSource).toContain("to={surface === 'pos' ? '/terminal' : undefined}");
    expect(sharedBusinessAdminPageSource).toContain("href={surface === 'pos' ? undefined : buildPosTerminalUrl()}");
    expect(sharedBusinessAdminPageSource).toContain(
      "href={surface === 'pos' ? undefined : buildPosTerminalUrl({ path: '/terminal', search: `?view=${encodeURIComponent('terminal_setup')}` })}"
    );
  });

  it('keeps the dirty-guard contract on the external GuardedLink mode', () => {
    expect(sharedBusinessAdminPageSource).toContain('window.location.assign(externalHref)');
    expect(sharedBusinessAdminPageSource).toContain('shouldBlockSettingsNavigation(isDirty)');
    expect(sharedBusinessAdminPageSource).toContain('onLeave?.()');
  });
});

describe('OPIS page routes', () => {
  it('resolves known pages and falls back to the dashboard', () => {
    expect(createPageUrl('Sales')).toBe('/sales');
    expect(createPageUrl('Unknown')).toBe('/');
    expect(createPageUrl('Dashboard')).toBe('/');
    expect(getPageNameFromPath('/catalog')).toBe('Items');
    expect(getPageNameFromPath('/backoffice/catalog')).toBe('Items');
    expect(getPageNameFromPath('/')).toBe('Dashboard');
    expect(getPageNameFromPath('/nope')).toBe('Dashboard');
  });
});
