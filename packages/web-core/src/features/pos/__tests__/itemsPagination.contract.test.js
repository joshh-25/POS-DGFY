import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const layoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const paginationPath = path.resolve(__dirname, '../../../../Components/ui/pagination.jsx');

describe('POS item list pagination', () => {
    it('limits the rendered item list to fifteen records and exposes page navigation', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('const POS_ITEMS_PAGE_SIZE = 20;');
    expect(workspace).toContain('page_size: itemsPageSize');
    expect(workspace).toContain('{paginatedItems.map((item) => {');
    expect(workspace).toContain('<GlobalPagination');
    expect(workspace).toContain('testId="pos-items-pagination"');
    expect(workspace).toContain('hidePageSizeSuffixOnMobile');
    const pagination = fs.readFileSync(paginationPath, 'utf8');
    expect(pagination).toContain('hidePageSizeSuffixOnMobile = false');
    expect(workspace).toContain('className={`${POS_PAGINATION_FOOTER_CLASS} mt-auto`}');
    expect(workspace).toContain('itemLabel="entries"');
    expect(workspace).toContain('pageSizeOptions={POS_ITEMS_PAGE_SIZE_OPTIONS}');
    expect(workspace).toContain('onPageChange={setItemsPage}');
    expect(workspace).toContain('onPageSizeChange={(nextPageSize) => {');
    expect(workspace).toContain('<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">');
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
