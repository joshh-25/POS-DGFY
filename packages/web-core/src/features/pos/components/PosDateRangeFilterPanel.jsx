import { useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosDateRangePicker from './PosDateRangePicker.jsx';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const dateToInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const compareDates = (left, right) => left.localeCompare(right);

export default function PosDateRangeFilterPanel({
  open = false,
  onClose,
  onApplyDateRange,
  dateRange = {},
  anchorRef,
  dialogId = 'pos-date-range-dialog',
  titleId = 'pos-date-range-title',
  descriptionId = 'pos-date-range-description',
  title = 'Select Date',
  description = 'Choose a date range.',
  datePickerTestIdPrefix = 'pos-date-range-calendar',
  cancelTestId,
  applyTestId,
  resetButtonLabel = 'Reset date range',
  todayDate = '',
  timeZone,
  actionDisabled = false,
  fitContentHeight = false
}) {
  const initialFrom = dateRange.dateFrom || todayDate || dateToInput(new Date());
  const initialTo = dateRange.dateTo || initialFrom;
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const position = usePosReportsPopoverPosition({ open, anchorRef, maxWidth: 464, fitContentHeight });

  const rangeStart = draftFrom && draftTo && compareDates(draftFrom, draftTo) <= 0 ? draftFrom : draftTo;
  const rangeEnd = draftFrom && draftTo && compareDates(draftFrom, draftTo) <= 0 ? draftTo : draftFrom;

  const resetDateRange = () => {
    const today = todayDate || dateToInput(new Date());
    setDraftFrom(today);
    setDraftTo(today);
  };

  const applyDateRange = () => {
    if (!rangeStart || !rangeEnd) return;
    onApplyDateRange?.({ dateFrom: rangeStart, dateTo: rangeEnd });
  };

  if (!open) return null;

  return (
    <PosFilterDialogShell
      open={open}
      onClose={onClose}
      mode="calendar"
      mobile={isMobileDialog}
      fitContentHeight={fitContentHeight}
      position={position}
      id={dialogId}
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
    >
      <PosFilterDialogHeader
        title={title}
        description={description}
        titleId={titleId}
        descriptionId={descriptionId}
        onClose={onClose}
        closeLabel="Close date filter"
        mobile={isMobileDialog}
        headerAction={(
          <Button
            type="button"
            onClick={resetDateRange}
            aria-label={resetButtonLabel}
            className={`${isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'} shrink-0 bg-[#1A4E8D] p-0 text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73]`}
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
        className="dgfy-pos-history-dialog-header"
        titleClassName="text-xl font-black text-[#0F172A]"
        descriptionClassName="mt-0.5 text-[12px] text-slate-500"
      />

      <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2'} dgfy-pos-history-dialog-body`}>
        <PosDateRangePicker
          from={draftFrom}
          to={draftTo}
          onChange={(nextFrom, nextTo) => {
            setDraftFrom(nextFrom);
            setDraftTo(nextTo);
          }}
          mobile={isMobileDialog}
          testIdPrefix={datePickerTestIdPrefix}
          enableRangeDrag
          dateLabelStyle="short"
          todayDate={todayDate}
          timeZone={timeZone}
        />
      </div>

      <PosFilterDialogFooter
        onCancel={onClose}
        onApply={applyDateRange}
        applyIcon={CalendarDays}
        disabled={!rangeStart || !rangeEnd || actionDisabled}
        cancelLabel="Cancel"
        cancelTestId={cancelTestId}
        applyTestId={applyTestId}
        mobile={isMobileDialog}
        className={`${isMobileDialog ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2'} dgfy-pos-history-dialog-footer`}
        leftButtonClassName="h-9 border-[#A9C5EA] px-3 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF]"
        applyButtonClassName="h-9 text-[13px]"
      />
    </PosFilterDialogShell>
  );
}
