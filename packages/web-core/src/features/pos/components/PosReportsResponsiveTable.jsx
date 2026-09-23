import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import PosSettingsPagination, { DEFAULT_POS_SETTINGS_PAGE_SIZE_OPTIONS } from '../settings/PosSettingsPagination.jsx';
import PosReportsDropdown from './PosReportsDropdown.jsx';

const DEFAULT_PAGE_SIZE = 20;

const fallbackValue = (row, column, index) => {
  const value = typeof column.getValue === 'function' ? column.getValue(row, index) : row?.[column.key];
  return value == null || value === '' ? '—' : value;
};

const createVisibilityClasses = () => 'table-cell';
const resolveTextAlignment = (align) => align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
const resolveJustifyAlignment = (align) => align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

const compareValues = (left, right, direction) => {
  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
    ? leftNumber - rightNumber
    : String(left).localeCompare(String(right));
  return direction === 'asc' ? comparison : -comparison;
};

export default function PosReportsResponsiveTable({
  rows = [],
  columns = [],
  searchQuery = '',
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  initialSort,
  ariaLabel = 'Reports table',
  title = 'Reports table',
  caption,
  emptyMessage = 'No rows found.',
  searchEmptyMessage,
  getSearchValue,
  idPrefix = 'pos-reports-table',
  resultLabel = 'rows'
}) {
  const sourceRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const normalizedColumns = useMemo(() => columns, [columns]);
  const selectedColumns = normalizedColumns;
  const [sort, setSort] = useState(() => initialSort || { key: normalizedColumns[0]?.key, direction: 'desc' });
  const [selectedPageSize, setSelectedPageSize] = useState(() => {
    const value = Number(initialPageSize);
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_PAGE_SIZE;
  });
  const [pageState, setPageState] = useState({ queryKey: '', page: 1 });
  const queryKey = String(searchQuery || '').trim().toLowerCase();
  const page = pageState.queryKey === queryKey ? pageState.page : 1;

  const filteredRows = useMemo(() => {
    if (!queryKey) return sourceRows;
    return sourceRows.filter((row) => {
      const value = typeof getSearchValue === 'function'
        ? getSearchValue(row)
        : normalizedColumns.map((column) => fallbackValue(row, column)).join(' ');
      return String(value || '').toLowerCase().includes(queryKey);
    });
  }, [getSearchValue, normalizedColumns, queryKey, sourceRows]);

  const sortedRows = useMemo(() => {
    const definition = normalizedColumns.find((column) => column.key === sort.key) || normalizedColumns[0];
    if (!definition) return filteredRows;
    return [...filteredRows].sort((left, right) => compareValues(
      typeof definition.getSortValue === 'function' ? definition.getSortValue(left) : fallbackValue(left, definition),
      typeof definition.getSortValue === 'function' ? definition.getSortValue(right) : fallbackValue(right, definition),
      sort.direction
    ));
  }, [filteredRows, normalizedColumns, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / selectedPageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRows = sortedRows.slice((currentPage - 1) * selectedPageSize, currentPage * selectedPageSize);
  const renderCell = (row, column, index) => (
    typeof column.render === 'function' ? column.render(row, index) : fallbackValue(row, column, index)
  );

  const handleSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPageState({ queryKey, page: 1 });
  };

  const setPage = (nextPage) => setPageState({
    queryKey,
    page: Math.max(1, Math.min(pageCount, nextPage))
  });

  const handlePageSizeChange = (nextPageSize) => {
    const normalizedPageSize = Number(nextPageSize);
    if (!Number.isInteger(normalizedPageSize) || normalizedPageSize <= 0) return;
    setSelectedPageSize(normalizedPageSize);
    setPageState({ queryKey, page: 1 });
  };

  const renderSortIcon = (key) => {
    const iconClassName = `h-3.5 w-3.5 ${sort.key === key ? 'text-[#1A4E8D]' : 'text-[#2D6CDF] opacity-50'}`;
    if (sort.key !== key) return <ChevronDown className={iconClassName} aria-hidden="true" />;
    return sort.direction === 'asc'
      ? <ChevronUp className={iconClassName} aria-hidden="true" />
      : <ChevronDown className={iconClassName} aria-hidden="true" />;
  };

  return (
    <section className="min-w-0" aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`} className="sr-only">{title}</h3>

      <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
        <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]" role="region" aria-label={ariaLabel} tabIndex={0}>
          <table className="w-max min-w-full table-fixed text-[13px]">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead className="border-b border-slate-200 bg-[#F7FAFF] text-[11px] text-[#0F172A]">
              <tr>
                {selectedColumns.map((column) => {
                  const cellVisibility = createVisibilityClasses();
                  return (
                    <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${cellVisibility} ${column.widthClass || ''} whitespace-nowrap px-4 py-3 font-black ${resolveTextAlignment(column.align)}`}>
                      <button type="button" onClick={() => handleSort(column.key)} className={`inline-flex min-h-9 w-full items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] ${resolveJustifyAlignment(column.align)}`} aria-label={`Sort by ${column.label}`}>
                        <span>{column.label}</span>
                        {renderSortIcon(column.key)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.length > 0 ? paginatedRows.map((row, index) => (
                <tr key={`${idPrefix}-row-${index}`} className="odd:bg-white even:bg-[#F8FBFF] text-slate-700 transition-colors hover:bg-[#EEF5FF]">
                  {selectedColumns.map((column) => <td key={column.key} className={`${createVisibilityClasses()} ${column.widthClass || ''} px-4 py-2.5 ${resolveTextAlignment(column.valueAlign || column.align)} text-[#334155] ${(column.numeric || column.align === 'right' || column.align === 'center') ? 'font-semibold tabular-nums' : 'font-medium'}`}>{renderCell(row, column, index)}</td>)}
                </tr>
              )) : (
                <tr><td colSpan={selectedColumns.length || 1} className="px-4 py-12 text-center text-sm font-semibold text-slate-500">{searchQuery ? (searchEmptyMessage || emptyMessage) : emptyMessage}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
          <PosSettingsPagination
            page={currentPage}
            totalPages={pageCount}
            pageSize={selectedPageSize}
            total={sortedRows.length}
            itemLabel={resultLabel}
            pageSizeOptions={DEFAULT_POS_SETTINGS_PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            renderPageSizeSelect={({ options, value, onChange, disabled, label }) => (
              <PosReportsDropdown
                id={`${idPrefix}-page-size`}
                value={value}
                options={options.map((option) => ({ value: option, label: `${option} / page` }))}
                onChange={(nextValue) => onChange(Number(nextValue))}
                ariaLabel={label}
                disabled={disabled}
                placement="top"
                size="small"
                triggerClassName="w-[6.25rem] sm:w-[7.5rem]"
              />
            )}
            pageSizeLabel={`${resultLabel} per page`}
            pageInputLabel={`Go to ${title} page`}
            previousLabel={`Previous ${title} page`}
            nextLabel={`Next ${title} page`}
          />
        </div>
      </div>
    </section>
  );
}
