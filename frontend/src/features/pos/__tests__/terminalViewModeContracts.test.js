import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalPagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');
const terminalWorkspaceSidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const terminalSidebarPanelPath = path.resolve(__dirname, '../components/TerminalSidebarPanel.jsx');
const terminalOperationsWorkspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const posCheckoutTerminalPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const terminalPageLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');

describe('POS terminal view-mode contracts', () => {
  let terminalPageContent = '';
  let terminalWorkspaceSidebarContent = '';
  let terminalSidebarPanelContent = '';
  let terminalOperationsWorkspaceContent = '';
  let posCheckoutTerminalContent = '';
  let terminalPageLayoutContent = '';

  beforeAll(() => {
    terminalPageContent = fs.readFileSync(terminalPagePath, 'utf8');
    terminalWorkspaceSidebarContent = fs.readFileSync(terminalWorkspaceSidebarPath, 'utf8');
    terminalSidebarPanelContent = fs.readFileSync(terminalSidebarPanelPath, 'utf8');
    terminalOperationsWorkspaceContent = fs.readFileSync(terminalOperationsWorkspacePath, 'utf8');
    posCheckoutTerminalContent = fs.readFileSync(posCheckoutTerminalPath, 'utf8');
    terminalPageLayoutContent = fs.readFileSync(terminalPageLayoutPath, 'utf8');
  });

  it('keeps explicit checkout and operations mode lists in TerminalPage', () => {
    expect(terminalPageContent).toContain("const CHECKOUT_VIEW_MODES = ['checkout', 'history', 'receipt']");
    expect(terminalPageContent).toContain("'incoming_queue'");
    expect(terminalPageContent).toContain("'location_scope'");
    expect(terminalPageContent).toContain("'shift_controls'");
  });

  it('blocks sidebar view switching while terminal is locked', () => {
    expect(terminalPageContent).toContain('if (locked) {');
    expect(terminalPageContent).toContain('setMobileNavOpen(false);');
    expect(terminalPageContent).toContain('return;');
  });

  it('enforces incoming queue access-state handling in TerminalPage', () => {
    expect(terminalPageContent).toContain("accessState: 'forbidden'");
    expect(terminalPageContent).toContain("accessState: 'allowed'");
    expect(terminalPageContent).toContain("accessState: isForbidden ? 'forbidden' : 'error'");
    expect(terminalPageContent).toContain("['incoming_queue', 'location_scope'].includes(posViewMode)");
  });

  it('fails closed when compliance gate context cannot be loaded', () => {
    expect(terminalPageContent).toContain('loadError: true');
    expect(terminalPageContent).toContain("code: 'COMPLIANCE_GATE_UNAVAILABLE'");
    expect(terminalPageContent).toContain("if (complianceGate.loadError) return 'Compliance status is unavailable. Please refresh and retry.';");
    expect(terminalPageContent).toContain("title: 'Compliance gate unavailable'");
  });

  it('keeps incoming queue and location scope sidebar items permission-aware', () => {
    expect(terminalWorkspaceSidebarContent).toContain("disabled={locked || !canViewPos}");
    expect(terminalWorkspaceSidebarContent).toContain('POS view permission required');
  });

  it('renders forbidden/error states and transact guard in incoming queue workspace', () => {
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'forbidden\'');
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'error\'');
    expect(terminalSidebarPanelContent).toContain("disabled={Boolean(actionLoading) || !canTransactPos || locked}");
    expect(terminalSidebarPanelContent).toContain('You need POS transact permission to update order statuses.');
  });

  it('keeps dedicated operations workspace content mapping for every sidebar mode', () => {
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Incoming Online Queue'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Location Scope'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Shift Controls'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Cash Drawer Event'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Close Shift'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Sales Today'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Terminal Setup Context'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'incoming_queue'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'terminal_setup'");
  });

  it('keeps receipt preview empty-state branch with history fallback action', () => {
    expect(posCheckoutTerminalContent).toContain('No receipt selected yet.');
    expect(posCheckoutTerminalContent).toContain('onClick={() => setCurrentViewMode(\'history\')}');
    expect(posCheckoutTerminalContent).toContain('Go to History');
  });

  it('keeps queue-to-receipt ownership in POSCheckoutTerminal and avoids prefetch in TerminalPage', () => {
    expect(terminalPageContent).not.toContain('fetchPosTransactionById');
    expect(
      terminalPageContent.includes('externalReceiptTransactionId={receiptRequestId}')
      || terminalPageContent.includes('receiptRequestId={receiptRequestId}')
    ).toBe(true);
    expect(posCheckoutTerminalContent).toContain('const detail = await fetchPosTransactionById(id);');
  });

  it('guards incoming queue receipt action with opening lock and lifecycle guidance copy', () => {
    expect(terminalPageContent).toContain('const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);');
    expect(terminalPageContent).toContain('if (incomingReceiptOpeningId !== null) return;');
    expect(terminalOperationsWorkspaceContent).toContain('Opening...');
    expect(terminalSidebarPanelContent).toContain('Completed or cancelled online orders move to History/Receipt Preview.');
  });

  it('supports deep-link handoff from queue cards to filtered history view', () => {
    expect(terminalPageContent).toContain('const [historyRequestQuery, setHistoryRequestQuery] = useState(\'\');');
    expect(
      terminalPageContent.includes('externalHistoryQuery={historyRequestQuery}')
      || terminalPageContent.includes('historyRequestQuery={historyRequestQuery}')
    ).toBe(true);
    expect(terminalOperationsWorkspaceContent).toContain('Open in History');
    expect(terminalSidebarPanelContent).toContain('History');
    expect(posCheckoutTerminalContent).toContain('setHistorySearch(query);');
  });

  it('persists offline checkout intents and exposes replay affordance', () => {
    expect(posCheckoutTerminalContent).toContain('const CHECKOUT_INTENT_QUEUE_KEY = \'pos_checkout_intent_queue_v1\';');
    expect(posCheckoutTerminalContent).toContain('queueCheckoutIntentLocally');
    expect(posCheckoutTerminalContent).toContain('Replay queued checkouts');
    expect(posCheckoutTerminalContent).toContain('idempotency_key');
  });

  it('surfaces compliance reason codes with per-blocker remediation links in terminal banner', () => {
    expect(terminalPageLayoutContent).toContain('Reason code: {complianceBlockerDetails.reasonCode}');
    expect(terminalPageLayoutContent).toContain('{blocker.label || blocker.code}');
    expect(terminalPageLayoutContent).toContain('Fix now');
    expect(terminalPageLayoutContent).toContain('onClick={() => navigate(blocker.action_target)}');
  });

  it('maps compliance policy checkout denials to explicit remediation guidance copy', () => {
    expect(posCheckoutTerminalContent).toContain('buildCompliancePolicyBlockerMessage');
    expect(posCheckoutTerminalContent).toContain('Compliance policy blocked checkout (');
    expect(posCheckoutTerminalContent).toContain('Resolve blocker in');
    expect(posCheckoutTerminalContent).toContain('BSP_OPS_REGISTRATION_REQUIRED');
  });
});
