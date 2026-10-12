import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(posRoot, '../..');
const panelPath = path.join(repositoryRoot, 'packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx');
const stylesPath = path.join(repositoryRoot, 'packages/web-core/src/index.css');
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
    expect(listView).not.toContain('label="Direction"');
    expect(listView).not.toContain('VOUCHER_DIRECTION_OPTIONS');
    expect(listView).toContain('data-testid="pos-vouchers-sort-direction-toggle"');
    expect(listView).toContain('<SortAsc');
    expect(listView).toContain('<SortDesc');
    expect(listView).toContain('<VoucherPlusIcon');
    expect(source).toContain('const VoucherPlusIcon =');
    expect(source).toContain('M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z');
    expect(source).toContain('M9 12h6');
    expect(source).toContain('M12 9v6');
    expect(listView).toContain('hidePageSizeSuffixOnMobile');
    expect(listView).toContain('dgfy-pos-history-pagination-footer mt-auto shrink-0 rounded-none border-0 border-t');
    expect(listView).not.toContain('<select');
    expect(source).toContain("const [direction, setDirection] = useState('asc');");
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
    expect(form).toContain('flex w-full flex-wrap items-center gap-x-6 gap-y-2 pb-1 sm:col-span-2 lg:col-span-3');
    expect(form).toContain('whitespace-nowrap text-xs font-semibold text-[#0F172A]');
    expect(form).toContain('flex flex-wrap items-center gap-x-6 gap-y-2');
    expect(form).toContain('inline-flex items-center gap-2 text-xs font-semibold text-slate-700');
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

  it('adds low-emphasis example placeholders to editable voucher fields', () => {
    const source = fs.readFileSync(panelPath, 'utf8');
    const form = source.slice(source.indexOf('const renderForm'));

    expect(source).toContain("const VOUCHER_FORM_PLACEHOLDER_CLASS = 'placeholder:text-slate-400 placeholder:opacity-70';");

    [
      'placeholder="e.g. SUMMER15"',
      'placeholder="e.g. Save on your next order"',
      'placeholder="e.g. 15% OFF"',
      'placeholder="e.g. Valid for new customers"',
      'placeholder="e.g. 50.00"',
      'placeholder="e.g. 15"',
      'placeholder="e.g. 100"',
      'placeholder="e.g. 299.00"',
      'placeholder="e.g. 500"',
      'placeholder="e.g. 5000"',
      'placeholder="e.g. 2"',
      'placeholder="e.g. 1000"',
      'placeholder="e.g. 1"',
    ].forEach((placeholder) => expect(form).toContain(placeholder));

    expect(form).toContain("placeholder={form.voucherKind === 'delivery_campaign' ? 'e.g. Free delivery over ₱500' : 'e.g. Summer Sale 15% Off'}");
    expect(form).toContain('<SelectValue placeholder="Choose a benefit type..." />');
    expect(form).toContain('<SelectValue placeholder="Select a pricelist (e.g. Wholesale)..." />');
    expect(form).toContain('<SelectValue placeholder="Choose a scope type..." />');
    expect(form).toContain('placeholder={scopeTypeDraft === \'item\' ? \'Select an item...\' : \'Select a folder...\'}');
    expect(form).toContain("placeholder={'e.g. 1024\\n2048 — one account ID per line'}");
    expect(form).toContain('<PosDateRangeField');
    expect(form).toContain('id="pos-voucher-validity-range"');
    expect(form).toContain('title="Select validity dates"');
    expect(form).toContain('openLabel="Open validity dates calendar"');
    expect(form).toContain('<PosTimeRangeField');
    expect(form).toContain('id="pos-voucher-time-range"');
    expect(form).toContain('title="Select daily time window"');
    expect(form).toContain('openLabel="Open daily time window"');
    expect(form).toContain('startPlaceholder="e.g. 09:00 AM"');
    expect(form).toContain('endPlaceholder="e.g. 06:00 PM"');
    expect(form).not.toContain('<Input type="time"');
    expect(form).toContain('sm:col-span-2 lg:col-span-2');
    expect(form).toContain('layerClassName="z-[10000]"');
    expect(form).toContain('compact');

    const rangeFieldPath = path.join(repositoryRoot, 'packages/web-core/src/features/pos/components/PosDateRangeField.jsx');
    const rangeField = fs.readFileSync(rangeFieldPath, 'utf8');
    expect(rangeField).toContain("description = 'Select one date for a one-day voucher or two dates for a validity range.'");
    expect(rangeField).toContain('showPresets={false}');
    expect(rangeField).toContain('overlayClassName="bg-slate-950/60 backdrop-blur-sm"');
    expect(rangeField).toContain('applyLabel="Apply Dates"');
    expect(rangeField).toContain('h-auto max-h-[calc(100vh-2rem)]');
    expect(rangeField).toContain('aria-label="Selected validity dates"');
    expect(rangeField).toContain('text-[11px] font-semibold text-slate-500');
    expect(rangeField).toContain('font-normal text-slate-400 opacity-70');
    expect(rangeField).toContain('grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]');
    expect(rangeField).toContain('aria-orientation="vertical"');
    expect(rangeField).toContain('group-hover:bg-blue-50 group-hover:text-[#1A4E8D]');
    expect(rangeField).toContain('max-w-[36rem]');

    const timeFieldPath = path.join(repositoryRoot, 'packages/web-core/src/features/pos/components/PosTimeRangeField.jsx');
    const timeField = fs.readFileSync(timeFieldPath, 'utf8');
    expect(timeField).toContain('grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]');
    expect(timeField).toContain('role="listbox"');
    expect(timeField).toContain('[scrollbar-width:none] [&::-webkit-scrollbar]:hidden');
    expect(timeField).toContain('snap-y snap-mandatory');
    expect(timeField).toContain('text-lg font-semibold text-slate-400');
    expect(timeField).toContain('Apply Times');
    expect(timeField).toContain('overlayClassName="bg-slate-950/60 backdrop-blur-sm"');
    expect(timeField).toContain('className="h-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[36rem]"');
  });

  it('keeps voucher labels and controls aligned across responsive field grids', () => {
    const source = fs.readFileSync(panelPath, 'utf8');
    const styles = fs.readFileSync(stylesPath, 'utf8');
    const form = source.slice(source.indexOf('const renderForm'));

    expect(form).toContain('pos-voucher-form-grid');
    expect(form).toContain('pos-voucher-form-field');
    expect(form).toContain('pos-voucher-form-label-row');
    expect(styles).toContain('.pos-voucher-form-modal .pos-voucher-form-grid {');
    expect(styles).toContain('align-self: stretch;');
    expect(styles).toContain('.pos-voucher-form-modal .pos-voucher-form-field {');
    expect(styles).toContain('gap: 0.5rem;');
    expect(styles).toContain('margin-top: 0;');
    expect(styles).toContain('min-height: 1.25rem;');
    expect(styles).toContain('.pos-voucher-form-modal .pos-voucher-form-field > label {\n  display: block;\n}');
    expect(styles).not.toContain('display: grid;\n  align-content: center;');
    expect(styles).toContain('.pos-voucher-form-modal .pos-voucher-form-label-row {');
    expect(styles).toContain('button[role="combobox"]');
    expect(styles).toContain('margin-top: auto !important;');
  });
});
