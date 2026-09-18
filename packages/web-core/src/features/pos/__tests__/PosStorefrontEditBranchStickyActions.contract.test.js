import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(__dirname, '../settings/PosStorefrontSettingsPane.jsx');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const workspacePath = path.resolve(__dirname, '../settings/PosSettingsWorkspace.jsx');
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');

describe('storefront edit branch mobile actions contract', () => {
  it('keeps edit content clear of the mobile action bar and preserves desktop placement', () => {
    expect(componentSource).toContain("'mt-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:pb-0 lg:mt-8'");
    expect(componentSource).toContain('fixed inset-x-0 bottom-0');
    expect(componentSource).toContain('sm:absolute sm:inset-x-auto sm:right-4 sm:top-4');
  });

  it('uses a solid, safe-area-aware action bar with touch-friendly balanced actions', () => {
    expect(componentSource).toContain('border-t border-slate-200 bg-white');
    expect(componentSource).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]');
    expect(componentSource).toContain('shadow-[0_-4px_12px_rgba(15,23,42,0.08)]');
    expect(componentSource).toContain('min-h-11 flex-1');
  });

  it('does not leave the settings tab pane transformed at rest', () => {
    expect(workspaceSource).toContain("setPaneInlineStyle({ opacity: 1, transition: 'none' });");
    expect(workspaceSource).toContain('viewport-fixed descendants');
  });
});
