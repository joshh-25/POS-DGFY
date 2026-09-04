import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const sidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const layoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const terminalPagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');

describe('POS category management contract', () => {
  it('lets admins explicitly create a category while saving a new item without creating defaults', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain('Category Management');
    expect(source).toContain("is_active: folder?.is_active !== false");
    expect(source).toContain('create_category_name: typedCategoryName');
    expect(source).toContain('Select or create a category');
    expect(source).toContain('autoComplete="off"');
    expect(source).toContain('Only an administrator can create categories.');
    expect(source).not.toContain('POS_FOOD_CATEGORY_LABELS');
    expect(source).not.toContain('ensureFoodCategoryFolder');
  });

  it('uses an editable category combobox instead of browser datalist suggestions', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain('function EditableFoodCategoryCombobox');
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('Show food categories');
    expect(source).toContain('const [isFiltering, setIsFiltering] = useState(false);');
    expect(source).toContain('const normalizedQuery = isFiltering ? normalizedValue : \'\';');
    expect(source).toContain('No existing category matches. Save to create');
    expect(source).not.toContain('pos-items-create-category-options');
    expect(source).not.toContain('pos-items-edit-category-options');
  });

  it('keeps category lifecycle controls behind the company-local category permission', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain('canManageCategories={canManageCategories}');
    expect(source).toContain("{ id: 'categories', label: 'Categories', icon: Tags }");
    expect(source).toContain('Move assigned items to');
    expect(source).toContain('replacementFolderId');
    expect(source).toContain("Select an active replacement category before deleting this category.");
    expect(source).toContain('replacementFolderIdNumber > 0');
  });

  it('places category management inside Items and removes it from Settings', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');
    const catalogStart = source.indexOf('function ItemsCatalogWorkspace');
    const settingsStart = source.indexOf('function SettingsWorkspace');
    const workspaceExport = source.indexOf('export default function TerminalOperationsWorkspace');
    const catalogSource = source.slice(catalogStart, settingsStart);
    const settingsSource = source.slice(settingsStart, workspaceExport);

    expect(catalogStart).toBeGreaterThan(-1);
    expect(catalogSource).toContain('aria-label="Items workspace navigation"');
    expect(catalogSource).toContain("{ id: 'categories', label: 'Categories', icon: Tags }");
    expect(source).toContain('<ItemsCatalogWorkspace');
    expect(settingsSource).not.toContain("{ id: 'categories', label: 'Categories', icon: Tags }");
    expect(settingsSource).not.toContain('<CategoryManagementWorkspace');
  });

  it('preserves category-only access and keeps category mutations online-only', () => {
    const workspaceSource = fs.readFileSync(workspacePath, 'utf8');
    const sidebarSource = fs.readFileSync(sidebarPath, 'utf8');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');
    const terminalPageSource = fs.readFileSync(terminalPagePath, 'utf8');
    const historyBlock = sidebarSource.slice(
      sidebarSource.indexOf('label="History"'),
      sidebarSource.indexOf('{!isCashierRole')
    );
    const itemsBlock = sidebarSource.slice(
      sidebarSource.indexOf('label="Items"'),
      sidebarSource.indexOf('{showIncomingQueue')
    );

    expect(terminalPageSource).toContain("const canManageCategories = hasPermission('categories:manage');");
    expect(terminalPageSource).toContain("normalizedView === 'items' && !canViewPos && !canManageCategories");
    expect(layoutSource).toContain('canManageCategories={canManageCategories}');
    expect(layoutSource.match(/onQueueOfflineItemDraft=\{onQueueOfflineItemDraft\}/g)).toHaveLength(2);
    expect(sidebarSource).toContain('const canAccessItemsWorkspace = canViewPos || canManageCategories;');
    expect(historyBlock).toContain('disabled={locked || onboardingRestricted || !canViewPos}');
    expect(itemsBlock).toContain('disabled={locked || onboardingRestricted || !canAccessItemsWorkspace}');
    expect(workspaceSource).toContain('Category management is available online only.');
  });

  it('maps the saved category ID back into the edit-item category control', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain('const savedFolderId = Number(item?.folder_id || 0);');
    expect(source).toContain('Number(option?.folder_id) === savedFolderId');
    expect(source).toContain('pos_category: matchedActiveCategory?.value');
  });

  it('preserves service taxonomy when an existing service item is edited in POS', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain("String(activeEditItem?.category || '').trim().toLowerCase() === 'service'");
    expect(source).toContain("mode_item_preset: category === 'product' ? posItemPreset.key : 'service'");
    expect(source).toContain("unit_of_measure: category === 'product' ? (posItemPreset.default_unit || 'pcs') : 'service'");
    expect(source).toContain("fifo_enabled: category === 'product' ? posItemPreset.fifo_enabled !== false : false");
    expect(source).toContain("max_capacity: category === 'service' ? 1 : Math.max(resolvedStock, 1)");
  });
});
