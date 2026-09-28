import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('CSV import workflow-mode contracts', () => {
  it('uses workflow_mode query param for template downloads', () => {
    const hookPath = path.resolve(webCoreRoot, 'src/hooks/useCSVImport.js');
    const source = fs.readFileSync(hookPath, 'utf8');

    expect(source).toContain('/items/import/template?workflow_mode=');
    expect(source).toContain('normalizeTemplateRequest');
    expect(source).toContain("services_items_import_template.csv");
    expect(source).toContain("fnb_items_import_template.csv");
  });

  it('uses a single workflow-mode-specific template button in the modal', () => {
    const modalPath = path.resolve(webCoreRoot, 'Components/items/CSVImportModal.jsx');
    const source = fs.readFileSync(modalPath, 'utf8');

    expect(source).toContain('Download {getWorkflowModeLabel(workflowMode)} Template');
    expect(source).not.toContain('Products Template');
    expect(source).toContain('WORKFLOW_MODE_TEMPLATE_MISMATCH');
    expect(source).toContain('const resultStatCount = 3');
    expect(source).toContain("resultStatCount === 3 ? 'grid-cols-3' : 'grid-cols-2'");
  });

  it('keeps the preview table bounded before the footer actions', () => {
    const modalPath = path.resolve(webCoreRoot, 'Components/items/CSVImportModal.jsx');
    const source = fs.readFileSync(modalPath, 'utf8');

    expect(source).toContain('data-testid="csv-import-preview-table-scroll"');
    expect(source).toContain('csv-import-preview-table-scroll max-h-[13rem] overflow-auto');
    // Footer restyled slate-200 -> slate-100 with dialog padding; the bounded
    // preview above is unchanged.
    expect(source).toContain('gap-2 border-t border-slate-100 p-4 pt-3');
  });

  it('passes workflow_mode query/body values for CSV exports', () => {
    const hookPath = path.resolve(webCoreRoot, 'src/hooks/useCSVExport.js');
    const modalPath = path.resolve(webCoreRoot, 'Components/items/CSVExportModal.jsx');
    const hookSource = fs.readFileSync(hookPath, 'utf8');
    const modalSource = fs.readFileSync(modalPath, 'utf8');

    expect(hookSource).toContain("params.append('workflow_mode', workflowMode)");
    expect(hookSource).toContain('workflow_mode: workflowMode');
    expect(hookSource).toContain('workflowMode: response.data.data.workflowMode');
    expect(modalSource).toContain('useWorkflowMode');
    expect(modalSource).toContain('getWorkflowModeLabel');
    expect(modalSource).toContain('Export Items to {exportTemplateLabel || workflowModeLabel} CSV');
    expect(modalSource).toContain('exportAll({ workflowMode })');
    expect(modalSource).toContain('exportFiltered(filters, { workflowMode })');
    expect(modalSource).toContain('exportByIds(Array.from(selectedIds), { workflowMode })');
  });
});
