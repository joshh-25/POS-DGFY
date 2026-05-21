import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('CSV import workflow-mode contracts', () => {
  it('uses workflow_mode query param for template downloads', () => {
    const hookPath = path.resolve(process.cwd(), 'src/hooks/useCSVImport.js');
    const source = fs.readFileSync(hookPath, 'utf8');

    expect(source).toContain('/items/import/template?workflow_mode=');
    expect(source).toContain('normalizeTemplateRequest');
    expect(source).toContain("services_items_import_template.csv");
    expect(source).toContain("fnb_items_import_template.csv");
  });

  it('uses a single workflow-mode-specific template button in the modal', () => {
    const modalPath = path.resolve(process.cwd(), 'Components/items/CSVImportModal.jsx');
    const source = fs.readFileSync(modalPath, 'utf8');

    expect(source).toContain('Download {getWorkflowModeLabel(workflowMode)} Template');
    expect(source).not.toContain('Products Template');
    expect(source).toContain('WORKFLOW_MODE_TEMPLATE_MISMATCH');
  });

  it('passes workflow_mode query/body values for CSV exports', () => {
    const hookPath = path.resolve(process.cwd(), 'src/hooks/useCSVExport.js');
    const modalPath = path.resolve(process.cwd(), 'Components/items/CSVExportModal.jsx');
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
