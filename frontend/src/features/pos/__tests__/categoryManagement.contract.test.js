import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS category management contract', () => {
  it('lets admins explicitly create a category while saving a new item without creating defaults', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain('Category Management');
    expect(source).toContain("is_active: folder?.is_active !== false");
    expect(source).toContain('create_category_name: typedCategoryName');
    expect(source).toContain('Select or create a category');
    expect(source).toContain('Only an administrator can create categories.');
    expect(source).not.toContain('POS_FOOD_CATEGORY_LABELS');
    expect(source).not.toContain('ensureFoodCategoryFolder');
  });

  it('keeps category lifecycle controls inside the admin-only settings tab', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain("String(terminalUser?.role || '').trim().toLowerCase() === 'admin'");
    expect(source).toContain("{ id: 'categories', label: 'Categories', icon: Tags }");
    expect(source).toContain('Move assigned items to');
    expect(source).toContain('replacementFolderId');
  });

  it('maps the saved category ID back into the edit-item category control', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain('const savedFolderId = Number(item?.folder_id || 0);');
    expect(source).toContain('Number(option?.folder_id) === savedFolderId');
    expect(source).toContain('pos_category: matchedActiveCategory?.value');
  });
});
