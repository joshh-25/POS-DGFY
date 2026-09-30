import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosDateRangePicker from './PosDateRangePicker.jsx';
import { PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const parseDateInput = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? date
    : null;
};

const dateToInput = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

const parseDateEntry = (value) => {
  const normalized = String(value || '').trim();
  const isoDate = parseDateInput(normalized);
  if (isoDate) return dateToInput(isoDate);

  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const [, month, day, year] = match;
  const parsedDate = parseDateInput(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  return parsedDate ? dateToInput(parsedDate) : '';
};

const getTodayInput = () => dateToInput(new Date());

const formatDateInput = (value) => {
  const date = parseDateInput(value);
  return date
    ? date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : 'Select date';
};

export default function PosSingleDatePicker({
  id = 'pos-single-date-picker',
  value = '',
  todayDate = '',
  onChange = () => {},
  describedBy
}) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(null);
  const [validationError, setValidationError] = useState('');
  const triggerRef = useRef(null);
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const dialogId = `${id}-dialog`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const calendarToday = parseDateInput(todayDate) ? todayDate : getTodayInput();
  const position = usePosReportsPopoverPosition({ open, anchorRef: triggerRef, maxWidth: 360 });
  const errorId = `${id}-error`;
  const displayValue = draftValue ?? formatDateInput(value);

  const validateDraft = () => {
    const parsedDate = parseDateEntry(displayValue);
    if (!parsedDate) {
      setValidationError('Enter a valid date in MM/DD/YYYY format.');
      return;
    }
    setDraftValue(null);
    setValidationError('');
    if (parsedDate !== value) onChange(parsedDate);
  };

  const selectDate = (nextDate) => {
    if (!parseDateInput(nextDate)) return;
    setDraftValue(null);
    setValidationError('');
    onChange(nextDate);
    setOpen(false);
  };

  return (
    <>
      <div ref={triggerRef} className="w-full min-w-0 sm:w-44">
        <div className="flex min-w-0">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={displayValue}
            placeholder="MM/DD/YYYY"
            aria-describedby={[describedBy, validationError ? errorId : null].filter(Boolean).join(' ') || undefined}
            aria-invalid={validationError ? 'true' : undefined}
            aria-required="true"
            onChange={(event) => {
              const nextValue = event.target.value;
              setDraftValue(nextValue);
              setValidationError('');
              const parsedDate = parseDateEntry(nextValue);
              if (parsedDate) {
                setDraftValue(null);
                onChange(parsedDate);
              }
            }}
            onBlur={validateDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                validateDraft();
              }
            }}
            className={`min-h-10 min-w-0 flex-1 rounded-l-lg border bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus-visible:z-10 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20 ${validationError ? 'border-rose-400' : 'border-slate-300'}`}
          />
          <Button
            type="button"
            variant="outline"
            aria-label="Open business date calendar"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            onClick={() => setOpen(true)}
            className="min-h-10 w-10 shrink-0 rounded-l-none rounded-r-lg border-slate-300 bg-white p-0 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {validationError ? <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-rose-700">{validationError}</p> : null}
      </div>

      <PosFilterDialogShell
        open={open}
        onClose={() => setOpen(false)}
        mode="calendar"
        mobile={isMobileDialog}
        position={position}
        id={dialogId}
        ariaLabelledBy={titleId}
        ariaDescribedBy={descriptionId}
      >
        <PosFilterDialogHeader
          title="Select business date"
          description="Choose one date to compare the full branch day with its saved Z-reading."
          titleId={titleId}
          descriptionId={descriptionId}
          onClose={() => setOpen(false)}
          closeLabel="Close business date calendar"
          mobile={isMobileDialog}
          titleClassName="text-base font-black text-[#0F172A]"
          descriptionClassName="mt-0.5 text-[12px] leading-4 text-slate-500"
        />
        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2'}`}>
          <div className="mb-1 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => selectDate(calendarToday)}
              className="h-8 gap-1.5 px-2 text-xs font-bold text-[#1A4E8D] hover:bg-blue-50"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Today
            </Button>
          </div>
          <PosDateRangePicker
            from={value}
            to={value}
            onChange={(nextDate) => selectDate(nextDate)}
            mobile={isMobileDialog}
            testIdPrefix={`${id}-calendar`}
            dateLabelStyle="short"
            selectionMode="single"
            todayDate={calendarToday}
          />
        </div>
      </PosFilterDialogShell>
    </>
  );
}
