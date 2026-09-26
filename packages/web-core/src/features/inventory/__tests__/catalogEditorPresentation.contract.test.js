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
});
