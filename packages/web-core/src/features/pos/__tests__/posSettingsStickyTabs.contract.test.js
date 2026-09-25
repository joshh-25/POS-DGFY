import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosSettingsWorkspace.jsx'), 'utf8');
const tabsSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosSettingsTabNavigation.jsx'), 'utf8');
const pageSpacingSource = fs.readFileSync(path.resolve(__dirname, '../components/PosPageSpacing.js'), 'utf8');

describe('POS Settings mobile sticky tabs contract', () => {
  it('keeps the Settings tab rail pinned in the shell scroller on mobile only', () => {
    expect(workspaceSource).toContain('className="max-[767px]:overflow-x-clip"');
    expect(tabsSource).toContain('data-testid="pos-settings-sticky-tabs"');
    expect(tabsSource).toContain('POS_MOBILE_STICKY_TAB_ROW_CLASS');
    expect(pageSpacingSource).toContain('max-[767px]:sticky max-[767px]:top-0 max-[767px]:z-30 max-[767px]:-mt-4 max-[767px]:w-full max-[767px]:bg-white max-[767px]:pt-4');
    expect(tabsSource).toContain('<PosLineTabNavigation');
    expect(tabsSource).toContain('ariaLabel="Settings sections"');
  });
});
