import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const DEFAULT_POS_SETTINGS_PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const toPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

export default function PosSettingsPagination({
  page,
  totalPages,
  pageSize,
  total,
  itemLabel = 'items',
  pageSizeOptions = DEFAULT_POS_SETTINGS_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  pageSizeLabel = `${itemLabel} per page`,
  pageInputLabel = `Go to ${itemLabel} page`,
  previousLabel = `Previous ${itemLabel} page`,
  nextLabel = `Next ${itemLabel} page`,
  disabled = false,
  className = ''
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeTotalPages = Math.max(1, toPositiveInteger(totalPages, 1));
  const safePageSize = toPositiveInteger(pageSize, 1);
  const safePage = Math.min(safeTotalPages, Math.max(1, toPositiveInteger(page, 1)));
  const [pageInput, setPageInput] = useState(String(safePage));
  const options = Array.from(new Set([
    ...pageSizeOptions,
    safePageSize
  ].map((option) => toPositiveInteger(option, safePageSize)))).sort((left, right) => left - right);
  const start = safeTotal === 0 ? 0 : ((safePage - 1) * safePageSize) + 1;
  const end = Math.min(safePage * safePageSize, safeTotal);

  useEffect(() => {
    setPageInput(String(safePage));
  }, [safePage]);

  const submitPage = () => {
    const requested = Number.parseInt(pageInput, 10);
    if (Number.isInteger(requested)) {
      onPageChange(Math.min(safeTotalPages, Math.max(1, requested)));
    } else {
      setPageInput(String(safePage));
    }
  };

  const rangeLabel = `Showing ${start}–${end} of ${safeTotal} ${itemLabel}`;

  return (
    <nav aria-label={`${itemLabel} pagination`} className={`flex min-w-0 flex-col gap-2 text-[12px] font-semibold leading-4 text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:gap-3">
        <span aria-live="polite" title={rangeLabel} className="min-w-0 flex-1 break-words whitespace-normal leading-5 sm:truncate sm:whitespace-nowrap sm:leading-8">
          Showing {start}–{end} of {safeTotal} {itemLabel}
        </span>
        <label className="relative block shrink-0">
          <span className="sr-only">{pageSizeLabel}</span>
          <select
            aria-label={pageSizeLabel}
            value={safePageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 w-[6.25rem] appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-[12px] font-bold text-slate-700 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[7.5rem] sm:pl-3 sm:pr-8"
          >
            {options.map((option) => <option key={option} value={option}>{option} / page</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 sm:right-2.5" />
        </label>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 sm:ml-auto sm:justify-end">
        <div className="flex shrink-0 items-center gap-1" aria-label="Pagination controls">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={previousLabel}
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={disabled || safePage <= 1}
            className="h-9 w-9 rounded-lg p-0"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
          <span aria-live="polite" className="flex h-9 min-w-[4.25rem] items-center justify-center rounded-lg bg-slate-50 px-2 text-[12px] font-bold text-slate-700 sm:min-w-[4.5rem]">
            {safePage} of {safeTotalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={nextLabel}
            onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
            disabled={disabled || safePage >= safeTotalPages}
            className="h-9 w-9 rounded-lg p-0"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>

        <label className="flex shrink-0 items-center gap-1 leading-none">
          <span className="text-[12px] font-semibold text-slate-500">Go to<span className="hidden sm:inline"> Page</span></span>
          <Input
            aria-label={pageInputLabel}
            inputMode="numeric"
            value={pageInput}
            disabled={disabled}
            onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            onBlur={submitPage}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitPage();
              }
            }}
            className="h-9 w-10 rounded-lg border-slate-200 px-1 text-center text-[12px] font-bold sm:w-16 sm:px-2"
          />
        </label>
      </div>
    </nav>
  );
}
