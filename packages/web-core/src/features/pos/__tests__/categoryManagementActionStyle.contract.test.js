import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const stylesheetPath = path.resolve(__dirname, '../../../index.css');

describe('POS Items category creation action styling', () => {
  it('uses the reference hover while preserving focus and pressed colors across viewports', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const categoryWorkspaceStart = workspace.indexOf('function CategoryManagementWorkspace()');
    const createHandlerStart = workspace.indexOf('onClick={openCreate}', categoryWorkspaceStart);
    const addButtonStart = workspace.lastIndexOf('<Button', createHandlerStart);
    const addButtonEnd = workspace.indexOf('</Button>', addButtonStart);
    const addCategoryButton = workspace.slice(addButtonStart, addButtonEnd);
    const stylesStart = stylesheet.indexOf('.pos-items-catalog-workspace .pos-items-category-add-action {');
    const stylesEnd = stylesheet.indexOf('/* Reset actions in POS > Items', stylesStart);
    const actionStyles = stylesheet.slice(stylesStart, stylesEnd);

    expect(addCategoryButton).toContain('pos-items-category-add-action');
    expect(addCategoryButton).toContain('aria-pressed={editor?.mode === \'create\'}');
    expect(stylesStart).toBeGreaterThanOrEqual(0);
    expect(actionStyles).toContain('.pos-items-category-add-action:focus-visible,');
    expect(actionStyles).toContain('.pos-items-category-add-action:active');
    expect(actionStyles).toContain('background-color: #143f73;');
    expect(actionStyles).toContain('.pos-items-category-add-action:hover:not([aria-pressed="true"]):not(:active):not(:focus-visible)');
    expect(actionStyles).toContain('background-color: #eff6ff;');
    expect(actionStyles).toContain('color: #0f172a;');
    expect(actionStyles).toContain('border-color: #1a4e8d;');
  });

  it('hides category action labels and keeps Refresh DGFY blue in portrait tablet view', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const tabletStylesStart = stylesheet.indexOf('@media screen and (orientation: portrait) and (min-width: 768px) and (max-width: 1199.98px) {');
    const tabletStylesEnd = stylesheet.indexOf('/* The mobile Items workspace navigation', tabletStylesStart);
    const tabletStyles = stylesheet.slice(tabletStylesStart, tabletStylesEnd);
    const refreshButtonStart = workspace.indexOf('aria-label="Refresh categories"');
    const refreshButtonEnd = workspace.indexOf('</Button>', refreshButtonStart);
    const refreshButton = workspace.slice(refreshButtonStart, refreshButtonEnd);

    expect(tabletStylesStart).toBeGreaterThanOrEqual(0);
    expect(tabletStyles).toContain('.dgfy-pos-shell[data-pos-items-view="true"] .pos-categories-mobile-action-label {');
    expect(tabletStyles).toContain('display: none;');
    expect(tabletStyles).toContain('.dgfy-pos-shell[data-pos-items-view="true"] .pos-items-category-refresh-button {');
    expect(tabletStyles).toContain('background-color: #1a4e8d;');
    expect(tabletStyles).toContain('color: #fff;');
    expect(tabletStyles).toContain('.dgfy-pos-shell[data-pos-items-view="true"] .pos-categories-mobile-actions > button {');
    expect(tabletStyles).toContain('flex: 0 0 2.5rem;');
    expect(tabletStyles).toContain('width: 2.5rem;');
    expect(tabletStyles).toContain('height: 2.5rem;');
    expect(tabletStyles).toContain('max-height: 2.5rem;');
    expect(tabletStyles).toContain('padding: 0;');
    expect(refreshButton).toContain('pos-items-category-refresh-button');
  });
});
