import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import PosTableSurface, {
  POS_TABLE_CELL_CLASS,
  POS_TABLE_HEADER_CELL_CLASS,
  POS_TABLE_HEADER_CLASS,
  POS_TABLE_REPORT_SURFACE_CLASS,
  POS_TABLE_ROW_CLASS
} from './PosTableSurface.jsx';
import PosTableDetailsDialog from './PosTableDetailsDialog.jsx';
import PosMobileDataCard from './PosMobileDataCard.jsx';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import {
  getPosReportColumnValueToneClass,
  POS_REPORT_VALUE_TONE_CLASSES
} from './posReportValueTones.js';
import {
  MAX_POS_TABLE_DATA_COLUMNS,
  MAX_POS_TABLE_TABLET_LANDSCAPE_COLUMNS,
  MAX_POS_TABLE_TABLET_PORTRAIT_COLUMNS,
  selectPosTableColumns,
  selectPosTableColumnsForViewport,
  selectPosTableMobileColumns
} from './posTableColumns.js';

const DEFAULT_PAGE_SIZE = 20;
const emphasizeMobileValue = (className) => (
  className === POS_REPORT_VALUE_TONE_CLASSES.secondary
    ? POS_REPORT_VALUE_TONE_CLASSES.primary
    : className
);
const getMobileColumnValueToneClass = (column, row) => (
  emphasizeMobileValue(getPosReportColumnValueToneClass(column, row))
);
const MOBILE_SEMANTIC_VALUE_TONE_CLASSES = new Set([
  POS_REPORT_VALUE_TONE_CLASSES.brand,
  POS_REPORT_VALUE_TONE_CLASSES.positive,
  POS_REPORT_VALUE_TONE_CLASSES.danger
]);
const getMobileCardTitleToneClass = (column, row) => {
  const toneClass = getPosReportColumnValueToneClass(column, row);

  return MOBILE_SEMANTIC_VALUE_TONE_CLASSES.has(toneClass)
    ? toneClass
    : POS_REPORT_VALUE_TONE_CLASSES.primary;
};

const fallbackValue = (row, column, index) => {
  const value = typeof column.getValue === 'function' ? column.getValue(row, index) : row?.[column.key];
  return value == null || value === '' ? '—' : value;
};

const resolveTextAlignment = (align) => align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
const resolveJustifyAlignment = (align) => align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
const getRowLabel = (row, primaryColumn) => {
  const knownLabel = row?.invoice_number || row?.item_name || row?.category_name || row?.bucket_start_local || row?.cashier_name || row?.id;
  if (knownLabel) return String(knownLabel);
  if (!primaryColumn) return 'record';
  const renderedValue = typeof primaryColumn.render === 'function'
    ? primaryColumn.render(row, 0)
    : fallbackValue(row, primaryColumn, 0);
  if (typeof renderedValue === 'string' || typeof renderedValue === 'number') return String(renderedValue);
  const value = fallbackValue(row, primaryColumn, 0);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'record';
};

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
  resultLabel = 'rows',
  maxDesktopColumns = MAX_POS_TABLE_DATA_COLUMNS,
  serverPagination = null,
  controlledSort = null,
  onSortChange,
  detailsDialogTitle,
  getDetailsSubtitle,
  renderDetailsSections,
  renderDetailsFooter,
  showActions = true,
  loading = false
}) {
  const sourceRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const normalizedColumns = useMemo(() => (Array.isArray(columns) ? columns : []), [columns]);
  const selectedColumns = useMemo(
    () => selectPosTableColumns(normalizedColumns, maxDesktopColumns),
    [maxDesktopColumns, normalizedColumns]
  );
  const tabletPortraitColumns = useMemo(
    () => selectPosTableColumnsForViewport(normalizedColumns, MAX_POS_TABLE_TABLET_PORTRAIT_COLUMNS, 'tabletPortrait'),
    [normalizedColumns]
  );
  const tabletLandscapeColumns = useMemo(
    () => selectPosTableColumnsForViewport(normalizedColumns, MAX_POS_TABLE_TABLET_LANDSCAPE_COLUMNS, 'tabletLandscape'),
    [normalizedColumns]
  );
  const responsiveTableColumns = useMemo(() => {
    const visibleKeys = new Set([
      ...tabletPortraitColumns,
      ...tabletLandscapeColumns,
      ...selectedColumns
    ].map((column) => column.key));
    return normalizedColumns.filter((column) => visibleKeys.has(column.key));
  }, [normalizedColumns, selectedColumns, tabletLandscapeColumns, tabletPortraitColumns]);
  const mobileColumns = useMemo(() => {
    const visibleColumns = selectPosTableMobileColumns(normalizedColumns);
    return visibleColumns.length > 0 ? visibleColumns : normalizedColumns.slice(0, 1);
  }, [normalizedColumns]);
  const [sort, setSort] = useState(() => initialSort || { key: mobileColumns[0]?.key, direction: 'desc' });
  const activeSort = controlledSort || sort;
  const [detailsRow, setDetailsRow] = useState(null);
  const [expandedMobileRow, setExpandedMobileRow] = useState(null);
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
    if (controlledSort) return filteredRows;
    const definition = normalizedColumns.find((column) => column.key === activeSort.key) || normalizedColumns[0];
    if (!definition) return filteredRows;
    return [...filteredRows].sort((left, right) => compareValues(
      typeof definition.getSortValue === 'function' ? definition.getSortValue(left) : fallbackValue(left, definition),
      typeof definition.getSortValue === 'function' ? definition.getSortValue(right) : fallbackValue(right, definition),
      activeSort.direction
    ));
  }, [activeSort, controlledSort, filteredRows, normalizedColumns]);

  const pageCount = serverPagination
    ? Math.max(1, Number(serverPagination.totalPages) || 1)
    : Math.max(1, Math.ceil(sortedRows.length / selectedPageSize));
  const currentPage = serverPagination
    ? Math.min(pageCount, Math.max(1, Number(serverPagination.currentPage) || 1))
    : Math.min(page, pageCount);
  const paginatedRows = serverPagination
    ? sortedRows
    : sortedRows.slice((currentPage - 1) * selectedPageSize, currentPage * selectedPageSize);
  const stateVariant = loading ? 'loading' : 'empty';
  const stateMessage = loading
    ? `Loading ${String(title || 'report').toLowerCase()}…`
    : (searchQuery ? (searchEmptyMessage || emptyMessage) : emptyMessage);
  const renderCell = (row, column, index) => (
    typeof column.render === 'function' ? column.render(row, index) : fallbackValue(row, column, index)
  );
  const resolveColumnVisibilityClasses = (column) => {
    const visibleAtPortrait = tabletPortraitColumns.some((entry) => entry.key === column.key);
    const visibleAtLandscape = tabletLandscapeColumns.some((entry) => entry.key === column.key);
    const visibleAtDesktop = selectedColumns.some((entry) => entry.key === column.key);
    const classes = [visibleAtPortrait ? 'table-cell' : 'hidden'];

    if (visibleAtLandscape !== visibleAtPortrait) {
      classes.push(visibleAtLandscape ? 'min-[1024px]:table-cell' : 'min-[1024px]:hidden');
    }
    if (visibleAtDesktop !== visibleAtLandscape) {
      classes.push(visibleAtDesktop ? 'min-[1200px]:table-cell' : 'min-[1200px]:hidden');
    }
    return classes.join(' ');
  };

  const buildDetailsSections = (row, index = 0) => {
    const sections = typeof renderDetailsSections === 'function'
      ? renderDetailsSections(row, { columns: normalizedColumns, renderCell })
      : [{
          key: 'record-details',
          title: 'Record details',
          fields: normalizedColumns.map((column) => ({
            key: column.key,
            label: column.label,
            value: typeof column.renderDetailsValue === 'function'
              ? column.renderDetailsValue(row, index)
              : renderCell(row, column, index)
          }))
        }];
    if (!Array.isArray(sections)) return [];

    return sections.map((section) => ({
      ...section,
      fields: (Array.isArray(section?.fields) ? section.fields : []).map((field) => {
        const column = normalizedColumns.find((entry) => entry.key === field?.key);
        return {
          ...field,
          valueClassName: field?.valueClassName || (column ? getPosReportColumnValueToneClass(column, row) : undefined)
        };
      })
    }));
  };
  const detailsSections = detailsRow ? buildDetailsSections(detailsRow) : [];
  const detailsTitle = detailsRow
    ? (typeof detailsDialogTitle === 'function' ? detailsDialogTitle(detailsRow) : detailsDialogTitle || `${title} details`)
    : '';
  const detailsSubtitle = detailsRow && typeof getDetailsSubtitle === 'function'
    ? getDetailsSubtitle(detailsRow)
    : detailsRow
      ? getRowLabel(detailsRow)
      : '';
  const detailsFooter = detailsRow && typeof renderDetailsFooter === 'function'
    ? renderDetailsFooter(detailsRow, () => setDetailsRow(null))
    : null;

  const handleSort = (key) => {
    const nextSort = ((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }))(activeSort);
    if (controlledSort) {
      onSortChange?.(nextSort);
    } else {
      setSort(nextSort);
      setPageState({ queryKey, page: 1 });
    }
  };

  const setPage = (nextPage) => {
    if (serverPagination) {
      serverPagination.onPageChange?.(Math.max(1, Math.min(pageCount, nextPage)));
      return;
    }
    setPageState({
      queryKey,
      page: Math.max(1, Math.min(pageCount, nextPage))
    });
  };

  const handlePageSizeChange = (nextPageSize) => {
    const normalizedPageSize = Number(nextPageSize);
    if (!Number.isInteger(normalizedPageSize) || normalizedPageSize <= 0) return;
    if (serverPagination) {
      serverPagination.onPageSizeChange?.(normalizedPageSize);
      return;
    }
    setSelectedPageSize(normalizedPageSize);
    setPageState({ queryKey, page: 1 });
  };

  const renderSortIcon = (key) => {
    const iconClassName = `h-3.5 w-3.5 ${activeSort.key === key ? 'text-[#1A4E8D]' : 'text-[#2D6CDF] opacity-50'}`;
    if (activeSort.key !== key) return <ChevronDown className={iconClassName} aria-hidden="true" />;
    return activeSort.direction === 'asc'
      ? <ChevronUp className={iconClassName} aria-hidden="true" />
      : <ChevronDown className={iconClassName} aria-hidden="true" />;
  };

  return (
    <section className="min-w-0" aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`} className="sr-only">{title}</h3>

      <div
        className="pos-reports-mobile-view min-[768px]:hidden"
        data-testid={`${idPrefix}-mobile-view`}
      >
        {paginatedRows.length > 0 ? (
          <ul className="grid min-w-0 gap-2" aria-label={`${ariaLabel} mobile cards`}>
            {paginatedRows.map((row, index) => {
              const primaryColumn = mobileColumns[0];
              const rowLabel = getRowLabel(row, primaryColumn);
              const visibleMobileKeys = new Set(mobileColumns.map((column) => column.key));
              const mobileDetailsSections = buildDetailsSections(row, index)
                .map((section) => ({
                  ...section,
                  fields: (Array.isArray(section?.fields) ? section.fields : [])
                    .filter((field) => !visibleMobileKeys.has(field?.key))
                }))
                .filter((section) => section.fields.length > 0);
              const hasMobileDetails = mobileDetailsSections.length > 0;
              const detailsId = `${idPrefix}-mobile-details-${currentPage}-${index}`;
              const expanded = expandedMobileRow === row;

              return (
                <li key={`${idPrefix}-mobile-row-${index}`} className="min-w-0">
                  <PosMobileDataCard
                    titleLabel={primaryColumn?.mobileTitleLabel === false ? undefined : primaryColumn?.label}
                    title={primaryColumn ? renderCell(row, primaryColumn, index) : rowLabel}
                    titleClassName={getMobileCardTitleToneClass(primaryColumn, row)}
                    fieldLayout="rows"
                    fields={mobileColumns.slice(1).map((column) => ({
                      key: column.key,
                      label: column.label,
                      labelNoWrap: column.mobileLabelNoWrap,
                      value: renderCell(row, column, index),
                      valueClassName: getMobileColumnValueToneClass(column, row),
                      align: column.mobileValueAlign || 'right',
                      numeric: column.numeric
                    }))}
                    expanded={expanded}
                    detailsId={detailsId}
                    detailsLabel={`Additional details for ${rowLabel}`}
                    details={hasMobileDetails ? (
                      <div className="space-y-2">
                        {mobileDetailsSections.map((section) => (
                          <section key={section.key || section.title || 'details'} className="space-y-1.5">
                            {section.key !== 'record-details' && section.title ? (
                              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                {section.title}
                              </h4>
                            ) : null}
                            <dl className="space-y-1.5 text-[11px] leading-4">
                              {section.fields.map((field, fieldIndex) => (
                                <div
                                  key={field.key || `${section.key || 'detail'}-${fieldIndex}`}
                                  className="grid min-w-0 grid-cols-[minmax(5.5rem,0.42fr)_minmax(0,1fr)] items-start gap-2"
                                >
                                  <dt className="min-w-0 break-words text-[#64748B]">
                                    {field.label || field.key || 'Details'}
                                  </dt>
                                  <dd className={cn('min-w-0 break-words text-right font-medium text-[#475569]', emphasizeMobileValue(field.valueClassName))}>
                                    {field.value ?? '—'}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </section>
                        ))}
                      </div>
                    ) : null}
                    action={hasMobileDetails ? (
                      <PosTableActionButton
                        icon={Eye}
                        className={expanded ? 'bg-blue-50' : undefined}
                        onClick={() => setExpandedMobileRow((current) => current === row ? null : row)}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${rowLabel}`}
                        title={`${expanded ? 'Hide' : 'Show'} details`}
                      />
                    ) : null}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <PosShiftStateNotice
            variant={stateVariant}
            message={stateMessage}
            compact
          />
        )}
      </div>

      <PosTableSurface className={`${POS_TABLE_REPORT_SURFACE_CLASS} hidden min-[768px]:block`}>
        <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] min-[768px]:max-[1199px]:overflow-x-hidden" role="region" aria-label={ariaLabel} tabIndex={0}>
            <table className="pos-reports-responsive-table w-max min-w-full table-fixed text-[13px]">
              {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead className={POS_TABLE_HEADER_CLASS}>
              <tr>
                {responsiveTableColumns.map((column) => {
                  const cellVisibility = resolveColumnVisibilityClasses(column);
                  return (
                    <th key={column.key} scope="col" aria-sort={activeSort.key === column.key ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${cellVisibility} pos-reports-table-column ${column.widthClass || ''} ${POS_TABLE_HEADER_CELL_CLASS} whitespace-nowrap ${resolveTextAlignment(column.align)}`}>
                      <button type="button" onClick={() => handleSort(column.key)} className={`inline-flex min-h-9 w-full items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] ${resolveJustifyAlignment(column.align)}`} aria-label={`Sort by ${column.label}`}>
                        <span>{column.label}</span>
                        {renderSortIcon(column.key)}
                      </button>
                    </th>
                  );
                })}
                {showActions ? (
                  <th scope="col" className={`table-cell pos-reports-table-action-column w-[4.5rem] ${POS_TABLE_HEADER_CELL_CLASS} text-center whitespace-nowrap`}>
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.length > 0 ? paginatedRows.map((row, index) => (
                <tr key={`${idPrefix}-row-${index}`} className={`${POS_TABLE_ROW_CLASS} pos-table-row--report`}>
                {responsiveTableColumns.map((column) => <td key={column.key} className={cn(resolveColumnVisibilityClasses(column), 'pos-reports-table-column', column.widthClass, POS_TABLE_CELL_CLASS, getPosReportColumnValueToneClass(column, row), resolveTextAlignment(column.valueAlign || column.align), (column.numeric || column.align === 'right' || column.align === 'center') ? 'font-semibold tabular-nums' : 'font-medium')}>{renderCell(row, column, index)}</td>)}
                  {showActions ? (
                    <td className={`table-cell pos-reports-table-action-column w-[4.5rem] ${POS_TABLE_CELL_CLASS} text-center`}>
                      <PosTableActionButton
                        icon={Eye}
                        className="mx-auto"
                        onClick={() => setDetailsRow(row)}
                        aria-label={`View details for ${getRowLabel(row)}`}
                        title="View details"
                      />
                    </td>
                  ) : null}
                </tr>
              )) : (
                <tr>
                  <td colSpan={(responsiveTableColumns.length || 0) + (showActions ? 1 : 0)} className="px-2.5 py-4">
                    <PosShiftStateNotice
                      variant={stateVariant}
                      message={stateMessage}
                      compact
                      className="border-0 bg-transparent px-0 py-2 shadow-none"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PosTableSurface>

      <GlobalPagination
        testId={`${idPrefix}-pagination`}
        controlTestIdPrefix={idPrefix}
        ariaLabel={`${resultLabel} pagination`}
        currentPage={currentPage}
        totalPages={pageCount}
        totalItems={serverPagination ? Number(serverPagination.totalItems) || 0 : sortedRows.length}
        pageSize={serverPagination ? Number(serverPagination.pageSize) || selectedPageSize : selectedPageSize}
        itemLabel={resultLabel}
        pageSizeOptions={serverPagination?.pageSizeOptions || [5, 10, 20, 50]}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        disabled={Boolean(serverPagination?.disabled)}
        loading={Boolean(serverPagination?.loading)}
        pageSizeLabel={`${resultLabel} per page`}
        pageInputLabel={`Go to ${title} page`}
        previousLabel={`Previous ${title} page`}
        nextLabel={`Next ${title} page`}
        className={`${POS_PAGINATION_FOOTER_CLASS} max-[767px]:sticky max-[767px]:bottom-0 max-[767px]:z-20 max-[767px]:bg-white`}
      />

      <PosTableDetailsDialog
        open={Boolean(detailsRow)}
        onOpenChange={(nextOpen) => !nextOpen && setDetailsRow(null)}
        title={detailsTitle}
        subtitle={detailsSubtitle}
        sections={detailsSections}
        footer={detailsFooter}
        testId={`${idPrefix}-details-dialog`}
        variant="reports"
      />
    </section>
  );
}
