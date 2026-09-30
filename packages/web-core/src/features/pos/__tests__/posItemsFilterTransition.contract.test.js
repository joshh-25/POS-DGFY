import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(testDirectory, '../components/TerminalOperationsWorkspace.jsx');
const workspace = fs.readFileSync(workspacePath, 'utf8');

describe('POS Items filter transitions', () => {
  it('uses the same readable header treatment in desktop and mobile filters', () => {
    const filterHeaderTitles = workspace.match(/text-xl font-bold leading-6 tracking-tight">Filter<\/(?:p|DialogTitle)>/g) || [];
    const filterHeaderDescriptions = workspace.match(/Refine your item list/g) || [];
    const filterHeaderCloseButtons = workspace.match(/aria-label="Close item filters"/g) || [];

    expect(filterHeaderTitles).toHaveLength(2);
    expect(filterHeaderDescriptions).toHaveLength(2);
    expect(filterHeaderCloseButtons).toHaveLength(2);
    expect(workspace.match(/text-sm leading-5 text-slate-500/g) || []).toHaveLength(2);
  });

  it('measures the desktop filter position before the browser paints it', () => {
    const effectStart = workspace.indexOf('useLayoutEffect(() => {\n    if (!showDesktopFilters');
    const effectEnd = workspace.indexOf('  }, [showDesktopFilters]);', effectStart);

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(workspace.slice(effectStart, effectEnd)).toContain('updateDesktopFilterPosition();');
  });

  it('closes the other responsive filter surface before opening one', () => {
    const mobileOpenStart = workspace.indexOf('const openMobileFilters = () => {');
    const desktopToggleStart = workspace.indexOf('const toggleDesktopFilters = () => {');
    const mobileOpen = workspace.slice(mobileOpenStart, desktopToggleStart);
    const desktopToggleEnd = workspace.indexOf('\n  const applyMobileFilters', desktopToggleStart);
    const desktopToggle = workspace.slice(desktopToggleStart, desktopToggleEnd);

    expect(mobileOpen).toContain('setShowDesktopFilters(false);');
    expect(mobileOpen).toContain('setShowMobileFilters(true);');
    expect(desktopToggle).toContain('setShowMobileFilters(false);');
    expect(desktopToggle).toContain('setShowDesktopFilters((visible) => !visible);');
  });
});
