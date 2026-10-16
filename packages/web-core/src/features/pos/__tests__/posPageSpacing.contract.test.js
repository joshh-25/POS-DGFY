import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readPosFile = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const spacingSource = readPosFile('components/PosPageSpacing.js');
const pageFrameSource = readPosFile('components/PosPageFrame.jsx');
const terminalLayoutSource = readPosFile('components/TerminalPageLayout.jsx');
const operationsWorkspaceSource = readPosFile('components/TerminalOperationsWorkspace.jsx');
const lineTabNavigationSource = readPosFile('components/PosLineTabNavigation.jsx');
const historySource = readPosFile('components/POSTransactionHistoryPanel.jsx');
const reportsSource = readPosFile('components/PosReportsAnalyticsWorkspace.jsx');
const settingsSource = readPosFile('settings/PosSettingsWorkspace.jsx');
const affiliateSecondaryNavSource = readPosFile('affiliates/AffiliateSecondaryNav.jsx');
const affiliateListSource = readPosFile('affiliates/AffiliateListView.jsx');
const affiliateCashoutSource = readPosFile('affiliates/AffiliateCashoutView.jsx');
const affiliateStatCardSource = readPosFile('affiliates/AffiliateStatCard.jsx');
const affiliateStatusSource = readPosFile('affiliates/AffiliateStatusBadge.jsx');
const affiliatePendingInvitesSource = readPosFile('affiliates/AffiliatePendingInvites.jsx');
const affiliateSettingsSource = readPosFile('affiliates/AffiliateSettingsView.jsx');
const affiliateFilterSource = readPosFile('affiliates/AffiliateFilterPopover.jsx');
const affiliatePriceRulePreviewSource = readPosFile('affiliates/AffiliatePriceRulePreview.jsx');
const affiliateInviteDialogSource = readPosFile('affiliates/AffiliateInviteDialog.jsx');
const affiliateWorkspaceCss = fs.readFileSync(path.resolve(__dirname, '../affiliates/affiliateWorkspace.css'), 'utf8');
const pageScrollCss = fs.readFileSync(path.resolve(__dirname, '../../..', 'index.css'), 'utf8');

describe('POS mobile page spacing contract', () => {
  it('keeps Shift top spacing aligned with the shared page frame on desktop and mobile', () => {
    const primaryShiftTabCall = operationsWorkspaceSource.match(/<PosLineTabNavigation([\s\S]*?)\/>/)?.[1] || '';
    expect(spacingSource).toContain("export const POS_PAGE_FRAME_CLASS = 'px-4 py-4 sm:px-6 sm:py-4';");
    expect(spacingSource).toContain("export const POS_MOBILE_STICKY_TAB_ROW_CLASS = 'max-[767px]:sticky max-[767px]:top-0 max-[767px]:z-30 max-[767px]:-mt-4 max-[767px]:w-full max-[767px]:bg-white max-[767px]:pt-4';");
    expect(operationsWorkspaceSource).toContain('page="shift"');
    expect(operationsWorkspaceSource).toContain('data-testid="pos-shift-sticky-tabs"');
    expect(operationsWorkspaceSource).toContain('className={`min-w-0 ${POS_MOBILE_STICKY_TAB_ROW_CLASS}`}');
    expect(operationsWorkspaceSource).toContain('className={`${POS_PAGE_CONTENT_STACK_CLASS} sm:gap-6`}');
    expect(primaryShiftTabCall).toContain('mobileGridColumns={2}');
    expect(lineTabNavigationSource).toContain("2: 'grid-cols-2'");
    expect(lineTabNavigationSource).toContain('const mobileGridClass = MOBILE_GRID_CLASSES[mobileGridColumns] ||');
    expect(terminalLayoutSource).toContain('SHIFT_WORKSPACE_MODES.has(posViewMode)');
  });

  it('keeps the primary page roots on one shared spacing contract', () => {
    expect(spacingSource).toContain("export const POS_PAGE_FRAME_CLASS = 'px-4 py-4 sm:px-6 sm:py-4';");
    expect(spacingSource).not.toContain('POS_PAGE_COMPACT_FRAME_CLASS');
    expect(reportsSource).toContain('page="reports"');
    expect(settingsSource).not.toContain('spacing="compact"');
    expect(settingsSource).toContain('className="max-[767px]:overflow-x-clip"');
    expect(settingsSource).not.toContain('sm:px-3');
    expect(spacingSource).not.toContain('POS_PAGE_MOBILE_GUTTER_CLASS');
    expect(spacingSource).not.toContain('POS_PAGE_CLASS');
    expect(pageFrameSource).toContain('data-pos-page-frame={page || undefined}');
    expect(historySource).toContain('<PosPageFrame page="history"');
    expect(reportsSource).toContain('<PosPageFrame id={sectionId} page="reports" className="max-[767px]:overflow-x-clip">');
    expect(settingsSource).toMatch(/<PosPageFrame\s+id=\{sectionId\}\s+page="settings"/);
    expect(operationsWorkspaceSource).toContain('<PosPageFrame\n      id={sectionId}\n      page="shift"\n      className="max-[767px]:overflow-x-clip"');
    expect(terminalLayoutSource).toContain('const STANDARD_POS_PAGE_FRAME_MODES = new Set([');
    expect(terminalLayoutSource).toContain('SHIFT_WORKSPACE_MODES.has(posViewMode)');
    expect(terminalLayoutSource).toContain("usesStandardPosPageFrame ? 'p-0' : 'p-2'");
    expect(operationsWorkspaceSource).toContain("const workspaceShellClassName = usesOwnPageFrame\n    ? isAffiliateManagementView\n      ? 'flex min-h-0 flex-1 flex-col px-5 pb-0 pt-2 pos-affiliates-workspace-shell'\n      : 'p-0'");
    expect(terminalLayoutSource).toContain("const isAffiliateWorkspace = isOperationsWorkspaceMode && posViewMode === 'settings_affiliates';");
    expect(terminalLayoutSource).toContain("? ' pos-affiliates-workspace-content'");
    expect(terminalLayoutSource).toContain("settings_affiliates: 'Affiliates'");
    expect(affiliateSecondaryNavSource).toContain('className="pos-affiliates-tab-strip -mx-1 overflow-x-auto"');
    expect(affiliateSecondaryNavSource).toContain('className="pos-affiliates-tab-list flex min-w-max items-end gap-3 px-1 min-[1200px]:min-w-0 min-[1200px]:w-full min-[1200px]:gap-0 min-[1200px]:px-0"');
    expect(affiliateSecondaryNavSource).toContain('pos-affiliates-tab relative inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-[14px]');
    expect(affiliateSecondaryNavSource).toContain("import { SlidersHorizontal, UsersRound, WalletCards } from 'lucide-react';");
    expect(affiliateSecondaryNavSource).toContain("{ id: 'list', label: 'Affiliates List', icon: UsersRound }");
    expect(affiliateSecondaryNavSource).toContain("{ id: 'cashout', label: 'Cashout', icon: WalletCards }");
    expect(operationsWorkspaceSource).toContain('const usesOwnPageFrame = isSettingsView\n    || effectiveViewMode === \'reports\'\n    || SHIFT_WORKSPACE_MODES.has(effectiveViewMode);');
    expect(operationsWorkspaceSource).toContain('className={workspaceShellClassName}');
  });

  it('uses the same major-section gap in History without changing row density', () => {
    expect(spacingSource).toContain("export const POS_MOBILE_PAGE_STACK_CLASS = 'flex flex-col gap-4';");
    expect(historySource).toContain('POS_MOBILE_PAGE_STACK_CLASS');
    expect(historySource).not.toContain('POS_PAGE_MOBILE_GUTTER_CLASS');
    expect(historySource).toContain('flex-row w-full px-0 py-0');
    expect(historySource).toContain('overscroll-contain touch-pan-y');
    expect(settingsSource).toContain('className="min-w-0"');
  });

  it('removes the shell scrollbar gutter only from Reports and Settings', () => {
    const hiddenScrollbarModes = terminalLayoutSource.match(
      /const REPORTS_SETTINGS_SCROLLBAR_HIDDEN_MODES = new Set\(\[([\s\S]*?)\]\);/
    )?.[1] || '';

    expect(hiddenScrollbarModes).toContain("'reports'");
    expect(hiddenScrollbarModes).toContain("'settings_profile'");
    expect(hiddenScrollbarModes).toContain("'settings_pos'");
    expect(hiddenScrollbarModes).toContain("'settings_storefront'");
    expect(hiddenScrollbarModes).not.toContain("'history'");
    expect(terminalLayoutSource).toContain('const hidesWorkspaceScrollbar = usesStandardPosPageFrame');
    expect(terminalLayoutSource).toContain("? 'dgfy-pos-scrollbar-hidden' : ''}");
    expect(pageScrollCss).toMatch(/\.dgfy-pos-scroll-region\.dgfy-pos-scrollbar-hidden\s*\{[^}]*scrollbar-gutter:\s*auto;/s);
    expect(pageScrollCss).toMatch(/\.dgfy-pos-scroll-region\.dgfy-pos-scrollbar-hidden\s*\{[^}]*scrollbar-width:\s*none;/s);
  });

  it('keeps affiliate tables fixed to the available workspace width', () => {
    expect(affiliateListSource).toContain('affiliate-list-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1 touch-pan-y');
    expect(affiliateListSource).toContain('<div className="flex min-w-0 shrink-0 flex-col gap-0">');
    expect(affiliateListSource).toContain('<PosTableSurface className="flex min-w-0 shrink-0 flex-col">');
    expect(affiliateListSource).toContain('data-testid="affiliate-table-region"');
    expect(affiliateListSource).toContain('affiliate-table-region min-w-0');
    expect(affiliateListSource).not.toContain('affiliate-table-scroll-region');
    expect(affiliateListSource).toContain('sticky top-0 z-10');
    expect(affiliateListSource).toContain('overflow-x-hidden overflow-y-auto');
    expect(affiliateListSource).toContain('w-full min-w-0 table-fixed');
    expect(affiliateListSource).not.toContain('min-w-[1280px]');
    expect(affiliateListSource).toContain("'pos-affiliates-data-column pos-affiliates-identity-column',\n    'pos-affiliates-data-column pos-affiliates-status-column',\n    'pos-affiliates-data-column pos-affiliates-rate-column',\n    'pos-affiliates-data-column pos-affiliates-amount-column',\n    'pos-affiliates-data-column pos-affiliates-amount-column',\n    'pos-affiliates-data-column pos-affiliates-amount-column',\n    'pos-affiliates-data-column pos-affiliates-joined-column',\n    'pos-affiliates-actions-column'");
    expect(affiliateListSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Rate</th>');
    expect(affiliateListSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Sales (₱)</th>');
    expect(affiliateListSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Earned (₱)</th>');
    expect(affiliateListSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Unpaid (₱)</th>');
    expect(affiliateListSource).toContain("const AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-center");
    expect(affiliateListSource).toContain("const AFFILIATE_TABLE_ACTION_CELL_CLASS = 'px-2.5 py-2 text-center");
    expect(affiliateListSource).toContain('<th className={AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS}>Actions</th>');
    expect(affiliateListSource).toContain('<td className={AFFILIATE_TABLE_ACTION_CELL_CLASS}>');
    expect(affiliateListSource).toContain('<div className="flex w-full items-center justify-center">');
    expect(affiliateListSource).not.toContain('affiliate-list-table-separator');
    expect(affiliatePendingInvitesSource).toContain('data-testid="affiliate-pending-invites-heading"');
    expect(affiliatePendingInvitesSource).toContain('className="affiliate-pending-invites-heading flex min-w-0 items-center justify-between gap-4 border-t border-slate-200 px-2 py-4 sm:px-4 sm:py-5"');
    expect(affiliatePendingInvitesSource).toContain('className="text-base font-black leading-tight text-[#0F172A] sm:text-lg"');
    expect(affiliatePendingInvitesSource).toContain('className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-amber-700"');
    expect(affiliatePendingInvitesSource).toContain('data-testid="affiliate-pending-invites-region" className="affiliate-pending-invites-region min-w-0 overflow-x-hidden"');
    expect(affiliatePendingInvitesSource).not.toContain('affiliate-pending-invites-scroll-region');
    expect(affiliatePendingInvitesSource).toContain("className={`${POS_TABLE_SURFACE_CLASS} ${compact ? 'p-2' : 'p-0'}`}");
    expect(affiliatePendingInvitesSource).toContain('aria-label="Pending affiliate invites table"');
    expect(affiliatePendingInvitesSource).toContain('pos-affiliates-data-table pos-affiliates-pending-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]');
    expect(affiliatePendingInvitesSource).toContain('POS_TABLE_HEADER_CLASS');
    expect(affiliatePendingInvitesSource).toContain('POS_TABLE_ROW_CLASS');
    expect(affiliatePendingInvitesSource).toContain('className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-amber-700"');
    expect(affiliatePendingInvitesSource).toContain("<span>{invites.length} pending {invites.length === 1 ? 'invite' : 'invites'}</span>");
    expect(affiliatePendingInvitesSource).not.toContain('rounded-lg border border-amber-200 bg-amber-50');
    expect(affiliatePendingInvitesSource).toContain("'pos-affiliates-data-column pos-affiliates-identity-column',");
    expect(affiliatePendingInvitesSource).toContain("'pos-affiliates-actions-column'");
    expect(affiliatePendingInvitesSource).toContain('<th scope="col"');
    expect(affiliatePendingInvitesSource).toContain('>Date invited</th>');
    expect(affiliatePendingInvitesSource).not.toContain('>Status</th>');
    expect(affiliatePendingInvitesSource).not.toContain('>Invite ID</th>');
    expect(affiliatePendingInvitesSource).toContain('aria-label={`Cancel invite ${invite.email || \'without email\'}`}');
    expect(affiliatePendingInvitesSource).toContain('PosTableActionButton');
    expect(affiliatePendingInvitesSource).toContain('tone="danger"');
    expect(affiliatePendingInvitesSource).toContain('affiliate-pending-invites-pagination');
    expect(affiliatePendingInvitesSource).toContain('visibleInvites.map');
    expect(affiliateWorkspaceCss).toContain('.affiliate-table-region,');
    expect(affiliateWorkspaceCss).toContain('.affiliate-cashout-table-region,');
    expect(affiliateWorkspaceCss).toContain('.affiliate-pending-invites-region {');
    expect(affiliateWorkspaceCss).not.toContain('.affiliate-table-scroll-region');
    expect(affiliateWorkspaceCss).not.toContain('max-height: 27rem;');
    expect(affiliateWorkspaceCss).not.toContain('.affiliate-pending-invites-scroll-region');
    expect(affiliateWorkspaceCss).not.toContain('max-height: 12.5rem;');
    expect(affiliateWorkspaceCss).toContain('overflow-x: hidden;');
    expect(affiliateWorkspaceCss).toContain('overscroll-behavior-y: auto !important;');
    expect(affiliateCashoutSource).toContain('affiliate-cashout-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 touch-pan-y');
    expect(affiliateCashoutSource).toContain('data-testid="affiliate-cashout-table-region"');
    expect(affiliateCashoutSource).not.toContain('dgfy-pos-scroll-region min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(affiliateCashoutSource).toContain('w-full min-w-0 table-fixed');
    expect(affiliateCashoutSource).not.toContain('min-w-[1120px]');
    expect(affiliateCashoutSource).toContain("'pos-affiliates-data-column',\n    'pos-affiliates-data-column',\n    'pos-affiliates-data-column',\n    'pos-affiliates-data-column',\n    'pos-affiliates-data-column',\n    'pos-affiliates-data-column',\n    'pos-affiliates-actions-column'");
    expect(affiliateCashoutSource).toContain('pos-affiliates-data-table pos-affiliates-cashout-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]');
    expect(affiliateCashoutSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Amount (₱)</th>');
    expect(affiliateCashoutSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Available (₱)</th>');
    expect(affiliateCashoutSource).toContain('<th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Date</th>');
    expect(affiliateCashoutSource).toContain("const AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-center");
    expect(affiliateCashoutSource).toContain("const AFFILIATE_TABLE_ACTION_CELL_CLASS = 'px-2.5 py-2 text-center");
    expect(affiliateCashoutSource).toContain('<th className={AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS}>Actions</th>');
    expect(affiliateCashoutSource).toContain('<td className={AFFILIATE_TABLE_ACTION_CELL_CLASS}>');
    expect(affiliateCashoutSource).toContain('<div className="flex w-full items-center justify-center">');
  });

  it('keeps Affiliate filters content-sized while matching History controls', () => {
    expect(affiliateFilterSource).toContain('contentSized');
    expect(affiliateFilterSource).toContain('className="pos-filter-surface affiliate-filter-surface"');
    expect(affiliateFilterSource).toContain('pos-filter-surface-body affiliate-filter-dialog-body min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(affiliateFilterSource).not.toContain('dgfy-pos-history-filter-surface');
    expect(affiliateFilterSource).not.toContain('min-w-0 flex-1 overflow-x-hidden overflow-y-auto');
    expect(affiliateFilterSource).toContain("${mobileOnly ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2.5'} affiliate-filter-dialog-footer");
    expect(affiliateFilterSource).toContain("leftButtonClassName={mobileOnly ? 'h-9' : 'h-10'}");
    expect(affiliateFilterSource).toContain("applyButtonClassName={mobileOnly ? 'h-9' : 'h-10'}");
    expect(affiliateFilterSource).toContain('const dialogMaxWidth = 464;');
    expect(affiliateFilterSource).toContain('const dialogWidth = Math.min(dialogMaxWidth, Math.max(0, window.innerWidth - (viewportPadding * 2)));');
    expect(affiliateFilterSource).toContain('compact={!mobileOnly}');
    expect(affiliateWorkspaceCss).toContain('.affiliate-filter-surface');
    expect(affiliateWorkspaceCss).toContain('.affiliate-filter-dialog-body');
  });

  it('keeps each Affiliate table paginated beneath its own non-scrolling surface', () => {
    expect(affiliateListSource).toContain('className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden"');
    expect(affiliateListSource).toContain('data-testid="affiliate-list-scroll-region"');
    expect(affiliateListSource).toContain('affiliate-list-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1 touch-pan-y');
    const paginationIndex = affiliateListSource.indexOf('<GlobalPagination');
    const tableSurfaceEndIndex = affiliateListSource.indexOf('</PosTableSurface>');

    expect(paginationIndex).toBeGreaterThanOrEqual(0);
    expect(tableSurfaceEndIndex).toBeGreaterThanOrEqual(0);
    expect(tableSurfaceEndIndex).toBeLessThan(paginationIndex);
    expect(affiliateListSource).toContain('className={POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS}');
    expect(affiliateCashoutSource).toContain('<GlobalPagination');
    expect(affiliateCashoutSource).toContain('className={POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS}');
    expect(affiliatePendingInvitesSource).toContain('<GlobalPagination');
    expect(affiliatePendingInvitesSource).toContain('className={POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS}');
  });

  it('lets Affiliate Settings use the full workspace width', () => {
    expect(affiliateSettingsSource).toContain('affiliate-settings-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1');
    expect(affiliateSettingsSource).toContain('className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5"');
    expect(affiliateSettingsSource).toContain('className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"');
    expect(affiliateSettingsSource).toContain('setPreviewBasePricePesos(\'100\')');
    expect(affiliateSettingsSource).toContain('const AFFILIATE_SETTINGS_ACTION_BUTTON_CLASS =');
    expect(affiliateSettingsSource).not.toContain('xl:grid-cols-[');
    expect(affiliateSettingsSource).toContain('Program Settings');
    expect(affiliateSettingsSource).toContain('Selling Price');
  });

  it('reuses the Reports KPI design for Affiliate summaries', () => {
    expect(affiliateStatCardSource).toContain("import { PosReportsKpiCard } from '../components/PosReportsKpiCards.jsx';");
    expect(affiliateStatCardSource).toContain('<PosReportsKpiCard');
    expect(affiliateStatCardSource).not.toContain('footer=');
    expect(affiliateStatCardSource).toContain('REPORT_ACCENTS_BY_AFFILIATE_TONE');
    expect(affiliateListSource).toContain('grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-4');
    expect(affiliateCashoutSource).toContain('grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-5 affiliate-kpi-strip affiliate-cashout-kpi-strip');
    expect(affiliateCashoutSource).toContain('affiliate-cashout-requests-kpi');
    expect(affiliateWorkspaceCss).toContain('.affiliate-cashout-kpi-strip > .affiliate-cashout-requests-kpi {\n    grid-column: 1 / -1;\n  }');
    expect(affiliateWorkspaceCss).toContain('@media screen and (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
    expect(affiliateWorkspaceCss).toContain('.affiliate-cashout-kpi-strip > .affiliate-cashout-requests-kpi {');
    expect(affiliateWorkspaceCss).toContain('grid-column: 1 / -1;');
    expect(affiliateWorkspaceCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(affiliateWorkspaceCss).toContain('overflow: visible;');
    expect(affiliateWorkspaceCss).toContain('touch-action: auto;');
    expect(affiliateWorkspaceCss).not.toContain('scroll-snap-type: x mandatory;');
    expect(affiliateListSource).not.toContain("label: 'Cashout requests'");
    expect(affiliateCashoutSource).toContain("label: 'Cashout requests'");
    expect(affiliateListSource).not.toContain('grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2');
    expect(affiliateCashoutSource).not.toContain('grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2');
    expect(affiliateStatCardSource).toContain('valueClassName="affiliate-kpi-value"');
    expect(affiliateWorkspaceCss).toContain('.affiliate-kpi-strip .affiliate-kpi-value {');
    expect(affiliateWorkspaceCss).toContain('overflow-wrap: anywhere;');
    expect(affiliateWorkspaceCss).toContain('white-space: normal;');
  });

  it('places Affiliate KPIs above the search toolbar like Reports', () => {
    const listKpiIndex = affiliateListSource.indexOf('grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-4');
    const listSearchIndex = affiliateListSource.indexOf('id="affiliate-list-search"');
    const cashoutKpiIndex = affiliateCashoutSource.indexOf('grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-5');
    const cashoutSearchIndex = affiliateCashoutSource.indexOf('id="affiliate-cashout-search"');

    expect(listKpiIndex).toBeGreaterThanOrEqual(0);
    expect(listSearchIndex).toBeGreaterThanOrEqual(0);
    expect(cashoutKpiIndex).toBeGreaterThanOrEqual(0);
    expect(cashoutSearchIndex).toBeGreaterThanOrEqual(0);
    expect(listKpiIndex).toBeLessThan(listSearchIndex);
    expect(cashoutKpiIndex).toBeLessThan(cashoutSearchIndex);
  });

  it('keeps Affiliate Settings as one aligned responsive surface', () => {
    expect(affiliateSettingsSource).toContain('Affiliate Settings');
    expect(affiliateSettingsSource).toContain('Configure commission rules, payout thresholds, and affiliate pricing.');
    expect(affiliateSettingsSource).toContain('Allow self-serve enrollment');
    expect(affiliateSettingsSource).toContain('Program status');
    expect(affiliateSettingsSource).toContain('Estimated transaction breakdown');
    expect(affiliateSettingsSource).toContain('Live preview');
    expect(affiliateSettingsSource).toContain('Changes apply immediately to active affiliate links.');
    expect(affiliateSettingsSource).toContain('onSaveAllSettings');
    expect(affiliateSettingsSource).toContain('bg-[#1b4e8d] focus-visible:ring-[#1b4e8d]');
    expect(affiliateSettingsSource).not.toContain('Save Selling Price');
    expect(affiliatePriceRulePreviewSource).toContain("'affiliate-settings-preview grid grid-cols-3 divide-x divide-slate-200 divide-y-0'");
  });

  it('keeps affiliate enrollment content out of Settings', () => {
    expect(affiliateSettingsSource).not.toContain('Review enrolled affiliates and their current status.');
    expect(affiliateSettingsSource).not.toContain('Search affiliates in settings');
    expect(affiliateSettingsSource).not.toContain('<AffiliatePendingInvites');
    expect(affiliateSettingsSource).not.toContain('Edit Affiliates');
    expect(affiliateListSource).toContain("import AffiliatePendingInvites from './AffiliatePendingInvites.jsx';");
    expect(affiliateListSource).toContain('<AffiliatePendingInvites');
  });

  it('keeps Affiliate List typography aligned with the Reports table scale', () => {
    expect(affiliateListSource).toContain('className="pos-affiliates-data-table pos-affiliates-list-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]"');
    expect(affiliateCashoutSource).toContain('className="pos-affiliates-data-table pos-affiliates-cashout-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]"');
    expect(affiliateListSource).toContain('text-sm text-slate-500 max-[767px]:text-[13px]');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-data-table {\n  font-size: 13px;\n}');
    expect(affiliateWorkspaceCss).toContain('--pos-affiliates-actions-column-width: 6rem;');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-data-table col.pos-affiliates-actions-column {');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-data-table col.pos-affiliates-identity-column {');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-data-table > thead > tr > th {\n    font-size: 0.6875rem;');
    expect(affiliateListSource).toContain('pos-affiliates-status-cell whitespace-nowrap');
    expect(affiliateWorkspaceCss).toContain('@media screen and (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-list-table col.pos-affiliates-status-column {\n    width: 14%;');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-list-table col.pos-affiliates-rate-column {\n    width: 9%;');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-list-table col.pos-affiliates-amount-column {\n    width: 12%;');
    expect(affiliateWorkspaceCss).toContain('.pos-affiliates-list-table .pos-affiliates-status-cell > span {');
    expect(affiliateWorkspaceCss).toContain('text-overflow: ellipsis;');
  });

  it('uses icon-and-text status indicators instead of Affiliate pills', () => {
    expect(affiliateStatusSource).toContain('CheckCircle2');
    expect(affiliateStatusSource).toContain('statusTextClass');
    expect(affiliateStatusSource).not.toContain('rounded-full');
    expect(affiliateListSource).toContain('className="affiliate-actions-audit rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"');
    expect(affiliateListSource).toContain('className="text-[12px] font-bold text-[#0F172A]">Latest status-audit</p>');
    expect(affiliateListSource).toContain('className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]"');
    expect(affiliateListSource).toContain('className="min-w-0 justify-self-end break-words text-right font-medium text-[#0F172A]"');
    expect(affiliateListSource).toContain('UserRoundPlus');
    expect(affiliateListSource).toContain('<UserRoundPlus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Invite Affiliate');
    expect(affiliateListSource).toContain('<UserRoundPlus aria-hidden="true" />');
    expect(affiliateListSource).not.toContain('    Plus,');
    expect(affiliatePendingInvitesSource).toContain('icon={Trash2}');
    expect(affiliatePendingInvitesSource).not.toContain('AffiliateStatusBadge');
    expect(affiliatePendingInvitesSource).not.toContain('rounded-full');
    expect(affiliateSettingsSource).toContain('<Store aria-hidden="true" className="h-3.5 w-3.5" />');
    expect(affiliateSettingsSource).not.toContain('Tenant Default</span>');
    expect(affiliateFilterSource).not.toContain('rounded-full bg-white/20');
  });

  it('keeps the Affiliate actions dialog compact without removing its controls', () => {
    expect(affiliateListSource).toContain('max-w-lg');
    expect(affiliateListSource).not.toContain('max-w-2xl');
    expect(affiliateListSource).toContain('affiliate-actions-header border-b border-slate-100 px-3 py-2.5 text-left sm:px-5 sm:py-3');
    expect(affiliateListSource).toContain('affiliate-actions-body px-3 py-3 sm:px-5 sm:py-6');
    expect(affiliateListSource).toContain('aria-label="Affiliate controls"');
    expect(affiliateListSource).toContain('h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-[#1b4e8d] sm:h-10 sm:w-10 sm:rounded-xl');
    expect(affiliateListSource).not.toContain('>Affiliate controls</h3>');
    expect(affiliateListSource).not.toContain('Manage sharing, status, and affiliate-specific pricing.');
    expect(affiliateListSource).toContain('Save rate');
    expect(affiliateListSource).toContain('Share Link');
    expect(affiliateListSource).toContain('Suspend');
    expect(affiliateListSource).toContain('Revoke');
    expect(affiliateListSource).toContain('Set price override');
    expect(affiliateListSource).toContain('className="affiliate-actions-action-area mt-3 -mx-2.5 border-t border-slate-200 px-2.5 pt-3 sm:mt-4 sm:-mx-4 sm:px-4 sm:pt-4">');
    expect(affiliateListSource).toContain('className="grid grid-cols-2 gap-1.5 sm:gap-2">');
    expect(affiliateListSource).toContain('{!isActive && (');
    expect(affiliateListSource).toContain('sm:col-span-2');
    expect(affiliateListSource).toContain('Share link becomes available after this affiliate is active.');
    expect(affiliateListSource).toContain("${status === 'suspended' ? 'col-span-2 sm:col-span-2' : ''}");
    expect(affiliateListSource).toContain("const AFFILIATE_ACTION_BUTTON_CLASS = 'h-10 min-w-0 w-full justify-center rounded-lg px-2 text-[11px] font-bold';");
    expect(affiliateListSource).toContain('<Percent aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 sm:h-4 sm:w-4" />');
    expect(affiliateListSource).not.toContain('<span className="shrink-0">%</span>');
    expect(affiliateListSource).toContain('className="h-10 min-w-0 bg-white pr-8 text-xs"');
    expect(affiliateListSource).toContain('pointer-events-none absolute inset-y-2 right-3 flex items-center border-l border-slate-200 pl-2 text-xs font-bold text-slate-400');
    expect(affiliateListSource).toContain('<span className="font-bold text-[#334155]">{affiliateDisplayName(activeAffiliate)}</span>');
    expect(affiliateListSource).toContain("const AFFILIATE_PRIMARY_BUTTON_CLASS = 'h-10 min-w-0 w-full shrink-0 justify-center rounded-lg bg-[#1b4e8d] px-2 text-[11px] font-bold text-white hover:bg-[#143f73] focus-visible:ring-[#1b4e8d] sm:w-[9.5rem]';");
    expect(affiliateListSource).toContain('className="affiliate-actions-rate-row mt-2 flex min-w-0 flex-row items-center gap-1.5 sm:mt-3 sm:gap-2">');
    expect(affiliateListSource).toContain('variant="affiliate-actions"');
    expect(affiliateListSource).toContain('aria-labelledby="affiliate-pricing-heading"');
    expect(affiliateListSource).toContain('className="affiliate-actions-rule-value min-w-0 flex-1 sm:w-24 sm:flex-none"');
    expect(affiliateListSource).toContain('className="relative affiliate-actions-select"');
    expect(affiliateListSource).toContain('className="affiliate-actions-select-content"');
    expect(affiliateListSource).toContain('<SelectTrigger className="h-10 min-w-0 bg-white text-xs"><SelectValue className="min-w-0 flex-1 truncate whitespace-nowrap text-left" /></SelectTrigger>');
    expect(affiliateListSource).toContain('className="whitespace-nowrap text-xs">{PRICE_RULE_TYPE_LABELS[type]}</SelectItem>');
    expect(affiliateListSource).toContain('className="affiliate-actions-dialog max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)]');
    expect(affiliateListSource).toContain('className="sr-only"');
    expect(affiliateListSource).toContain('id="affiliate-pricing-value"');
    expect(affiliateListSource).toContain("className={RATE_BASED_RULE_TYPES.has(ruleDraft.rule_type) ? 'h-10 bg-white pr-8 text-xs' : 'h-10 bg-white pl-10 text-xs'}");
    expect(affiliateListSource).toContain("? 'Percentage' : 'Amount (PHP)'");
    expect(affiliateListSource).toContain('text-xs font-bold text-slate-400">%</span>');
    expect(affiliateListSource).toContain('text-xs font-bold text-slate-400">₱</span>');
    expect(affiliateListSource).not.toContain('Percentage (%)');
    expect(affiliateListSource).toContain('Save override');
    expect(affiliateListSource).not.toContain('Selling price just for');
    expect(affiliatePriceRulePreviewSource).toContain("const isAffiliateActionsVariant = variant === 'affiliate-actions';");
    expect(affiliatePriceRulePreviewSource).toContain("'affiliate-actions-preview grid grid-cols-3 gap-1.5 sm:gap-2'");
    expect(affiliatePriceRulePreviewSource).toContain('border-blue-200 bg-blue-50/40');
    expect(affiliatePriceRulePreviewSource).toContain('border-emerald-200 bg-emerald-50/50');
    expect(affiliatePriceRulePreviewSource).toContain("const previewDetailClass = isAffiliateActionsVariant\n        ? 'mt-0.5 truncate text-[11px] text-slate-400'");
    expect(affiliatePriceRulePreviewSource).toContain("const previewValueClass = isSettingsVariant\n        ? 'mt-1 min-w-0 max-w-full break-words whitespace-normal text-[clamp(0.75rem,4.5vw,1rem)] font-black leading-tight [overflow-wrap:anywhere]'");
    expect(affiliatePriceRulePreviewSource).toContain('title="Net earnings">Net earnings</div>');
    expect(affiliateWorkspaceCss).toContain('.affiliate-actions-select-content');
    expect(affiliateWorkspaceCss).toContain('.affiliate-actions-select > div.absolute');
    expect(affiliateWorkspaceCss).toContain('max-width: min(24rem, calc(100vw - 2rem));');
    expect(affiliateWorkspaceCss).toContain(".affiliate-actions-select-content [role='option'] > span");
    expect(affiliateWorkspaceCss).toContain('height: min(6.125rem, calc(100vh - 8rem));');
    expect(affiliateWorkspaceCss).toContain('overflow-y: scroll;');
    expect(affiliateWorkspaceCss).toContain('touch-action: pan-y;');
    expect(affiliateWorkspaceCss).toContain('text-overflow: clip;');
    expect(affiliateWorkspaceCss).toContain('.affiliate-actions-dialog');
    expect(affiliateWorkspaceCss).toContain('scrollbar-color: #94a3b8 transparent;');
    expect(affiliateCashoutSource).toContain("const AFFILIATE_MODAL_BUTTON_CLASS = 'h-10 min-w-0 w-full justify-center rounded-lg px-2 text-[11px] font-bold';");
    expect(affiliateCashoutSource).toContain("const AFFILIATE_MODAL_PRIMARY_BUTTON_CLASS = `${AFFILIATE_MODAL_BUTTON_CLASS} bg-[#1b4e8d] text-white hover:bg-[#143f73] focus-visible:ring-[#1b4e8d]`;");
    expect(affiliateCashoutSource).toContain("className=\"affiliate-cashout-dialog flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg");
    expect(affiliateCashoutSource).toContain('affiliate-cashout-dialog-footer flex shrink-0 flex-col gap-3 border-t border-slate-200');
  });

  it('keeps the Invite Affiliate dialog aligned with the system modal typography', () => {
    expect(affiliateInviteDialogSource).toContain('affiliate-invite-dialog flex max-h-[calc(100vh-2rem)]');
    expect(affiliateInviteDialogSource).toContain('h-12 w-12 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-[#1b4e8d]');
    expect(affiliateInviteDialogSource).toContain('Invite someone to promote your store by email.');
    expect(affiliateInviteDialogSource).toContain('text-[16px] font-extrabold text-[#0F172A]');
    expect(affiliateInviteDialogSource).toContain('Email to invite <span className="text-rose-500">*</span>');
    expect(affiliateInviteDialogSource).toContain('An invitation code and onboarding link will be sent to this address.');
    expect(affiliateInviteDialogSource).toContain('>Rate override</label>');
    expect(affiliateInviteDialogSource).toContain('>optional</span>');
    expect(affiliateInviteDialogSource).toContain('placeholder="Use program default"');
    expect(affiliateInviteDialogSource).toContain('className="h-10 rounded-lg border-slate-300 bg-white text-[14px]');
    expect(affiliateInviteDialogSource).toContain('className="h-10 rounded-lg border-slate-300 bg-white pr-10 text-[14px]');
    expect(affiliateInviteDialogSource).toContain('border-l border-slate-200 pl-2 text-xs font-bold text-slate-400">%</span>');
    expect(affiliateInviteDialogSource).toContain('Leave blank to use the storewide affiliate default rate');
    expect(affiliateInviteDialogSource).toContain('h-10 min-w-0 w-full rounded-lg bg-[#1b4e8d] px-2 text-[11px] font-bold');
    expect(affiliateInviteDialogSource).toContain('h-10 min-w-0 w-full rounded-lg border-slate-300 bg-white px-2 text-[11px] font-bold');
    expect(affiliateInviteDialogSource).toContain('affiliate-invite-dialog-footer flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5');
    expect(affiliateInviteDialogSource).not.toContain('Rate override (%)');
  });

  it('keeps Affiliate Settings footer actions the same size and shape', () => {
    expect(affiliateSettingsSource).toContain("const AFFILIATE_SETTINGS_ACTION_BUTTON_CLASS = 'h-10 min-w-0 w-full flex-1 justify-center rounded-lg px-3 text-[13px] font-extrabold whitespace-nowrap sm:w-44 sm:flex-none';");
    expect((affiliateSettingsSource.match(/AFFILIATE_SETTINGS_ACTION_BUTTON_CLASS/g) || [])).toHaveLength(3);
    expect(affiliateSettingsSource).toContain('RotateCcw aria-hidden="true" className="mr-2 h-4 w-4"');
    expect(affiliateSettingsSource).toContain('Save aria-hidden="true" className="mr-2 h-4 w-4"');
  });

  it('lets the cashout KPI fill the last row on landscape tablets', () => {
    expect(affiliateWorkspaceCss).toContain('@media screen and (orientation: landscape) and (min-width: 1024px) and (max-width: 1279.98px)');
    expect(affiliateWorkspaceCss).toContain('.affiliate-cashout-kpi-strip > .affiliate-cashout-requests-kpi {\n    grid-column: 1 / -1;\n  }');
  });
});
