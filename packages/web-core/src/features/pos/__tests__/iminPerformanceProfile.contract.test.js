import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(__dirname, '../../../..');
const repositoryRoot = path.resolve(webCoreRoot, '../..');
const posEntrySource = fs.readFileSync(
  path.join(repositoryRoot, 'apps/dgfy-pos/src/main.jsx'),
  'utf8'
);
const sharedStyles = fs.readFileSync(path.join(webCoreRoot, 'src/index.css'), 'utf8');
const catalogWorkflowSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/hooks/usePosCatalogWorkflow.js'),
  'utf8'
);
const terminalOperationsSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/TerminalOperationsWorkspace.jsx'),
  'utf8'
);
const checkoutViewSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
  'utf8'
);
const legacyCheckoutSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx'),
  'utf8'
);
const terminalLayoutSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/TerminalPageLayout.jsx'),
  'utf8'
);
const terminalSidebarSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/TerminalWorkspaceSidebar.jsx'),
  'utf8'
);
const workspaceChunksSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/terminalWorkspaceChunks.js'),
  'utf8'
);
const workspaceShellSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/TerminalWorkspaceShell.jsx'),
  'utf8'
);
const serviceCreateModalSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/PosServiceCatalogCreateModal.jsx'),
  'utf8'
);
const serviceEditModalSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/components/PosServiceCatalogEditModal.jsx'),
  'utf8'
);

describe('iMin POS performance profile contract', () => {
  it('installs one runtime profile before the POS application mounts', () => {
    const installIndex = posEntrySource.indexOf('installIminPerformanceProfile();');
    const mountIndex = posEntrySource.indexOf('const mountApp =');

    expect(installIndex).toBeGreaterThan(-1);
    expect(mountIndex).toBeGreaterThan(installIndex);
  });

  it('removes full-screen blur and paint-heavy overlay motion only under the iMin marker', () => {
    expect(sharedStyles).toContain('html.dgfy-imin-performance [data-dialog-overlay="true"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-sm"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-md"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-xl"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-2xl"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-3xl"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-[1px]"]');
    expect(sharedStyles).toContain('backdrop-filter: none !important;');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-pos-overlay-fade-in');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-float');
  });

  it('disables every continuously-looping animation on the item-save-in-flight overlay', () => {
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-shimmer');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-pulse-ring');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-spin-slow');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-spin-reverse');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="animate-ping"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .dot-1');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .dot-2');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .dot-3');
  });

  it('keeps search typing urgent while catalog requests follow the deferred query', () => {
    expect(catalogWorkflowSource).toContain('const deferredSearch = useDeferredValue(search);');
    expect(catalogWorkflowSource).toContain('buildCatalogRequestKey(deferredSearch, selectedLocationId)');
    expect(catalogWorkflowSource).toContain('buildCatalogRequestParams(deferredSearch, selectedLocationId)');
    expect(catalogWorkflowSource).toContain('const CATALOG_IMIN_SEARCH_DELAY_MS = 150;');
    expect(catalogWorkflowSource).toContain('const catalogLoadDelayMs = isIminRuntime');
    expect(catalogWorkflowSource).toContain('String(deferredSearch || \'\').trim() ? CATALOG_IMIN_SEARCH_DELAY_MS : 0');
    expect(catalogWorkflowSource).toContain('CATALOG_BROWSER_LOAD_DELAY_MS');
  });

  it('commits both operations panes immediately on iMin while retaining browser transitions', () => {
    const tabChangeBodies = [...terminalOperationsSource.matchAll(
      /const handleTabChange = useCallback\(\(nextTab\) => \{([\s\S]*?)\n\x20{2}\}, \[activeTab, clearAnimationTimers, isIminRuntime\]\);/g
    )].map((match) => match[1]);

    expect(tabChangeBodies).toHaveLength(2);
    tabChangeBodies.forEach((body) => {
      expect(body).toContain('if (isIminRuntime)');
      expect(body).toContain('setRenderedTab(nextTab);');
      const iminBranchStart = body.indexOf('if (isIminRuntime)');
      const browserBranchStart = body.indexOf('const movingForward');
      expect(iminBranchStart).toBeGreaterThan(-1);
      expect(browserBranchStart).toBeGreaterThan(iminBranchStart);
      expect(body.slice(iminBranchStart, browserBranchStart)).not.toContain('window.setTimeout');
    });
    expect(terminalOperationsSource).toContain('isIminWrapperRuntime, posToast as toast');
  });

  it('keeps POS item cards readable when disabled and removes locked-surface filter cost on iMin', () => {
    expect(checkoutViewSource).toContain("'cursor-not-allowed opacity-75'");
    expect(checkoutViewSource).not.toContain('blur-[0.5px]');
    expect(terminalLayoutSource).toContain('blur-[2px]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="blur-[2px]"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="blur-sm"]');
    expect(sharedStyles).toContain('filter: none !important;');
  });

  it('removes the remaining half-pixel disabled-card blur only under the iMin marker', () => {
    expect(legacyCheckoutSource).toContain('blur-[0.5px]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="blur-[0.5px]"]');
  });

  it('covers custom POS modal overlays through the shared iMin backdrop rule', () => {
    expect(serviceCreateModalSource).toContain('backdrop-blur-sm');
    expect(serviceEditModalSource).toContain('backdrop-blur-sm');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-sm"]');
  });

  it('keeps remaining closed-only item and service dialogs out of the eager operations chunk', () => {
    [
      'PosItemImageViewer',
      'PosServiceCatalogCreateModal',
      'PosServiceCatalogEditModal'
    ].forEach((componentName) => {
      expect(terminalOperationsSource).toContain(`const ${componentName} = lazyWithChunkRetry`);
    });
    expect(terminalOperationsSource).not.toContain("import PosItemImageViewer from './PosItemImageViewer.jsx';");
    expect(terminalOperationsSource).not.toContain("import PosServiceCatalogCreateModal from './PosServiceCatalogCreateModal.jsx';");
    expect(terminalOperationsSource).not.toContain("import PosServiceCatalogEditModal from './PosServiceCatalogEditModal.jsx';");
    expect(terminalOperationsSource).toContain('{showCreateServiceModal ? (');
    expect(terminalOperationsSource).toContain('{editingServiceItem ? (');
    expect(terminalOperationsSource).toContain('{itemImagePreview ? (');
  });

  it('defers the large operations workspace on iMin and prefetches the selected view on intent', () => {
    expect(terminalLayoutSource).toContain("import { isIminWrapperRuntime } from '../../../utils/iminRuntimeFeedback.js';");
    expect(terminalLayoutSource).toContain("const REPORT_WORKSPACE_MODES = new Set(['audit']);");
    expect(terminalLayoutSource).toContain('loadAuditWorkspacePanel().catch(() => {});');
    expect(terminalLayoutSource).toContain('const isIminRuntime = isIminWrapperRuntime();');
    expect(terminalLayoutSource).toContain('if (!isIminRuntime)');
    expect(terminalSidebarSource).toContain('onPointerDown={onPrefetch}');
  });

  it('keeps optional operations panels and modal-only dependencies out of the eager operations import graph', () => {
    [
      'PosReportsAnalyticsWorkspace',
      'PosServicesOperationsWorkspace',
      'PosFnbModifiersWorkspace',
      'PosServiceOptionsWorkspace',
      'VoucherManagementPanel',
      'PricelistManagementPanel'
    ].forEach((componentName) => {
      expect(terminalOperationsSource).toContain(`const ${componentName} = lazyWithChunkRetry`);
    });
    // The remaining optional settings panels are owned (and deferred) by the
    // settings boundary, not the operations workspace: each renders behind a
    // closed-by-default gate (payments tab / attendance editor) and loads
    // through its own lazy boundary. Rendered proof lives in their behavior
    // tests (downpaymentSettingsPanel, PosCashierAttendanceSettingsCard,
    // terminalStorefrontStatusCard).
    const settingsWorkspaceSource = fs.readFileSync(
      path.join(webCoreRoot, 'src/features/pos/settings/PosSettingsWorkspace.jsx'),
      'utf8'
    );
    const operationsAccessSource = fs.readFileSync(
      path.join(webCoreRoot, 'src/features/pos/settings/PosOperationsAccessSection.jsx'),
      'utf8'
    );
    expect(settingsWorkspaceSource).toContain('const DownpaymentSettingsPanel = lazyWithChunkRetry');
    expect(settingsWorkspaceSource).not.toContain("import DownpaymentSettingsPanel from '../components/DownpaymentSettingsPanel.jsx';");
    expect(settingsWorkspaceSource).toContain("<Suspense fallback={null}>");
    expect(operationsAccessSource).toContain('const PosCashierAttendanceSettingsCard = lazyWithChunkRetry');
    expect(operationsAccessSource).not.toContain("import PosCashierAttendanceSettingsCard from '../components/PosCashierAttendanceSettingsCard.jsx';");
    expect(operationsAccessSource).toContain("<Suspense fallback={null}>");
    // TerminalStorefrontStatusCard has no render site on mainline (its only
    // references are its own module and behavior test): pin that it stays out
    // of every eager settings/operations import graph rather than asserting a
    // lazy boundary that no render path would ever cross.
    [terminalOperationsSource, settingsWorkspaceSource, operationsAccessSource].forEach((source) => {
      expect(source).not.toContain("from '../components/TerminalStorefrontStatusCard.jsx'");
      expect(source).not.toContain('from ./TerminalStorefrontStatusCard.jsx');
    });
    expect(terminalOperationsSource).toContain('<Suspense fallback={null}>');
    expect(terminalOperationsSource).toContain('showCsvImport && canImportItems');
    expect(terminalOperationsSource).toContain('externalQrScannerOpen ? (');
  });

  it('defers the incoming order queue and warms it on Orders intent', () => {
    expect(terminalOperationsSource).toContain('const IncomingQueueWorkspace = lazyWithChunkRetry(loadIncomingQueueWorkspace);');
    expect(terminalOperationsSource).not.toContain("import { IncomingQueueWorkspace, WorkspaceShell } from './TerminalOperationsPanels.jsx';");
    expect(terminalOperationsSource).toContain("import WorkspaceShell from './TerminalWorkspaceShell.jsx';");
    expect(workspaceChunksSource).toContain("import('./TerminalOperationsPanels.jsx')");
    expect(workspaceChunksSource).toContain('module.IncomingQueueWorkspace');
    expect(workspaceShellSource).toContain('export default function WorkspaceShell');
    expect(terminalLayoutSource).toContain("import { loadIncomingQueueWorkspace } from './terminalWorkspaceChunks.js';");
    expect(terminalLayoutSource).toContain("const QUEUE_WORKSPACE_MODES = new Set(['incoming_queue']);");
    expect(terminalLayoutSource).toContain('loadIncomingQueueWorkspace()');
  });
});
