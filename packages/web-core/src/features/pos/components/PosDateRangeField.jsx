import { useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosDateRangePicker from './PosDateRangePicker.jsx';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';

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

const formatDatePart = (value, placeholder) => {
  const date = parseDateInput(value);
  return date
    ? date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : placeholder;
};

const normalizeRange = (from, to) => {
  const nextFrom = String(from || '').trim();
  const nextTo = String(to || '').trim();
  if (!nextFrom && !nextTo) return { from: '', to: '' };
  if (!nextFrom) return { from: nextTo, to: nextTo };
  if (!nextTo) return { from: nextFrom, to: nextFrom };
  return nextFrom <= nextTo
    ? { from: nextFrom, to: nextTo }
    : { from: nextTo, to: nextFrom };
};

export default function PosDateRangeField({
  id = 'pos-date-range-field',
  from = '',
  to = '',
  onChange = () => {},
  title = 'Select validity dates',
  description = 'Select one date for a one-day voucher or two dates for a validity range.',
  openLabel = 'Open validity dates calendar',
  todayDate = '',
  placeholder = 'MM/DD/YYYY',
  compact = false,
  layerClassName = 'z-[10000]'
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const dialogId = `${id}-dialog`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const fromSelected = Boolean(parseDateInput(from));
  const toSelected = Boolean(parseDateInput(to));

  const openDialog = () => {
    setDraftFrom(from || '');
    setDraftTo(to || '');
    setOpen(true);
  };

  const applyRange = () => {
    const nextRange = normalizeRange(draftFrom, draftTo);
    onChange(nextRange.from, nextRange.to);
    setOpen(false);
  };

  return (
    <>
      <div className="w-full min-w-0">
        <button
          id={id}
          type="button"
          aria-label={openLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          onClick={openDialog}
          className={`${compact ? 'h-8 min-h-8 px-2.5 text-xs' : 'min-h-10 px-3 text-sm'} group flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white font-semibold outline-none transition hover:border-[#8AA8CD] hover:bg-slate-50 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20`}
        >
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center overflow-hidden text-left">
            <span className="min-w-0 truncate pr-2 text-slate-800">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">From:</span>
              <span className={fromSelected ? 'font-semibold text-slate-800' : 'font-normal text-slate-400 opacity-70'}>
                {formatDatePart(from, placeholder)}
              </span>
            </span>
            <span
              role="separator"
              aria-orientation="vertical"
              data-testid={`${id}-range-divider`}
              className="h-5 w-px bg-slate-200"
            />
            <span className="min-w-0 truncate pl-2 text-slate-800">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">Until:</span>
              <span className={toSelected ? 'font-semibold text-slate-800' : 'font-normal text-slate-400 opacity-70'}>
                {formatDatePart(to, placeholder)}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center border-l border-slate-200 pl-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-[#1A4E8D]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
          </span>
        </button>
      </div>

      <PosFilterDialogShell
        open={open}
        onClose={() => setOpen(false)}
        mode="calendar"
        mobile={isMobileDialog}
        fitContentHeight
        id={dialogId}
        ariaLabelledBy={titleId}
        ariaDescribedBy={descriptionId}
        layerClassName={layerClassName}
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        className="h-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[36rem]"
      >
        <PosFilterDialogHeader
          title={title}
          description={description}
          titleId={titleId}
          descriptionId={descriptionId}
          closeLabel="Close validity dates calendar"
          mobile={isMobileDialog}
          headerAction={(
            <Button
              type="button"
              onClick={() => {
                setDraftFrom('');
                setDraftTo('');
              }}
              aria-label="Reset validity dates"
              title="Reset dates"
              className={`${isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'} shrink-0 bg-[#1A4E8D] p-0 text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73]`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          titleClassName="text-xl font-black text-[#0F172A]"
          descriptionClassName="mt-0.5 text-[12px] text-slate-500"
          className={`${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2.5'} dgfy-pos-history-dialog-header`}
        />

        <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2'} dgfy-pos-history-dialog-body`}>
          <div className="mb-2 grid grid-cols-2 gap-2" role="group" aria-label="Selected validity dates">
            <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Valid from</span>
              <span
                data-testid={`${id}-from-summary`}
                className={`block truncate text-xs font-black ${draftFrom ? 'text-slate-800' : 'text-slate-400'}`}
              >
                {formatDatePart(draftFrom, 'Select date')}
              </span>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Valid until</span>
              <span
                data-testid={`${id}-until-summary`}
                className={`block truncate text-xs font-black ${draftTo ? 'text-slate-800' : 'text-slate-400'}`}
              >
                {formatDatePart(draftTo, 'Select second date')}
              </span>
            </div>
          </div>
          <PosDateRangePicker
            from={draftFrom}
            to={draftTo}
            onChange={(nextFrom, nextTo) => {
              setDraftFrom(nextFrom || '');
              setDraftTo(nextTo || '');
            }}
            mobile={isMobileDialog}
            testIdPrefix={`${id}-calendar`}
            enableRangeDrag
            dateLabelStyle="short"
            showPresets={false}
            todayDate={todayDate}
          />
        </div>

        <PosFilterDialogFooter
          onCancel={() => setOpen(false)}
          onApply={applyRange}
          applyIcon={CalendarDays}
          applyLabel="Apply Dates"
          cancelLabel="Cancel"
          mobile={isMobileDialog}
          buttonStyle="form"
          className={`${isMobileDialog ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2'} dgfy-pos-history-dialog-footer`}
          leftButtonClassName="border-[#A9C5EA] px-3 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF]"
          applyButtonClassName="text-[13px]"
        />
      </PosFilterDialogShell>
    </>
  );
}
