import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSupplierComponent = (fileName) => fs.readFileSync(
  path.resolve(__dirname, '..', fileName),
  'utf8'
);

const details = readSupplierComponent('SupplierDetailsModal.jsx');
const form = readSupplierComponent('SupplierFormModal.jsx');
const importModal = readSupplierComponent('SupplierImportModal.jsx');
const exportModal = readSupplierComponent('SupplierExportModal.jsx');
const choice = readSupplierComponent('AddSupplierChoiceDialog.jsx');
const quickAssign = readSupplierComponent('QuickAssignSupplierModal.jsx');

describe('Supplier modal interaction contract', () => {
  it('exposes an accessible close action on every supplier modal surface', () => {
    expect(details).toContain('aria-label="Close supplier details"');
    expect(form).toContain('aria-label="Close supplier form"');
    expect(importModal).toContain('aria-label="Close supplier import"');
    expect(exportModal).toContain('aria-label="Close supplier export"');
    expect(choice).toContain('aria-label="Close supplier assignment choices"');
    expect(quickAssign).toContain('aria-label="Close supplier assignment"');
  });

  it('blocks close and duplicate actions while supplier mutations are pending', () => {
    expect(form).toContain('if (submitting) return false;');
    expect(form).toContain('disabled={submitting}');
    expect(importModal).toContain('if (loading) return;');
    expect(importModal).toContain('disabled={loading}');
    expect(exportModal).toContain('if (loading) return;');
    expect(exportModal).toContain('disabled={loading}');
    expect(quickAssign).toContain('if (loading) return;');
    expect(quickAssign).toContain('disabled={loading}');
  });

  it('keeps supplier persistence result-driven without changing the existing page callbacks', () => {
    expect(form).toContain('const result = await save(dataToSave);');
    expect(form).toContain('if (result === false) return false;');
    expect(form).toContain('const result = await onSaveDraft(draftData);');
    expect(form).toContain('if (result === false) return false;');
  });
});
