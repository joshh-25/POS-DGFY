import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const repoRoot = path.resolve(webCoreRoot, '../..');

const readWebCoreFile = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');
const readRepoFile = (relativePath) => fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');

describe('Catalog Editor presentation contracts', () => {
  it('keeps Catalog Editor embedded under Back Office without duplicate page chrome', () => {
    const itemsPageSource = readWebCoreFile('src/features/inventory/pages/ItemsPage.jsx');
    const migratedModuleSource = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/MigratedBackOfficeModule.jsx');

    expect(itemsPageSource).toContain('export default function Items({ embedded = false })');
    expect(itemsPageSource).toContain("className={cn('catalog-editor-page space-y-4', embedded && 'catalog-editor-page--embedded')}");
    expect(itemsPageSource).not.toContain('More filters');
    expect(itemsPageSource).not.toContain('Folder filters');
    expect(itemsPageSource).not.toContain('activeFilterCount');
    expect(itemsPageSource).not.toContain('resetCatalogFilters');
    expect(itemsPageSource).not.toContain('MSME mode uses one simple item flow');
    expect(itemsPageSource).not.toContain('What Fix POS Setup checks');

    expect(migratedModuleSource).toContain("const isCatalog = section === 'catalog';");
    expect(migratedModuleSource).toContain('{isCatalog || isFnb || isSales ? <Module embedded /> : <Module />}');
    expect(migratedModuleSource).not.toContain('Back to overview');
  });

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
});
