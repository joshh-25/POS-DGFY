import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const readWebCoreFile = (relativePath) => readFileSync(path.join(repositoryRoot, 'packages/web-core/src', relativePath), 'utf8');
const managerSource = readWebCoreFile('features/pos/components/PosFnbModifierManager.jsx');
const assignmentSource = readWebCoreFile('features/pos/components/PosFnbModifiersWorkspace.jsx');
const posStyles = readWebCoreFile('index.css');

describe('Items options mobile layout', () => {
  it('keeps bulk-assignment helper copy concise for small screens', () => {
    expect(assignmentSource).toContain("description={isBulkEditor ? 'Unchanged category groups stay assigned.'");
    expect(assignmentSource).toContain("description={isBulkEditor ? 'Inherited and unchanged groups stay assigned.'");
    expect(assignmentSource).not.toContain('Apply group changes across the selected items.');
  });

  it('stretches the shared assignment search and card surfaces across the mobile content width', () => {
    expect(assignmentSource).toContain('pos-items-options-panel flex min-h-0 min-w-0 flex-1 flex-col max-[767px]:w-full');
    expect(assignmentSource).toContain('px-4 py-3 max-[767px]:px-0 sm:flex-row');
    expect(assignmentSource).toContain('sm:flex-row sm:items-end sm:justify-between max-[767px]:w-full');
    expect(assignmentSource).toContain('sm:w-[min(100%,30rem)] max-[767px]:w-full');
    expect(assignmentSource).toContain('pos-items-options-assignment-table-surface flex min-h-0 flex-1 flex-col max-[767px]:w-full');
    expect(assignmentSource).toContain('space-y-2 p-3 max-[767px]:w-full');
    expect(assignmentSource).toContain('max-[767px]:w-full max-[767px]:px-0');
  });

  it('aligns the option-group content edges with the subtab rail', () => {
    expect(managerSource).toContain('pos-items-options-manager-content flex min-h-0 min-w-0 flex-1 flex-col py-3 sm:py-4');
  });

  it('removes the extra option-group list frame on phones and keeps its cards scrollable above the footer', () => {
    expect(managerSource).toContain('pos-items-options-group-catalog-list');
    expect(managerSource).toContain('max-[767px]:rounded-none max-[767px]:border-0');
    expect(managerSource).toContain('className={`${POS_PAGINATION_FOOTER_CLASS} mt-3 max-[767px]:mt-0`}');
    expect(posStyles).toContain('.pos-items-options-workspace .pos-items-options-manager .pos-items-options-group-catalog-list {');
    expect(posStyles).toContain('flex: 1 1 0%;\n    height: auto;\n    min-height: 0;\n    max-height: none;');
    expect(posStyles).toContain('overflow-y: hidden;');
  });

  it('aligns mobile option-group cards and uses compact status and colored visibility badges', () => {
    const mobileCardsStart = managerSource.indexOf('visibleGroups.length ? isOverlayViewport ?');
    const mobileTableStart = managerSource.indexOf(') : <table', mobileCardsStart);
    const mobileCardsMarkup = managerSource.slice(mobileCardsStart, mobileTableStart);

    expect(mobileCardsMarkup).toContain('space-y-2 px-0 py-3');
    expect(mobileCardsMarkup).not.toContain('statusBadge(');
    expect(mobileCardsMarkup).toContain("{isActive ? 'Active' : 'Inactive'}");
    expect(mobileCardsMarkup).toContain('Choose up to ${Math.max(1, Number(group.max_select || 1))} optional');
    expect(mobileCardsMarkup).toContain('bg-blue-50 text-[#1A4E8D]');
    expect(mobileCardsMarkup).toContain('bg-emerald-50 text-emerald-700');
  });

  it('keeps option choices in the main editor scroll and uses 36px choice fields', () => {
    expect(managerSource).toContain('data-testid="fnb-option-group-editor-scroll" role="region" aria-label="Option group editor fields" tabIndex={0}');
    expect(managerSource).toContain('data-testid="fnb-modifier-options-list" className="pos-fnb-modifier-choice-list min-w-0 space-y-2"');
    expect(managerSource).not.toContain('data-testid="fnb-modifier-options-list" className="pos-items-options-list');
    expect(managerSource).not.toContain('data-testid="fnb-modifier-options-list" className="dgfy-pos-scroll-region');

    const choiceInputs = managerSource.split('\n').filter((line) => (
      line.includes('aria-label={`Choice') && line.includes('className="h-9 w-full')
    ));
    expect(choiceInputs).toHaveLength(2);
    expect(choiceInputs.every((line) => !line.includes('h-11'))).toBe(true);
  });

  it('keeps the desktop option-group editor arrow inside its clipped panel', () => {
    expect(managerSource).toContain('min-[1200px]:left-0 min-[1200px]:right-auto min-[1200px]:top-1/2');
    expect(managerSource).not.toContain('min-[1200px]:left-[-1rem]');
  });

  it('removes the assignment surface frame on phones while retaining card borders and a separate scroll region', () => {
    expect(assignmentSource).toContain('pos-items-options-assignment-table-surface');
    expect(assignmentSource).toContain('max-[767px]:rounded-none max-[767px]:border-0 max-[767px]:shadow-none');
    expect(assignmentSource).toContain('data-testid="pos-fnb-assignment-table-scroll-region" className="dgfy-pos-scroll-region min-h-0 flex-1 overflow-auto max-[767px]:w-full"');
    expect(assignmentSource).toContain('rounded-xl border p-3');
    expect(assignmentSource).toContain('className={`${POS_PAGINATION_FOOTER_CLASS} mt-3 max-[767px]:mt-0`}');
    expect(posStyles).toContain('flex: 1 1 0%;\n    flex-direction: column;\n    min-height: 0;\n    overflow: hidden;');
  });

  it('keeps bulk selection from tinting assignment rows and styles clear selection like the discard action', () => {
    expect(assignmentSource).toContain("const isAssignmentTarget = assignmentOpen && id === String(selectedId);");
    expect(assignmentSource).toContain("${isAssignmentTarget ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'}");
    expect(assignmentSource).toContain('border-rose-200 bg-[#fff1f2]/70');
    expect(assignmentSource).toContain('checked={selectedTargetSet.has(id)}');
  });

  it('separates the bulk-selection banner from the table in both assignment views', () => {
    expect(assignmentSource).toContain('className="mb-2 flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" role="status"');
  });

  it('places a compact selected-count badge on the option-group search-label row', () => {
    expect(assignmentSource).toContain('<div className="flex min-w-0 items-center justify-between gap-2">');
    expect(assignmentSource).toContain('<label htmlFor={searchId} className="min-w-0 flex-1 text-[10px] font-bold text-[#334155]">{searchLabel}</label>');
    expect(assignmentSource).toContain('className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-slate-600">{selectedIds.length} selected</span>');
    expect(assignmentSource).toContain('{selectionTargetLabel || hasUnsavedChanges ? (');
    expect(assignmentSource).not.toContain('rounded-full bg-slate-100 px-2 py-1 text-slate-600">{selectedIds.length} selected');
  });

  it('uses an assignment-specific icon and concise visible label for category and item rows', () => {
    expect(assignmentSource).toContain('ListPlus');
    expect(assignmentSource).toContain("aria-label={canManage ? 'Assign groups' : 'View groups'}");
    expect(assignmentSource.match(/canManage \? 'Assign' : 'View groups'/g)).toHaveLength(2);
    expect(assignmentSource.match(/<ListPlus className="h-3\.5 w-3\.5" aria-hidden="true" \/>/g)).toHaveLength(2);
    expect(assignmentSource.match(/<Eye className="h-3\.5 w-3\.5" aria-hidden="true" \/>/g)).toHaveLength(2);
  });
});
