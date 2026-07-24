import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacePath = path.resolve(__dirname, '../components/PosReportsAnalyticsWorkspace.jsx');
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');

describe('POS report category filter contract', () => {
  it('uses active folder IDs rather than date-dependent category names', () => {
    expect(workspaceSource).toContain("const [categoryId, setCategoryId] = useState('');");
    expect(workspaceSource).toContain('category_id: categoryId || undefined');
    expect(workspaceSource).toContain('value={entry.folder_id || \'\'}');
    expect(workspaceSource).toContain('{entry.name}');
    expect(workspaceSource).not.toContain('value={category}');
  });

  it('keeps report cards viewport-safe and renders table rows as mobile cards', () => {
    expect(workspaceSource).toContain('min-w-0 max-w-full overflow-hidden rounded-2xl');
    expect(workspaceSource).toContain('grid min-w-0 gap-3 sm:hidden');
    expect(workspaceSource).toContain('hidden min-w-0 max-w-full overflow-x-auto overscroll-x-contain');
    expect(workspaceSource).toContain('min-w-[720px]');
  });
});
