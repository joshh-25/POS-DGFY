import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/PosItemsCategoryManagementWorkspace.jsx');
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

  it('uses a readable selected state for category reorder mode', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const reorderLabelStart = workspace.indexOf("aria-label={busy && isReordering ? 'Saving category order'");
    const reorderButtonStart = workspace.lastIndexOf('<Button', reorderLabelStart);
    const reorderButtonEnd = workspace.indexOf('</Button>', reorderButtonStart);
    const reorderButton = workspace.slice(reorderButtonStart, reorderButtonEnd);

    expect(reorderButton).toContain('aria-pressed={isReordering}');
    expect(reorderButton).toContain('pos-items-category-reorder-button');
    expect(stylesheet).toContain('.pos-items-catalog-workspace .pos-items-category-reorder-button[aria-pressed="true"]');
    expect(stylesheet).toContain('background-color: #1a4e8d;');
    expect(stylesheet).toContain('color: #fff;');
    expect(stylesheet).toContain('.pos-items-category-reorder-button[aria-pressed="true"]:hover');
  });

  it('orders Add, Reorder, and icon-only Refresh actions and uses a category-plus icon', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const addActionIndex = workspace.indexOf('aria-label="Add Categories"');
    const reorderActionIndex = workspace.indexOf("aria-label={busy && isReordering ? 'Saving category order'");
    const refreshActionIndex = workspace.indexOf('aria-label="Refresh categories"');
    const refreshButtonStart = workspace.lastIndexOf('<Button', refreshActionIndex);
    const refreshButtonEnd = workspace.indexOf('</Button>', refreshButtonStart);
    const refreshButton = workspace.slice(refreshButtonStart, refreshButtonEnd);

    expect(addActionIndex).toBeGreaterThanOrEqual(0);
    expect(addActionIndex).toBeLessThan(reorderActionIndex);
    expect(reorderActionIndex).toBeLessThan(refreshActionIndex);
    expect(workspace).toContain('<FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />');
    expect(refreshButton).toContain('size="icon"');
    expect(refreshButton).toContain('title="Refresh categories"');
    expect(refreshButton).toContain('<RefreshCcw aria-hidden="true"');
    expect(refreshButton).not.toContain('pos-categories-mobile-action-label');
  });

  it('gives the inactive Reorder Categories action a restrained blue fill', () => {
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const stylesStart = stylesheet.indexOf('.pos-items-catalog-workspace .pos-items-category-reorder-button:not([aria-pressed="true"]) {');
    const stylesEnd = stylesheet.indexOf('.pos-items-catalog-workspace .pos-items-category-reorder-button[aria-pressed="true"]', stylesStart);
    const reorderStyles = stylesheet.slice(stylesStart, stylesEnd);

    expect(stylesStart).toBeGreaterThanOrEqual(0);
    expect(reorderStyles).toContain('border-color: #bfdbfe;');
    expect(reorderStyles).toContain('background-color: #eff6ff;');
    expect(reorderStyles).toContain('color: #1a4e8d;');
  });

  it('reuses the standard POS history icon-action design for category actions', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain("import PosTableActionButton from './PosTableActionButton.jsx';");
    expect(workspace.match(/<PosTableActionButton/g)).toHaveLength(3);
    expect(workspace).toContain('tone="danger"');
  });

  it('uses warning colors only for deactivating an active category', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const actionButton = fs.readFileSync(
      path.resolve(__dirname, '../components/PosTableActionButton.jsx'),
      'utf8'
    );

    expect(workspace).toContain("tone={folder.is_active ? 'warning' : 'primary'}");
    expect(actionButton).toContain('warning: \'border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 focus-visible:ring-amber-500\'');
  });
});
