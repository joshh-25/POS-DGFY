import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS report breakdown frontend contract', () => {
  it('requests the backend breakdown endpoint and exposes it through the service facade', () => {
    const serviceSource = readSource('../services/posService.js');
    expect(serviceSource).toContain("api.get('/pos/reports/breakdowns'");
    expect(serviceSource).toContain('export const fetchPosReportsBreakdown');
    expect(serviceSource).toContain('fetchPosReportsBreakdown,');
  });

  it('keeps the three breakdown tabs on demand and routes their exports by section', () => {
    const workspaceSource = readSource('../components/PosReportsAnalyticsWorkspace.jsx');
    expect(workspaceSource).toContain("{ id: 'hourly', label: 'Hourly Sales'");
    expect(workspaceSource).toContain("{ id: 'item_sales', label: 'Item Sales'");
    expect(workspaceSource).toContain("{ id: 'category_sales', label: 'Sales by Category'");
    expect(workspaceSource).toContain('fetchPosReportsBreakdown({');
    expect(workspaceSource).toContain('selectedTab.breakdown');
    expect(workspaceSource).toContain('saveOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, payload, `breakdown:${activeBreakdown}`)');
    expect(workspaceSource).toContain('reportParams.sort_by = breakdownSort.sort_by;');
  });

  it('uses a versioned, scope-bound, query-bound offline envelope', () => {
    const snapshotSource = readSource('../services/offlinePosSnapshotStore.js');
    expect(snapshotSource).toContain('const REPORT_SNAPSHOT_VERSION = 2;');
    expect(snapshotSource).toContain('query_identity: reportKey');
    expect(snapshotSource).toContain('scope_identity: buildOfflinePosScopeKey(scope)');
    expect(snapshotSource).toContain('return { ...parsed, stale: true };');
  });
});
