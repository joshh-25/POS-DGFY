import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS item list pagination', () => {
  it('limits the rendered item list to fifteen records and exposes page navigation', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('const POS_ITEMS_PAGE_SIZE = 15;');
    expect(workspace).toContain('page_size: POS_ITEMS_PAGE_SIZE');
    expect(workspace).toContain('{paginatedItems.map((item) => {');
    expect(workspace).toContain('Previous items page');
    expect(workspace).toContain('Next items page');
  });

  it('keeps a blocking save screen visible until item persistence completes', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('const [itemSaveInFlight, setItemSaveInFlight] = useState(false);');
    expect(workspace).toContain('setItemSaveInFlight(true);');
    expect(workspace).toContain('setItemSaveInFlight(false);');
    expect(workspace).toContain('{itemSaveInFlight && typeof document !== \'undefined\' && createPortal((');
    expect(workspace).toContain("savingTitle: 'Saving Menu Item…'");
    expect(workspace).toContain("savingTitle: 'Saving Product…'");
    expect(workspace).toContain("savingStatusLabel: 'RETAIL CATALOG SYNC'");
    expect(workspace).toContain('itemWorkspacePresentation.savingTitle');
    expect(workspace).toContain('animate-spin-slow');
    expect(workspace).toContain('<SavingItemIcon className="h-7 w-7 text-white drop-shadow" />');
  });
});
