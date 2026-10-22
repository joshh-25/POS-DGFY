import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, Filter, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { PosFilterChoiceGroup, PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterCountBadge from './PosFilterCountBadge.jsx';
import PosCashierFilterControl from './PosCashierFilterControl.jsx';
import PosSearchField from './PosSearchField.jsx';
import {
  POS_FILTER_TRIGGER_HEIGHT_CLASS,
  POS_TOOLBAR_COMPACT_LABEL_CLASS,
  POS_TOOLBAR_CONTROL_HEIGHT_CLASS,
  POS_TOOLBAR_ICON_ACTION_CLASS
} from './posToolbarSizing.js';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const EMPTY_FILTERS = { terminalId: '', closedBy: '' };

export default function PosZReadingHistoryToolbar({
  searchQuery = '',
  onSearchQueryChange,
  filters = EMPTY_FILTERS,
  onApplyFilters,
  terminalOptions = [],
  cashierOptions = [],
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
  const [cashierSearch, setCashierSearch] = useState('');
  const [cashierPickerOpen, setCashierPickerOpen] = useState(false);
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const position = usePosReportsPopoverPosition({ open, anchorRef: filterButtonRef, maxWidth: 464, fitContentHeight: true });
  const activeFilterCount = Number(Boolean(filters.terminalId)) + Number(Boolean(filters.closedBy));
  const normalizedTerminalOptions = useMemo(() => {
    const options = (Array.isArray(terminalOptions) ? terminalOptions : [])
      .filter((option) => option && option.value !== undefined)
      .map((option) => ({
        key: option.key || String(option.value || 'all-terminals'),
        value: String(option.value || ''),
        label: String(option.label || option.value || 'All terminals')
      }));
    return options.length > 0
      ? options
      : [{ key: 'all-terminals', value: '', label: 'All terminals' }];
  }, [terminalOptions]);
  const normalizedCashierOptions = useMemo(() => (Array.isArray(cashierOptions) ? cashierOptions : [])
    .filter((option) => option && option.value !== undefined && String(option.value).trim())
    .map((option) => ({
      key: option.key || String(option.value),
      value: String(option.value),
      label: String(option.label || option.value)
    })), [cashierOptions]);

  useEffect(() => {
    if (open) {
      setDraft({ ...EMPTY_FILTERS, ...filters });
      setCashierSearch(String(filters.closedBy || ''));
      setCashierPickerOpen(Boolean(filters.closedBy));
    }
  }, [filters, open]);

  const applyFilters = () => {
    onApplyFilters?.({
      terminalId: String(draft.terminalId || '').trim(),
      closedBy: String(draft.closedBy || '').trim()
    });
    setOpen(false);
  };

  const resetFilters = () => {
    setDraft({ ...EMPTY_FILTERS });
    setCashierSearch('');
    setCashierPickerOpen(false);
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-col gap-2 min-[1024px]:flex-row min-[1024px]:items-center min-[1024px]:gap-4">
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
              className={`relative ${POS_FILTER_TRIGGER_HEIGHT_CLASS} ${POS_TOOLBAR_ICON_ACTION_CLASS} gap-1 rounded-xl bg-[#1A4E8D] text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:text-[13px] min-[1024px]:gap-1.5`}
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="pos-z-reading-history-filter-dialog"
              aria-label={`Filter${activeFilterCount ? `, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} applied` : ''}`}
              title="Filter Z-readings"
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

        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-slate-300 lg:block" />
          <Button
            type="button"
            className={`min-h-11 gap-1.5 rounded-xl bg-slate-900 text-[12px] font-extrabold text-white shadow-sm hover:bg-slate-800 sm:text-[13px] min-[1024px]:min-h-9 ${POS_TOOLBAR_ICON_ACTION_CLASS}`}
            onClick={onPrint}
            disabled={printDisabled || actionBusy}
          >
            <Printer className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
            <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Print / Save PDF</span>
          </Button>
          <Button
            type="button"
            className={`min-h-11 gap-1.5 rounded-xl bg-[#1A4E8D] text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:text-[13px] min-[1024px]:min-h-9 ${POS_TOOLBAR_ICON_ACTION_CLASS}`}
            onClick={onExport}
            disabled={exportDisabled || actionBusy}
          >
            <Download className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
            <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>{actionBusy ? 'Preparing…' : 'Export CSV'}</span>
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
        fitContentHeight
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
        <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto px-4 ${isMobileDialog ? 'py-3' : 'py-4'}`}>
          <div className="grid min-w-0 gap-4">
            <PosFilterChoiceGroup
              label="Terminal"
              value={draft.terminalId}
              options={normalizedTerminalOptions}
              onChange={(value) => setDraft((current) => ({ ...current, terminalId: String(value || '') }))}
              testId="pos-z-reading-filter-terminal"
              compact={!isMobileDialog}
              mobile={isMobileDialog}
              groupAriaLabel="Terminal options"
            />
            <PosCashierFilterControl
              value={draft.closedBy}
              searchValue={cashierSearch}
              options={normalizedCashierOptions}
              onSearchChange={setCashierSearch}
              onChange={(value) => setDraft((current) => ({ ...current, closedBy: String(value || '') }))}
              expanded={cashierPickerOpen}
              onExpandedChange={setCashierPickerOpen}
              compact={!isMobileDialog}
              mobile={isMobileDialog}
              label="Closed by"
              optionsLabel="Cashier options"
              allLabel="All cashiers"
              id="pos-z-reading-filter-cashier-search"
              testIdPrefix="pos-z-reading-filter-cashier"
              optionName="pos-z-reading-filter-cashier"
            />
          </div>
        </div>
        <PosFilterDialogFooter
          onReset={resetFilters}
          onApply={applyFilters}
          applyLabel="Apply Filters"
          mobile={isMobileDialog}
          applyIcon={Filter}
        />
      </PosFilterDialogShell>
    </div>
  );
}
