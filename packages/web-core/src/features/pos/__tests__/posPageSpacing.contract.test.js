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
const historySource = readPosFile('components/POSTransactionHistoryPanel.jsx');
const reportsSource = readPosFile('components/PosReportsAnalyticsWorkspace.jsx');
const settingsSource = readPosFile('settings/PosSettingsWorkspace.jsx');
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
    expect(primaryShiftTabCall).toContain('mobileGridColumns={visibleShiftTabs.length > 1 ? 2 : 1}');
    expect(primaryShiftTabCall).not.toContain('mobileGridColumns={3}');
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
    expect(operationsWorkspaceSource).toContain('const usesOwnPageFrame = isSettingsView\n    || effectiveViewMode === \'reports\'\n    || SHIFT_WORKSPACE_MODES.has(effectiveViewMode);');
    expect(operationsWorkspaceSource).toContain("const workspaceShellClassName = usesOwnPageFrame\n    ? 'p-0'");
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
});
