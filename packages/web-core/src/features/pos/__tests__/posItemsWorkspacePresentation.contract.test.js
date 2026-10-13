import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspacePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/TerminalOperationsWorkspace.jsx');
const itemsWorkspacePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/PosItemsWorkspace.jsx');
const catalogWorkspacePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/PosItemsCatalogWorkspace.jsx');
const responsiveCardPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/PosItemResponsiveCard.jsx');
const stylesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../index.css');
const readWorkspace = () => fs.readFileSync(itemsWorkspacePath, 'utf8');
const readTerminalWorkspace = () => fs.readFileSync(workspacePath, 'utf8');
const readCatalogWorkspace = () => fs.readFileSync(catalogWorkspacePath, 'utf8');
const readResponsiveCard = () => fs.readFileSync(responsiveCardPath, 'utf8');
const readStyles = () => fs.readFileSync(stylesPath, 'utf8');

describe('standalone POS Items workspace presentation', () => {
  it('targets the Items management workspace instead of the checkout item picker', () => {
    const source = readWorkspace();
    const terminalWorkspace = readTerminalWorkspace();
    const resultsGrid = source.slice(source.indexOf('data-testid="pos-items-results"'), source.indexOf('{presentedItems.map'));

    expect(terminalWorkspace).toContain("case 'items':");
    expect(terminalWorkspace).toContain('<ItemsCatalogWorkspace');
    expect(terminalWorkspace).toContain('itemsWorkspaceComponent={ItemsWorkspace}');
    expect(readCatalogWorkspace()).toContain('<ItemsWorkspaceComponent');
    expect(source).toContain('className="pos-items-desktop-toolbar hidden items-center gap-2 sm:flex"');
    expect(source).toContain('className="pos-items-desktop-actions flex shrink-0 flex-wrap items-center justify-end gap-2"');
    expect(source).toContain('data-testid="pos-items-results"');
    // The result area retains its test hook while tablet/desktop columns are
    // selected from available width instead of a fixed desktop breakpoint.
    expect(source).toContain('pos-items-responsive-results');
    expect(resultsGrid).not.toContain('xl:grid-cols-2');
    expect(source).toContain('pos-items-desktop-toolbar');
    expect(source).toContain('placeholder="Search item by Name, SKU, or Barcode"');
    expect(source).toContain('<PosItemResponsiveCard');
    expect(source).toContain('<PosItemsListView');
    expect(source).toContain('data-view-mode={itemsDisplayMode}');
    expect(source).toContain('PosItemsViewToggle value={itemsDisplayMode}');
    expect(readResponsiveCard()).toContain('pos-items-responsive-card-top');
    expect(readResponsiveCard()).toContain('pos-items-responsive-card hidden');
    expect(readResponsiveCard()).toContain('Cost (₱):');
    expect(readResponsiveCard()).toContain('Price (₱):');
    expect(readResponsiveCard()).toContain('₱{formatMoney(item.default_sale_price)}');
    expect(readResponsiveCard()).toContain('`₱${formatMoney(item.cost_per_unit)}`');
    expect(source).toContain('tabular-nums');
  });

  it('keeps the reference card metrics and item management actions', () => {
    const source = readWorkspace();
    const responsiveCard = readResponsiveCard();
    // The tablet/desktop card follows the reference order and keeps the same
    // guarded item-management actions.
    expect(source).toContain('Cost (₱):');
    expect(source).toContain('Stock:');
    expect(source).toContain('Price (₱):');
    expect(source).toContain('font-black leading-tight tabular-nums');
    expect(source).toContain('Search item by Name, SKU, or Barcode');
    expect(source).toContain('Add Items');
    expect(source).toContain('<PackagePlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />');
    expect(source).toContain('Import Items');
    expect(source).toContain("const menuImportButtonLabel = 'Import Menu';");
    expect(source).toContain('SKU');
    expect(source).toContain('Barcode');
    expect(source).toContain('Edit Item');
    expect(source).toContain('Delete');
    expect(responsiveCard.indexOf('Cost (₱):')).toBeLessThan(responsiveCard.indexOf('Stock:'));
    expect(responsiveCard.indexOf('Stock:')).toBeLessThan(responsiveCard.indexOf('Price (₱):'));
    expect(responsiveCard.indexOf('Price (₱):')).toBeLessThan(responsiveCard.indexOf('Profit (₱):'));
    expect(responsiveCard.indexOf('onClick={onDelete}')).toBeLessThan(responsiveCard.indexOf('onClick={onEdit}'));
  });

  it('keeps tablet toolbar actions icon-only with accessible names and preserves desktop labels', () => {
    const source = readWorkspace();
    const styles = readStyles();
    const tabletToolbarRules = styles.slice(styles.lastIndexOf('/* Tablet Items toolbar actions use compact icon-only buttons.'));

    expect(source).toContain('aria-label="Filter items"');
    expect(source).toContain('aria-label="Add Items"');
    expect(source).toContain('aria-label="Import Items"');
    expect(source).toContain('className="pos-items-tablet-action-label">Filter</span>');
    expect(source).toContain('className="pos-items-tablet-action-label">Add Items</span>');
    expect(tabletToolbarRules).toContain('@media screen and (min-width: 768px) and (max-width: 1199.98px)');
    expect(tabletToolbarRules).toContain('pos-items-tablet-action-label');
    expect(tabletToolbarRules).toContain('width: 2.5rem;');
    expect(tabletToolbarRules).not.toContain('@media screen and (max-width: 767.98px)');
  });

  it('keeps tablet/desktop metrics in a compact 2x2 grid with subtle dividers', () => {
    const source = readResponsiveCard();
    const metricsClassName = source.match(/className="(pos-items-responsive-metrics[^"]*)"/)?.[1] || '';

    expect(metricsClassName).toContain('grid-cols-2');
    expect(metricsClassName).toContain('grid-rows-[repeat(2,minmax(2.25rem,auto))]');
    expect(metricsClassName).toContain('shrink-0');
    expect(metricsClassName).toContain('border-slate-300/40');
    expect(metricsClassName).not.toContain('divide-x');
    expect(metricsClassName).not.toContain('border-y');
  });

  it('keeps result-count changes in the row count instead of compressing card contents', () => {
    const styles = readStyles();
    const responsiveRules = styles.slice(styles.lastIndexOf('/* POS > Items tablet/desktop catalog cards.'));

    expect(responsiveRules).toContain('grid-auto-rows: max-content;');
    expect(responsiveRules).toContain('max-height: none;');
    expect(responsiveRules).toContain('min-height: 13rem;');
    expect(responsiveRules).not.toContain('max-height: calc(4 * 6.75rem');
  });

  it('caps the tablet/desktop grid at four columns and leaves the phone card composition alone', () => {
    const source = readWorkspace();
    const responsiveCard = readResponsiveCard();
    const styles = readStyles();

    expect(styles).toContain('@media screen and (min-width: 768px)');
    expect(styles).toContain('repeat(auto-fill, minmax(max(16rem, calc((100% - 1.5rem) / 4)), 1fr))');
    expect(styles).toContain('max(18rem, calc((100% - 1.5rem) / 4))');
    expect(styles).toContain('max(20rem, calc((100% - 1.5rem) / 4))');
    expect(styles).toContain('.pos-items-responsive-results .pos-items-reference-mobile-card');
    expect(source).toContain('pos-items-reference-mobile-card flex flex-col');
    expect(source).toContain('shadow-none md:hidden');
    expect(responsiveCard).toContain('pos-items-responsive-card hidden');
    expect(responsiveCard).toContain('md:flex');
  });

  it('announces when previously loaded item results are being refreshed', () => {
    const source = readWorkspace();

    expect(source).toContain('    setLoading(true);\n    setError(\'\');\n    try {');
    expect(source).toContain('{loading && itemsLoaded.current ? (');
    expect(source).toContain('data-testid="pos-items-refreshing"');
    expect(source).toContain('Updating items… Showing previous results until the refresh finishes.');
    expect(source).toContain('aria-busy={loading}');
  });

  it('shows the existing stock status in both responsive item cards', () => {
    const source = readWorkspace();
    const responsiveCard = readResponsiveCard();
    const combinedCards = `${source}\n${responsiveCard}`;
    const mobileImageStart = source.indexOf('className="pos-items-reference-mobile-card-image relative');
    const mobileImageEnd = source.indexOf('</button>', mobileImageStart);
    const mobileImage = source.slice(mobileImageStart, mobileImageEnd);
    const mobileMetricsStart = source.indexOf('className="pos-items-reference-mobile-card-metrics');
    const mobileMetricsEnd = source.indexOf('pos-items-reference-mobile-card-actions', mobileMetricsStart);
    const mobileMetrics = source.slice(mobileMetricsStart, mobileMetricsEnd);
    const responsiveImageStart = responsiveCard.indexOf('className="pos-items-responsive-image relative');
    const responsiveImageEnd = responsiveCard.indexOf('</div>', responsiveImageStart);
    const responsiveImage = responsiveCard.slice(responsiveImageStart, responsiveImageEnd);

    expect(source).toContain("? 'Out of Stock' : almostOutOfStock ? 'Low Stock' : 'In Stock'");
    expect(source).toContain("? 'border-rose-200 bg-rose-50 text-rose-800'");
    expect(source).toContain("? 'border-amber-200 bg-amber-50 text-amber-800'");
    expect(source).toContain("? 'border-sky-200 bg-sky-50 text-sky-800'");
    expect(combinedCards.match(/data-testid="pos-item-stock-status"/g) || []).toHaveLength(2);
    expect(combinedCards).toContain('{stockStatusLabel}');
    expect(source).toContain("? 'Low Stock' : 'In Stock'");
    expect(responsiveImage).toContain('data-testid="pos-item-stock-status"');
    expect(responsiveImage).toContain('absolute left-1 top-1');
    expect(responsiveImage).toContain('aria-hidden="true" className={`h-1 w-1');
    expect(mobileImage).toContain('data-testid="pos-item-stock-status"');
    expect(mobileImage).toContain('absolute left-1 top-1');
    expect(mobileImage).toContain('stockStatusBadgeClassName');
    expect(mobileImage).toContain('stockStatusDotClassName');
    expect(mobileImage).toContain('{stockStatusLabel}');
    expect(mobileMetrics).not.toContain('data-testid="pos-item-stock-status"');
    expect(mobileMetrics).toContain('<span className="sr-only">Stock status: {stockStatusLabel}</span>');
    expect(source).not.toContain('title={stockStatusLabel}');
  });

  it('keeps long desktop/tablet item names readable without hiding their full value', () => {
    const responsiveCard = readResponsiveCard();
    const styles = readStyles();

    expect(responsiveCard).toContain('pos-items-responsive-card-title');
    expect(responsiveCard).toContain('title={itemName}');
    expect(responsiveCard).toContain('aria-label={itemName}');
    expect(styles).toContain('-webkit-line-clamp: 2;');
    expect(styles).toContain('overflow-wrap: anywhere;');
    expect(styles).toContain('.pos-items-responsive-stock-status-label');
    expect(responsiveCard).toContain('pos-items-responsive-stock-status-label');
    expect(responsiveCard).not.toContain('className="truncate">{stock.statusLabel}</span>');
  });

  it('limits phone/tablet item titles to two lines while retaining the full name', () => {
    const source = readWorkspace();
    const mobileTitleClass = source.match(/className="(pos-items-reference-mobile-card-title[^"]*)"/)?.[1] || '';

    expect(mobileTitleClass).toContain('line-clamp-2');
    expect(mobileTitleClass).toContain('break-words');
    expect(source).toContain("title={item.name || 'Unnamed item'}");
  });

  it('uses a named region when the Items workspace has no rendered tab strip', () => {
    const source = readCatalogWorkspace();

    expect(source).toContain("role={availableTabs.length > 1 ? 'tabpanel' : 'region'}");
    expect(source).toContain('aria-labelledby={availableTabs.length > 1 && visibleTab ? `pos-items-tab-${visibleTab}` : undefined}');
    expect(source).toContain('aria-label={availableTabs.length === 1 ? availableTabs[0].label : undefined}');
    expect(source).not.toContain('aria-labelledby={visibleTab ? `pos-items-tab-${visibleTab}` : undefined}');
  });

  it('keeps Grid/List as presentation-only views and limits the table to tablet and larger screens', () => {
    const source = readWorkspace();
    const listView = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/PosItemsListView.jsx'),
      'utf8'
    );
    const styles = readStyles();

    expect(source).toContain("useState('grid')");
    expect(source).toContain('data-view-mode={itemsDisplayMode}');
    expect(source).toContain('currentPage={currentItemsPage}');
    expect(source).toContain('totalItems={itemsTotal}');
    expect(listView).toContain('POS item list');
    expect(listView).toContain('Category');
    expect(listView).toContain('SKU');
    expect(listView).toContain('Price (₱)');
    expect(listView).toContain('Cost (₱)');
    expect(listView).toContain('Profit (₱)');
    expect(listView).toContain('Stock');
    expect(listView).toContain('Actions');
    expect(listView).toContain('pos-items-list-column-profit');
    expect(listView).toContain('!text-center');
    expect(listView).toContain('justify-center gap-2');
    expect(listView).not.toContain('type="checkbox"');
    expect(styles).toContain('@media screen and (min-width: 768px)');
    expect(styles).toContain('@media screen and (min-width: 768px) and (max-width: 1023.98px)');
    expect(styles).toContain('.pos-items-list-column-profit');
    expect(styles).toContain('col.pos-items-list-column-actions {\n    width: 18%;');
    expect(styles).toContain('.pos-items-list-view thead th:last-child {\n    text-align: center;');
    expect(styles).toContain('@media screen and (max-width: 767.98px)');
    expect(styles).toContain('data-view-mode="list"] > .pos-items-grid-entry');
  });
});
