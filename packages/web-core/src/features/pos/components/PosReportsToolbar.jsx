import { CalendarDays, Download, Filter, Printer, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search reports</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              placeholder="Search based on Date/Time, Transaction/Invoice, Cashier, or sales values"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/15"
            />
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              ref={filterButtonRef}
              className="h-11 min-h-11 w-11 min-w-0 shrink-0 justify-center gap-1 rounded-xl bg-[#1A4E8D] px-0 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:text-[13px] lg:h-9 lg:min-h-9 lg:w-auto lg:gap-1.5 lg:px-3"
              onClick={onOpenFilters}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-controls="pos-reports-filter-dialog"
              aria-label={`Filter${activeFilterCount ? `, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} applied` : ''}`}
              title="Filter reports"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Filter</span>
              {activeFilterCount > 0 ? (
                <span aria-hidden="true" className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black leading-none text-[#1A4E8D]">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              ref={dateFilterButtonRef}
              variant="outline"
              className="h-11 min-h-11 w-11 min-w-0 shrink-0 justify-center gap-1 rounded-xl border-[#A9C5EA] px-0 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF] sm:text-[13px] lg:h-9 lg:min-h-9 lg:w-auto lg:gap-1.5 lg:px-3"
              onClick={onOpenDateFilter}
              aria-haspopup="dialog"
              aria-expanded={dateFilterOpen}
              aria-controls="pos-reports-date-dialog"
              aria-label="Filter by date"
              title="Filter by date"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Filter by date</span>
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

      {activeFilterCount > 0 ? (
        <div role="group" aria-label="Applied report filters" aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-2">
          {activeFilterChips.map((filter) => (
            <button
              key={filter.key}
              type="button"
              title={filter.label}
              aria-label={`Remove filter: ${filter.label}`}
              onClick={() => onRemoveFilter?.(filter.key)}
              className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-1 text-left text-[12px] font-semibold text-[#1A4E8D] transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/35 focus-visible:ring-offset-1"
            >
              <span className="max-w-[min(65vw,18rem)] truncate">{filter.label}</span>
              <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </button>
          ))}
          <span aria-hidden="true" className="hidden h-6 w-px bg-slate-200 sm:block" />
          <button
            type="button"
            onClick={onClearAllFilters}
            aria-label="Clear all report filters"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-bold text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 focus-visible:ring-offset-1"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Clear all</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
