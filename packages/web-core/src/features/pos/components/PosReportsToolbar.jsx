import { CalendarDays, Download, Filter, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosFilterCountBadge from './PosFilterCountBadge.jsx';
import PosSearchField from './PosSearchField.jsx';
import { POS_FILTER_TRIGGER_HEIGHT_CLASS, POS_TOOLBAR_CONTROL_HEIGHT_CLASS } from './posToolbarSizing.js';

export default function PosReportsToolbar({
  searchQuery = '',
  onSearchQueryChange,
  onOpenFilters,
  onOpenDateFilter,
  activeFilterChips = [],
  onRemoveFilter,
  onClearAllFilters,
  onPrint,
  onExport,
  exportDisabled = false,
  printDisabled = false,
  filtersOpen = false,
  dateFilterOpen = false,
  filterButtonRef,
  dateFilterButtonRef
}) {
  const activeFilterCount = activeFilterChips.length;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PosSearchField
            ariaLabel="Search reports"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            placeholder="Search based on Date/Time, Transaction/Invoice, Cashier, or sales values"
            className="flex-1"
            inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
          />

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              ref={filterButtonRef}
              className={`relative ${POS_FILTER_TRIGGER_HEIGHT_CLASS} w-11 min-w-0 shrink-0 justify-center gap-1 rounded-xl bg-[#1A4E8D] px-0 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:text-[13px] lg:w-auto lg:gap-1.5 lg:px-3`}
              onClick={onOpenFilters}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-controls="pos-reports-filter-dialog"
              aria-label={`Filter${activeFilterCount ? `, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} applied` : ''}`}
              title="Filter reports"
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

        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span aria-hidden="true" className="hidden h-7 w-px bg-slate-300 lg:block" />
          <Button
            type="button"
            className="min-h-11 min-w-0 flex-1 gap-1.5 rounded-xl bg-slate-900 px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-slate-800 sm:min-h-10 sm:flex-none sm:px-4 sm:text-[13px] lg:min-h-9"
            onClick={onPrint}
            disabled={printDisabled}
          >
            <Printer className="h-4 w-4 text-white" aria-hidden="true" />
            <span>Print / Save PDF</span>
          </Button>
          <Button
            type="button"
            className="min-h-11 min-w-0 flex-1 gap-1.5 rounded-xl bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:min-h-10 sm:flex-none sm:px-4 sm:text-[13px] lg:min-h-9"
            onClick={onExport}
            disabled={exportDisabled}
          >
            <Download className="h-4 w-4 text-white" aria-hidden="true" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      <PosAppliedFilterChips
        activeFilters={activeFilterChips}
        onRemoveFilter={onRemoveFilter}
        onClearAllFilters={onClearAllFilters}
        groupLabel="Applied report filters"
        clearAllAriaLabel="Clear all report filters"
      />
    </div>
  );
}
