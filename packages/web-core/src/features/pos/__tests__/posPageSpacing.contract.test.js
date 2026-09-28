import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readPosFile = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const spacingSource = readPosFile('components/PosPageSpacing.js');
const pageFrameSource = readPosFile('components/PosPageFrame.jsx');
const terminalLayoutSource = readPosFile('components/TerminalPageLayout.jsx');
const historySource = readPosFile('components/POSTransactionHistoryPanel.jsx');
const reportsSource = readPosFile('components/PosReportsAnalyticsWorkspace.jsx');
const settingsSource = readPosFile('settings/PosSettingsWorkspace.jsx');
const pageScrollCss = fs.readFileSync(path.resolve(__dirname, '../../..', 'index.css'), 'utf8');

describe('POS mobile page spacing contract', () => {
  it('keeps the primary page roots on one shared spacing contract', () => {
    expect(spacingSource).toContain("export const POS_PAGE_FRAME_CLASS = 'px-4 py-4 sm:px-6 sm:py-4';");
    expect(spacingSource).not.toContain('POS_PAGE_COMPACT_FRAME_CLASS');
    expect(reportsSource).toContain('page="reports"');
    expect(settingsSource).not.toContain('spacing="compact"');
    expect(spacingSource).not.toContain('POS_PAGE_MOBILE_GUTTER_CLASS');
    expect(spacingSource).not.toContain('POS_PAGE_CLASS');
    expect(pageFrameSource).toContain('data-pos-page-frame={page || undefined}');
    expect(historySource).toContain('<PosPageFrame page="history"');
    expect(reportsSource).toContain('<PosPageFrame id={sectionId} page="reports" className="max-[767px]:overflow-x-clip p-0"');
    expect(settingsSource).toContain('<PosPageFrame id={sectionId} page="settings"');
    expect(terminalLayoutSource).toContain('const STANDARD_POS_PAGE_FRAME_MODES = new Set([');
    expect(terminalLayoutSource).toContain("usesStandardPosPageFrame ? 'p-0' : 'p-2'");
  });

  it('uses the same major-section gap in History without changing row density', () => {
    expect(spacingSource).toContain("export const POS_MOBILE_PAGE_STACK_CLASS = 'flex flex-col gap-4';");
    expect(historySource).toContain('POS_MOBILE_PAGE_STACK_CLASS');
    expect(historySource).not.toContain('POS_PAGE_MOBILE_GUTTER_CLASS');
    expect(historySource).toContain('flex-row w-full px-0 py-0');
    expect(historySource).toContain('touch-pan-x px-3 py-0');
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
