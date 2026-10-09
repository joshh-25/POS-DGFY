import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(posRoot, '../..');
const panelPath = path.join(repositoryRoot, 'packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx');
const terminalLayoutPath = path.join(repositoryRoot, 'packages/web-core/src/features/pos/components/TerminalPageLayout.jsx');
const operationsWorkspacePath = path.join(repositoryRoot, 'packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx');

describe('POS voucher management presentation contract', () => {
  it('keeps voucher filters inside the Items-style filter surface as labeled buttons', () => {
    const source = fs.readFileSync(panelPath, 'utf8');
    const listView = source.slice(source.indexOf('const renderListView'), source.indexOf('const renderForm'));

    expect(listView).toContain('pos-items-desktop-toolbar');
    expect(listView).toContain('pos-items-mobile-controls');
    expect(listView).toContain('h-9 rounded-lg border-[#1A4E8D]');
    expect(listView).toContain('h-9 rounded-lg bg-[#1A4E8D]');
    expect(listView).toContain('pos-vouchers-desktop-filters');
    expect(listView).toContain('pos-vouchers-mobile-filter-dialog');
    expect(listView).toContain('pos-filter-surface--extended');
    expect(listView).toContain('pos-items-reset-action');
    expect(listView).toContain('Apply Filters');
    expect(listView).toContain('label="Status"');
    expect(listView).toContain('label="Type"');
    expect(listView).toContain('label="Benefit Type"');
    expect(listView).toContain('label="Sort"');
    expect(listView).toContain('label="Direction"');
    expect(listView).toContain('VOUCHER_DIRECTION_OPTIONS');
    expect(listView).toContain('hidePageSizeSuffixOnMobile');
    expect(listView).toContain('dgfy-pos-history-pagination-footer mt-auto shrink-0 rounded-none border-0 border-t');
    expect(listView).not.toContain('<select');
    expect(source).toContain('useLayoutEffect(() =>');
  });

  it('keeps the API-backed list and actions mounted under the redesigned presentation', () => {
    const source = fs.readFileSync(panelPath, 'utf8');
    const listView = source.slice(source.indexOf('const renderListView'), source.indexOf('const renderForm'));

    expect(listView).toContain('loadVouchers');
    expect(listView).toContain('GlobalPagination');
    expect(listView).toContain('openEditForm(voucher)');
    expect(listView).toContain('openLifecycleConfirm(voucher,');
    expect(listView).toContain('voucher.redemption_stats');
    expect(listView).toContain('flex w-full min-w-0 items-center gap-1');
    expect(listView).toContain('sm:w-[6.5rem] sm:flex-none');
    expect(listView).toContain('flex min-w-0 flex-1 items-start gap-2');
    expect(listView).toContain('inline-flex shrink-0 items-center gap-1 rounded-full border');
    expect(listView).toContain('border-t border-slate-100 pt-2');
    expect(listView).toContain('hidden h-12 w-12 shrink-0 place-items-center');
    expect(listView).toContain('pos-voucher-card-row');
    expect(listView).toContain('pos-voucher-card-icon');
    expect(listView).toContain('h-3.5 w-3.5 shrink-0 text-[#1A4E8D] sm:hidden');
    expect(listView).toContain('text-[13px] font-black uppercase leading-tight');
    expect(listView).toContain('mt-1 min-w-0 max-w-full overflow-hidden');
    expect(listView).toContain('min-w-0 max-w-full overflow-hidden break-words line-clamp-2');
  });

  it('gives vouchers the same full-bleed workspace shell as Items', () => {
    const panel = fs.readFileSync(panelPath, 'utf8');
    const terminalLayout = fs.readFileSync(terminalLayoutPath, 'utf8');
    const operationsWorkspace = fs.readFileSync(operationsWorkspacePath, 'utf8');

    expect(panel).toContain('pos-voucher-catalog-workspace');
    expect(terminalLayout).toContain("posViewMode === 'settings_vouchers'");
    expect(terminalLayout).toContain('isFullBleedCatalogWorkspace');
    expect(operationsWorkspace).toContain('pos-catalog-workspace-shell');
    expect(operationsWorkspace).toContain('isFullBleedCatalogView');
  });

  it('uses the Items-sized modal treatment for new and edit voucher handling', () => {
    const source = fs.readFileSync(panelPath, 'utf8');
    const form = source.slice(source.indexOf('const renderForm'));

    expect(form).toContain('role="dialog"');
    expect(form).toContain('pos-voucher-form-modal');
    expect(form).toContain('pos-items-mobile-sheet-panel');
    expect(form).toContain('New Voucher');
    expect(form).toContain('Edit Voucher');
    expect(form).toContain('Create and configure POS catalog voucher & redemption rules');
    expect(form).toContain('Update POS catalog voucher & redemption rules');
    expect(form).toContain('Basics');
    expect(form).toContain('Benefit');
    expect(form).toContain('Minimums &amp; limits');
    expect(form).toContain('Create Voucher');
    expect(form).toContain('Save Changes');
    expect(form).toContain('pos-items-catalog-form-modal');
    expect(form).toContain('max-w-[64rem]');
    expect(form).toContain('bg-[#F8FAFC]');
    expect(form).toContain('disabled readOnly');
    expect(form).toContain('pos-items-modal-scroll-region');
    expect(form).toContain('grid shrink-0 grid-cols-2');
    expect(form).toContain('VOUCHER_MODAL_CHECKBOX_CLASS');
    expect(form).toContain('VOUCHER_MODAL_SELECT_CLASS');
    expect(form).toContain('WEEKDAY_FULL_LABELS');
    expect(form).toContain('pos-voucher-form-section');
    expect(form).toContain('<Ticket');
    expect(form).toContain('<BadgePercent');
    expect(form).toContain('<SlidersHorizontal');
    expect(form).toContain('Account restriction (optional)');
    expect(form).toContain('createdByUsername');
    expect(form).toContain('updatedByUsername');
    expect(form).toContain('pos-voucher-audit-meta');
    expect(form).toContain('<CalendarClock');
    expect(form).toContain('<ListChecks');
    expect(form).toContain('<BarChart3');
    expect(form).not.toContain('PHP');
    expect(form).not.toContain('₱, optional');
    expect(form).not.toContain('openLifecycleConfirm({ voucher_id: form.voucherId');
    expect(form).not.toContain('<Badge className');
    expect(form).toContain('grid grid-cols-1 gap-4 sm:grid-cols-3');
    expect(form).toContain('grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-7');
    expect(form).toContain('pos-voucher-weekday-grid');
    expect(form).not.toContain('rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5');
  });
});
