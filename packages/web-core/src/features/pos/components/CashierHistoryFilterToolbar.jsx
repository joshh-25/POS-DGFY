import { useRef, useState } from 'react';
import { CalendarDays, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosDateRangeFilterPanel from './PosDateRangeFilterPanel.jsx';
import PosFilterCountBadge from './PosFilterCountBadge.jsx';
import PosSearchField from './PosSearchField.jsx';
import { PosFilterChoiceGroup, PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import {
  POS_FILTER_TRIGGER_HEIGHT_CLASS,
  POS_TOOLBAR_COMPACT_LABEL_CLASS,
  POS_TOOLBAR_CONTROL_HEIGHT_CLASS,
  POS_TOOLBAR_ICON_ACTION_CLASS
} from './posToolbarSizing.js';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' }
];

export default function CashierHistoryFilterToolbar({
  status = 'all',
  onApplyStatus,
  dateRange = {},
  todayDate = '',
  activeFilterChips = [],
  onRemoveFilter,
  onClearAllFilters,
  onApplyDateRange,
  searchQuery = '',
  onSearchQueryChange,
  cashierName = '',
  actionDisabled = false,
  refreshAction = null
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState(status);
  const filterButtonRef = useRef(null);
  const dateFilterButtonRef = useRef(null);
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const position = usePosReportsPopoverPosition({ open: filtersOpen, anchorRef: filterButtonRef, maxWidth: 464, fitContentHeight: true });
  const activeFilterCount = activeFilterChips.length;

  const applyStatus = () => {
    onApplyStatus?.(statusDraft);
    setFiltersOpen(false);
  };

  const applyDateRange = (nextDateRange) => {
    onApplyDateRange?.(nextDateRange);
    setDateFilterOpen(false);
  };

  return (
    <div className="min-w-0 space-y-2" data-testid="pos-cashier-history-filter-toolbar">
      <div className="flex min-w-0 flex-col gap-2 min-[1024px]:flex-row min-[1024px]:items-center min-[1024px]:gap-4" data-testid="pos-cashier-history-toolbar-controls">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PosSearchField
            ariaLabel="Search cashier history"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            onClear={() => onSearchQueryChange?.('')}
            placeholder="Search shift # or terminal ID"
            disabled={actionDisabled}
            className="flex-1"
            inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
          />

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              ref={filterButtonRef}
              disabled={actionDisabled}
              className={`relative ${POS_FILTER_TRIGGER_HEIGHT_CLASS} ${POS_TOOLBAR_ICON_ACTION_CLASS} gap-1 rounded-xl bg-[#1A4E8D] text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:text-[13px] min-[1024px]:gap-1.5`}
              onClick={() => {
                setStatusDraft(status);
                setFiltersOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-controls="pos-cashier-history-filter-dialog"
              aria-label={`Filter${activeFilterCount ? `, ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} applied` : ''}`}
              title="Filter cashier history"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Filter</span>
              <PosFilterCountBadge count={activeFilterCount} />
            </Button>
            <Button
              type="button"
              ref={dateFilterButtonRef}
              variant="outline"
              disabled={actionDisabled}
              className={`${POS_FILTER_TRIGGER_HEIGHT_CLASS} ${POS_TOOLBAR_ICON_ACTION_CLASS} gap-1 rounded-xl border-[#A9C5EA] text-[12px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF] sm:text-[13px] min-[1024px]:gap-1.5`}
              onClick={() => setDateFilterOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={dateFilterOpen}
              aria-controls="pos-cashier-history-date-dialog"
              aria-label="Filter by Date"
              title="Filter by Date"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className={POS_TOOLBAR_COMPACT_LABEL_CLASS}>Filter by Date</span>
            </Button>
            {refreshAction}
          </div>
        </div>
      </div>

      <PosAppliedFilterChips
        activeFilters={activeFilterChips}
        onRemoveFilter={onRemoveFilter}
        onClearAllFilters={onClearAllFilters}
        groupLabel="Applied cashier history filters"
        clearAllAriaLabel="Clear all cashier history filters"
      />

      <PosFilterDialogShell
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        mode="filters"
        mobile={isMobileDialog}
        fitContentHeight
        position={position}
        id="pos-cashier-history-filter-dialog"
        ariaLabelledBy="pos-cashier-history-filter-title"
        ariaDescribedBy="pos-cashier-history-filter-description"
      >
        <PosFilterDialogHeader
          title="Filter cashier history"
          description={cashierName ? `Filter ${cashierName}'s shifts.` : 'Filter your shifts.'}
          titleId="pos-cashier-history-filter-title"
          descriptionId="pos-cashier-history-filter-description"
          onClose={() => setFiltersOpen(false)}
          mobile={isMobileDialog}
        />
        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2.5'} dgfy-pos-history-dialog-body`}>
          <PosFilterChoiceGroup
            label="Status"
            value={statusDraft}
            options={STATUS_OPTIONS}
            onChange={setStatusDraft}
            testId="pos-cashier-history-filter-status"
            compact={!isMobileDialog}
            mobile={isMobileDialog}
            groupAriaLabel="Cashier history status"
          />
        </div>
        <PosFilterDialogFooter
          onReset={() => setStatusDraft('all')}
          onApply={applyStatus}
          disabled={actionDisabled}
          mobile={isMobileDialog}
          className={`${isMobileDialog ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2.5'} dgfy-pos-history-dialog-footer`}
          leftButtonClassName="border-[#A9C5EA] bg-white text-[13px] font-extrabold text-[#1A4E8D] shadow-none hover:border-[#1A4E8D] hover:bg-[#F5F9FF]"
          applyButtonClassName="text-[13px]"
        />
      </PosFilterDialogShell>

      <PosDateRangeFilterPanel
        key={dateFilterOpen ? 'cashier-history-date-open' : 'cashier-history-date-closed'}
        open={dateFilterOpen}
        onClose={() => setDateFilterOpen(false)}
        onApplyDateRange={applyDateRange}
        dateRange={dateRange}
        anchorRef={dateFilterButtonRef}
        dialogId="pos-cashier-history-date-dialog"
        titleId="pos-cashier-history-date-title"
        descriptionId="pos-cashier-history-date-description"
        title="Select shift dates"
        description="Choose a business-date range."
        datePickerTestIdPrefix="pos-cashier-history-date-calendar"
        todayDate={todayDate}
        timeZone="Asia/Manila"
        actionDisabled={actionDisabled}
        fitContentHeight
      />
    </div>
  );
}
