import { Check, ListFilter, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fieldLabelClassName = 'text-[13px] font-semibold text-[#334155]';

const slugify = (value) => String(value || 'field')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export function PosFilterChoiceGroup({
  label,
  value,
  options = [],
  onChange,
  testId,
  compact = false,
  compactGridClassName = '',
  mobile = false,
  scrollable = false,
  groupAriaLabel,
  emptyLabel,
  emptyValue = '',
  showSelectedIcon = false,
  className = ''
}) {
  const headingId = `${testId || slugify(label)}-heading`;
  const optionGroupClassName = compact
    ? `mt-1.5 grid min-w-0 max-w-full grid-cols-4 gap-2 ${compactGridClassName}`.trim()
    : mobile
      ? 'dgfy-pos-history-horizontal-scroll mt-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x'
      : scrollable
        ? 'mt-1 flex min-w-0 max-w-full gap-1.5 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:thin]'
        : 'mt-2 flex min-w-0 max-w-full flex-wrap gap-2';
  const optionClassName = compact
    ? 'h-8 w-full min-w-0 px-2 py-1 text-[10px]'
    : mobile
      ? 'h-9 w-[6.5rem] min-w-[6.5rem] shrink-0 px-2 py-1 text-[11px]'
      : scrollable
        ? 'min-h-9 min-w-[8rem] max-w-[12rem] shrink-0 px-3 py-1 text-[11px]'
        : 'min-h-9 w-max min-w-0 shrink-0 px-3 py-1.5 text-[12px]';

  return (
    <section className={`min-w-0 ${className}`.trim()} aria-labelledby={headingId}>
      <h3 id={headingId} className={fieldLabelClassName}>{label}</h3>
      <div className={optionGroupClassName} role="group" aria-label={groupAriaLabel || `${label} options`}>
        {options.map((option) => {
          const selected = value === option.value;
          const displayLabel = option.value === emptyValue && emptyLabel ? emptyLabel : option.label;
          return (
            <button
              key={option.key || option.value || `${testId || slugify(label)}-empty`}
              type="button"
              data-testid={testId ? `${testId}-${option.value || 'all'}` : undefined}
              aria-pressed={selected}
              disabled={option.disabled}
              onClick={() => onChange?.(option.value)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg border text-center font-extrabold leading-none transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${optionClassName} ${selected
                ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'
                } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400`}
            >
              {showSelectedIcon && selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              <span className="truncate">{displayLabel}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PosFilterDialogHeader({
  title,
  description,
  titleId,
  descriptionId,
  onClose,
  closeLabel = 'Close filters',
  closeTestId,
  headerAction,
  icon: Icon,
  mobile = false,
  className = '',
  titleClassName = 'text-xl font-black text-[#0F172A]',
  descriptionClassName = 'mt-0.5 text-[12px] text-slate-500'
}) {
  const action = headerAction || (onClose ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-testid={closeTestId}
      onClick={onClose}
      aria-label={closeLabel}
      className={`${mobile ? 'h-11 w-11 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : 'h-9 w-9'} shrink-0 text-slate-500 hover:text-slate-800`}
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </Button>
  ) : null);

  return (
    <header className={`flex shrink-0 flex-row items-start justify-between gap-4 border-b border-slate-200 ${mobile ? 'px-4 py-3' : 'px-4 py-3'} ${className}`.trim()}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1A4E8D]">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 id={titleId} className={`${titleClassName} dgfy-pos-filter-dialog-title`}>{title}</h2>
          <p id={descriptionId} className={descriptionClassName}>{description}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

export function PosFilterDialogFooter({
  onReset,
  onCancel,
  onApply,
  resetLabel = 'Reset All',
  cancelLabel = 'Cancel',
  applyLabel = 'Apply Filters',
  resetTestId,
  cancelTestId,
  applyTestId,
  resetIcon: ResetIcon = RotateCcw,
  applyIcon: ApplyIcon = ListFilter,
  mobile = false,
  buttonStyle = 'filter',
  className = '',
  leftButtonClassName = '',
  applyButtonClassName = '',
  disabled = false
}) {
  const isCancel = typeof onCancel === 'function';
  const leftAction = isCancel ? onCancel : onReset;
  const leftLabel = isCancel ? cancelLabel : resetLabel;
  const LeftIcon = isCancel ? null : ResetIcon;
  const buttonStyleClassName = buttonStyle === 'form'
    ? 'h-10 rounded-lg'
    : `${mobile ? 'h-9' : 'h-10'} rounded-xl`;

  return (
    <footer className={`flex shrink-0 flex-row justify-between gap-2 border-t border-slate-200 ${mobile ? 'px-4 py-3' : 'px-4 py-2.5'} ${className}`.trim()}>
      <Button
        type="button"
        variant={isCancel ? 'outline' : 'outline'}
        onClick={leftAction}
        data-testid={isCancel ? cancelTestId : resetTestId}
        className={`min-w-0 flex-1 ${buttonStyleClassName} ${isCancel
          ? 'border-[#A9C5EA] px-3 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-[#F5F9FF]'
          : 'border-rose-300 bg-rose-50/40 px-3 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800'} ${leftButtonClassName}`.trim()}
      >
        {LeftIcon ? <LeftIcon className="mr-2 h-4 w-4" aria-hidden="true" /> : null}
        {leftLabel}
      </Button>
      <Button
        type="button"
        onClick={onApply}
        data-testid={applyTestId}
        disabled={disabled}
        className={`min-w-0 flex-1 ${buttonStyleClassName} bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] ${applyButtonClassName}`.trim()}
      >
        {ApplyIcon ? <ApplyIcon className="mr-2 h-4 w-4" aria-hidden="true" /> : null}
        {applyLabel}
      </Button>
    </footer>
  );
}

export default PosFilterChoiceGroup;
