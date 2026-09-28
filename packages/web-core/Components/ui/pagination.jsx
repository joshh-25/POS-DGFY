import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../src/lib/utils.js';
import { Button } from './button.jsx';

export const DEFAULT_PAGE_SIZE_OPTIONS = [20, 40, 60];
export const POS_PAGINATION_FOOTER_CLASS = 'dgfy-pos-pagination-footer shrink-0 rounded-none border-0 border-t border-slate-200 px-6 py-2.5 shadow-none';

const toPositiveInteger = (value, fallback = 1) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizePageSizeOptions = (options, pageSize) => {
  const values = Array.from(new Set(
    (Array.isArray(options) ? options : DEFAULT_PAGE_SIZE_OPTIONS)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
  const numericPageSize = Number(pageSize);
  if (Number.isInteger(numericPageSize) && numericPageSize > 0 && !values.includes(numericPageSize)) {
    values.push(numericPageSize);
  }
  return values.length > 0 ? values.sort((left, right) => left - right) : DEFAULT_PAGE_SIZE_OPTIONS;
};

const getControlId = (prefix, testId, suffix) => `${prefix || testId || 'pagination'}-${suffix}`;

const PageSizeDropdown = ({ controlId, options, selectedPageSize, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = `${controlId}-options`;

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsidePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('button')?.focus();
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const choosePageSize = (nextPageSize) => {
    if (disabled) return;
    onChange(nextPageSize);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="dgfy-global-pagination__page-size relative shrink-0">
      <button
        id={controlId}
        data-testid={controlId}
        type="button"
        aria-label="Items per page"
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="dgfy-global-pagination__page-size-trigger inline-flex h-10 min-w-[5.75rem] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-[#1A4E8D]/50 hover:bg-[#F8FBFF] focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/15 disabled:cursor-not-allowed disabled:opacity-50 lg:text-[13px]"
      >
        <span className="dgfy-global-pagination__page-size-value whitespace-nowrap">{selectedPageSize} / page</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label="Items per page options"
          className="dgfy-global-pagination__page-size-menu absolute bottom-[calc(100%+0.375rem)] left-0 z-50 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={String(option) === String(selectedPageSize)}
              data-testid={`${controlId}-option-${option}`}
              onClick={() => choosePageSize(option)}
              className={`dgfy-global-pagination__page-size-option flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-xs font-semibold transition lg:text-[13px] ${String(option) === String(selectedPageSize) ? 'bg-[#E8F0FB] text-[#1A4E8D]' : 'text-slate-700 hover:bg-[#F8FBFF] hover:text-[#1A4E8D]'}`}
            >
              <span>{option} / page</span>
              {String(option) === String(selectedPageSize) && <span aria-hidden="true" className="text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export function GlobalPagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  start,
  end,
  itemLabel = 'items',
  pageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange = () => {},
  onPageSizeChange = () => {},
  disabled = false,
  loading = false,
  showPageSize = true,
  showGoTo = true,
  accentColor = '#1A4E8D',
  className,
  testId,
  controlTestIdPrefix,
  ariaLabel = 'Pagination'
}) {
  const safeTotalItems = Math.max(0, Number(totalItems) || 0);
  const safePageSize = Number(pageSize) > 0 ? Number(pageSize) : 20;
  const safeTotalPages = Math.max(1, toPositiveInteger(totalPages));
  const safeCurrentPage = Math.min(safeTotalPages, toPositiveInteger(currentPage));
  const options = useMemo(() => normalizePageSizeOptions(pageSizeOptions, pageSize), [pageSize, pageSizeOptions]);
  const selectedPageSize = Number.isInteger(Number(pageSize)) && Number(pageSize) > 0
    ? String(pageSize)
    : String(options[0] || 20);
  const [goToPage, setGoToPage] = useState(String(safeCurrentPage));
  const isDisabled = Boolean(disabled || loading);
  const derivedStart = safeTotalItems === 0 ? 0 : ((safeCurrentPage - 1) * safePageSize) + 1;
  const derivedEnd = safeTotalItems === 0 ? 0 : Math.min(safeTotalItems, safeCurrentPage * safePageSize);
  const safeStart = Number.isInteger(Number(start)) && Number(start) >= 0 ? Number(start) : derivedStart;
  const safeEnd = Number.isInteger(Number(end)) && Number(end) >= 0 ? Number(end) : derivedEnd;

  React.useEffect(() => {
    setGoToPage(String(safeCurrentPage));
  }, [safeCurrentPage]);

  const changePage = (nextPage) => {
    const normalizedPage = Math.min(safeTotalPages, Math.max(1, Number(nextPage) || 1));
    if (!isDisabled && normalizedPage !== safeCurrentPage) onPageChange(normalizedPage);
  };

  const submitPage = (event) => {
    event.preventDefault();
    changePage(goToPage);
  };

  const pageSizeId = getControlId(controlTestIdPrefix, testId, 'page-size');
  const previousPageId = getControlId(controlTestIdPrefix, testId, 'previous-page');
  const nextPageId = getControlId(controlTestIdPrefix, testId, 'next-page');
  const goToPageId = getControlId(controlTestIdPrefix, testId, 'go-to-page');

  return (
    <nav
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn(
        'dgfy-global-pagination flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm text-slate-600 shadow-sm',
        'max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:px-4 max-md:py-3',
        className
      )}
    >
      <div className="dgfy-global-pagination__summary flex min-w-0 items-center gap-5 max-md:justify-between">
        <span className="dgfy-global-pagination__summary-text whitespace-nowrap text-xs font-medium lg:text-[13px]">
          Showing {safeStart}–{safeEnd} of {safeTotalItems} {itemLabel}
        </span>
        {showPageSize ? (
          <PageSizeDropdown
            controlId={pageSizeId}
            options={options}
            selectedPageSize={selectedPageSize}
            disabled={isDisabled}
            onChange={onPageSizeChange}
          />
        ) : null}
      </div>

      <div className="dgfy-global-pagination__controls flex shrink-0 items-center gap-3 max-md:w-full max-md:justify-between">
        <Button
          type="button"
          variant="outline"
          data-testid={previousPageId}
          aria-label="Previous page"
          title="Previous page"
          disabled={isDisabled || safeCurrentPage <= 1}
          onClick={() => changePage(safeCurrentPage - 1)}
          style={{ color: accentColor }}
          className="dgfy-global-pagination__previous h-10 w-10 rounded-lg border-slate-200 p-0 hover:bg-slate-50"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </Button>
        <span className="dgfy-global-pagination__status inline-flex h-10 min-w-[96px] items-center justify-center rounded-lg bg-slate-50 px-4 text-xs font-semibold lg:text-[13px]" style={{ color: accentColor }} aria-live="polite">
          {safeCurrentPage} of {safeTotalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          data-testid={nextPageId}
          aria-label="Next page"
          title="Next page"
          disabled={isDisabled || safeCurrentPage >= safeTotalPages}
          onClick={() => changePage(safeCurrentPage + 1)}
          style={{ color: accentColor }}
          className="dgfy-global-pagination__next h-10 w-10 rounded-lg border-slate-200 p-0 hover:bg-slate-50"
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </Button>
        {showGoTo ? (
          <>
            <span className="dgfy-global-pagination__mobile-go-to-label text-xs lg:text-[13px]" aria-hidden="true">Go to Page</span>
            <form className="dgfy-global-pagination__go-to flex items-center gap-2" onSubmit={submitPage}>
              <label htmlFor={goToPageId} className="dgfy-global-pagination__go-to-label whitespace-nowrap text-xs font-medium lg:text-[13px]">Go to</label>
              <input
                id={goToPageId}
                data-testid={goToPageId}
                aria-label="Go to page"
                inputMode="numeric"
                pattern="[0-9]*"
                value={goToPage}
                onChange={(event) => setGoToPage(event.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => setGoToPage(String(Math.min(safeTotalPages, Math.max(1, Number(goToPage) || 1))))}
                disabled={isDisabled}
                className="dgfy-global-pagination__go-to-input h-10 w-16 rounded-lg border border-slate-200 bg-white px-3 text-center text-xs font-semibold text-slate-700 outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/15 disabled:cursor-not-allowed disabled:opacity-50 lg:text-[13px]"
              />
              <span className="dgfy-global-pagination__go-to-suffix whitespace-nowrap text-xs font-medium lg:text-[13px]">Page</span>
            </form>
          </>
        ) : null}
      </div>
    </nav>
  );
}

export default GlobalPagination;
