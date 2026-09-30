import { useEffect, useState } from 'react';
import { CalendarDays, Download, Filter, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterCountBadge from './PosFilterCountBadge.jsx';
import PosSearchField from './PosSearchField.jsx';
import { POS_FILTER_TRIGGER_HEIGHT_CLASS, POS_TOOLBAR_CONTROL_HEIGHT_CLASS } from './posToolbarSizing.js';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const EMPTY_FILTERS = { terminalId: '', closedBy: '' };
const inputClassName = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

export default function PosZReadingHistoryToolbar({
  searchQuery = '',
  onSearchQueryChange,
  filters = EMPTY_FILTERS,
  onApplyFilters,
  onRemoveFilter,
  onClearAllFilters,
  activeFilterChips = [],
  onOpenDateFilter,
  dateFilterButtonRef,
  dateFilterOpen = false,
  filterButtonRef,
  onPrint,
  onExport,
  printDisabled = false,
  exportDisabled = false,
  actionBusy = false
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_FILTERS });
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const position = usePosReportsPopoverPosition({ open, anchorRef: filterButtonRef, maxWidth: 464 });
  const activeFilterCount = Number(Boolean(filters.terminalId)) + Number(Boolean(filters.closedBy));

  useEffect(() => {
    if (open) setDraft({ ...EMPTY_FILTERS, ...filters });
  }, [filters, open]);

  const applyFilters = () => {
    onApplyFilters?.({
      terminalId: String(draft.terminalId || '').trim(),
      closedBy: String(draft.closedBy || '').trim()
    });
    setOpen(false);
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PosSearchField
            ariaLabel="Search Z-reading history"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            onClear={() => onSearchQueryChange?.('')}
            placeholder="Search by reading, business date, terminal, or cashier"
            className="min-w-0 flex-1"
            inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              ref={filterButtonRef}
              className={`relative ${POS_FILTER_TRIGGER_HEIGHT_CLASS} w-11 min-w-0 shrink-0 justify-center gap-1 rounded-xl bg-[#1A4E8D] px-0 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:text-[13px] lg:w-auto lg:gap-1.5 lg:px-3`}
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="pos-z-reading-history-filter-dialog"
              aria-label={`Filter${activeFilterCount ? `, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} applied` : ''}`}
              title="Filter Z-readings"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Filter</span>
              <PosFilterCountBadge count={activeFilterCount} />
            </Button>
            <Button
              type="button"
              ref={dateFilterButtonRef}
              variant="outline"
              className={`${POS_FILTER_TRIGGER_HEIGHT_CLASS} w-11 min-w-0 shrink-0 justify-center gap-1 rounded-xl border-[#A9C5EA] px-0 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF] sm:text-[13px] lg:w-auto lg:gap-1.5 lg:px-3`}
              onClick={onOpenDateFilter}
              aria-haspopup="dialog"
              aria-expanded={dateFilterOpen}
              aria-controls="pos-reports-date-dialog"
              aria-label="Filter by Date"
              title="Filter by Date"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Filter by Date</span>
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-slate-300 lg:block" />
          <Button
            type="button"
            className="min-h-11 min-w-0 flex-1 gap-1.5 rounded-xl bg-slate-900 px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-slate-800 sm:min-h-10 sm:flex-none sm:px-4 sm:text-[13px] lg:min-h-9"
            onClick={onPrint}
            disabled={printDisabled || actionBusy}
          >
            <Printer className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
            <span>Print / Save PDF</span>
          </Button>
          <Button
            type="button"
            className="min-h-11 min-w-0 flex-1 gap-1.5 rounded-xl bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:min-h-10 sm:flex-none sm:px-4 sm:text-[13px] lg:min-h-9"
            onClick={onExport}
            disabled={exportDisabled || actionBusy}
          >
            <Download className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
            <span>{actionBusy ? 'Preparing…' : 'Export CSV'}</span>
          </Button>
        </div>
      </div>

      <PosAppliedFilterChips
        activeFilters={activeFilterChips}
        onRemoveFilter={onRemoveFilter}
        onClearAllFilters={onClearAllFilters}
        groupLabel="Applied Z-reading history filters"
        clearAllAriaLabel="Clear all Z-reading history filters"
      />

      <PosFilterDialogShell
        open={open}
        onClose={() => setOpen(false)}
        mode="filters"
        mobile={isMobileDialog}
        position={position}
        id="pos-z-reading-history-filter-dialog"
        ariaLabelledBy="pos-z-reading-history-filter-title"
        ariaDescribedBy="pos-z-reading-history-filter-description"
      >
        <PosFilterDialogHeader
          title="Filter Z-readings"
          description="Narrow saved readings by the terminal or cashier who closed them."
          titleId="pos-z-reading-history-filter-title"
          descriptionId="pos-z-reading-history-filter-description"
          onClose={() => setOpen(false)}
          mobile={isMobileDialog}
        />
        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="pos-z-reading-filter-terminal">
            Terminal
            <input
              id="pos-z-reading-filter-terminal"
              data-testid="pos-z-reading-filter-terminal"
              className={inputClassName}
              value={draft.terminalId}
              onChange={(event) => setDraft((current) => ({ ...current, terminalId: event.target.value }))}
              placeholder="For example, COUNTER-01"
              maxLength={100}
            />
          </label>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="pos-z-reading-filter-closer">
            Closed by
            <input
              id="pos-z-reading-filter-closer"
              data-testid="pos-z-reading-filter-closer"
              className={inputClassName}
              value={draft.closedBy}
              onChange={(event) => setDraft((current) => ({ ...current, closedBy: event.target.value }))}
              placeholder="Cashier name or email"
              maxLength={100}
            />
          </label>
        </div>
        <PosFilterDialogFooter
          onReset={() => setDraft({ ...EMPTY_FILTERS })}
          onApply={applyFilters}
          applyLabel="Apply Filters"
          mobile={isMobileDialog}
          applyIcon={Filter}
        />
      </PosFilterDialogShell>
    </div>
  );
}
