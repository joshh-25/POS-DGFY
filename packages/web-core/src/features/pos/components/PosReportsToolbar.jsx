import { CalendarDays, Download, Filter, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosFilterCountBadge from './PosFilterCountBadge.jsx';
import PosSearchField from './PosSearchField.jsx';
import {
  POS_FILTER_TRIGGER_HEIGHT_CLASS,
  POS_TOOLBAR_COMPACT_LABEL_CLASS,
  POS_TOOLBAR_CONTROL_HEIGHT_CLASS,
  POS_TOOLBAR_ICON_ACTION_CLASS
} from './posToolbarSizing.js';

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
      <div className="flex min-w-0 flex-col gap-2 min-[1024px]:flex-row min-[1024px]:items-center min-[1024px]:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PosSearchField
            ariaLabel="Search reports"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            onClear={() => onSearchQueryChange?.('')}
            placeholder="Search based on Date/Time, Transaction/Invoice, Cashier, or sales values"
            className="flex-1"
            inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
          />

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              ref={filterButtonRef}
              className={`relative ${POS_FILTER_TRIGGER_HEIGHT_CLASS} ${POS_TOOLBAR_ICON_ACTION_CLASS} gap-1 rounded-xl bg-[#1A4E8D] text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:text-[13px] min-[1024px]:gap-1.5`}
              onClick={onOpenFilters}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-controls="pos-reports-filter-dialog"
              aria-label={`Filter${activeFilterCount ? `, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} applied` : ''}`}
              title="Filter reports"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Filter</span>
              <PosFilterCountBadge count={activeFilterCount} />
            </Button>
            <Button
              type="button"
              ref={dateFilterButtonRef}
              variant="outline"
              className={`${POS_FILTER_TRIGGER_HEIGHT_CLASS} ${POS_TOOLBAR_ICON_ACTION_CLASS} gap-1 rounded-xl border-[#A9C5EA] text-[12px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF] sm:text-[13px] min-[1024px]:gap-1.5`}
              onClick={onOpenDateFilter}
              aria-haspopup="dialog"
              aria-expanded={dateFilterOpen}
              aria-controls="pos-reports-date-dialog"
              aria-label="Filter by Date"
              title="Filter by Date"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Filter by Date</span>
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span aria-hidden="true" className="hidden h-7 w-px bg-slate-300 lg:block" />
          <Button
            type="button"
            className={`min-h-11 gap-1.5 rounded-xl bg-slate-900 text-[12px] font-extrabold text-white shadow-sm hover:bg-slate-800 sm:text-[13px] min-[1024px]:min-h-9 ${POS_TOOLBAR_ICON_ACTION_CLASS}`}
            onClick={onPrint}
            disabled={printDisabled}
          >
            <Printer className="h-4 w-4 text-white" aria-hidden="true" />
            <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Print / Save PDF</span>
          </Button>
          <Button
            type="button"
            className={`min-h-11 gap-1.5 rounded-xl bg-[#1A4E8D] text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:text-[13px] min-[1024px]:min-h-9 ${POS_TOOLBAR_ICON_ACTION_CLASS}`}
            onClick={onExport}
            disabled={exportDisabled}
          >
            <Download className="h-4 w-4 text-white" aria-hidden="true" />
            <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Export CSV</span>
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
