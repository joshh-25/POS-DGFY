import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const fieldLabelClassName = 'text-[13px] font-semibold text-[#334155]';
const TWO_COLUMN_MIN = 7;
const TWO_COLUMN_MAX = 12;

const slugify = (value) => String(value || 'cashier')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export default function PosCashierFilterControl({
  value = '',
  options = [],
  searchValue = '',
  onSearchChange,
  onChange,
  expanded = false,
  onExpandedChange,
  compact = false,
  mobile = false,
  label = 'Cashier',
  optionsLabel = 'Cashier options',
  allLabel = 'All cashiers',
  noResultsLabel = 'No matching cashiers.',
  id = 'pos-cashier-search',
  testIdPrefix = 'pos-cashier',
  optionName = 'pos-cashier',
  scrollToOptionsOnSearch = true,
  className = ''
}) {
  const selectedValue = String(value ?? '').trim();
  const normalizedSearchValue = String(searchValue ?? '');
  const visibleOptions = useMemo(() => {
    const query = normalizedSearchValue.trim().toLowerCase();
    return options.filter((option) => (
      !query || String(option?.label ?? '').toLowerCase().includes(query)
    ));
  }, [normalizedSearchValue, options]);
  const listOptionCount = visibleOptions.length + 1;
  const listUsesTwoColumns = listOptionCount >= TWO_COLUMN_MIN
    && listOptionCount <= TWO_COLUMN_MAX;
  const listIsScrollable = listOptionCount > TWO_COLUMN_MAX;
  const headingId = `${testIdPrefix}-heading`;
  const optionsId = `${testIdPrefix}-options`;
  const searchTestId = `${testIdPrefix}-search`;
  const toggleTestId = `${testIdPrefix}-dropdown-toggle`;
  const optionsPanelRef = useRef(null);

  const scrollOptionsIntoView = useCallback(() => {
    if (!scrollToOptionsOnSearch) return;
    const target = optionsPanelRef.current;
    if (!target || typeof target.scrollIntoView !== 'function') return;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [scrollToOptionsOnSearch]);

  useEffect(() => {
    if (expanded) scrollOptionsIntoView();
  }, [expanded, scrollOptionsIntoView]);

  const handleSearchChange = (nextValue) => {
    onSearchChange?.(nextValue);
    onExpandedChange?.(true);
    scrollOptionsIntoView();
  };

  const handleOptionChange = (option) => {
    const nextValue = String(option?.value ?? '');
    const nextSearchValue = nextValue ? String(option?.label ?? nextValue) : '';
    onSearchChange?.(nextSearchValue);
    onChange?.(option?.value ?? '', option);
    onExpandedChange?.(false);
  };

  const optionRowClassName = `flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-[#334155] hover:bg-blue-50 focus-within:bg-blue-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-[#1A4E8D] focus-within:ring-offset-1 ${compact ? 'py-1 text-[11px]' : mobile ? 'py-1.5 text-[12px]' : 'py-1.5 text-[12px]'}`;
  const avatarClassName = compact ? 'h-5 w-5' : 'h-6 w-6';
  const inputClassName = `${compact ? 'h-10' : 'h-11'} rounded-xl border-slate-200 bg-white pl-12 pr-12 text-[13px] text-[#334155] shadow-sm shadow-slate-100 focus-visible:border-[#2563EB] focus-visible:ring-4 focus-visible:ring-blue-100`;

  return (
    <section className={`min-w-0 ${className}`.trim()} aria-labelledby={headingId}>
      <span id={headingId} className={fieldLabelClassName}>{label}</span>
      <div className={`${mobile ? 'relative mt-1.5' : 'relative mt-2'}`}>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          value={normalizedSearchValue}
          onFocus={() => {
            onExpandedChange?.(true);
            scrollOptionsIntoView();
          }}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search Cashier"
          aria-label="Search Cashier"
          data-testid={searchTestId}
          className={inputClassName}
        />
        <button
          type="button"
          data-testid={toggleTestId}
          onClick={() => onExpandedChange?.(!expanded)}
          aria-expanded={expanded}
          aria-controls={optionsId}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} cashier options`}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#1A4E8D] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {expanded ? (
        <div ref={optionsPanelRef} className="mt-5 min-w-0" data-testid={`${testIdPrefix}-picker`}>
          <h3 className={fieldLabelClassName}>{optionsLabel}</h3>
          <div
            id={optionsId}
            className={`dgfy-pos-scrollbar-hidden mt-2 grid w-full min-w-0 gap-1 ${listUsesTwoColumns ? 'grid-cols-2' : 'grid-cols-1'} ${listIsScrollable ? 'max-h-52 overflow-y-auto overscroll-contain touch-pan-y pr-1' : ''}`}
            role="radiogroup"
            aria-label="Cashier options"
            data-testid={optionsId}
          >
            <label className={optionRowClassName}>
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="radio"
                  name={optionName}
                  value=""
                  checked={!selectedValue}
                  onChange={() => handleOptionChange({ value: '', label: allLabel })}
                  className="sr-only"
                  data-testid={`${testIdPrefix}-option-all`}
                />
                <span className={`${avatarClassName} grid shrink-0 place-items-center rounded-full bg-white text-[#1A4E8D]`} aria-hidden="true">
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="truncate font-semibold">{allLabel}</span>
              </span>
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${!selectedValue ? 'border-[#1A4E8D] bg-[#1A4E8D] shadow-[inset_0_0_0_3px_white]' : 'border-[#1A4E8D] bg-white'}`} aria-hidden="true" />
            </label>
            {visibleOptions.map((option) => {
              const optionValue = String(option?.value ?? '');
              const optionLabel = String(option?.label ?? optionValue);
              const selected = selectedValue === optionValue;
              const initials = optionLabel.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
              return (
                <label key={option.key || optionValue || optionLabel} className={optionRowClassName}>
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name={optionName}
                      value={optionValue}
                      checked={selected}
                      disabled={option.disabled}
                      onChange={() => handleOptionChange(option)}
                      className="sr-only"
                      data-testid={`${testIdPrefix}-option-${slugify(optionValue || optionLabel)}`}
                    />
                    <span className={`${avatarClassName} grid shrink-0 place-items-center rounded-full bg-[#1683F4] text-[10px] font-black text-white`} aria-hidden="true">
                      {initials}
                    </span>
                    <span className="truncate font-semibold">{optionLabel}</span>
                  </span>
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${selected ? 'border-[#1A4E8D] bg-[#1A4E8D] shadow-[inset_0_0_0_3px_white]' : 'border-[#1A4E8D] bg-white'}`} aria-hidden="true" />
                </label>
              );
            })}
            {normalizedSearchValue.trim() && visibleOptions.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-slate-500">{noResultsLabel}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
