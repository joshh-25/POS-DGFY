import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('OPIS Back Office migration contract', () => {
  it('keeps POS outside OPIS routing and preserves the production sales handoff', () => {
    const source = readRepoFile('apps/dgfy-pos/src/main.jsx');
    expect(source).toContain('<Route path="/sales" element={<SkupervisorSalesRedirect />} />');
    expect(source).toContain('buildSkupervisorPath');
    expect(source).not.toMatch(/backoffice|business-admin|opis/i);
  });

  it('exposes migrated merchant workspaces from the single Business Admin shell', () => {
    const source = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/MigratedBackOfficeModule.jsx');
    const businessAdmin = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/BusinessAdminPage.jsx');
    const manifest = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/businessAdminManifest.js');
    for (const key of ['catalog', 'suppliers', 'purchase-orders', 'job-orders', 'stock-movements', 'dispatch-orders', 'services', 'fnb', 'hospitality', 'sales', 'reports', 'ai-chat', 'vouchers']) {
      expect(manifest).toContain(key);
      const manifestKey = key.includes('-') ? `'${key}'` : key;
      expect(manifest).toContain(`${manifestKey}: module(`);
    }
    expect(businessAdmin).toContain('MigratedBackOfficeModule');
    expect(businessAdmin).toContain('BACKOFFICE_NAV_GROUPS');
    expect(businessAdmin).toContain('BACKOFFICE_SECTION_META');
    expect(manifest).toContain('group');
    expect(manifest).toContain('buildBackOfficeModulePath');
    expect(manifest).toContain('BACKOFFICE_SETTINGS_SECTION_MANIFEST');
  });

  it('embeds Sales Timeline in the parent Back Office shell', () => {
    const source = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/MigratedBackOfficeModule.jsx');
    expect(source).toContain("const isSales = section === 'sales';");
    expect(source).toContain("const isReports = section === 'reports';");
    expect(source).toContain('{!isCatalog && !isFnb && !isSales && !isReports ? (');
    expect(source).toContain('{isCatalog ? <Module embedded editorLabel="Item Editor" itemEditorMode /> : isFnb || isSales ? <Module embedded /> : <Module />}');
  });

  it('does not retain a POS page-url map for historical Back Office routes', () => {
    expect(fs.existsSync(path.join(repoRoot, 'apps/dgfy-pos/src/utils.js'))).toBe(false);
    const source = readRepoFile('apps/dgfy-pos/src/main.jsx');
    expect(source).not.toMatch(/backoffice|business-admin|opis/i);
  });

  it('retires the IMS merchant shell without removing platform administration', () => {
    const source = readRepoFile('apps/dgfy-ims/src/main.jsx');
    for (const [legacyRoute, backOfficeRoute] of Object.entries({
      items: 'catalog',
      suppliers: 'suppliers',
      'purchase-orders': 'purchase-orders',
      'job-orders': 'job-orders',
      'stock-movements': 'stock-movements',
      'dispatch-orders': 'dispatch-orders',
      reports: 'reports',
      'ai-chat': 'ai-chat',
      services: 'services',
      fnb: 'fnb',
      hospitality: 'hospitality',
      sales: 'sales',
      settings: 'settings'
    })) {
      expect(source).toContain(`<Route path="/${legacyRoute}" element={<LegacyMerchantRoute target="/backoffice/${backOfficeRoute}`);
    }
    expect(source).toContain('<Route path="/admin" element={<AdminLayout />}>');
    expect(source).toContain('<Route path="/receive/:token" element={<LegacyReceiveRoute />} />');
  });
});
