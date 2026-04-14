import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('CSV import workflow-mode contracts', () => {
  it('uses workflow_mode query param for template downloads', () => {
    const hookPath = path.resolve(process.cwd(), 'src/hooks/useCSVImport.js');
    const source = fs.readFileSync(hookPath, 'utf8');

    expect(source).toContain('/items/import/template?workflow_mode=');
    expect(source).toContain('normalizeTemplateRequest');
  });

  it('uses a single workflow-mode-specific template button in the modal', () => {
    const modalPath = path.resolve(process.cwd(), 'Components/items/CSVImportModal.jsx');
    const source = fs.readFileSync(modalPath, 'utf8');

    expect(source).toContain('Download {getWorkflowModeLabel(workflowMode)} Template');
    expect(source).not.toContain('Products Template');
    expect(source).toContain('WORKFLOW_MODE_TEMPLATE_MISMATCH');
  });
});
