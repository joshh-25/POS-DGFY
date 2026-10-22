import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const repoRoot = path.resolve(webCoreRoot, '../..');

const readWebCoreFile = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('Catalog Editor presentation contracts', () => {
  it('applies the compact dialog contract to every Catalog Editor modal surface', () => {
    const modalPaths = [
      'Components/items/ItemDetailsModal.jsx',
      'Components/items/ItemFormModal.jsx',
      'Components/items/MoveToFolderModal.jsx',
      'Components/items/ImportExportModal.jsx',
      'Components/items/CSVImportModal.jsx',
      'Components/items/CSVExportModal.jsx',
      'Components/products/ProductCreateWizard.jsx'
    ];

    modalPaths.forEach((relativePath) => {
      const source = readWebCoreFile(relativePath);
      expect(source.includes('catalog-editor-dialog-content') || source.includes('data-catalog-editor="true"'), relativePath).toBe(true);
    });

    expect(readWebCoreFile('Components/ui/DeleteConfirmDialog.jsx')).toContain('className={className}');
    expect(readWebCoreFile('Components/ui/ConfirmationDialog.jsx')).toContain('className={className || "sm:max-w-md"}');
    expect(readWebCoreFile('src/index.css')).toContain('.catalog-editor-dialog-content.wizard-core-typography');
  });

  it('preserves catalog safety and operational guidance while trimming redundant copy', () => {
    const itemsPageSource = readWebCoreFile('src/features/inventory/pages/ItemsPage.jsx');
    const itemFormSource = readWebCoreFile('Components/items/ItemFormModal.jsx');
    const csvImportSource = readWebCoreFile('Components/items/CSVImportModal.jsx');

    expect(itemFormSource).toContain('POS readiness requirements');
    expect(itemFormSource).toContain('POS terminal cards use the item images added in Storefront Catalog below.');
    expect(itemFormSource).toContain('Drag item images here, or choose them from your device.');
    expect(csvImportSource).toContain('Full catalog sync');
    expect(csvImportSource).toContain('deactivationAcknowledged');
    expect(csvImportSource).toContain('Deactivated items are never deleted');
  });

  it('keeps the complete item edit workflow in one modal', () => {
    const itemFormSource = readWebCoreFile('Components/items/ItemFormModal.jsx');
    const itemDetailsSource = readWebCoreFile('Components/items/ItemDetailsModal.jsx');
    const itemsPageSource = readWebCoreFile('src/features/inventory/pages/ItemsPage.jsx');

    expect(itemFormSource).toContain('data-testid="item-editor-basic-info"');
    expect(itemFormSource).toContain('data-testid="item-editor-stock-inventory"');
    expect(itemFormSource).toContain('data-testid="item-editor-cost-financial"');
    expect(itemFormSource).toContain('data-testid="item-editor-shelf-life"');
    expect(itemFormSource).toContain('data-testid="item-editor-barcodes"');
    expect(itemFormSource).toContain('<BarcodeManager item={item} />');
    expect(itemFormSource).toContain('storage_temperature');
    expect(itemFormSource).toContain('storage_conditions');
    expect(itemsPageSource).toContain('hideStockControls={itemEditorMode && !editingItem}');
    expect(itemsPageSource).toContain('hideUnitOfMeasure={itemEditorMode && !editingItem}');
    expect(itemsPageSource).toContain('onEdit={itemEditorMode ? handleEditFromDetails : undefined}');
    expect(itemDetailsSource).toContain('onEdit,');
    expect(itemDetailsSource).toContain('Edit Item');
  });

  it('keeps OPIS Item Editor row-based while preserving categories and channel visibility controls', () => {
    const itemsPageSource = readWebCoreFile('src/features/inventory/pages/ItemsPage.jsx');
    const itemCardSource = readWebCoreFile('Components/items/ItemCard.jsx');
    const itemDetailsSource = readWebCoreFile('Components/items/ItemDetailsModal.jsx');
    const opisModuleSource = fs.readFileSync(
      path.resolve(repoRoot, 'apps/dgfy-opis/src/features/businessAdmin/MigratedBackOfficeModule.jsx'),
      'utf8'
    );

    expect(opisModuleSource).toContain('itemEditorMode');
    expect(itemsPageSource).toContain('itemEditorMode = false');
    expect(itemsPageSource).toContain("const renderedViewMode = itemEditorMode ? 'list' : viewMode;");
    expect(itemsPageSource).toContain('const resolveItemCategoryNames = useCallback');
    expect(itemsPageSource).toContain('folderNavigationEnabled && currentFolder');
    expect(itemCardSource).toContain('Show in Storefront');
    expect(itemsPageSource).toContain('Toggle POS visibility for ${item.name}');
    expect(itemsPageSource).toContain('Toggle storefront visibility for ${item.name}');
    expect(itemsPageSource).toContain('itemEditorMode={itemEditorMode}');
    expect(itemDetailsSource).toContain('itemEditorMode = false');
    expect(itemDetailsSource.match(/\{!itemEditorMode && \(/g)).toHaveLength(4);
  });

  it('uses the POS Add Item workflow in OPIS while keeping the full edit surface for existing items', () => {
    const itemsPageSource = readWebCoreFile('src/features/inventory/pages/ItemsPage.jsx');
    const itemFormSource = readWebCoreFile('Components/items/ItemFormModal.jsx');
    const posWorkspaceSource = readWebCoreFile('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    const posItemsWorkspaceSource = readWebCoreFile('src/features/pos/components/PosItemsWorkspace.jsx');

    expect(itemsPageSource).toContain('const PosItemCreateWorkflow = lazy(() =>');
    expect(itemsPageSource).toContain('if (itemEditorMode)');
    expect(itemsPageSource).toContain('<PosItemCreateWorkflow');
    expect(itemsPageSource).toContain('hideUnitOfMeasure={itemEditorMode && !editingItem}');
    expect(itemsPageSource).toContain('hideStockControls={itemEditorMode && !editingItem}');
    expect(itemsPageSource).toContain('!itemEditorMode && (');
    expect(itemFormSource).toContain('hideUnitOfMeasure = false');
    expect(itemFormSource).toContain('{!hideUnitOfMeasure && (');
    expect(itemFormSource).toContain('hideStockControls = false');
    expect(itemFormSource).toContain('{!hideStockControls && (');
    expect(itemFormSource).toContain('!hideStockControls && !isDraft && !isStockExemptItem');
    expect(posWorkspaceSource).toContain('export function PosItemCreateWorkflow');
    expect(posWorkspaceSource).toContain('modalOnly');
    expect(posItemsWorkspaceSource).toContain("unit_of_measure: category === 'product'");
  });

  it('keeps stock movement transactions in the dedicated Stock Movements workspace', () => {
    const itemDetailsSource = readWebCoreFile('Components/items/ItemDetailsModal.jsx');
    const stockMovementsSource = readWebCoreFile('src/features/stockMovements/pages/StockMovementsPage.jsx');

    expect(itemDetailsSource).toContain('const stockMovementItemId = item.item_id || item.id;');
    expect(itemDetailsSource).toContain('!financialPolicy.is_pure_service');
    expect(itemDetailsSource).toContain("{itemEditorMode ? 'Manage Stock' : 'Create Stock Movement'}");
    expect(itemDetailsSource).toContain('View Movement History');
    expect(itemDetailsSource).toContain('Create Stock Movement');
    expect(stockMovementsSource).toContain('Record Movement');
  });

  it('hides FIFO presentation in Item Editor mode without removing FIFO support', () => {
    const itemDetailsSource = readWebCoreFile('Components/items/ItemDetailsModal.jsx');

    expect(itemDetailsSource.match(/!itemEditorMode && !financialPolicy\.is_pure_service && item\.fifo_enabled/g)).toHaveLength(3);
    expect(itemDetailsSource).toContain('FIFOBatchViewer');
    expect(itemDetailsSource).toContain('Shelf Life & Storage');
  });

  it('keeps the Item Editor table focused on categories, expiry, and operational stock', () => {
    const itemsPageSource = readWebCoreFile('src/features/inventory/pages/ItemsPage.jsx');

    expect(itemsPageSource).not.toContain('>FIFO</th>');
    expect(itemsPageSource).toContain('>Expiry</th>');
    expect(itemsPageSource).toContain('getNextExpiryDate(item)');
    expect(itemsPageSource).toContain('>Categories</th>');
    expect(itemsPageSource).not.toContain('getCategoryLabel(item)');
    expect(itemsPageSource).toContain('>Stock Level</th>');
    expect(itemsPageSource).not.toContain('{stockScope.label}');
  });
});
