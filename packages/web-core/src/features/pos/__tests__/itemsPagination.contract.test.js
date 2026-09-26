import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const layoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');

describe('POS item list pagination', () => {
  it('matches the desktop Items wireframe with two bounded card columns and a scrollable workspace', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const layout = fs.readFileSync(layoutPath, 'utf8');

    expect(workspace).toContain('data-testid="pos-items-results"');
    expect(workspace).toContain('dgfy-pos-scroll-region min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y grid gap-2 xl:grid-cols-2');
    expect(workspace).toContain('dgfy-pos-items-catalog-results');
    expect(workspace).toContain('flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3');
    expect(workspace).toContain("'flex min-h-0 flex-1 flex-col px-5 pb-0 pt-2'");
    expect(workspace).toContain('borderless={effectiveViewMode === \'items\'}');
    expect(workspace).toContain("'flex min-h-0 min-w-0 flex-1 flex-col catalog-slide-enter'");
    expect(workspace).toContain('xl:grid-cols-2');
    expect(workspace).toContain('xl:grid-cols-[minmax(4rem,max-content)_minmax(13rem,1fr)_11.5rem_6rem]');
    expect(workspace).toContain('Search item by Name, SKU, or Barcode');
    expect(workspace).toContain('aria-controls="pos-items-desktop-filters"');
    expect(workspace).toContain('const desktopFilterButtonRef = useRef(null);');
    expect(workspace).toContain('const POS_DESKTOP_FILTER_WIDTH = 464;');
    expect(workspace).toContain('const dialogWidth = Math.min(\n        POS_DESKTOP_FILTER_WIDTH');
    expect(workspace).toContain('const preferredTop = buttonRect.bottom + 8;');
    expect(workspace).toContain('style={desktopFilterPosition || undefined}');
    expect(workspace).toContain('role="dialog"');
    expect(workspace).toContain('data-testid="pos-items-filter-category-scroll"');
    expect(workspace).toContain('mt-1.5 grid min-w-0 max-w-full grid-cols-4 gap-2');
    expect(workspace).toContain('inline-flex h-8 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-lg border px-2 py-1 text-center text-[10px] font-extrabold leading-none transition-colors');
    expect(workspace).toContain('flex shrink-0 items-center gap-2 border-t border-slate-200 px-4 py-2.5');
    expect(workspace).not.toContain('<span aria-hidden="true" />');
    expect(workspace).toContain('className="h-9 rounded-lg border-[#1A4E8D] bg-white pl-9 pr-3 text-[13px] placeholder:text-slate-300"');
    expect(workspace).toContain('className="box-border h-full min-w-0 overflow-hidden rounded-xl border border-slate-300 bg-white p-2');
    expect(workspace).toContain('aspect-square h-16 w-16 min-h-16 min-w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 sm:h-16 sm:w-16 xl:h-auto xl:w-auto xl:self-stretch');
    expect(workspace).toContain('xl:grid-cols-[minmax(4rem,max-content)_minmax(13rem,1fr)_11.5rem_6rem]');
    expect(workspace).toContain('min-w-0 self-stretch pl-4 pr-0 xl:flex xl:min-h-[4rem] xl:items-center');
    expect(workspace).toContain('flex min-h-full min-w-0 flex-1 flex-col justify-center xl:grid xl:grid-rows-2 xl:justify-normal');
    expect(workspace).toContain('flex min-w-0 flex-col gap-0 border-t border-slate-100 xl:min-h-0 xl:justify-center');
    expect(workspace).toContain('grid min-w-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg border border-slate-300 bg-white xl:col-span-1 xl:h-auto xl:min-h-16 xl:w-full xl:self-stretch');
    expect(workspace).toContain('break-words text-[16px] font-black leading-5');
    expect(workspace).toContain('`₱${money(item.cost_per_unit)}`');
    expect(workspace).not.toContain('`${money(item.cost_per_unit)} PHP`');
    expect(workspace).toContain('Reset All');
    expect(workspace).toContain('Apply Filters');
    expect(workspace).toContain('grid min-w-0 flex-1 grid-cols-2 gap-2');
    expect(workspace).toContain('h-10 min-w-0 flex-1 rounded-lg border-[#1A4E8D] bg-white px-3 text-[13px] font-extrabold text-[#1A4E8D]');
    expect(workspace).toContain('h-10 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white');
    expect(workspace).toContain('setDraftCategoryFilter');
    expect(workspace).toContain('setDraftStockFilter');
    expect(workspace).toContain('Add Items');
    expect(workspace).toContain('Edit Item');
    expect(workspace).toContain('h-8 rounded-lg border-[#1A4E8D] bg-white px-2 text-xs font-bold text-[#1A4E8D]');
    expect(layout).toContain("'dgfy-pos-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y'");
    expect(layout).toContain("const isItemsCatalogWorkspace = isOperationsWorkspaceMode && posViewMode === 'items';");
    expect(layout).toContain("? `flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-2 overflow-hidden p-2${isItemsView ? ' pos-items-workspace-content' : ''}`");
  });

  it('uses the mobile item-card composition in two columns for portrait tablets only', () => {
    const styles = fs.readFileSync(path.resolve(__dirname, '../../../index.css'), 'utf8');
    const tabletBlockStart = styles.indexOf('/* Tablet portrait Items uses the mobile card composition');
    const tabletBlockEnd = styles.indexOf('@media (max-width: 420px)', tabletBlockStart);
    const tabletBlock = styles.slice(tabletBlockStart, tabletBlockEnd);

    expect(tabletBlock).toContain('@media (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
    expect(tabletBlock).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(tabletBlock).toContain('.pos-items-mobile-results .pos-items-reference-mobile-card');
    expect(tabletBlock).toContain('display: flex;');
    expect(tabletBlock).toContain('.pos-items-mobile-results .pos-items-desktop-card');
    expect(tabletBlock).toContain('display: none;');
  });

  it('uses the portrait-tablet Items surface with the navigation rail and two-column Categories', () => {
    const layout = fs.readFileSync(layoutPath, 'utf8');
    const styles = fs.readFileSync(path.resolve(__dirname, '../../../index.css'), 'utf8');
    const tabletBlockStart = styles.indexOf('/* Portrait-tablet Items keeps the compact navigation rail used by the rest of');
    const tabletBlockEnd = styles.indexOf('@media (max-width: 420px)', tabletBlockStart);
    const tabletBlock = styles.slice(tabletBlockStart, tabletBlockEnd);

    expect(layout).toContain("data-pos-items-view={isItemsView ? 'true' : undefined}");
    expect(layout).toContain("${isItemsView ? ' pos-items-workspace-content' : ''}");
    expect(layout).toContain("${isItemsView ? 'pos-items-persistent-sidebar' : ''}");
    expect(tabletBlock).toContain('@media (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
    expect(tabletBlock).toContain('grid-template-columns: 68px minmax(0, 1fr) !important;');
    expect(tabletBlock).toContain('.pos-items-persistent-sidebar');
    expect(tabletBlock).toContain('display: flex !important;');
    expect(tabletBlock).toContain('.pos-items-mobile-tab-list');
    expect(tabletBlock).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(tabletBlock).toContain('min-height: 3rem;');
    expect(tabletBlock).toContain('font-size: 0.875rem;');
    expect(tabletBlock).toContain('.pos-categories-mobile-grid');
    expect(tabletBlock).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(tabletBlock).toContain('height: 2.5rem;');
    expect(tabletBlock).toContain('.pos-items-reference-mobile-card-image');
    expect(tabletBlock).toContain('border-radius: 0.5rem;');
  });

  it('limits the rendered item list to fifteen records and exposes page navigation', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('const POS_ITEMS_PAGE_SIZE = 20;');
    expect(workspace).toContain('page_size: itemsPageSize');
    expect(workspace).toContain('{paginatedItems.map((item) => {');
    expect(workspace).toContain('<GlobalPagination');
    expect(workspace).toContain('testId="pos-items-pagination"');
    expect(workspace).toContain('className="dgfy-pos-history-pagination-footer mt-auto shrink-0 rounded-none border-0 border-t border-slate-200 px-6 py-2.5 shadow-none"');
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
