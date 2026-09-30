import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Back Office Reports presentation contract', () => {
  const reportsPage = readRepoFile('packages/web-core/src/features/merchantBackOffice/pages/ReportsPage.jsx');
  const reportsHook = readRepoFile('packages/web-core/src/hooks/useReports.js');
  const tabs = readRepoFile('packages/web-core/Components/ui/tabs.jsx');
  const businessAdminPage = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/BusinessAdminPage.jsx');
  const businessAdminService = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/businessAdminService.js');
  const businessAdminRoutes = readRepoFile('apps/dgfy-api/src/routes/businessAdmin.js');
  const migratedModule = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/MigratedBackOfficeModule.jsx');

  it('keeps Reports on one report-owned filter surface', () => {
    const filterList = businessAdminPage.match(/const showDateFilters = \[(.*?)\]\.includes\(activeSection\);/s)?.[1] || '';
    expect(filterList).not.toContain("'reports'");
    expect(reportsPage).toContain('business-admin-reports-page');
    expect(reportsPage).toContain('Reports &amp; analytics');
    expect(reportsPage).toContain('Choose period and scope');
    expect(reportsPage).toContain('id="report-date-from"');
    expect(reportsPage).toContain('id="report-date-to"');
    expect(reportsPage).toContain('id="report-location"');
  });

  it('keeps the migrated Reports surface and removes only the confirmed dead legacy client flow', () => {
    expect(businessAdminPage).not.toContain('function ReportsWorkspace');
    expect(businessAdminPage).not.toContain('handleReportExport');
    expect(businessAdminPage).not.toContain('activeSection === \'activity\'');
    expect(businessAdminService).not.toContain('activity:');
    expect(businessAdminService).not.toContain('reports:');
    expect(businessAdminService).not.toContain('reportDefinitions:');
    expect(businessAdminService).not.toContain('inventoryStock:');
    expect(businessAdminService).not.toContain('exportReport:');
    expect(businessAdminPage).toContain("businessAdminApi.reportDataset('low_stock'");
    expect(businessAdminService).toContain('reportDataset:');
    expect(businessAdminRoutes).toContain("router.get('/activity'");
    expect(businessAdminRoutes).toContain("router.get('/reports'");
    expect(businessAdminRoutes).toContain("router.get('/reports/definitions'");
    expect(businessAdminRoutes).toContain("router.get('/inventory/stock'");
  });

  it('keeps the report tabs horizontally scrollable and prevents unsupported actions', () => {
    expect(reportsPage).toContain('flex-nowrap');
    expect(reportsPage).toContain('overflow-x-auto');
    expect(reportsPage).toContain('business-admin-reports-tab');
    expect(reportsPage.indexOf('<TabsTrigger value="summary"')).toBeLessThan(
      reportsPage.indexOf('<TabsTrigger value="expiry"')
    );
    expect(reportsPage).toContain('Reset filters');
    expect(reportsPage).toContain("const TENANT_WIDE_REPORT_TABS = new Set(['cost', 'tenant-revenue']);");
    expect(reportsPage).toContain('Read-only view');
    expect(reportsPage).not.toContain('fetchSnapshots(typeMap[activeTab])');
    expect(reportsPage).not.toContain('exportCSV(typeMap[activeTab], dateFilters)');
  });

  it('removes the duplicate workspace banner from Reports only', () => {
    expect(migratedModule).toContain("const isReports = section === 'reports';");
    expect(migratedModule).toContain('{!isCatalog && !isFnb && !isSales && !isReports ? (');
  });

  it('keeps the Reports shell mounted while a legacy report refreshes', () => {
    expect(reportsPage).toContain('function ReportPanelStatus');
    expect(reportsPage).toContain('Updating {label}…');
    expect(reportsPage).toContain('business-admin-report-panel-state');
    expect(reportsPage).not.toContain('if (activeReportType && loading && !expiryReport');
    expect(reportsPage).not.toContain('if (activeReportType && error)');

    const reportPanels = [
      ['expiry', 'expiryReport', 'expiry risk'],
      ['aging', 'stockAgingReport', 'stock aging'],
      ['production', 'productionReport', 'production'],
      ['procurement', 'poAnalysisReport', 'purchasing'],
      ['summary', 'executiveSummary', 'overview']
    ];

    for (const [tab, reportState, label] of reportPanels) {
      expect(reportsPage).toContain(`<TabsContent value="${tab}" forceMount>`);
      expect(reportsPage).toContain(
        `<ReportPanelStatus label="${label}" loading={loading} error={error} hasData={Boolean(${reportState})} />`
      );
      expect(reportsPage).toContain(`{${reportState} ? (`);
    }
  });

  it('keeps report tab state visible and guards rapid report changes', () => {
    expect(tabs).toContain("data-state={isSelected ? 'active' : 'inactive'}");
    expect(tabs).toContain('forceMount = false');
    expect(tabs).toContain('hidden={!isSelected}');

    for (const tab of ['expiry', 'aging', 'production', 'procurement', 'summary']) {
      expect(reportsPage).toContain(`<TabsContent value="${tab}" forceMount>`);
    }

    expect(reportsHook).toContain('const reportRequestRef = useRef(0);');
    expect(reportsHook).toContain('reportRequestRef.current === requestId');
    expect(reportsHook).toContain('if (reportRequestRef.current === requestId) setLoading(false);');
  });

  it('keeps fiscal Z-reading identity, amount, and generated time visible', () => {
    expect(businessAdminPage).toContain('Z readings & eSales');
    expect(businessAdminPage).toContain("label: 'Generated'");
    expect(businessAdminPage).toContain("label: 'Z total'");
    expect(businessAdminPage).toContain('row.summary?.total_amount');
    expect(businessAdminPage).toContain("timeZone: 'Asia/Manila'");
    expect(businessAdminPage).not.toContain("dynamicColumns([...(data?.z_readings || []), ...(data?.esales_reports || [])]");
  });
});
